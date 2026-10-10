import type { Register } from 'claude-code'

import { clean, LIMIT, shrink } from './trim'

export const register: Register = on => {
  let savedChars = 0

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran

    // A failed command: its log is often the biggest of all. The model reads a
    // deny as the error result, so the trimmed log takes the original's place.
    if (ran.isError === true) {
      const text = ran.text ?? ''
      if (clean(text).length <= LIMIT) return ran
      const savedAt = await save($, e.tool_use_id, text)
      const short = shrink(text, savedAt)
      savedChars += text.length - short.length
      $.ui.status(`output-trim: ~${Math.round(savedChars / 4).toLocaleString('es')} tokens ahorrados`)

      return { deny: `Command failed. Its output, trimmed:\n${short}` }
    }

    const result = ran.result
    // Already handled by the engine (persisted to a file), backgrounded, or an image.
    if (result.persistedOutputPath !== undefined || result.backgroundTaskId !== undefined || result.isImage === true) {
      return ran
    }

    const stdout = clean(result.stdout)
    const stderr = clean(result.stderr)
    const isLong = stdout.length + stderr.length > LIMIT
    const isNoisy = stdout.length < result.stdout.length || stderr.length < result.stderr.length
    if (!isLong && !isNoisy) return ran

    const savedAt = isLong ? await save($, e.tool_use_id, `${result.stdout}\n--- stderr ---\n${result.stderr}`) : undefined
    const trimmed = { ...result, stdout: shrink(stdout, savedAt), stderr: shrink(stderr, savedAt) }
    savedChars += result.stdout.length + result.stderr.length - trimmed.stdout.length - trimmed.stderr.length
    if (isLong) $.ui.status(`output-trim: ~${Math.round(savedChars / 4).toLocaleString('es')} tokens ahorrados`)

    return { result: trimmed }
  }).catch(($, e, next) => next(e))
}

/** Keeps the untrimmed output where the model can still grep it; undefined if it cannot be written. */
const save = async (
  $: { fs: { write: (path: string, text: string) => Promise<void> } },
  id: string,
  text: string,
): Promise<string | undefined> => {
  const path = `/tmp/output-trim-${id.replace(/[^\w-]/g, '')}.log`
  try {
    await $.fs.write(path, text)

    return path
  } catch {
    return undefined
  }
}
