import { expect, mock, test } from 'claude-code/testing'

import { decidir, esTareaGrande, hayPruebasEnPackage, MAX_CONTINUACIONES, MAX_RONDAS, protocolo, resumenPlan, TEXTO_PLAN, TEXTO_REVISION } from './reglas'

const base = { activa: true, razon: 'answer', continuaciones: 0, max: MAX_CONTINUACIONES, total: 4, hechos: 1, siguiente: 'conectar el formulario', presupuesto: 'normal', repeticiones: 0, yaRevisado: false, veredicto: null as 'ok' | 'problemas' | null, rondas: 0, sinVeredicto: 0 }

test('reconoce un pedido grande por tamaño, partes o palabras', () => {
  expect(esTareaGrande('cambia el color del botón')).toBe(false)
  expect(esTareaGrande('/piloto hacer algo')).toBe(false)
  expect(esTareaGrande('hazme una página web completa para mi panadería')).toBe(true)
  expect(esTareaGrande('quiero:\n- login\n- registro\n- recuperar clave')).toBe(true)
  expect(esTareaGrande('migra todo el proyecto a TypeScript')).toBe(true)
})

test('sigue solo mientras queden pasos y todo vaya bien', () => {
  const d = decidir(base)
  expect(d).toEqual({ accion: 'continuar', texto: expect.stringMatching(/paso 2 de 4: conectar el formulario/) })
})

test('sin misión no hace nada; si lo interrumpiste, para', () => {
  expect(decidir({ ...base, activa: false })).toEqual({ accion: 'nada' })
  expect(decidir({ ...base, razon: 'aborted' })).toEqual({ accion: 'parar', motivo: 'lo interrumpiste' })
})

test('con poco límite de uso para en vez de gastarlo', () => {
  const d = decidir({ ...base, presupuesto: 'ahorro' })
  expect(d.accion).toBe('parar')
})

test('sin plan lo pide una vez; si aun así no hay, la tarea era corta y termina', () => {
  expect(decidir({ ...base, total: 0, hechos: 0, siguiente: null })).toEqual({ accion: 'continuar', texto: TEXTO_PLAN })
  expect(decidir({ ...base, total: 0, hechos: 0, siguiente: null, continuaciones: 1 })).toEqual({ accion: 'terminar', motivo: 'listo' })
})

test('al acabar los pasos pide la revisión; con TODO BIEN termina aprobado; un plan corto termina directo', () => {
  const hecho = { ...base, hechos: 4, siguiente: null }
  expect(decidir(hecho)).toEqual({ accion: 'continuar', texto: TEXTO_REVISION, revision: true })
  expect(decidir({ ...hecho, yaRevisado: true, veredicto: 'ok' })).toEqual({ accion: 'terminar', motivo: 'listo y revisado', revision: 'aprobada' })
  expect(decidir({ ...base, total: 2, hechos: 2, siguiente: null })).toEqual({ accion: 'terminar', motivo: 'listo' })
})

test('si el revisor encuentra problemas se corrige y se revisa de nuevo, hasta 2 rondas; luego termina con observaciones', () => {
  const hecho = { ...base, hechos: 4, siguiente: null, yaRevisado: true, veredicto: 'problemas' as const }
  expect(decidir(hecho)).toEqual({ accion: 'continuar', texto: expect.stringMatching(/ronda 1 de 2/), correccion: true })
  expect(decidir({ ...hecho, rondas: 1 })).toEqual({ accion: 'continuar', texto: expect.stringMatching(/ronda 2 de 2/), correccion: true })
  expect(decidir({ ...hecho, rondas: MAX_RONDAS })).toEqual({ accion: 'terminar', motivo: expect.stringMatching(/observaciones/), revision: 'con observaciones' })
})

test('si se pidió revisar y el revisor no opinó, se insiste una vez y luego termina avisando', () => {
  const hecho = { ...base, hechos: 4, siguiente: null, yaRevisado: true }
  expect(decidir(hecho)).toEqual({ accion: 'continuar', texto: TEXTO_REVISION, revision: true })
  expect(decidir({ ...hecho, sinVeredicto: 1 })).toEqual({ accion: 'terminar', motivo: expect.stringMatching(/no llegó a opinar/), revision: 'con observaciones' })
})

test('un pedido de crear algo, aunque sea corto, cuenta como grande', () => {
  expect(esTareaGrande('hazme una página para mi panadería')).toBe(true)
  expect(esTareaGrande('crea una tienda en línea de ropa')).toBe(true)
  expect(esTareaGrande('crea un archivo notas.txt')).toBe(false)
  expect(esTareaGrande('explícame qué es una API')).toBe(false)
})

test('frena en el tope de pasos seguidos y si se atasca en el mismo paso', () => {
  expect(decidir({ ...base, continuaciones: MAX_CONTINUACIONES }).accion).toBe('parar')
  const atasco = decidir({ ...base, repeticiones: 2 })
  expect(atasco).toEqual({ accion: 'parar', motivo: expect.stringMatching(/atascado/) })
})

