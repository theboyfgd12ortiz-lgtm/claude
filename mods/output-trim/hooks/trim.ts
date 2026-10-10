// Pure text shaping: no `$`, so tests can call it directly.

/** Outputs longer than this many characters are cut (about 4k tokens). */
export const LIMIT = 15_000
/** Characters kept from the start: the command's setup, first errors. */
export const HEAD = 3_000
/** Characters kept from the end: summaries, final errors, exit info. */
export const TAIL = 7_000

const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g

/** Drops colour codes and keeps only the last state of `\r`-redrawn progress lines. */
export const clean = (text: string): string =>
  text
    .replace(ANSI, '')
    .split('\n')
    .map(line => (line.includes('\r') ? (line.split('\r').filter(p => p.length > 0).pop() ?? '') : line))
    .join('\n')

/** Folds runs of 3+ identical lines into one line and a count. */
export const foldRepeats = (text: string): string => {
  const lines = text.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    let j = i
    while (j + 1 < lines.length && lines[j + 1] === lines[i]) j++
    const run = j - i + 1
    out.push(lines[i] ?? '')
    if (run >= 3) out.push(`[… previous line repeated ${run - 1} more times]`)
    else for (let k = 1; k < run; k++) out.push(lines[i] ?? '')
    i = j + 1
  }

  return out.join('\n')
}

/** Keeps head and tail on line boundaries, with a marker saying what was cut and where it is. */
export const cut = (text: string, savedAt?: string): string => {
  if (text.length <= LIMIT) return text
  const headEnd = Math.max(text.lastIndexOf('\n', HEAD), 0) || HEAD
  const tailStartRaw = text.length - TAIL
  const tailStart = text.indexOf('\n', tailStartRaw) + 1 || tailStartRaw
  const dropped = text.slice(headEnd, tailStart)
  const droppedLines = dropped.split('\n').length - 1
  const where = savedAt === undefined ? '' : ` Full output: ${savedAt} (grep it or Read it with offset/limit).`

  return (
    text.slice(0, headEnd) +
    `\n[… output-trim: ${dropped.length.toLocaleString('en')} characters / ~${droppedLines} lines cut from the middle.${where}]\n` +
    text.slice(tailStart)
  )
}

/** The whole pass: clean, fold, then cut if still too long. */
export const shrink = (text: string, savedAt?: string): string => cut(foldRepeats(clean(text)), savedAt)
