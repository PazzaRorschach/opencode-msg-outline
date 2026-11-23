import type { Context } from "@opencode/plugin/tui/context"
import type { UserMessage } from "../types"
import { isUser } from "./messages"

export const PAGE_SIZE = 200
export const MAX_PAGES = 40
const MAX_LOAD_CALLS = 40
const LOAD_DEADLINE_MS = 60_000
const LOAD_CALL_TIMEOUT_MS = 15_000
const PAGE_TIMEOUT_MS = 15_000

type MessagePage = Awaited<ReturnType<Context["client"]["message"]["list"]>>

/** The public TUI type hides the paging methods that the message store actually exposes. */
type PagedMessages = Context["data"]["session"]["message"] & {
  more?(sessionID: string): boolean
  loading?(sessionID: string): boolean
  loadMore?(
    sessionID: string,
    options?: { all?: boolean; signal?: AbortSignal },
  ): Promise<unknown>
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** User messages currently in OpenCode's loaded window, in message order. */
export function loadedUsers(context: Context, sessionID: string): UserMessage[] {
  try {
    return (context.data.session.message.list(sessionID) ?? []).filter(isUser)
  } catch {
    return []
  }
}

/**
 * One page of messages. `type: "user"` is a server-side filter, so the plugin
 * transfers user messages only; a failure falls back to the unfiltered endpoint.
 */
export async function fetchMessagePage(
  context: Context,
  sessionID: string,
  cursor: string | undefined,
  useTypeFilter: boolean,
  signal: AbortSignal,
): Promise<MessagePage | undefined> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal.aborted) controller.abort()
  else signal.addEventListener("abort", abort, { once: true })

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const request = context.client.message.list(
      {
        sessionID,
        limit: PAGE_SIZE,
        ...(cursor ? { cursor } : { order: "desc" as const }),
        ...(useTypeFilter ? { type: "user" as const } : {}),
      },
      { signal: controller.signal },
    )
    // A hard deadline is needed because a client is free to ignore its signal.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abort()
        reject(new Error("message.list timeout"))
      }, PAGE_TIMEOUT_MS)
    })
    return await Promise.race([request, deadline])
  } catch {
    return undefined
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    signal.removeEventListener("abort", abort)
  }
}

/**
 * Makes sure a message is in the loaded window before dispatching navigation.
 * OpenCode 2.3.x exposes `loadMore({ all: true })`; older versions ignore the
 * option, so the loop still advances one page per call.
 */
export async function ensureLoaded(context: Context, sessionID: string, id: string) {
  if (loadedUsers(context, sessionID).some((message) => message.id === id)) return true

  const messages = context.data.session.message as PagedMessages
  const more = messages.more?.bind(messages)
  const loading = messages.loading?.bind(messages)
  const loadMore = messages.loadMore?.bind(messages)

  if (more && loading && loadMore) {
    const deadline = Date.now() + LOAD_DEADLINE_MS
    for (let call = 0; call < MAX_LOAD_CALLS && Date.now() < deadline; call++) {
      if (loadedUsers(context, sessionID).some((message) => message.id === id)) return true
      if (loading(sessionID)) {
        await sleep(50)
        continue
      }
      if (!more(sessionID)) return false

      const controller = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort()
            reject(new Error("message.loadMore timeout"))
          }, LOAD_CALL_TIMEOUT_MS)
        })
        await Promise.race([
          loadMore(sessionID, { all: true, signal: controller.signal }),
          deadline,
        ])
      } catch {
        return false
      } finally {
        if (timer !== undefined) clearTimeout(timer)
      }
    }
    return loadedUsers(context, sessionID).some((message) => message.id === id)
  }

  return ensureLoadedByCommand(context, sessionID, id)
}

/**
 * Last-resort path for versions without the paging store. `session.first`
 * may end with an asynchronous scroll-to-top, so wait for the loaded list to
 * settle after the target appears before returning.
 */
async function ensureLoadedByCommand(context: Context, sessionID: string, id: string) {
  const deadline = Date.now() + LOAD_DEADLINE_MS
  let lastCount = -1
  let quietSince = Date.now()

  while (Date.now() < deadline) {
    const users = loadedUsers(context, sessionID)
    if (users.length !== lastCount) {
      lastCount = users.length
      quietSince = Date.now()
    }
    if (users.some((message) => message.id === id)) {
      if (Date.now() - quietSince >= 800) return true
      await sleep(100)
      continue
    }
    try {
      context.keymap.dispatch("session.first")
    } catch {
      return false
    }
    await sleep(200)
  }
  return false
}
