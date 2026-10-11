import { expect, mock, test } from 'claude-code/testing'

import {
  ajustes,
  decidir,
  escalar,
  ESCALERA,
  heuristica,
  leerPuntos,
  NIVEL_PILOTO,
  peldano,
  puntosANivel,
  pideUnPlan,
  techoEfectivo,
} from '../hooks/register'

const nivel = (args: string) => ({
  command: 'nivel',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
}) as const
const pedir = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const

const CERO = { alcance: 0, razonamiento: 0, riesgo: 0, dudas: 0, calidad: 0 }
const PAGINA = { alcance: 3, razonamiento: 2, riesgo: 1, dudas: 2, calidad: 3 }
const PANE = {
  title: 'Selector de modelo',
  isFocused: false,
  bodyColumns: 64,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 24 },
  view: {},
} as const

test('la escalera tiene 9 niveles, de Haiku a Opus', async () => {
  expect(ESCALERA.length).toBe(9)
  expect(peldano(1).model).toBe('claude-haiku-5-5')
  expect(peldano(4).model).toBe('claude-sonnet-5-5')
  expect(peldano(9).effort).toBe('max')
})

test('los puntos se vuelven nivel', async () => {
  expect(puntosANivel(CERO)).toBe(1)
  expect(puntosANivel({ ...CERO, calidad: 1 })).toBe(2)
  expect(puntosANivel(PAGINA)).toBe(7)
  expect(puntosANivel({ alcance: 3, razonamiento: 3, riesgo: 3, dudas: 3, calidad: 3 })).toBe(9)
})

test('lee el JSON del clasificador aunque venga con ruido', async () => {
  const r = leerPuntos('Claro: {"alcance":3,"razonamiento":2,"riesgo":9,"dudas":1,"calidad":3,"motivo":"página completa"}')
  expect(r?.puntos.alcance).toBe(3)
  expect(r?.puntos.riesgo).toBe(3)
  expect(r?.motivo).toBe('página completa')
  expect(leerPuntos('no sé')).toBeUndefined()
  expect(leerPuntos('{"motivo":"sin números"}')).toBeUndefined()
})

test('el respaldo por palabras clave separa lo fácil de lo difícil', async () => {
  expect(puntosANivel(heuristica('cambia el color del botón a rojo'))).toBeLessThan(3)
  expect(puntosANivel(heuristica('hazme una página completa para la barbería, llamativa'))).toBeGreaterThan(5)
  expect(heuristica('migra la base de datos de supabase').riesgo).toBe(3)
})

test('el mensaje ajusta: cuidado sube, prisa baja, imágenes piden Sonnet', async () => {
  expect(ajustes('piensa bien esto', 0).delta).toBe(1)
  expect(ajustes('hazlo rápido', 0).delta).toBe(-1)
  expect(ajustes('que la página cargue rápido', 0).delta).toBe(0)
  expect(ajustes('mira', 1).minimo).toBe(3)
  expect(ajustes('1. uno\n2. dos\n3. tres\n4. cuatro', 0).delta).toBe(1)
})

test('bajar de modelo cuida la caché en conversaciones largas', async () => {
  const corta = { mensajes: 4, contexto: 10_000 }
  const larga = { mensajes: 60, contexto: 90_000 }
  expect(decidir({ actual: 7, pedido: 2, alcance: 0, ...corta }).nivel).toBe(2)
  expect(decidir({ actual: 7, pedido: 2, alcance: 0, ...larga }).nivel).toBe(6)
  expect(decidir({ actual: 7, pedido: 4, alcance: 2, ...larga }).nivel).toBe(4)
  expect(decidir({ actual: 7, pedido: 4, alcance: 2, mensajes: 60, contexto: 400_000 }).nivel).toBe(6)
  expect(decidir({ actual: 2, pedido: 8, alcance: 3, ...larga }).nivel).toBe(8)
  expect(decidir({ actual: 5, pedido: 3, alcance: 0, ...larga }).nivel).toBe(3)
})

test('un turno que va mal sube solo, sin pasar del tope', async () => {
  expect(escalar(2, 3, 0, 9)).toBe(2)
  expect(escalar(2, 15, 0, 9)).toBe(4)
  expect(escalar(4, 40, 0, 9)).toBe(4)
  expect(escalar(4, 5, 4, 9)).toBe(6)
  expect(escalar(1, 5, 8, 9)).toBe(6)
  expect(escalar(4, 5, 4, 5)).toBe(5)
  expect(escalar(8, 5, 12, 9)).toBe(9)
})

