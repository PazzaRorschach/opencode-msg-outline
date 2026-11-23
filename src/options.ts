import type { PanelOptions } from "./types"

const DEFAULT_SCROLL_STEP = 3

function positiveInt(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}

/** Reads the plugin options while keeping every value bounded and predictable. */
export function readPanelOptions(raw: Readonly<Record<string, unknown>>): PanelOptions {
  const visibleRows = positiveInt(raw.visibleRows, 0)
  return {
    ...(visibleRows > 0 ? { visibleRows } : {}),
    scroll: raw.scroll !== false,
    scrollStep: positiveInt(raw.scrollStep, DEFAULT_SCROLL_STEP),
  }
}
