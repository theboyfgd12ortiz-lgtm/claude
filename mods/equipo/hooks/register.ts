import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Aprendizaje, Investigacion, Registro } from '../types'
import { AVISO_COMPACTAR, entradaPizarra, esTareaGrande, pistaDeEquipo, PIZARRA, sumarEntrada } from './contexto'
import { aprender, esBueno, lecciones, modeloAprendido } from './aprende'
import { AGENTES, ahorro, costo, familiaDe, GUIA, modeloParaAgente, slug } from './reglas'

const agentes = atom({ plugin: 'equipo', key: 'agentes' } as const, [])
const investigacion = atom({ plugin: 'equipo', key: 'investigacion' } as const, null)
const isAuto = atom({ plugin: 'equipo', key: 'isAuto' } as const, true)
const aprendizaje = atom({ plugin: 'equipo', key: 'aprendizaje' } as const, {})
const presupuestoEstado = { plugin: 'presupuesto', key: 'estado' } as const

/** De dónde vienen los mensajes de la persona. */
const PERSONA = new Set(['composer', 'bridge', 'sdk', 'slack-ping', 'unclassified'])

/** Cuántos agentes se recuerdan para el panel. */
const MAX = 40

const num = (n: number | undefined): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

/** Resumen corto del equipo, para /equipo y para el panel sin pantalla. */
export const resumenEquipo = (lista: readonly Registro[]): string => {
  if (lista.length === 0) return 'Aún no trabajó ningún agente del equipo.'
  const trabajando = lista.filter(r => r.estado === 'trabajando').length
  const ahorrado = lista.reduce((s, r) => s + ahorro(r), 0)
  const porModelo = ['haiku', 'sonnet', 'opus', 'otro']
    .map(f => [f, lista.filter(r => r.familia === f).length] as const)
    .filter(([, n]) => n > 0)
    .map(([f, n]) => `${n} con ${f}`)
    .join(', ')

  return `${lista.length} agentes (${porModelo})${trabajando > 0 ? `, ${trabajando} trabajando` : ''} · ${ahorrado >= 0 ? 'ahorro' : 'sobrecosto'} neto estimado ~${Math.abs(Math.round(ahorrado / 1000)).toLocaleString('es')}k unidades (ya descontado lo que cuesta delegar; comparado con hacerlo todo con el modelo del director; es una estimación).`
}

/** Lanza un agente; el clasificador del modo automático a veces no da veredicto la primera vez y pide repetir una vez. */
const lanzar = async ($: EngineInterface, args: Parameters<EngineInterface['agent']['spawn']>[0]) => {
  const r = await $.agent.spawn(args)
  if (r.deny !== undefined && /classifier|verdict/i.test(r.deny)) return $.agent.spawn(args)

  return r
}

/** Cambia lo aprendido y lo guarda para la próxima sesión. */
const recordar = async ($: EngineInterface, cambio: (a: Aprendizaje) => Aprendizaje) => {
  const nuevo = await update($, aprendizaje, cambio)
  await $.store.set('aprendizaje', nuevo).catch(() => undefined)
}

const guardar = async ($: EngineInterface, i: Investigacion): Promise<string> => {
  const archivo = `.claude/investigaciones/${slug(i.pregunta)}.md`
  await $.fs.write(archivo, `# ${i.pregunta}\n\n${i.texto}\n`)
  await update($, investigacion, v => (v === null ? v : { ...v, archivo }))

  return archivo
}

