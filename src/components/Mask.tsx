/** @jsxImportSource @opentui/solid */

import { Show } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"
import type { MaskState } from "../types"
import { outlineColors } from "../theme"

export function MaskVeil(props: { context: Context; mask: MaskState }) {
  const colors = () => outlineColors(props.context)
  return (
    <Show when={props.mask.show}>
      <box
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        zIndex={999}
        backgroundColor={colors().background}
        justifyContent="center"
        alignItems="center"
      >
        <box
          border
          borderColor={colors().accent}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          flexDirection="column"
        >
          <box flexDirection="row" gap={1}>
            <text fg={colors().accent}>{"◆"}</text>
            <text fg={colors().text}>{"正在定位消息…"}</text>
          </box>
          <text fg={colors().muted}>{props.mask.preview}</text>
        </box>
      </box>
    </Show>
  )
}
