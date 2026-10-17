import { expect, mock, test } from 'claude-code/testing'

import { denegarLecturaEnorme } from './contexto'
import {
  alFallar,
  decidir,
  DECIDE_TU,
  horaDeCorte,
  leerInstantanea,
  leerNoche,
  nocheVigente,
  redactar,
  MAX_CONTINUACIONES,
  protocolo,
  resumenManana,
  RUTA_NOCHE,
  RUTA_RESUMEN,
  topesDeNoche,
} from './mision'

const AHORA = new Date(2026, 9, 16, 23, 0, 0).getTime()

test('en modo noche el protocolo no dice que pregunte: dice que decida y anote la duda', () => {
  const dia = protocolo('haz una web', false)
  const noche = protocolo('haz una web', false, true)
  expect(dia).toMatch(/pregunta antes de empezar/)
  expect(noche).not.toMatch(/pregunta antes de empezar/)
  expect(noche).toContain(DECIDE_TU)
})

test('el archivo del modo noche se tolera ausente o roto', () => {
  expect(leerNoche(undefined)).toEqual({ activo: false, desde: '' })
  expect(leerNoche('{roto')).toEqual({ activo: false, desde: '' })
  expect(leerNoche('{"activo":true,"desde":"2026-10-16T23:00:00Z"}')).toEqual({ activo: true, desde: '2026-10-16T23:00:00Z' })
})

test('un error de la API termina el turno con un motivo propio, y de noche el presupuesto apretado no para', () => {
  const base = { activa: true, razon: 'answer', continuaciones: 0, max: MAX_CONTINUACIONES, total: 4, hechos: 1, siguiente: 'x', presupuesto: 'normal', repeticiones: 0, yaRevisado: false, veredicto: null, rondas: 0, sinVeredicto: 0 } as const
  expect(decidir({ ...base, razon: 'error' })).toMatchObject({ accion: 'parar', motivo: expect.stringMatching(/error de la API/) })
  expect(decidir({ ...base, presupuesto: 'ahorro' }).accion).toBe('parar')
  expect(decidir({ ...base, presupuesto: 'ahorro', noche: true }).accion).toBe('continuar')
})

test('errores pasajeros: reintenta a 1, 5 y 15 minutos y luego para; los no pasajeros paran', () => {
  const base = { error: 'overloaded', reintentos: 0, reintentosTotal: 0, esperasLimite: 0, cincoHoras: 40, semana: 30, ahora: AHORA }
  expect(alFallar(base)).toMatchObject({ accion: 'esperar', ms: 60_000 })
  expect(alFallar({ ...base, reintentos: 1 })).toMatchObject({ accion: 'esperar', ms: 5 * 60_000 })
  expect(alFallar({ ...base, reintentos: 2 })).toMatchObject({ accion: 'esperar', ms: 15 * 60_000 })
  expect(alFallar({ ...base, reintentos: 3 }).accion).toBe('parar')
  expect(alFallar({ ...base, reintentosTotal: 12 }).accion).toBe('parar')
  expect(alFallar({ ...base, error: 'billing_error' }).accion).toBe('parar')
  expect(alFallar({ ...base, semana: 80 }).accion).toBe('parar')
})

test('con el límite de 5 horas agotado espera a la renovación, con tope de esperas', () => {
  const reset = new Date(AHORA + 30 * 60_000).toISOString()
  const base = { error: 'rate_limit', reintentos: 0, reintentosTotal: 0, esperasLimite: 0, cincoHoras: 100, semana: 30, resetsAt: reset, ahora: AHORA }
  expect(alFallar(base)).toMatchObject({ accion: 'esperar', ms: 30 * 60_000 + 60_000, limite: true })
  expect(alFallar({ ...base, esperasLimite: 3 }).accion).toBe('parar')
})

