import { expect, test } from 'claude-code/testing'

import { ahorro, costo, familiaDe, modeloParaAgente, slug, AGENTES, GUIA } from './reglas'

test('reconoce la familia del modelo', () => {
  expect(familiaDe('claude-haiku-5-5')).toBe('haiku')
  expect(familiaDe('claude-opus-5-5')).toBe('opus')
  expect(familiaDe('gpt-x')).toBe('otro')
})

test('un agente sin modelo propio recibe uno más barato que el director', () => {
  const base = { pedido: undefined, padre: 'claude-opus-5-5', fork: false }
  expect(modeloParaAgente({ ...base, tipo: 'Explore' })).toBe('haiku')
  expect(modeloParaAgente({ ...base, tipo: 'equipo:obrero' })).toBe('sonnet')
  expect(modeloParaAgente({ ...base, tipo: 'general-purpose' })).toBeUndefined()
  expect(modeloParaAgente({ ...base, tipo: 'equipo:obrero', padre: 'claude-haiku-5-5' })).toBe('claude-haiku-5-5')
})

test('no toca lo que ya eligió alguien, ni bifurcaciones, ni directores igual de baratos', () => {
  const base = { pedido: undefined, padre: 'claude-opus-5-5', fork: false }
  expect(modeloParaAgente({ ...base, tipo: 'Explore', pedido: 'opus' })).toBeUndefined()
  expect(modeloParaAgente({ ...base, tipo: 'Explore', fork: true })).toBeUndefined()
  expect(modeloParaAgente({ ...base, tipo: 'otro-tipo' })).toBeUndefined()
  expect(modeloParaAgente({ ...base, tipo: 'equipo:obrero', padre: 'claude-sonnet-5-5' })).toBe('sonnet')
  expect(modeloParaAgente({ ...base, tipo: 'Explore', padre: 'claude-sonnet-5-5', aprendido: 'sonnet' })).toBeUndefined()
  expect(modeloParaAgente({ ...base, tipo: 'equipo:explorador', aprendido: 'sonnet' })).toBe('sonnet')
})

test('el ahorro compara con el modelo del director', () => {
  const r = { nuevo: 1000, cache: 0, escrito: 100 }
  expect(costo(r, 'opus')).toBe(7500)
  const reg = { id: 'a', tipo: 'Explore', descripcion: '', modelo: 'haiku', familia: 'haiku', padre: 'opus', at: 0, fin: 1, estado: 'listo', ...r } as const
  expect(ahorro(reg)).toBe(6000)
  expect(ahorro({ ...reg, familia: 'opus' })).toBe(0)
})

test('los agentes del equipo tienen modelo, respuesta corta y la guía los nombra', () => {
  for (const a of AGENTES) {
    expect(['haiku', 'sonnet']).toContain(a.model)
    expect(GUIA).toContain(`equipo:${a.name}`)
  }
  expect(slug('¿Cómo hago X en Node.js?')).toBe('como-hago-x-en-node-js')
  expect(slug('???')).toBe('investigacion')
})

const SPAWN = { tool_use_id: 't1', prompt: 'busca', description: 'buscar', subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: false, fork: false } as const

test('el hook baja el modelo del agente y lo anota con su gasto', async ($, on) => {
  on('clock.now', () => ({ value: 1000 }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  let modelo: string | undefined
  on('agent.spawn', (_$, e) => {
    modelo = e.model

    return { model: e.model ?? 'opus', agentId: 'ag1' } as never
  })
  const r = await $.agent.spawn(SPAWN as never)
  expect(modelo).toBe('haiku')
  expect(r.agentId).toBe('ag1')
  const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
  expect((await $.command.run({ command: 'equipo', args: '', ...CMD } as never)).text).toMatch(/1 agentes \(1 con haiku\), 1 trabajando/)
  await $.turn.complete({ agentId: 'ag1', reason: 'answer', answer: 'ok', usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 } } as never)
  const texto = (await $.command.run({ command: 'equipo', args: '', ...CMD } as never)).text
  expect(texto).toMatch(/1 con haiku\)/)
  expect(texto).not.toMatch(/trabajando/)
})

