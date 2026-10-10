import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { nivelDe } from './reglas'

const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
const TURNO = { reason: 'answer', answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't' } as const

/** A stand-in for selector-modelo: it passes /nivel on to the test's own hook, which records it. */
const selector = {
  name: 'selector-modelo',
  register: (on: (...a: unknown[]) => unknown) => {
    on('command.run', { command: 'nivel' }, (_$: unknown, e: unknown, next: (e: unknown) => unknown) => next(e))
  },
}

test('el nivel sale del uso más alto', () => {
  expect(nivelDe(10, 5)).toBe('normal')
  expect(nivelDe(82, 5)).toBe('ahorro')
  expect(nivelDe(40, 92)).toBe('ahorro')
  expect(nivelDe(98, 5)).toBe('critico')
  expect(nivelDe(null, null)).toBe('normal')
})

/** The hooks every test needs: limits that the test can move, the selector's /nivel, toasts. */
const preparar = (on: On, uso: { semana: number }, pedidos: string[]) => {
  mock.store(on)
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: [{ kind: 'seven_day', percentUsed: uso.semana, resetsAt: '2026-10-14T01:00:00Z' }] },
  }) as never)
  on('command.list', () => ({ value: [{ name: 'nivel', description: '', source: 'plugin', plugin: 'selector-modelo' }] }) as never)
  on('command.run', { command: 'nivel' }, (_$, e) => {
    pedidos.push(e.args)

    return { text: 'ok' }
  })
  on('ui.toast', () => ({ value: undefined }) as never)
  on('turn.complete', () => ({ text: 'ok' }))
}

test('baja el tope del selector con poco límite y lo devuelve al renovarse', { plugins: [selector as never] }, async ($, on) => {
  const clock = mock.clock(on)
  const uso = { semana: 98 }
  const pedidos: string[] = []
  preparar(on, uso, pedidos)

  await $.turn.complete(TURNO as never)
  await clock.advance(0)
  expect(pedidos).toEqual(['tope 4'])

  uso.semana = 3
  await $.turn.complete(TURNO as never)
  await clock.advance(0)
  expect(pedidos).toEqual(['tope 4', 'tope 9'])

  const estado = await $.command.run({ command: 'presupuesto', args: '', ...CMD } as never)
  expect(estado.text).toMatch(/normal · semana 3%/)
})

test('con /presupuesto off deja de tocar el modelo', { plugins: [selector as never] }, async ($, on) => {
  const clock = mock.clock(on)
  const uso = { semana: 99 }
  const pedidos: string[] = []
  preparar(on, uso, pedidos)

  const off = await $.command.run({ command: 'presupuesto', args: 'off', ...CMD } as never)
  expect(off.text).toMatch(/apagado/)

  await $.turn.complete(TURNO as never)
  await clock.advance(0)
  expect(pedidos).toEqual([])
})
