import type { MessageEntry } from "../types"
import { compareEntries } from "./messages"

export type OutlineCacheEntry = {
  entries: Map<string, MessageEntry>
  ready: boolean
  selected: string
  lastFetchAt: number
  signature: string
  /** Last inner scroll position, restored after a selection-driven remount. */
  scrollTop: number
  /** When true, the new mount should stay on the latest message instead. */
  atBottom: boolean
}

const cache = new Map<string, OutlineCacheEntry>()

/** Snapshot signature used by the slot re-mount guard. */
export function contentSignature(entries: Iterable<MessageEntry>, ready: boolean) {
  const list = [...entries].sort(compareEntries)
  if (list.length === 0) return `${ready ? "1" : "0"}:0`
  const first = list[0].id.slice(0, 8)
  const last = list[list.length - 1].id.slice(0, 8)
  return `${ready ? "1" : "0"}:${list.length}:${first}..${last}`
}

/**
 * Plugin-owned Solid signals do not schedule frames in OpenCode 2.3.x; the
 * panel is re-mounted when this cache changes. Keeping the snapshot here lets
 * the fresh mount render immediately without fetching again.
 */
export function getOutlineCache(sessionID: string): OutlineCacheEntry {
  let entry = cache.get(sessionID)
  if (!entry) {
    const entries = new Map<string, MessageEntry>()
    const ready = false
    entry = {
      entries,
      ready,
      selected: "",
      lastFetchAt: 0,
      signature: contentSignature(entries.values(), ready),
      scrollTop: 0,
      atBottom: false,
    }
    cache.set(sessionID, entry)
  }
  return entry
}
