/** @jsxImportSource @opentui/solid */

import { Plugin } from "@opencode/plugin/tui"
import { Show } from "solid-js"
import { MaskVeil } from "./components/Mask"
import { MessageOutlinePanel } from "./components/Panel"
import { readPanelOptions } from "./options"
import type { MaskControl, MaskState, Settings } from "./types"

const COMMAND_ID = "msg-outline.toggle"
const MASK_MIN_VISIBLE_MS = 800

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export default Plugin.define({
  id: "opencode-msg-outline",
  setup(context) {
    const options = readPanelOptions(context.options)

    const initialSettings: Settings = { visible: true }
    const initialMask: MaskState = { show: false, preview: "" }
    const [settings, updateSettings] = context.storage.store("settings", {
      initial: initialSettings,
    })
    const [mask, setMask] = context.storage.memory("mask", {
      initial: initialMask,
    })
    // Memory survives plugin hot reloads; clear a veil left by a reloaded jump.
    setMask((draft) => {
      draft.show = false
      draft.preview = ""
    })

    let maskShownAt = 0
    let maskVisible = false
    const maskControl: MaskControl = {
      show(preview) {
        maskVisible = true
        maskShownAt = Date.now()
        setMask((draft) => {
          draft.show = true
          draft.preview = preview
        })
      },
      async drop() {
        if (!maskVisible) return
        // Keep the veil visible long enough to read even when paging is instant.
        const remaining = MASK_MIN_VISIBLE_MS - (Date.now() - maskShownAt)
        if (remaining > 0) await sleep(remaining)
        maskVisible = false
        setMask((draft) => {
          draft.show = false
        })
      },
    }

    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: COMMAND_ID,
          title: "切换用户消息列表",
          description: "在会话侧边栏显示或隐藏用户消息列表",
          group: "Msg Outline",
          bind: "alt+u",
          palette: true,
          slash: { name: "outline", aliases: ["messages", "msgs"] },
          run: async () => {
            await updateSettings((draft) => {
              draft.visible = !draft.visible
            })
            context.ui.toast.show({
              message: settings.visible ? "用户消息列表：已显示" : "用户消息列表：已隐藏",
            })
          },
        },
      ],
      bindings: [COMMAND_ID],
    }))

    const unbindMask = context.ui.slot({
      append: "app",
      render: () => <MaskVeil context={context} mask={mask} />,
    })

    // OpenCode 2.3.x does not schedule frames for plugin-owned reactive
    // updates. Rebuild the slot claim when the content signature changes so
    // the fresh mount reads the cache; keep the mechanism throttled and
    // single-flight to avoid remount storms.
    const REMOUNT_MIN_INTERVAL_MS = 500
    let handles: Array<() => void> = []
    // Handles whose previous unbind threw are retried on the next detach.
    let retiredHandles: Array<() => void> = []
    let remountTimer: ReturnType<typeof setTimeout> | undefined
    let pendingSignature: string | null = null
    let pendingSelection = false
    let lastSignature = ""
    let lastRemountAt = 0
    let disposed = false

    function detachPanels() {
      const current = [...retiredHandles, ...handles]
      handles = []
      retiredHandles = []
      for (const unbind of current) {
        try {
          unbind()
        } catch {
          // Retry this handle on the next detach in case the host dropped it.
          retiredHandles.push(unbind)
        }
      }
    }

    function attachPanel() {
      const unbind = context.ui.slot({
        append: "sidebar.content",
        render: ({ sessionID }) => (
          <Show when={settings.visible}>
            <Show when={sessionID} keyed fallback={null}>
              {(id: string) => (
                <MessageOutlinePanel
                  context={context}
                  sessionID={id}
                  options={options}
                  mask={maskControl}
                  onContentChanged={requestContent}
                  onSelectionChanged={requestSelection}
                />
              )}
            </Show>
          </Show>
        ),
      })
      handles.push(unbind)
    }

    function scheduleRemount() {
      if (disposed || remountTimer !== undefined) return
      const wait = Math.max(0, REMOUNT_MIN_INTERVAL_MS - (Date.now() - lastRemountAt))
      remountTimer = setTimeout(() => {
        remountTimer = undefined
        const signature = pendingSignature
        const force = pendingSelection
        pendingSignature = null
        pendingSelection = false
        if (disposed) return
        if (!force && (!signature || signature === lastSignature)) return
        if (signature) lastSignature = signature
        lastRemountAt = Date.now()
        detachPanels()
        try {
          attachPanel()
        } catch {
          // OpenCode will retry on the next content change.
        }
      }, wait)
    }

    function requestContent(signature: string) {
      if (disposed || !signature) return
      pendingSignature = signature
      scheduleRemount()
    }

    function requestSelection() {
      if (disposed) return
      pendingSelection = true
      scheduleRemount()
    }

    attachPanel()

    return () => {
      disposed = true
      if (remountTimer !== undefined) clearTimeout(remountTimer)
      detachPanels()
      unbindMask()
    }
  },
})
