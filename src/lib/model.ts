import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"
import type { MaskControl, MessageEntry, PanelOptions } from "../types"
import { contentSignature, getOutlineCache } from "./cache"
import { createJumper } from "./jump"
import {
  compareEntries,
  groupEntries,
  isUser,
  latestGroups,
  sameEntry,
  sameUserMessages,
  toEntry,
} from "./messages"
import { fetchMessagePage, MAX_PAGES } from "./history"

const POLL_INTERVAL_MS = 60_000
const REFETCH_THROTTLE_MS = 2_000

type FetchMode = "all" | "latest"

export function createOutlineModel(input: {
  context: Context
  sessionID: string
  options: PanelOptions
  mask: MaskControl
  onContentChanged: (signature: string) => void
  onSelectionChanged: () => void
}) {
  const {
    context,
    sessionID,
    options,
    mask,
    onContentChanged,
    onSelectionChanged,
  } = input

  // Plugin-owned Solid updates do not schedule frames in OpenCode 2.3.x, so
  // the slot is re-mounted when this cache changes. A fresh mount reads the
  // cache and renders the latest snapshot immediately.
  const cached = getOutlineCache(sessionID)
  const [pool, setPool] = createSignal<Map<string, MessageEntry>>(new Map(cached.entries))
  const [ready, setReady] = createSignal(cached.ready)
  const [selected, setSelected] = createSignal(cached.selected)

  const jumpTo = createJumper(context, mask)

  // The memo's equality check ignores assistant streaming: the array identity
  // changes every token, but the user-message slice usually does not.
  const localUsers = createMemo(
    () => {
      try {
        return (context.data.session.message.list(sessionID) ?? []).filter(isUser)
      } catch {
        return []
      }
    },
    undefined,
    { equals: sameUserMessages },
  )

  let localIds = new Set<string>()
  let disposed = false
  let controller: AbortController | undefined
  let fetching: FetchMode | undefined
  let queued: FetchMode | undefined
  let typeFilter = true

  function repaint() {
    try {
      context.renderer.requestRender()
    } catch {
      // OpenCode owns the renderer; a missing frame hook is not fatal.
    }
  }

  function notifyContent() {
    const signature = contentSignature(untrack(pool).values(), untrack(ready))
    if (signature === cached.signature) return
    cached.signature = signature
    // Prefix the session so switching between two empty sessions can still
    // trigger a fresh mount for the second one.
    onContentChanged(`${sessionID}:${signature}`)
  }

  function mergeEntries(values: Iterable<MessageEntry>, notify = true) {
    let changed = false
    setPool((previous) => {
      let next: Map<string, MessageEntry> | undefined
      for (const entry of values) {
        const current = previous.get(entry.id)
        if (current && sameEntry(current, entry)) continue
        next ??= new Map(previous)
        next.set(entry.id, entry)
        changed = true
      }
      return next ?? previous
    })
    if (!changed) return

    cached.entries = new Map(untrack(pool))
    if (notify) notifyContent()
    repaint()
  }

  function markReady() {
    if (disposed) return
    setReady(true)
    cached.ready = true
    cached.lastFetchAt = Date.now()
    if (cached.selected && !cached.entries.has(cached.selected)) {
      cached.selected = ""
      setSelected("")
    }
    notifyContent()
    repaint()
  }

  async function fetchPage(cursor: string | undefined, signal: AbortSignal) {
    const page = await fetchMessagePage(context, sessionID, cursor, typeFilter, signal)
    if (page || !typeFilter || signal.aborted || disposed) return page
    // The server rejected the type filter (or the request failed); retry once
    // without it. A cursor is still valid because it only encodes order.
    typeFilter = false
    return fetchMessagePage(context, sessionID, cursor, false, signal)
  }

  async function fetchAll(signal: AbortSignal) {
    const collected = new Map<string, MessageEntry>()
    const seen = new Set<string>()
    let cursor: string | undefined
    let complete = false

    try {
      for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
        if (disposed || signal.aborted) return
        const page = await fetchPage(cursor, signal)
        if (!page) break

        let fresh = 0
        for (const message of page.data ?? []) {
          if (seen.has(message.id)) continue
          seen.add(message.id)
          fresh++
          if (isUser(message)) collected.set(message.id, toEntry(message))
        }

        const next = page.cursor?.next ?? null
        if (!next) {
          complete = true
          break
        }
        if (fresh === 0) break
        cursor = next
      }
    } catch {
      // Keep partial results; the next poll retries.
    }

    if (disposed || signal.aborted) return
    if (complete) {
      setPool(new Map(collected))
      cached.entries = new Map(collected)
    } else if (collected.size > 0) {
      mergeEntries(collected.values(), false)
    }
    // Local messages may be newer than the server page; merge without a
    // re-mount so the first paint happens once, after `ready` flips.
    mergeEntries(untrack(localUsers).map(toEntry), false)
    markReady()
  }

  async function fetchLatest(signal: AbortSignal) {
    const known = new Set(untrack(pool).keys())
    if (known.size === 0) {
      await fetchAll(signal)
      return
    }

    const collected = new Map<string, MessageEntry>()
    const seen = new Set<string>()
    let cursor: string | undefined
    let reachedEnd = false
    let overlap = false

    try {
      for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
        if (disposed || signal.aborted) return
        const page = await fetchPage(cursor, signal)
        if (!page) break

        let fresh = 0
        for (const message of page.data ?? []) {
          if (seen.has(message.id)) continue
          seen.add(message.id)
          fresh++
          if (!isUser(message)) continue
          if (known.has(message.id)) {
            overlap = true
            continue
          }
          collected.set(message.id, toEntry(message))
        }

        const next = page.cursor?.next ?? null
        if (!next) {
          reachedEnd = true
          break
        }
        if (fresh === 0) break
        cursor = next
      }
    } catch {
      // Keep partial results; the next poll retries.
    }

    if (disposed || signal.aborted) return
    if (reachedEnd && !overlap) {
      // The whole history was walked without finding a known entry; the
      // cache may have changed on another client. Rebuild it.
      await fetchAll(signal)
      return
    }
    cached.lastFetchAt = Date.now()
    if (collected.size > 0) mergeEntries(collected.values(), true)
  }

  /** One pagination chain per panel; a full refresh supersedes queued increments. */
  function schedule(mode: FetchMode) {
    if (disposed) return
    if (fetching) {
      if (mode === "all" || !queued) queued = mode
      return
    }

    fetching = mode
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    const task = mode === "all" ? fetchAll(signal) : fetchLatest(signal)

    void task
      .catch(() => undefined)
      .finally(() => {
        if (disposed) return
        fetching = undefined
        const next = queued
        queued = undefined
        if (next) schedule(next)
      })
  }

  createEffect(() => {
    const users = localUsers()
    untrack(() => {
      const ids = new Set(users.map((message) => message.id))
      const added = [...ids].some((id) => !localIds.has(id))
      const removed = [...localIds].some((id) => !ids.has(id))
      localIds = ids

      // Do not request a re-mount before the initial fetch finishes; the
      // first paint is made once by markReady. Afterwards local changes need
      // a fresh mount to become visible.
      mergeEntries(users.map(toEntry), ready())
      if (removed) schedule("all")
      else if (added && ready()) schedule("latest")
    })
  })

  if (!cached.ready) schedule("all")
  else if (Date.now() - cached.lastFetchAt > REFETCH_THROTTLE_MS) schedule("latest")
  const poll = setInterval(() => schedule("latest"), POLL_INTERVAL_MS)

  onCleanup(() => {
    disposed = true
    controller?.abort()
    clearInterval(poll)
  })

  const entries = createMemo(() => [...pool().values()].sort(compareEntries))
  const groups = createMemo(() => groupEntries(entries()))
  const shownGroups = createMemo(() =>
    options.scroll ? groups() : latestGroups(groups(), options.visibleRows ?? 10),
  )
  const count = createMemo(() => entries().length)

  function pick(entry: MessageEntry) {
    const next = untrack(selected) === entry.id ? "" : entry.id
    setSelected(next)
    cached.selected = next
    repaint()
    onSelectionChanged()
    void jumpTo(sessionID, entry)
  }

  return {
    shownGroups,
    count,
    ready,
    selected,
    pick,
  }
}
