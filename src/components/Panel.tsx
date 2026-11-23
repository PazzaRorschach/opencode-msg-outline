/** @jsxImportSource @opentui/solid */

import { For, Show, createSignal, onCleanup, onMount } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"
import type {
  BoxRenderable,
  MouseEvent,
  ScrollAcceleration,
  ScrollBoxRenderable,
} from "@opentui/core"
import type { MaskControl, MessageEntry, MessageGroup, PanelOptions } from "../types"
import { getOutlineCache } from "../lib/cache"
import { outlineColors } from "../theme"
import { formatTime, truncate } from "../lib/format"
import { createOutlineModel } from "../lib/model"

const FALLBACK_SUMMARY_WIDTH = 30
const MIN_ROWS = 10
const MAX_ROWS = 30
const CHROME_ROWS = 15

export function MessageOutlinePanel(props: {
  context: Context
  sessionID: string
  options: PanelOptions
  mask: MaskControl
  onContentChanged: (signature: string) => void
  onSelectionChanged: () => void
}) {
  const model = createOutlineModel({
    context: props.context,
    sessionID: props.sessionID,
    options: props.options,
    mask: props.mask,
    onContentChanged: props.onContentChanged,
    onSelectionChanged: props.onSelectionChanged,
  })
  const cached = getOutlineCache(props.sessionID)
  const colors = () => outlineColors(props.context)
  const acceleration: ScrollAcceleration = {
    tick: () => props.options.scrollStep,
    reset() {},
  }

  const [viewportHeight, setViewportHeight] = createSignal(props.context.renderer.height)
  const [panelWidth, setPanelWidth] = createSignal(0)
  let panelNode: BoxRenderable | undefined
  let scroll: ScrollBoxRenderable | undefined

  const fixedRows = () => props.options.visibleRows
  const rows = () =>
    fixedRows() ?? Math.max(MIN_ROWS, Math.min(MAX_ROWS, viewportHeight() - CHROME_ROWS))
  const summaryWidth = () => {
    const width = panelWidth()
    return width > 0
      ? Math.min(32, Math.max(12, width - 10))
      : FALLBACK_SUMMARY_WIDTH
  }

  function saveScroll() {
    if (!scroll || scroll.isDestroyed) return
    cached.scrollTop = scroll.scrollTop
    const max = Math.max(0, scroll.scrollHeight - scroll.viewport.height)
    cached.atBottom = scroll.scrollTop >= max - 1
  }

  onMount(() => {
    const onResize = () => setViewportHeight(props.context.renderer.height)
    props.context.renderer.on("resize", onResize)
    onCleanup(() => {
      saveScroll()
      props.context.renderer.off("resize", onResize)
    })

    if (cached.scrollTop > 0 && !cached.atBottom) {
      setTimeout(() => {
        if (scroll && !scroll.isDestroyed) scroll.scrollTo(cached.scrollTop)
      }, 0)
    }
  })

  const stopScroll = (event: MouseEvent) => event.stopPropagation()
  const focusScroll = () => scroll?.focus()
  const blurScroll = () => scroll?.blur()

  function MessageRow(propsRow: { entry: MessageEntry }) {
    const active = () => model.selected() === propsRow.entry.id
    return (
      <box
        flexDirection="row"
        gap={1}
        onMouseUp={() => {
          saveScroll()
          model.pick(propsRow.entry)
        }}
      >
        <text fg={colors().muted}>{formatTime(propsRow.entry.created)}</text>
        <text fg={active() ? colors().accent : colors().muted}>{active() ? "●" : "─"}</text>
        <text fg={colors().text} wrapMode="none">
          {truncate(propsRow.entry.summary, summaryWidth())}
        </text>
      </box>
    )
  }

  function DateGroup(propsGroup: { group: MessageGroup }) {
    return (
      <box flexDirection="column">
        <text fg={colors().muted}>{`── ${propsGroup.group.label} ──`}</text>
        <For each={propsGroup.group.entries}>{(entry) => <MessageRow entry={entry} />}</For>
      </box>
    )
  }

  return (
    <box
      ref={(value) => {
        panelNode = value
        setPanelWidth(value.width)
      }}
      flexDirection="column"
      flexShrink={0}
      alignSelf="stretch"
      width="100%"
      zIndex={1}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      onSizeChange={() => setPanelWidth(panelNode?.width ?? 0)}
      onMouseScroll={stopScroll}
      onMouseOver={focusScroll}
      onMouseOut={blurScroll}
      onMouseDown={focusScroll}
    >
      <box flexDirection="row" gap={1}>
        <text fg={colors().accent}>{"◆ 用户消息列表"}</text>
        <text fg={colors().accent}>
          {model.ready() ? `(${model.count()})` : `(${model.count()}，加载中…)`}
        </text>
      </box>
      <text fg={colors().border}>{"─".repeat(16)}</text>
      <Show
        when={model.count() > 0}
        fallback={
          <text fg={colors().muted}>
            {model.ready() ? "暂无用户消息" : "正在加载用户消息…"}
          </text>
        }
      >
        <Show
          when={props.options.scroll}
          fallback={
            <For each={model.shownGroups()}>{(group) => <DateGroup group={group} />}</For>
          }
        >
          <scrollbox
            ref={(value) => {
              scroll = value
            }}
            height={rows()}
            width="100%"
            alignSelf="stretch"
            stickyScroll
            stickyStart="bottom"
            scrollAcceleration={acceleration}
            onMouseScroll={stopScroll}
            verticalScrollbarOptions={{
              visible: false,
              onChange: (position) => {
                cached.scrollTop = position
                if (scroll) {
                  const max = Math.max(0, scroll.scrollHeight - scroll.viewport.height)
                  cached.atBottom = position >= max - 1
                }
              },
            }}
          >
            <box flexDirection="column" width="100%">
              <For each={model.shownGroups()}>{(group) => <DateGroup group={group} />}</For>
            </box>
          </scrollbox>
        </Show>
      </Show>
    </box>
  )
}
