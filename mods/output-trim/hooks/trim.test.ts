import { expect, test } from 'claude-code/testing'

import { clean, foldRepeats, LIMIT, shrink } from './trim'

test('strips colour codes and progress redraws', () => {
  expect(clean('\x1b[32mok\x1b[0m')).toBe('ok')
  expect(clean('10%\r50%\r100%')).toBe('100%')
})

test('folds repeated lines', () => {
  expect(foldRepeats('a\na\na\na\nb')).toBe('a\n[… previous line repeated 3 more times]\nb')
  expect(foldRepeats('a\na\nb')).toBe('a\na\nb')
})

test('keeps short output whole and cuts long output to head + tail', () => {
  expect(shrink('hello')).toBe('hello')
  const long = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n')
  const out = shrink(long, '/tmp/x.log')
  expect(out.length).toBeLessThan(LIMIT)
  expect(out).toMatch(/^line 0\n/)
  expect(out).toMatch(/line 4999$/)
  expect(out).toMatch(/output-trim: .* cut from the middle\. Full output: \/tmp\/x\.log/)
})

test('trims a long Bash result through the hook', async ($, on) => {
  const big = Array.from({ length: 5000 }, (_, i) => `row ${i}`).join('\n')
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: big, stderr: '', interrupted: false } }))

  const res = await $.tool.call({ tool: 'Bash', command: 'seq 5000' })
  const stdout = (res.result as { stdout: string }).stdout
  expect(stdout.length).toBeLessThan(LIMIT)
  expect(stdout).toMatch(/row 4999$/)
})

test('leaves a short Bash result untouched', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'small', stderr: '', interrupted: false } }))
  const res = await $.tool.call({ tool: 'Bash', command: 'echo small' })
  expect((res.result as { stdout: string }).stdout).toBe('small')
})
