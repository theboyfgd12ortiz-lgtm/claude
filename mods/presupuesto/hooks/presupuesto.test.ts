import { expect, mock, test } from 'claude-code/testing'

import { duracion, estaAgotado, faltaPara, nivelDe } from './reglas'

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
  expect((await $.command.run({ command: 'tope', args: '', ...CMD } as never)).text).toBe('2')

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

test('con el presupuesto en modo ahorro se permite una skill por pedido; la segunda se rechaza; en normal pasan todas', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  let semana = 85
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [{ kind: 'seven_day', percentUsed: semana }] } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('turn.complete', () => ({ text: 'ok' }))
  on('tool.call', { tool: 'Skill' }, () => ({ result: { success: true } }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context }) as never)
  const turno = { reason: 'answer', answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't' } as never
  const pedido = () => $.prompt.submit({ text: 'edita el botón', wait: false, origin: { kind: 'composer' } } as never)
  const skill = (nombre: string) => $.tool.call({ tool: 'Skill', skill: nombre } as never)

  await $.turn.complete(turno)
  await clock.advance(0)
  await pedido()
  expect((await skill('frontend-design')).deny).toBeUndefined()
  expect((await skill('brainstorming')).deny).toMatch(/ya cargaste una skill/)
  await pedido()
  expect((await skill('brainstorming')).deny).toBeUndefined()

  semana = 10
  await $.turn.complete(turno)
  await clock.advance(0)
  expect((await skill('a')).deny).toBeUndefined()
  expect((await skill('b')).deny).toBeUndefined()
})

test('calcula cuánto falta para que se renueve el límite y cuándo está agotado', () => {
  expect(faltaPara('2026-10-11T12:00:00Z', Date.parse('2026-10-11T10:40:00Z'))).toBe(80 * 60_000)
  expect(faltaPara('2026-10-11T09:00:00Z', Date.parse('2026-10-11T10:40:00Z'))).toBeNull()
  expect(faltaPara(undefined, 0)).toBeNull()
  expect(duracion(80 * 60_000)).toBe('1 h 20 min')
  expect(duracion(35 * 60_000)).toBe('35 min')
  expect(estaAgotado(100, 10)).toBe(true)
  expect(estaAgotado(40, 100)).toBe(true)
  expect(estaAgotado(99, 99)).toBe(false)
})

test('al agotarse el límite avisa cuándo vuelve y, pasado ese tiempo, avisa que ya se puede seguir', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const ahora = (clock as unknown as { now: () => number }).now()
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 100, resetsAt: new Date(ahora + 60 * 60_000).toISOString() }] } }) as never)
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push((e as { text: string }).text)

    return { value: undefined } as never
  })
  const avisos: string[] = []
  on('ui.notify', (_$, e) => {
    avisos.push((e as { text: string }).text)

    return { value: { isSent: true, channel: 'x' } } as never
  })
  on('turn.complete', () => ({ text: 'ok' }))
  await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't' } as never)
  await clock.advance(0)
  expect(toasts.join(' ')).toMatch(/se acabó el límite\. Vuelve en 1 h/)
  await clock.advance(61 * 60_000)
  expect(avisos.join(' ')).toMatch(/ya puedes seguir/)
})
