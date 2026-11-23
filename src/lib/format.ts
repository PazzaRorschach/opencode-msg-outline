function isZeroWidth(codePoint: number) {
  return (
    codePoint === 0x200d ||
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  )
}

function isControl(codePoint: number) {
  return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)
}

function isWide(codePoint: number) {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  )
}

function charWidth(char: string) {
  const codePoint = char.codePointAt(0)
  if (codePoint === undefined || isControl(codePoint) || isZeroWidth(codePoint)) return 0
  return isWide(codePoint) ? 2 : 1
}

/** Terminal columns used by a string; wide CJK/emoji characters count as two. */
export function displayWidth(value: string) {
  let width = 0
  for (const char of value) width += charWidth(char)
  return width
}

/** Truncates by terminal columns and appends an ellipsis when needed. */
export function truncate(value: string, max: number) {
  if (max <= 0) return ""
  if (displayWidth(value) <= max) return value

  let output = ""
  let width = 0
  for (const char of value) {
    const next = charWidth(char)
    if (width + next > max - 1) break
    output += char
    width += next
  }
  return `${output}…`
}

function pad2(value: number) {
  return value.toString().padStart(2, "0")
}

/** Local calendar day, stable across DST changes. */
export function dateKey(created: number) {
  const date = new Date(created)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** `MM-DD` inside the reference year, `YYYY-MM-DD` for older/newer years. */
export function formatDate(created: number, reference = Date.now()) {
  const date = new Date(created)
  const monthDay = `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
  return date.getFullYear() === new Date(reference).getFullYear()
    ? monthDay
    : `${date.getFullYear()}-${monthDay}`
}

export function formatTime(created: number) {
  const date = new Date(created)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}