test('/nivel fija, pone tope y vuelve a auto', async ($, on) => {
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  expect((await $.command.run(nivel('7'))).text).toContain('Opus · esfuerzo alto')
  expect((await $.command.run(nivel('tope 5'))).text).toContain('nivel 5')
  expect((await $.command.run(nivel('auto'))).text).toContain('automático')
  expect((await $.command.run(nivel(''))).text).toContain('Nivel 7 de 9')
})

test('una petición se clasifica y el turno sale con ese modelo', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const pedidos: { model: string; effort: unknown }[] = []
  on('model.complete', () => ({
    value: {
      isAnswered: true,
      text: '{"alcance":3,"razonamiento":2,"riesgo":1,"dudas":2,"calidad":3,"motivo":"página completa y visual"}',
      usage: { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.step', async function* ($, e) {
    pedidos.push({ model: e.model, effort: e.effort })
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'listo',
      toolUses: [],
      stopReason: 'end_turn',
      usage: {
        model: e.model,
        input_tokens: 1000,
        output_tokens: 200,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    }
  })

  await $.command.run(nivel('auto'))
  await $.prompt.submit(pedir('hazme la página completa de la barbería con agenda por WhatsApp'))
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-haiku-5-5', messageCount: 2 })) void _
  expect(pedidos[0]).toEqual({ model: 'claude-opus-5-5', effort: 'high' })

  // Una respuesta corta sigue la misma tarea: mismo nivel, sin consultar otra vez.
  await $.prompt.submit(pedir('dale'))
  for await (const _ of $.turn.step({ turnId: 't2', index: 0, model: 'claude-haiku-5-5', messageCount: 4 })) void _
  expect(pedidos[1]).toEqual({ model: 'claude-opus-5-5', effort: 'high' })

  // Un subagente conserva el modelo que se le pidió.
  for await (const _ of $.turn.step({ turnId: 't3', index: 0, model: 'claude-haiku-5-5', messageCount: 1, agentId: 'a1' })) void _
  expect(pedidos[2]?.model).toBe('claude-haiku-5-5')

  const ui = await $.ui.mount({
    plugin: 'selector-modelo',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'selector-modelo',
    props: PANE,
  })
  expect(await ui.find({ type: 'Text', text: /NIVEL 7 DE 9 · MUY DIFÍCIL/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /sigue la tarea anterior/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /hazme la página completa/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /2 llamadas/ })).toBeDefined()
  await ui.unmount()
})

test('el panel se dibuja y sus botones cambian el nivel', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    await $.command.run(nivel('4'))
    const ui = await $.ui.mount({
      plugin: 'selector-modelo',
      surface,
      component: 'Pane',
      requestId: 'selector-modelo',
      props: PANE,
    })
    expect(await ui.find({ type: 'Text', text: /NIVEL 4 DE 9/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /REPARTO DE ESTA SESIÓN/ })).toBeDefined()
    await ui.press({ key: 'subir' })
    expect(await ui.find({ type: 'Text', text: /NIVEL 5 DE 9/ })).toBeDefined()
    await ui.press({ key: 'auto' })
    expect(await ui.find({ type: 'Text', text: /automático/ })).toBeDefined()
    await ui.unmount()
  }
})

test('el presupuesto puede bajar el tope, nunca subirlo', async () => {
  expect(techoEfectivo(9, null)).toBe(9)
  expect(techoEfectivo(9, 4)).toBe(4)
  expect(techoEfectivo(3, 5)).toBe(3)
  expect(techoEfectivo(9, undefined)).toBe(9)
})

test('las tareas grandes piden un plan visible, las pequeñas no', async () => {
  expect(pideUnPlan(null)).toBe(false)
  expect(pideUnPlan(CERO)).toBe(false)
  expect(pideUnPlan(PAGINA)).toBe(true)
  expect(pideUnPlan({ ...CERO, alcance: 1, razonamiento: 1 })).toBe(false)
  expect(pideUnPlan({ ...CERO, alcance: 1, riesgo: 3 })).toBe(true)
})

test('con la caché caliente no se cambia de modelo ni de esfuerzo por un escalón; con la fría sí, y subir mucho siempre', () => {
  const base = { mensajes: 4, contexto: 30_000, alcance: 1 }
  expect(decidir({ actual: 4, pedido: 5, ...base, fria: false }).nivel).toBe(4)
  expect(decidir({ actual: 5, pedido: 3, ...base, fria: false }).nivel).toBe(5)
  expect(decidir({ actual: 4, pedido: 5, ...base, fria: true }).nivel).toBe(5)
  expect(decidir({ actual: 3, pedido: 6, ...base, fria: false }).nivel).toBe(6)
  expect(decidir({ actual: 4, pedido: 4, ...base, fria: false }).nota).toBe('')
})

test('el mínimo del director durante una misión del piloto es un escalón de Opus', () => {
  expect(peldano(NIVEL_PILOTO).familia).toBe('opus')
})
