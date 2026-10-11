import { expect, test } from 'claude-code/testing'

import { ahorro, costo, dificultadDe, familiaDe, modeloParaAgente, slug, AGENTES, GUIA } from './reglas'

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
  expect(costo(r, 'opus')).toBe(60000)
  const reg = { id: 'a', tipo: 'Explore', descripcion: '', modelo: 'haiku', familia: 'haiku', padre: 'opus', at: 0, fin: 1, estado: 'listo', ...r } as const
  expect(ahorro(reg)).toBe(58500)
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
    await $.turn.complete({ reason: 'answer', answer: 'listo', usage: uso } as never)
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

test('la dificultad que escribe el director ajusta el modelo, sin pisar lo aprendido', () => {
  const base = { pedido: undefined, padre: 'claude-opus-5-5', fork: false }
  expect(dificultadDe('buscar login. dificultad: alta', '')).toBe('alta')
  expect(dificultadDe('x', 'Dificultad = fácil\nhaz esto')).toBe('baja')
  expect(dificultadDe('x', 'sin etiqueta')).toBeUndefined()
  expect(modeloParaAgente({ ...base, tipo: 'equipo:obrero', dificultad: 'alta' })).toBe('opus')
  expect(modeloParaAgente({ ...base, tipo: 'equipo:obrero', dificultad: 'baja' })).toBe('haiku')
  expect(modeloParaAgente({ ...base, tipo: 'equipo:explorador', dificultad: 'alta' })).toBe('sonnet')
  // Si el equipo ya lo subió por fallos, "baja" no lo vuelve a bajar.
  expect(modeloParaAgente({ ...base, tipo: 'equipo:explorador', aprendido: 'sonnet', dificultad: 'baja' })).toBe('sonnet')
  // Nunca más caro que el director.
  expect(modeloParaAgente({ ...base, tipo: 'equipo:obrero', padre: 'claude-sonnet-5-5', dificultad: 'alta' })).toBe('claude-sonnet-5-5')
})

test('máximo 3 agentes a la vez: el cuarto se rechaza con un mensaje claro', async ($, on) => {
  on('clock.now', () => ({ value: 1000 }) as never)
  let n = 0
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'opus', agentId: `q${++n}` }) as never)
  const resultados = []
  for (let i = 0; i < 4; i++) resultados.push(await $.agent.spawn({ ...SPAWN, subagentType: 'equipo:explorador' } as never))
  expect(resultados.slice(0, 3).every(r => r.deny === undefined)).toBe(true)
  expect(resultados[3]?.deny).toMatch(/3 agentes trabajando a la vez/)
})

test('máximo 6 agentes por tarea; al terminar el turno del director se reinicia la cuenta', async ($, on) => {
  on('clock.now', () => ({ value: 1000 }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  let n = 0
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'opus', agentId: `w${++n}` }) as never)
  const uso = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  const uno = async () => {
    const r = await $.agent.spawn({ ...SPAWN, subagentType: 'equipo:explorador' } as never)
    if (r.deny === undefined) await $.turn.complete({ agentId: `w${n}`, reason: 'answer', answer: 'src/a.ts:1', usage: uso } as never)

    return r
  }
  for (let i = 0; i < 6; i++) expect((await uno()).deny).toBeUndefined()
  expect((await uno()).deny).toMatch(/6 agentes/)
  await $.turn.complete({ reason: 'answer', answer: 'ok', usage: uso } as never)
  expect((await uno()).deny).toBeUndefined()
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

test('la dificultad que escribe el director ajusta el modelo, sin pisar lo aprendido', () => {
  const base = { pedido: undefined, padre: 'claude-opus-5-5', fork: false }
  expect(dificultadDe('buscar login. dificultad: alta', '')).toBe('alta')
  expect(dificultadDe('x', 'Dificultad = fácil\nhaz esto')).toBe('baja')
  expect(dificultadDe('x', 'sin etiqueta')).toBeUndefined()
  expect(modeloParaAgente({ ...base, tipo: 'equipo:obrero', dificultad: 'alta' })).toBe('opus')
  expect(modeloParaAgente({ ...base, tipo: 'equipo:obrero', dificultad: 'baja' })).toBe('haiku')
  expect(modeloParaAgente({ ...base, tipo: 'equipo:explorador', dificultad: 'alta' })).toBe('sonnet')
  // Si el equipo ya lo subió por fallos, "baja" no lo vuelve a bajar.
  expect(modeloParaAgente({ ...base, tipo: 'equipo:explorador', aprendido: 'sonnet', dificultad: 'baja' })).toBe('sonnet')
  // Nunca más caro que el director.
  expect(modeloParaAgente({ ...base, tipo: 'equipo:obrero', padre: 'claude-sonnet-5-5', dificultad: 'alta' })).toBe('claude-sonnet-5-5')
})

test('máximo 3 agentes a la vez: el cuarto se rechaza con un mensaje claro', async ($, on) => {
  on('clock.now', () => ({ value: 1000 }) as never)
  let n = 0
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'opus', agentId: `q${++n}` }) as never)
  const resultados = []
  for (let i = 0; i < 4; i++) resultados.push(await $.agent.spawn({ ...SPAWN, subagentType: 'equipo:explorador' } as never))
  expect(resultados.slice(0, 3).every(r => r.deny === undefined)).toBe(true)
  expect(resultados[3]?.deny).toMatch(/3 agentes trabajando a la vez/)
})