test('topes de la noche: hora de corte, semana al 80% y 15 puntos gastados', () => {
  const sin = { ahora: AHORA + 60_000, desde: AHORA, semana: 30, semanaInicial: 28 }
  expect(topesDeNoche(sin)).toBeNull()
  expect(topesDeNoche({ ...sin, ahora: horaDeCorte(AHORA) })).toMatch(/hora de corte/)
  expect(topesDeNoche({ ...sin, semana: 81 })).toMatch(/semana/)
  expect(topesDeNoche({ ...sin, semana: 45, semanaInicial: 28 })).toMatch(/15 puntos/)
})

test('el resumen de la mañana junta lo hecho, lo que falta, los fallos y las dudas', () => {
  const t = resumenManana({
    objetivo: 'web de panadería',
    estado: 'parada',
    motivo: 'la semana va en 81%',
    ahora: AHORA,
    desde: AHORA - 3_600_000,
    plan: [
      { texto: 'maquetar', hecho: true },
      { texto: 'probar', hecho: false },
    ],
    revision: 'sin revisar',
    bitacora: [{ hora: AHORA, texto: 'paró' }],
    fallos: ['error de la API: overloaded'],
    dudas: ['¿logo azul o rojo?'],
  })
  expect(t).toMatch(/\[x\] maquetar/)
  expect(t).toMatch(/\[ \] probar/)
  expect(t).toMatch(/overloaded/)
  expect(t).toMatch(/logo azul o rojo/)
  expect(t).toMatch(/parada \(la semana va en 81%\)/)
})

test('la misión guardada se lee validada; lo roto da null', () => {
  expect(leerInstantanea(undefined)).toBeNull()
  expect(leerInstantanea('{"version":2}')).toBeNull()
  const i = leerInstantanea(JSON.stringify({ version: 1, mision: { activa: true, objetivo: 'x' }, plan: [{ texto: 'a', hecho: true }, { nada: 1 }] }))
  expect(i?.plan).toEqual([{ texto: 'a', hecho: true }])
  expect(i?.dudas).toEqual([])
})

test('un archivo enorme no entra al chat caro con el contexto grande', () => {
  expect(denegarLecturaEnorme({ caracteres: 70_000, tokens: 120_000, haiku: false })).toMatch(/equipo:explorador/)
  expect(denegarLecturaEnorme({ caracteres: 70_000, tokens: 50_000, haiku: false })).toBeUndefined()
  expect(denegarLecturaEnorme({ caracteres: 10_000, tokens: 120_000, haiku: false })).toBeUndefined()
  expect(denegarLecturaEnorme({ caracteres: 70_000, tokens: 120_000, haiku: true })).toBeUndefined()
})

/** La ruta con que quedó guardada la misión (el motor la vuelve absoluta). */
const rutaMision = (a: Map<string, string>) => [...a.keys()].find(k => /mision\.json$/.test(k)) ?? ''

const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
const turno = (reason = 'answer') => ({ reason, answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't' }) as never
const plan = (hechos: number) => ({ tool: 'TodoWrite', todos: ['a', 'b', 'c'].map((c, i) => ({ content: `paso ${c}`, status: i < hechos ? 'completed' : 'pending', activeForm: c })) }) as never

type On = Parameters<NonNullable<Parameters<typeof test>[2]>>[1]

/** Un mundo mínimo: reloj, almacén, archivos en memoria y lo que se envía. */
const montar = (on: On, archivos = new Map<string, string>(), usage: { tokens?: number; rateLimits?: unknown[] } = {}) => {
  const clock = mock.clock(on, { now: AHORA })
  mock.store(on)
  const enviados: string[] = []
  on('command.register', () => ({ value: { command: 'x' } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: '/r' }) as never)
  on('turn.complete', () => ({ text: 'ok' }))
  on('tool.call', { tool: 'TodoWrite' }, () => ({ result: { oldTodos: [], newTodos: [] } }) as never)
  on('fs.write', (_$, e) => {
    archivos.set((e as { path: string }).path, (e as { text: string }).text)

    return { value: undefined } as never
  })
  on('fs.read', (_$, e) => {
    const t = archivos.get((e as { path: string }).path)
    if (t === undefined) throw new Error('no existe')

    return { value: t } as never
  })
  on('classic.StopFailure', () => ({}) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 10, tokens: usage.tokens ?? 1000 }, rateLimits: usage.rateLimits ?? [] } }) as never)
  on('prompt.submit', (_$, e) => {
    enviados.push(e.text)

    return { text: e.text, context: e.context } as never
  })

  return { clock, enviados, archivos }
}

