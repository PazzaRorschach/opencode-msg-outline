import type { AnyMessage, MessageEntry, MessageGroup, UserMessage } from "../types"
import { dateKey, formatDate } from "./format"

const MAX_SUMMARY_CHARS = 240

export function isUser(message: AnyMessage): message is UserMessage {
  return message.type === "user"
}

function clip(value: string, max: number) {
  if (value.length <= max) return value
  return Array.from(value).slice(0, max).join("")
}

/** First non-empty line of a user message; attachments are summarized separately. */
export function summaryOf(message: UserMessage) {
  const line = (message.text ?? "")
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.length > 0)
  if (line) return clip(line, MAX_SUMMARY_CHARS)

  const attachments =
    (message.files?.length ?? 0) +
    (message.agents?.length ?? 0) +
    (message.skills?.length ?? 0)
  return attachments > 0 ? `[附件 ×${attachments}]` : "(空消息)"
}

export function toEntry(message: UserMessage): MessageEntry {
  return {
    id: message.id,
    created: message.time.created,
    summary: summaryOf(message),
  }
}

export function sameEntry(a: MessageEntry, b: MessageEntry) {
  return a.created === b.created && a.summary === b.summary
}

/** Structural equality used by the local-cache memo to ignore assistant streaming. */
export function sameUserMessage(a: UserMessage, b: UserMessage) {
  return (
    a.id === b.id &&
    a.time.created === b.time.created &&
    a.text === b.text &&
    (a.files?.length ?? 0) === (b.files?.length ?? 0) &&
    (a.agents?.length ?? 0) === (b.agents?.length ?? 0) &&
    (a.skills?.length ?? 0) === (b.skills?.length ?? 0)
  )
}

export function sameUserMessages(a: readonly UserMessage[], b: readonly UserMessage[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index++) {
    if (!sameUserMessage(a[index], b[index])) return false
  }
  return true
}

/** OpenCode navigation skips messages without text (attachment-only messages). */
export function navigable(message: UserMessage) {
  return (message.text ?? "").trim().length > 0
}

export function compareEntries(a: MessageEntry, b: MessageEntry) {
  return a.created - b.created || a.id.localeCompare(b.id)
}

export function groupEntries(entries: readonly MessageEntry[]) {
  const groups: MessageGroup[] = []
  for (const entry of entries) {
    const key = dateKey(entry.created)
    const previous = groups[groups.length - 1]
    if (previous && previous.key === key) {
      previous.entries.push(entry)
      continue
    }
    groups.push({ key, label: formatDate(entry.created), entries: [entry] })
  }
  return groups
}

/** Latest N entries while keeping their date headings. */
export function latestGroups(groups: readonly MessageGroup[], limit: number) {
  if (limit <= 0) return []
  const shown: MessageGroup[] = []
  let remaining = limit
  for (let index = groups.length - 1; index >= 0 && remaining > 0; index--) {
    const group = groups[index]
    const entries = group.entries.slice(Math.max(0, group.entries.length - remaining))
    shown.unshift({ ...group, entries })
    remaining -= entries.length
  }
  return shown
}
