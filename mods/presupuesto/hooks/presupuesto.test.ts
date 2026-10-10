import { expect, mock, test } from 'claude-code/testing'

import { nivelDe } from './reglas'

/** A stand-in for another mod: it reads the ceiling the way selector-modelo does and reports it. */
const lector = {
  name: 'lector',
  register: (on: (...a: unknown[]) => unknown) => {
    on('command.run', { command: 'tope' }, async ($: { state: { get: (r: unknown) => Promise<{ value?: { topeMax: number | null } }> } }) => {
      const { value } = await $.state.get({ plugin: 'presupuesto', key: 'estado' })

      return { text: String(value?.topeMax) }
    })
  },
}

const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

test('el nivel sale del uso más alto', () => {
  expect(nivelDe(10, 5)).toBe('normal')
  expect(nivelDe(82, 5)).toBe('ahorro')
  expect(nivelDe(40, 92)).toBe('ahorro')
  expect(nivelDe(98, 5)).toBe('critico')
  expect(nivelDe(null, null)).toBe('normal')
})

test('publica el tope máximo según el límite y lo quita al renovarse', { plugins: [lector as never] }, async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  let semana = 98
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [{ kind: 'seven_day', percentUsed: semana }] } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('turn.complete', () => ({ text: 'ok' }))
  const turno = { reason: 'answer', answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't' } as never

  await $.turn.complete(turno)
  await clock.advance(0)
  const alto = await $.command.run({ command: 'presupuesto', args: '', ...CMD } as never)
  expect(alto.text).toMatch(/ahorro máximo · semana 98%/)
  expect((await $.command.run({ command: 'tope', args: '', ...CMD } as never)).text).toBe('4')

  semana = 3
  const bajo = await $.command.run({ command: 'presupuesto', args: '', ...CMD } as never)
  expect(bajo.text).toMatch(/normal · semana 3%/)
  expect((await $.command.run({ command: 'tope', args: '', ...CMD } as never)).text).toBe('null')
})

test('con /presupuesto off no limita nada', { plugins: [lector as never] }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [{ kind: 'seven_day', percentUsed: 99 }] } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)

  const off = await $.command.run({ command: 'presupuesto', args: 'off', ...CMD } as never)
  expect(off.text).toMatch(/apagado · normal/)
  expect((await $.command.run({ command: 'tope', args: '', ...CMD } as never)).text).toBe('null')
})
