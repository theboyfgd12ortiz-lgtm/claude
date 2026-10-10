import { expect, test } from 'claude-code/testing'

import { cacheShare, compact, describeTurn } from './register'

test('formats numbers compactly', () => {
  expect(compact(950)).toBe('950')
  expect(compact(12_345)).toBe('12.3k')
  expect(compact(2_500_000)).toBe('2.50M')
})

test('computes cache share', () => {
  expect(cacheShare({ input: 10, cacheRead: 90, cacheWrite: 0 })).toBe(90)
  expect(cacheShare({ input: 0, cacheRead: 0, cacheWrite: 0 })).toBe(0)
})

test('describes a turn', () => {
  const text = describeTurn({ input: 1000, output: 500, cacheRead: 9000, cacheWrite: 0, seconds: 12, tools: 3, model: 'm' })
  expect(text).toBe('Último turno: 10.0k entrada (90% caché) · 500 salida · 12s · 3 herramientas')
})

test('draws the band once a turn was measured', async ($, on) => {
  on('turn.complete', () => ({ text: 'done' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine band</Text>
  })
  await $.turn.complete({
    reason: 'answer',
    answer: 'ok',
    durationMs: 4000,
    isAborted: false,
    turnId: 't1',
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 0, model: 'm' },
  } as never)

  // The band starts hidden (the Centro de control shows the same); /tokens show turns it on.
  await $.command.run({ command: 'tokens', args: 'show', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'token-meter', surface, component: 'AbovePrompt', props: { hasSurvey: false } as never })
    expect(await ui.find({ type: 'Text', text: /Último turno: 1.0k entrada \(90% caché\)/ })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ plugin: 'token-meter', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /engine band/ })).toBeDefined()
  await ui.unmount()
})
