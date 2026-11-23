import type { Context } from "@opencode/plugin/tui/context"

/** Union of every message shape OpenCode exposes to TUI plugins. */
export type AnyMessage = ReturnType<Context["data"]["session"]["message"]["list"]>[number]

/** The `user` variant of a session message. */
export type UserMessage = Extract<AnyMessage, { type: "user" }>

/** Compact entry kept by the sidebar; full message data stays in the message store. */
export type MessageEntry = {
  readonly id: string
  readonly created: number
  readonly summary: string
}

export type MessageGroup = {
  readonly key: string
  readonly label: string
  readonly entries: MessageEntry[]
}

export type Settings = {
  visible: boolean
}

export type MaskState = {
  show: boolean
  preview: string
}

export type PanelOptions = {
  /** Fixed row count; when omitted, the panel fills the remaining sidebar height. */
  readonly visibleRows?: number
  readonly scroll: boolean
  readonly scrollStep: number
}

export interface MaskControl {
  show(preview: string): void
  drop(): Promise<void>
}