test('máximo 6 agentes por tarea; al terminar el turno del director se reinicia la cuenta', async ($, on) => {
  on('clock.now', () => ({ value: 1000 }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  let n = 0
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'opus', agentId: `w${++n}` }) as never)
  const uso = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  const uno = async () => {
    const r = await $.agent.spawn({ ...SPAWN, subagentType: 'equipo:explorador' } as never)
    if (r.deny === undefined) await $.turn.complete({ agentId: `w${n}`, reason: 'answer', answer: 'src/a.ts:1', usage: uso } as never)

    return r
  }
  for (let i = 0; i < 6; i++) expect((await uno()).deny).toBeUndefined()
  expect((await uno()).deny).toMatch(/6 agentes/)
  await $.turn.complete({ reason: 'answer', answer: 'ok', usage: uso } as never)
  expect((await uno()).deny).toBeUndefined()
})

type On = Parameters<NonNullable<Parameters<typeof test>[2]>>[1]
/** El selector y el presupuesto, reducidos a lo que publican en su estado. */
const selectorSimulado = {
  name: 'selector-modelo',
  register: (on: On) => {
    on('session.start', async ($, e, next) => {
      await $.state.set({ plugin: 'selector-modelo', key: 'nivel' } as never, 4 as never)

      return next(e)
    })
  },
}
const presupuestoSimulado = {
  name: 'presupuesto',
  register: (on: On) => {
    on('session.start', async ($, e, next) => {
      await $.state.set({ plugin: 'presupuesto', key: 'estado' } as never, { topeMax: 2 } as never)

      return next(e)
    })
  },
}

test('el director es el modelo que puso el selector, y el tope del presupuesto vale también para los agentes', { plugins: [selectorSimulado, presupuestoSimulado] }, async ($, on) => {
  const vistos: (string | undefined)[] = []
  on('agent.spawn', (_$, e) => {
    vistos.push(e.model)

    return { model: e.model ?? 'opus', agentId: `s${vistos.length}` } as never
  })
  on('clock.now', () => ({ value: 1000 }) as never)
  on('command.register', () => ({ value: { command: 'x' } }) as never)
  on('agent.register', () => ({ value: { agent: 'x' } }) as never)
  on('session.start', () => ({ cwd: '/r' }) as never)
  await $.session.start({ cwd: '/r', surface: 'desktop', isInteractive: true, source: 'startup' } as never)
  // Sesión en Opus, pero el selector trabaja en Sonnet y el tope pide Haiku: nada pasa de Haiku.
  await $.agent.spawn({ ...SPAWN, subagentType: 'equipo:obrero', description: 'cambiar. dificultad: alta' } as never)
  await $.agent.spawn({ ...SPAWN, subagentType: 'general-purpose', model: 'opus' } as never)
  expect(vistos).toEqual(['haiku', 'haiku'])
})

test('la guía del prompt de sistema no cambia a mitad de la charla aunque el equipo aprenda', async ($, on) => {
  on('clock.now', () => ({ value: 1000 }) as never)
  on('prompt.compose', (() => ({ sections: [{ id: 'intro', text: 'hola', scope: 'shared' }] })) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  let n = 0
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'opus', agentId: `g${++n}` }) as never)
  const compuesto = async () => (await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })).sections.find(s => s.id === 'equipo:guia')?.text
  const antes = await compuesto()
  expect(antes).toMatch(/Equipo de trabajo/)
  for (let i = 0; i < 2; i++) {
    await $.agent.spawn({ ...SPAWN, subagentType: 'equipo:explorador' } as never)
    await $.turn.complete({ agentId: `g${n}`, reason: 'answer', answer: '', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never)
  }
  expect(await compuesto()).toBe(antes)
})

test('una interrupción no cuenta como fallo del agente: no sube de nivel', async ($, on) => {
  on('clock.now', () => ({ value: 1000 }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  const modelos: (string | undefined)[] = []
  let n = 0
  on('agent.spawn', (_$, e) => {
    modelos.push(e.model)

    return { model: e.model ?? 'opus', agentId: `i${++n}` } as never
  })
  for (let i = 0; i < 3; i++) {
    await $.agent.spawn({ ...SPAWN, subagentType: 'equipo:explorador' } as never)
    await $.turn.complete({ agentId: `i${n}`, reason: 'aborted', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never)
  }
  expect(modelos).toEqual(['haiku', 'haiku', 'haiku'])
})

test('con la clave de OmniRoute puesta Claude tiene la herramienta gratis y su texto vuelve', async ($, on) => {
  on('clock.now', () => ({ value: 1000 }) as never)
  on('command.register', () => ({ value: { command: 'x' } }) as never)
  on('agent.register', () => ({ value: { agent: 'x' } }) as never)
  let registrada = ''
  on('tool.register', (_$, e) => {
    registrada = (e as { name: string }).name

    return { value: { tool: 'mcp__equipo__gratis' } } as never
  })
  on('env.get', (_$, e) => ({ value: (e as { name: string }).name === 'OMNIROUTE_API_KEY' ? 'k123' : undefined }) as never)
  let pedido = ''
  on('http.fetch', (_$, e) => {
    pedido = JSON.stringify(e)

    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ choices: [{ message: { content: 'Resumen listo' } }] }) } } as never
  })
  on('session.start', () => ({ cwd: '/r' }) as never)
  await $.session.start({ cwd: '/r', surface: 'desktop', isInteractive: true, source: 'startup' } as never)
  expect(registrada).toBe('gratis')

  const r = await $.tool.call({ tool: 'mcp__equipo__gratis', tarea: 'resume esto', contexto: 'hola mundo' } as never)
  expect((r as { text?: string }).text ?? String((r as { result?: unknown }).result)).toMatch(/Resumen listo/)
  expect(pedido).toMatch(/localhost:20128\/v1\/chat\/completions/)
  expect(pedido).toMatch(/Bearer k123/)

  const bloqueado = await $.tool.call({ tool: 'mcp__equipo__gratis', tarea: 'usa password = hunter2hunter2' } as never)
  expect(bloqueado.deny).toMatch(/clave o contraseña/)
})
