import type { Context } from "@opencode/plugin/tui/context"
import type { Renderable } from "@opentui/core"
import type { MaskControl, MessageEntry } from "../types"
import { truncate } from "./format"
import { navigable } from "./messages"
import { ensureLoaded, loadedUsers } from "./history"

const ROW_BUILD_TIMEOUT_MS = 2_000
const MASK_PREVIEW_WIDTH = 34

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    const request = (
      globalThis as typeof globalThis & {
        requestAnimationFrame?: (callback: () => void) => unknown
      }
    ).requestAnimationFrame
    if (request) request(resolve)
    else setTimeout(resolve, 16)
  })
}

async function waitForFrames(count: number) {
  for (let index = 0; index < count; index++) await nextFrame()
}

/**
 * Transcript part rows use `session-part:<messageID>:<partID>` as their
 * renderable id. User messages do not expose a message-id row, so scan the
 * tree for the requested message ids instead of looking up the id directly.
 */
function markMessageRows(
  root: Renderable,
  wanted: ReadonlySet<string>,
  found: Set<string>,
  budget: { left: number },
) {
  if (found.size === wanted.size || budget.left-- <= 0) return
  if (root.id.startsWith("session-part:")) {
    const rest = root.id.slice("session-part:".length)
    const colon = rest.indexOf(":")
    if (colon > 0) {
      const messageID = rest.slice(0, colon)
      if (wanted.has(messageID)) found.add(messageID)
    }
  }
  for (const child of root.getChildren()) markMessageRows(child, wanted, found, budget)
}

async function waitForRowBuild(context: Context, messageIDs: readonly string[]) {
  const wanted = new Set(messageIDs)
  const deadline = Date.now() + ROW_BUILD_TIMEOUT_MS
  let built = false

  while (Date.now() < deadline) {
    const found = new Set<string>()
    markMessageRows(context.renderer.root, wanted, found, { left: 20_000 })
    if (found.size === wanted.size) {
      built = true
      break
    }
    await nextFrame()
  }

  await waitForFrames(2)
  if (built) return true

  // Some versions may not publish per-part rows; still give the layout a
  // pass instead of failing the jump outright.
  await sleep(100)
  await waitForFrames(2)
  return false
}

function warn(context: Context, message: string) {
  context.ui.toast.show({ message, variant: "warning" })
}

/**
 * Jumps to a message using OpenCode's built-in navigation commands.
 *
 * The built-in navigation only walks the messages currently loaded in the
 * TUI window, so the step count must be computed from the same list. If the
 * target is outside that window, it is paged in behind the veil first.
 */
export function createJumper(context: Context, mask: MaskControl) {
  let jumping = false

  return async function jumpTo(sessionID: string, clicked: MessageEntry) {
    if (jumping) return
    jumping = true
    let masked = false

    try {
      let loaded = loadedUsers(context, sessionID)
      if (!loaded.some((message) => message.id === clicked.id)) {
        mask.show(truncate(clicked.summary, MASK_PREVIEW_WIDTH))
        masked = true
        const found = await ensureLoaded(context, sessionID, clicked.id)
        if (!found) {
          await mask.drop()
          masked = false
          warn(context, "这条消息没能加载出来")
          return
        }
        loaded = loadedUsers(context, sessionID)
      }

      const index = loaded.findIndex((message) => message.id === clicked.id)
      if (index < 0) {
        warn(context, "找不到这条消息")
        return
      }

      const steps = loaded.slice(index + 1).filter(navigable).length
      const targets = loaded.filter(navigable)
      const landing = targets[targets.length - 1 - steps]
      if (!landing) {
        warn(context, "当前会话没有可定位的文本消息")
        return
      }

      if (masked) {
        const lastUser = targets[targets.length - 1] ?? landing
        const ready = await waitForRowBuild(context, [lastUser.id, landing.id])
        if (!ready) {
          warn(context, "消息已加载，但会话行尚未准备好，定位可能不准确")
        }
      }

      try {
        context.keymap.dispatch("session.messages_last_user")

        if (masked) {
          await waitForFrames(2)
        }

        for (let step = 0; step < steps; step++) {
          context.keymap.dispatch("session.message.user.previous")
        }
      } catch {
        warn(context, "当前版本不支持消息跳转")
        return
      }

      if (masked) {
        await waitForFrames(2)
        await mask.drop()
        masked = false
      }
    } finally {
      try {
        if (masked) await mask.drop()
      } finally {
        jumping = false
      }
    }
  }
}