test('cuenta los pasos del plan', () => {
  expect(resumenPlan([{ texto: 'a', hecho: true }, { texto: 'b', hecho: false }, { texto: 'c', hecho: false }])).toEqual({ hechos: 1, total: 3, siguiente: 'b' })
  expect(protocolo('una tienda')).toMatch(/Misión: una tienda.*TodoWrite.*equipo:revisor/)
})

type On = Parameters<NonNullable<Parameters<typeof test>[2]>>[1]

const montar = (on: On) => {
  const clock = mock.clock(on)
  mock.store(on)
  const enviados: string[] = []
  on('command.register', () => ({ value: { command: 'x' } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: '/r' }) as never)
  on('turn.complete', () => ({ text: 'ok' }))
  on('tool.call', { tool: 'TodoWrite' }, () => ({ result: { oldTodos: [], newTodos: [] } }) as never)
  on('prompt.submit', (_$, e) => {
    enviados.push(e.text)

    return { text: e.text, context: e.context } as never
  })

  return { clock, enviados }
}

const turno = (reason = 'answer') => ({ reason, answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't' }) as never
const plan = (hechos: number) => ({ tool: 'TodoWrite', todos: ['a', 'b', 'c'].map((c, i) => ({ content: `paso ${c}`, status: i < hechos ? 'completed' : 'pending', activeForm: c })) }) as never

test('un pedido grande arranca la misión solo, y tras cada turno sigue con el siguiente paso hasta revisar y terminar', async ($, on) => {
  const { clock, enviados } = montar(on)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true, source: 'startup' } as never)
  const entra = await $.prompt.submit({ text: 'hazme una página web completa para mi panadería', wait: false, origin: { kind: 'composer' } } as never)
  expect((entra.context ?? []).join(' ')).toMatch(/Misión: hazme una página web completa/)

  await $.tool.call(plan(0))
  await $.turn.complete(turno())
  await clock.advance(0)
  expect(enviados.at(-1)).toMatch(/Piloto: sigue con el paso 1 de 3: paso a/)

  await $.tool.call(plan(1))
  await $.turn.complete(turno())
  await clock.advance(0)
  expect(enviados.at(-1)).toMatch(/paso 2 de 3: paso b/)

  await $.tool.call(plan(3))
  await $.turn.complete(turno())
  await clock.advance(0)
  expect(enviados.at(-1)).toMatch(/equipo:revisor/)

  // El revisor encuentra un problema: se corrige y se revisa de nuevo.
  await $.turn.complete({ agentId: 'r1', reason: 'answer', answer: '- src/a.ts: falta validar vacío', durationMs: 1, isAborted: false, turnId: 'tr' } as never)
  await $.turn.complete(turno())
  await clock.advance(0)
  expect(enviados.at(-1)).toMatch(/revisor encontró problemas \(ronda 1 de 2\)/)
  await $.turn.complete(turno())
  await clock.advance(0)
  expect(enviados.at(-1)).toMatch(/equipo:revisor/)
  await $.turn.complete({ agentId: 'r2', reason: 'answer', answer: 'TODO BIEN', durationMs: 1, isAborted: false, turnId: 'tr2' } as never)

  const antes = enviados.length
  await $.turn.complete(turno())
  await clock.advance(0)
  expect(enviados.length).toBe(antes)
  const estado = await $.command.run({ command: 'piloto', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)
  expect(estado.text).toMatch(/terminó: listo y revisado/)
})

test('un pedido corto no arranca nada y /piloto parar frena una misión', async ($, on) => {
  const { clock, enviados } = montar(on)
  const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true, source: 'startup' } as never)
  const corto = await $.prompt.submit({ text: 'cambia el título', wait: false, origin: { kind: 'composer' } } as never)
  expect(corto.context ?? []).toEqual([])

  await $.command.run({ command: 'piloto', args: 'monta una tienda en línea', ...CMD } as never)
  await $.command.run({ command: 'piloto', args: 'parar', ...CMD } as never)
  const antes = enviados.length
  await $.tool.call(plan(1))
  await $.turn.complete(turno())
  await clock.advance(0)
  expect(enviados.length).toBe(antes)
})

test('el protocolo pide pruebas primero si hay suite, y comprobar a mano si no', () => {
  expect(protocolo('x', true)).toMatch(/pruebas primero.*equipo:arreglador/)
  expect(protocolo('x', false)).toMatch(/No hay suite de pruebas/)
  expect(hayPruebasEnPackage('{"scripts":{"test":"vitest"}}')).toBe(true)
  expect(hayPruebasEnPackage('{"scripts":{"test":"echo \\"Error: no test specified\\" && exit 1"}}')).toBe(false)
  expect(hayPruebasEnPackage('no es json')).toBe(false)
})
