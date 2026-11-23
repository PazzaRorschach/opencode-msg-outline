import type { Context } from "@opencode/plugin/tui/context"
import type { RGBA } from "@opentui/core"

export type OutlineColors = {
  readonly accent: RGBA
  readonly text: RGBA
  readonly muted: RGBA
  readonly border: RGBA
  readonly background: RGBA
}

function channel(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function luminance(color: RGBA) {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

function contrast(left: RGBA, right: RGBA) {
  const a = luminance(left)
  const b = luminance(right)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Picks a foreground accent from the theme's interactive hue.
 *
 * `background.action.primary.focused` is a fill color in the current theme
 * system, not a text color; using it directly can make the outline nearly
 * invisible. Prefer a hue step with enough contrast against both the normal
 * and raised surfaces, starting from the step that is brightest on dark
 * themes and darkest on light themes.
 */
function readableAccent(theme: Context["theme"]) {
  const background = theme.background.base
  const raised = theme.background.raised.base
  const surface = raised.a > 0 ? raised : background
  const dark = luminance(background) < 0.5
  const steps = dark
    ? ([400, 300, 500, 200] as const)
    : ([300, 200, 400, 500] as const)

  let best: RGBA | undefined
  let bestContrast = -1
  for (const step of steps) {
    const color = theme.hue.interactive[step]
    if (color.a <= 0) continue
    const score = Math.min(contrast(color, background), contrast(color, surface))
    if (score >= 4.5) return color
    if (score > bestContrast) {
      bestContrast = score
      best = color
    }
  }
  return best ?? theme.text.base
}

/** Reads the active OpenCode theme. */
export function outlineColors(context: Context): OutlineColors {
  const theme = context.theme
  return {
    accent: readableAccent(theme),
    text: theme.text.base,
    muted: theme.text.muted,
    border: theme.border.base,
    background: theme.background.base,
  }
}