export const register: Register = on => {
  // Agente de la autoprueba en curso.
  let pruebaId: string | undefined

  // Obreros que terminaron desde la última revisión: si el revisor encuentra problemas, se les anota.
  let obreros: { familia: string }[] = []

  on('session.start', async ($, e, next) => {
    for (const spec of AGENTES) await $.agent.register(spec).catch(() => undefined)
    await $.command.register({
      name: 'equipo',
      description: 'Equipo de agentes con modelos baratos: /equipo · on|off · olvidar · probar',
      argumentHint: 'on|off|olvidar|probar',
    })
    await $.command.register({
      name: 'investigar',
      description: 'Investiga en internet con un agente barato: /investigar <pregunta> · ver · guardar',
      argumentHint: '<pregunta> | ver | guardar',
    })
    const guardado = await $.store.get('aprendizaje').catch(() => undefined)
    if (guardado !== null && typeof guardado === 'object' && !Array.isArray(guardado)) await update($, aprendizaje, () => guardado as Aprendizaje)
    if ((await $.store.get('isAuto').catch(() => undefined)) === false) await update($, isAuto, () => false)

    return next(e)
  })

  // Tareas grandes y contexto lleno: una pista corta con el mensaje (fuera del prompt de sistema, para no romper la caché).
  on('prompt.submit', async ($, e, next) => {
    const origen = (e.origin as { kind?: string } | undefined)?.kind
    if ((origen !== undefined && !PERSONA.has(origen)) || !(await read($, isAuto))) return next(e)
    const tope = (await $.state.get(presupuestoEstado).catch(() => undefined))?.value?.topeMax
    if (tope !== undefined && tope !== null) return next(e)
    const usage = await $.session.usage().catch(() => null)
    const pista = pistaDeEquipo({ contexto: usage?.context.percent ?? 0, grande: esTareaGrande(e.text), hayPizarra: (await read($, agentes)).length > 0 })

    return next(pista === undefined ? e : { ...e, context: [...(e.context ?? []), pista] })
  }).catch(($, e, next) => next(e))

  // Al compactar se conserva el plan y dónde están los resultados.
  on('session.compact', ($, e, next) => next({ ...e, instructions: e.instructions === undefined ? AVISO_COMPACTAR : `${e.instructions}\n\n${AVISO_COMPACTAR}` })).catch(($, e, next) => next(e))

  // 1. El director sabe cómo repartir el trabajo.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (e.traits.includes('bare') || e.traits.includes('analysis') || !(await read($, isAuto))) return composed
    // Con el presupuesto apretado se trabaja sin lanzar agentes: la guía solo estorbaría.
    const tope = (await $.state.get(presupuestoEstado).catch(() => undefined))?.value?.topeMax
    if (tope !== undefined && tope !== null) return composed
    const aprendido = lecciones(await read($, aprendizaje))
    const texto = aprendido.length === 0 ? GUIA : `${GUIA}\nLo que el equipo ya aprendió:\n${aprendido.map(l => `- ${l}`).join('\n')}`

    return { sections: [...composed.sections, { id: 'equipo:guia', text: texto, scope: 'session' }] }
  })

  // 2. Un agente sin modelo propio corre con el más barato que sirva.
  on('agent.spawn', async ($, e, next) => {
    const objetivo =
      e.fork || e.isTeammate === true || e.workflow !== undefined || !(await read($, isAuto))
        ? undefined
        : modeloParaAgente({ tipo: e.subagentType, pedido: e.model, padre: e.parentModel ?? '', fork: false, aprendido: modeloAprendido(await read($, aprendizaje), e.subagentType) })
    const lanzado = await next(objetivo === undefined ? e : { ...e, model: objetivo })
    if (lanzado.deny !== undefined || lanzado.agentId === undefined) return lanzado

    const id = lanzado.agentId
    const reg: Registro = {
      id,
      tipo: e.subagentType,
      descripcion: e.description,
      modelo: lanzado.model,
      familia: familiaDe(lanzado.model),
      padre: familiaDe(e.parentModel ?? ''),
      at: await $.clock.now(),
      fin: null,
      estado: 'trabajando',
      nuevo: 0,
      cache: 0,
      escrito: 0,
      encargo: Math.ceil(e.prompt.length / 4),
    }
    await update($, agentes, l => [reg, ...l].slice(0, MAX))

    return lanzado
  }).catch(($, e, next) => next(e))

  // 3. Lo que gastó cada agente y su respuesta.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const id = e.agentId
    if (id === undefined) {
      obreros = []

      return done
    }

    const u = e.usage
    if (u !== undefined) {
      await update($, agentes, l =>
        l.map(r =>
          r.id === id
            ? { ...r, nuevo: r.nuevo + num(u.input_tokens) + num(u.cache_creation_input_tokens), cache: r.cache + num(u.cache_read_input_tokens), escrito: r.escrito + num(u.output_tokens) }
            : r,
        ),
      )
    }
    const esPrueba = id === pruebaId
    if (esPrueba) {
      pruebaId = undefined
      const ok = e.reason === 'answer' && typeof e.answer === 'string' && e.answer.trim() !== ''
      $.ui.toast(ok ? 'equipo: autoprueba superada, el agente respondió.' : 'equipo: autoprueba falló, el agente no respondió.')
    }
    const fin = await $.clock.now()
    const respuesta = typeof e.answer === 'string' ? Math.ceil(e.answer.length / 4) : 0
    const lista = await update($, agentes, l => l.map(r => (r.id === id ? { ...r, estado: 'listo' as const, fin, respuesta } : r)))
    const reg = lista.find(r => r.id === id)
    if (reg !== undefined) {
      const bueno = esBueno(e.reason, e.answer, reg.tipo)
      if (e.reason === 'answer' && typeof e.answer === 'string' && e.answer.trim() !== '' && !esPrueba) {
        const hoy = new Date(fin).toISOString().slice(11, 16)
        const previa = await $.fs.read(PIZARRA).then(r => (typeof r === 'string' ? r : ''), () => '')
        await $.fs.write(PIZARRA, sumarEntrada(previa, entradaPizarra(reg.tipo, reg.descripcion, e.answer, hoy))).catch(() => undefined)
      }
      await recordar($, a => aprender(a, reg.tipo, reg.familia, bueno, costo(reg, reg.familia), ahorro(reg)))
      if (reg.tipo === 'equipo:obrero') obreros = [...obreros, { familia: reg.familia }].slice(-3)
      // El revisor encontró problemas en lo que hicieron los obreros: eso sí es un fallo de ellos.
      if (reg.tipo === 'equipo:revisor' && bueno && typeof e.answer === 'string' && !/TODO BIEN/.test(e.answer) && obreros.length > 0) {
        const culpables = obreros
        obreros = []
        await recordar($, a => culpables.reduce((acc, o) => aprender(acc, 'equipo:obrero', o.familia, false, 0, 0, false), a))
      }
    }
    const actual = await read($, investigacion)
    if (actual !== null && actual.estado === 'trabajando' && actual.id === id) {
      const texto = e.reason === 'answer' && typeof e.answer === 'string' ? e.answer.trim() : ''
      await update($, investigacion, v => (v === null ? v : { ...v, estado: texto === '' ? ('fallo' as const) : ('listo' as const), texto }))
      $.ui.toast(texto === '' ? 'equipo: la investigación no devolvió nada.' : 'equipo: investigación lista. Escribe /investigar ver para leerla.')
    }

    return done
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'equipo' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await update($, isAuto, () => arg === 'on')
      await $.store.set('isAuto', arg === 'on').catch(() => undefined)
    }
    if (arg === 'probar') {
      try {
        const r = await lanzar($, { prompt: 'Lista los nombres de los archivos que hay en la carpeta actual (solo el nivel superior) y responde en una línea.', description: 'Autoprueba del equipo', subagentType: 'equipo:explorador', model: 'haiku' })
        if (r.deny !== undefined) {
          // Lanzado por Claude mismo sí pasa por el permiso normal: se deja la petición lista para enviar.
          await $.prompt.fill({ text: 'Usa el agente equipo:explorador (model haiku) para listar los archivos de la carpeta actual y dime con qué modelo corrió.' }).catch(() => undefined)

          return { text: `El modo automático no dejó que el comando lance el agente (${r.deny.slice(0, 120)}). Dejé la petición escrita en el cuadro: envíala y Claude lo lanzará él, que sí tiene permiso.` }
        }
        pruebaId = r.agentId

        return { text: `Autoprueba lanzada. El agente corre con "${r.model}" (esperado: haiku, o el modelo del director si es más barato). Te aviso cuando responda.` }
      } catch (error) {
        return { text: `Autoprueba: no se pudo lanzar un agente (${error instanceof Error ? error.message : String(error)}). El reparto automático no funcionará en esta sesión.` }
      }
    }
    if (arg === 'olvidar') await recordar($, () => ({}))
    const auto = await read($, isAuto)
    const aprendido = lecciones(await read($, aprendizaje))

    return { text: [`Equipo ${auto ? 'activo' : 'apagado'}. ${resumenEquipo(await read($, agentes))}`, ...aprendido.map(l => `· ${l}`)].join('\n') }
  })

  on('command.run', { command: 'investigar' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === '') return { text: 'Uso: /investigar <qué quieres saber> · ver · guardar' }

    if (arg.toLowerCase() === 'ver') {
      const v = await read($, investigacion)
      if (v === null) return { text: 'Aún no hay investigaciones.' }

      return { text: v.estado === 'trabajando' ? `Sigo investigando: ${v.pregunta}` : v.estado === 'fallo' ? 'La última investigación falló.' : `# ${v.pregunta}\n\n${v.texto}` }
    }

    if (arg.toLowerCase() === 'guardar') {
      const actual = await read($, investigacion)
      if (actual === null || actual.estado !== 'listo') return { text: 'No hay una investigación lista para guardar.' }

      return { text: `Guardada en ${await guardar($, actual)}.` }
    }

    const antes = await read($, investigacion)
    if (antes !== null && antes.estado === 'trabajando') return { text: `Ya estoy investigando: ${antes.pregunta}. Espera a que termine.` }
    const ahora = await $.clock.now()
    const nueva: Investigacion = { id: '', pregunta: arg, at: ahora, estado: 'trabajando', texto: '', archivo: null }
    await update($, investigacion, () => nueva)
    try {
      const r = await lanzar($, { prompt: arg, description: `Investigar: ${arg.slice(0, 40)}`, subagentType: 'equipo:investigador', model: 'haiku' })
      if (r.deny !== undefined) throw new Error(r.deny)
      const agentId = r.agentId ?? ''
      await update($, investigacion, v => (v === null ? v : { ...v, id: agentId }))
    } catch (error) {
      await update($, investigacion, v => (v === null ? v : { ...v, estado: 'fallo' as const }))
      // Sin agente, Claude lo hace con sus propias herramientas.
      await $.prompt.fill({ text: `Investiga en internet y respóndeme con fuentes: ${arg}` }).catch(() => undefined)

      return { text: `No pude lanzar el investigador (${error instanceof Error ? error.message : String(error)}); dejé la pregunta lista para enviar.` }
    }

    return { text: 'Investigando con un agente barato (Haiku). Te aviso cuando termine; léelo con /investigar ver.' }
  })
}