test('el equipo aprende: dos fallos del explorador y la próxima vez corre con Sonnet', async ($, on) => {
  on('clock.now', () => ({ value: 1000 }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  const modelos: (string | undefined)[] = []
  let n = 0
  on('agent.spawn', (_$, e) => {
    modelos.push(e.model)

    return { model: e.model ?? 'opus', agentId: `ag${++n}` } as never
  })
  for (let i = 0; i < 2; i++) {
    await $.agent.spawn({ ...SPAWN, subagentType: 'equipo:explorador' } as never)
    await $.turn.complete({ agentId: `ag${i + 1}`, reason: 'answer', answer: '', usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never)
  }
  await $.agent.spawn({ ...SPAWN, subagentType: 'equipo:explorador' } as never)
  expect(modelos).toEqual(['haiku', 'haiku', 'sonnet'])
})

test('/equipo probar lanza un explorador barato y dice con qué modelo corre', async ($, on) => {
  on('clock.now', () => ({ value: 1000 }) as never)
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'opus', agentId: 'p1' }) as never)
  const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
  const r = await $.command.run({ command: 'equipo', args: 'probar', ...CMD } as never)
  expect(r.text).toMatch(/Autoprueba lanzada.*"haiku"/)
})

test('el revisor que halla problemas castiga al obrero; TODO BIEN no', async ($, on) => {
  on('clock.now', () => ({ value: 1000 }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  let n = 0
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'opus', agentId: `a${++n}` }) as never)
  const uso = { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
  const ronda = async (veredicto: string) => {
    await $.agent.spawn({ ...SPAWN, subagentType: 'equipo:obrero' } as never)
    await $.turn.complete({ agentId: `a${n}`, reason: 'answer', answer: 'Cambié src/a.ts y corrí las pruebas: pasan.', usage: uso } as never)
    await $.agent.spawn({ ...SPAWN, subagentType: 'equipo:revisor' } as never)
    await $.turn.complete({ agentId: `a${n}`, reason: 'answer', answer: veredicto, usage: uso } as never)
  }
  await ronda('TODO BIEN')
  await ronda('TODO BIEN')
  expect((await $.command.run({ command: 'equipo', args: '', ...CMD } as never)).text).not.toMatch(/falló/)
  await ronda('- src/a.ts: falta validar vacío')
  await ronda('- src/b.ts: rompe el login')
  expect((await $.command.run({ command: 'equipo', args: '', ...CMD } as never)).text).toMatch(/obrero falló/)
})

test('si el clasificador no da veredicto, /equipo probar reintenta una vez', async ($, on) => {
  on('clock.now', () => ({ value: 1000 }) as never)
  let intentos = 0
  on('agent.spawn', (_$, e) => {
    intentos += 1

    return (intentos === 1 ? { deny: 'The server-side auto mode classifier gave no verdict' } : { model: e.model ?? 'opus', agentId: 'p1' }) as never
  })
  const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
  const r = await $.command.run({ command: 'equipo', args: 'probar', ...CMD } as never)
  expect(intentos).toBe(2)
  expect(r.text).toMatch(/Autoprueba lanzada/)
})

test('un mensaje de tarea grande viaja con la pista del equipo', async ($, on) => {
  let visto: readonly string[] | undefined
  on('prompt.submit', (_$, e) => {
    visto = e.context

    return { text: e.text, context: e.context } as never
  })
  on('session.usage', () => ({ value: { context: { percent: 10 } } }) as never)
  await $.prompt.submit({ text: 'quiero esto:\n- login\n- registro\n- recuperar clave', wait: false, origin: { kind: 'composer' } } as never)
  expect(visto?.join(' ')).toMatch(/<equipo>Tarea grande/)
  visto = undefined
  await $.prompt.submit({ text: 'gracias', wait: false, origin: { kind: 'composer' } } as never)
  expect(visto ?? []).toEqual([])
})

test('lo que responde un agente queda en la pizarra', async ($, on) => {
  on('clock.now', () => ({ value: 1000 }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'opus', agentId: 'z1' }) as never)
  on('fs.read', () => ({ value: '' }) as never)
  let escrito = ''
  on('fs.write', (_$, e) => {
    escrito = (e as { text: string }).text

    return { value: undefined } as never
  })
  await $.agent.spawn(SPAWN as never)
  await $.turn.complete({ agentId: 'z1', reason: 'answer', answer: 'Está en src/login.ts:42', usage: { input_tokens: 5, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never)
  expect(escrito).toMatch(/# Pizarra del equipo[\s\S]*Está en src\/login\.ts:42/)
})