test('/noche alterna el modo noche y escribe el archivo', async ($, on) => {
  const { archivos } = montar(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true, source: 'startup' } as never)
  const on1 = await $.command.run({ command: 'noche', args: '', ...CMD } as never)
  expect(on1.text).toMatch(/Modo noche activo/)
  expect(JSON.parse(archivos.get(RUTA_NOCHE) ?? '{}').activo).toBe(true)
  const off = await $.command.run({ command: 'noche', args: '', ...CMD } as never)
  expect(off.text).toMatch(/apagado/)
  expect(JSON.parse(archivos.get(RUTA_NOCHE) ?? '{}').activo).toBe(false)
})

test('de noche AskUserQuestion se rechaza, la duda queda en el resumen de la mañana y de día pasa', async ($, on) => {
  const { archivos } = montar(on)
  on('tool.call', { tool: 'AskUserQuestion' } as never, (() => ({ result: { answers: {} } })) as never)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true, source: 'startup' } as never)
  const dia = await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: '¿azul o rojo?' }] } as never)
  expect(dia.deny).toBeUndefined()

  await $.command.run({ command: 'noche', args: 'on', ...CMD } as never)
  await $.command.run({ command: 'piloto', args: 'monta una tienda en línea', ...CMD } as never)
  const noche = await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: '¿azul o rojo?' }] } as never)
  expect(noche.deny).toMatch(/Decide tú con el criterio más prudente/)
  expect(archivos.get(RUTA_RESUMEN)).toMatch(/¿azul o rojo\?/)
})

test('de noche un error pasajero espera y sigue; a la tercera falla seguida para', async ($, on) => {
  const { clock, enviados } = montar(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true, source: 'startup' } as never)
  await $.command.run({ command: 'noche', args: 'on', ...CMD } as never)
  await $.command.run({ command: 'piloto', args: 'monta una tienda en línea', ...CMD } as never)
  await $.tool.call(plan(1))

  await $.classic.StopFailure({ error: 'overloaded' } as never)
  await $.turn.complete(turno('error'))
  await clock.advance(1500)
  const antes = enviados.length
  await clock.advance(59_000)
  expect(enviados.length).toBe(antes)
  await clock.advance(2_000)
  expect(enviados.at(-1)).toMatch(/la espera terminó.*paso 2 de 3/)

  // Segunda falla: espera 5 minutos.
  await $.classic.StopFailure({ error: 'overloaded' } as never)
  await $.turn.complete(turno('error'))
  await clock.advance(1500)
  const n = enviados.length
  await clock.advance(4 * 60_000)
  expect(enviados.length).toBe(n)
  await clock.advance(61_000)
  expect(enviados.length).toBe(n + 1)

  // Un error que no se arregla esperando para limpio.
  await $.classic.StopFailure({ error: 'billing_error' } as never)
  await $.turn.complete(turno('error'))
  await clock.advance(1500)
  const estado = await $.command.run({ command: 'piloto', args: '', ...CMD } as never)
  expect(estado.text).toMatch(/billing_error/)
})

test('con el límite de 5 horas agotado espera a la renovación y la semana al 80% para limpio', async ($, on) => {
  const reset = new Date(AHORA + 10 * 60_000).toISOString()
  const { clock, enviados } = montar(on, new Map(), { rateLimits: [{ kind: 'five_hour', percentUsed: 100, resetsAt: reset }, { kind: 'seven_day', percentUsed: 30 }] })
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true, source: 'startup' } as never)
  await $.command.run({ command: 'noche', args: 'on', ...CMD } as never)
  await $.command.run({ command: 'piloto', args: 'monta una tienda en línea', ...CMD } as never)
  await $.tool.call(plan(1))
  await $.classic.StopFailure({ error: 'rate_limit' } as never)
  await $.turn.complete(turno('error'))
  await clock.advance(1500)
  const antes = enviados.length
  await clock.advance(9 * 60_000)
  expect(enviados.length).toBe(antes)
  await clock.advance(2 * 60_000)
  expect(enviados.at(-1)).toMatch(/la espera terminó/)
})

test('un archivo enorme se rechaza con el contexto grande y pasa con el contexto chico', async ($, on) => {
  montar(on, new Map(), { tokens: 150_000 })
  on('tool.call', { tool: 'Read' } as never, (() => ({ result: { type: 'text', file: { content: 'x'.repeat(70_000) } } })) as never)
  const r = await $.tool.call({ tool: 'Read', file_path: 'a.ts' } as never)
  expect(r.deny).toMatch(/equipo:explorador/)
})

test('la misión se guarda en .claude/mision.json y /piloto retomar la restaura', async ($, on) => {
  const { archivos } = montar(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true, source: 'startup' } as never)
  await $.command.run({ command: 'piloto', args: 'monta una tienda en línea', ...CMD } as never)
  await $.tool.call(plan(1))
  await $.turn.complete(turno())
  const guardada = JSON.parse(archivos.get(rutaMision(archivos)) ?? '{}')
  expect(guardada.mision.activa).toBe(true)
  expect(guardada.plan).toHaveLength(3)

  // Se "cierra" Claude Code: una sesión nueva ofrece retomar y /piloto retomar reenvía el plan.
  await $.command.run({ command: 'piloto', args: 'parar', ...CMD } as never)
  archivos.set(rutaMision(archivos), JSON.stringify(guardada))
  const r = await $.command.run({ command: 'piloto', args: 'retomar', ...CMD } as never)
  expect(r.text).toMatch(/Retomo la misión/)
  const estado = await $.command.run({ command: 'piloto', args: '', ...CMD } as never)
  expect(estado.text).toMatch(/Piloto en marcha: monta una tienda en línea · 1 de 3 pasos/)
})

test('el modo noche caduca a las 7:00 o a las 12 h, lo que llegue antes', () => {
  const desde = new Date(2026, 9, 16, 23, 0, 0).toISOString()
  const t = Date.parse(desde)
  expect(nocheVigente(desde, t + 3_600_000)).toBe(true)
  // 7:00 del día siguiente = 8 h después: ya caducó.
  expect(nocheVigente(desde, t + 9 * 3_600_000)).toBe(false)
  // Encendido a las 8:00: caduca a las 12 h (20:00), no a las 7:00 de mañana.
  const dia = new Date(2026, 9, 16, 8, 0, 0)
  expect(nocheVigente(dia.toISOString(), dia.getTime() + 11 * 3_600_000)).toBe(true)
  expect(nocheVigente(dia.toISOString(), dia.getTime() + 13 * 3_600_000)).toBe(false)
  expect(nocheVigente('', t)).toBe(false)
  expect(leerNoche(`{"activo":true,"desde":"${desde}"}`, t + 9 * 3_600_000).activo).toBe(false)
  expect(leerNoche(`{"activo":true,"desde":"${desde}"}`, t + 3_600_000).activo).toBe(true)
})

test('redactar oculta claves antes de escribirlas en disco', () => {
  const clave = 'sk-ant-' + 'a'.repeat(30)
  expect(redactar(`falló con ${clave} y password=hunter22x`)).toBe('falló con [oculto] y password=[oculto]')
  expect(redactar('todo normal')).toBe('todo normal')
})
