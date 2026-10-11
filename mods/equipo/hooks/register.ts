import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Aprendizaje, Gratis, Investigacion, Registro } from '../types'
import { AVISO_COMPACTAR, entradaPizarra, esTareaGrande, pistaDeEquipo, PIZARRA, sumarEntrada } from './contexto'
import { construirPeticion, leerRespuesta, modeloPara, traeSecreto, URL_POR_DEFECTO } from './gratis'
import { aprender, esBueno, lecciones } from './aprende'
import { AGENTES, ahorro, costo, dificultadDe, familiaDe, familiaDeNivel, rango, GUIA, modeloParaAgente, slug } from './reglas'

const agentes = atom({ plugin: 'equipo', key: 'agentes' } as const, [])
const investigacion = atom({ plugin: 'equipo', key: 'investigacion' } as const, null)
const isAuto = atom({ plugin: 'equipo', key: 'isAuto' } as const, true)
const aprendizaje = atom({ plugin: 'equipo', key: 'aprendizaje' } as const, {})
const gratis = atom({ plugin: 'equipo', key: 'gratis' } as const, { estado: 'sin probar', llamadas: 0, fallos: 0, ultimo: null })
const selectorNivel = { plugin: 'selector-modelo', key: 'nivel' } as const
const presupuestoEstado = { plugin: 'presupuesto', key: 'estado' } as const

/** De dónde vienen los mensajes de la persona. */
const PERSONA = new Set(['composer', 'bridge', 'sdk', 'slack-ping', 'unclassified'])

/** Agentes a la vez y por turno: más que eso casi siempre gasta más de lo que ahorra. */
const MAX_PARALELO = 3
const MAX_TURNO = 6
/** Un agente "trabajando" desde hace más de esto se da por colgado y no cuenta. */
const COLGADO_MS = 15 * 60 * 1000

/** Una investigación que lleva más que esto sin responder se da por perdida y deja pedir otra. */
const INVESTIGAR_MAX_MS = 10 * 60 * 1000

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

type ResultadoGratis = { ok: true; texto: string } | { ok: false; motivo: string }

/** Manda una tarea de solo texto a OmniRoute (modelos gratuitos) y anota cómo salió. */
const llamarGratis = async ($: EngineInterface, a: { tarea: string; contexto?: string | undefined; tipo?: string | undefined }): Promise<ResultadoGratis> => {
  if (traeSecreto(`${a.tarea}\n${a.contexto ?? ''}`)) return { ok: false, motivo: 'No lo envío: parece traer una clave o contraseña, y esto sale a proveedores gratuitos de terceros.' }
  const clave = await $.env.get('OMNIROUTE_API_KEY')
  const base = (await $.env.get('OMNIROUTE_URL')) ?? URL_POR_DEFECTO
  const modelo = modeloPara(a.tipo, await $.env.get('OMNIROUTE_MODEL'))
  const { url, init } = construirPeticion(base, clave, modelo, a.tarea, a.contexto)
  const anotar = (ok: boolean, estado: 'conectado' | 'sin conexión', ultimo: string) =>
    update($, gratis, (g): Gratis => ({ ...g, estado, llamadas: g.llamadas + 1, fallos: g.fallos + (ok ? 0 : 1), ultimo }))
  try {
    const r = await $.http.fetch(url, init)
    const res = leerRespuesta(r.status, r.text)
    await anotar(res.ok, 'conectado', res.ok ? modelo : res.motivo)

    return res
  } catch {
    await anotar(false, 'sin conexión', 'sin conexión')

    return { ok: false, motivo: `No pude conectar con OmniRoute en ${base}. ¿Está encendido? (omniroute)` }
  }
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

const guiaConLecciones = (aprendido: string[]): string => (aprendido.length === 0 ? GUIA : `${GUIA}\nLo que el equipo ya aprendió:\n${aprendido.map(l => `- ${l}`).join('\n')}`)

export const register: Register = on => {
  // La guía tal como se mandó en esta sesión.
  let guiaFija: string | undefined
  // La primera entrada de la pizarra de cada sesión la empieza de cero; las demás se escriben una a una.
  let pizarraNueva = true
  let colaPizarra: Promise<unknown> = Promise.resolve()

  // Lanzamientos en vuelo y en lo que va del turno del director (se cuentan sin esperar, para que los paralelos no se cuelen).
  let reservas = 0
  let lanzadosEnTurno = 0

  // Agente de la autoprueba en curso.
  let pruebaId: string | undefined

  // Obreros que terminaron desde la última revisión: si el revisor encuentra problemas, se les anota.
  let obreros: { familia: string }[] = []

  on('session.start', async ($, e, next) => {
    guiaFija = undefined
    pizarraNueva = true
    // El obrero gratis solo existe si la persona puso su clave de OmniRoute: así nadie paga por una herramienta que no usa.
    const claveOmni = await $.env.get('OMNIROUTE_API_KEY')
    if (claveOmni !== undefined && claveOmni !== '') {
      await $.tool
        .register({
          name: 'gratis',
          description:
            'Ayudante gratuito de SOLO TEXTO (modelos de OmniRoute): sin archivos, sin internet, sin herramientas. Úsalo para redactar, resumir, traducir, explicar o responder de memoria cuando el presupuesto esté apretado. Pásale en `contexto` todo lo que necesite; no envíes claves ni datos privados.',
          inputSchema: {
            type: 'object',
            properties: {
              tarea: { type: 'string', description: 'Lo que debe hacer, claro y completo.' },
              contexto: { type: 'string', description: 'Texto sobre el que trabaja (opcional).' },
              tipo: { type: 'string', enum: ['rapido', 'codigo', 'barato'], description: 'rapido, codigo o barato (opcional).' },
            },
            required: ['tarea'],
          },
        })
        .catch(() => undefined)
      await update($, gratis, (g): Gratis => ({ ...g, estado: g.estado === 'sin clave' ? 'sin probar' : g.estado }))
    } else {
      await update($, gratis, (g): Gratis => ({ ...g, estado: 'sin clave' }))
    }
    for (const spec of AGENTES) await $.agent.register(spec).catch(() => undefined)
    await $.command.register({
      name: 'equipo',
      description: 'Equipo de agentes con modelos baratos: /equipo · on|off · olvidar · probar',
      argumentHint: 'on|off|olvidar|probar',
    })
    await $.command.register({
      name: 'gratis',
      description: 'Pregunta a un modelo gratuito de OmniRoute (solo texto): /gratis <tarea> · estado',
      argumentHint: '<tarea> | estado',
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
    const apretado = typeof (await $.state.get(presupuestoEstado).catch(() => undefined))?.value?.topeMax === 'number'
    const usage = await $.session.usage().catch(() => null)
    const pista = pistaDeEquipo({ contexto: usage?.context.percent ?? 0, tokens: usage?.context.tokens ?? 0, grande: esTareaGrande(e.text), hayPizarra: (await read($, agentes)).length > 0, apretado, gratis: apretado && ['sin probar', 'conectado'].includes((await read($, gratis)).estado) })

    return next(pista === undefined ? e : { ...e, context: [...(e.context ?? []), pista] })
  }).catch(($, e, next) => next(e))

  // Al compactar se conserva el plan y dónde están los resultados.
  on('session.compact', ($, e, next) => {
    guiaFija = undefined

    return next({ ...e, instructions: e.instructions === undefined ? AVISO_COMPACTAR : `${e.instructions}\n\n${AVISO_COMPACTAR}` })
  }).catch(($, e, next) => next(e))

  // 1. El director sabe cómo repartir el trabajo.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (e.traits.includes('bare') || e.traits.includes('analysis') || !(await read($, isAuto))) return composed
    // El texto se fija al empezar (y tras compactar): un cambio en el prompt de sistema tira la caché de toda la conversación.
    guiaFija ??= guiaConLecciones(lecciones(await read($, aprendizaje)))

    return { sections: [...composed.sections, { id: 'equipo:guia', text: guiaFija, scope: 'session' }] }
  })

  // 2. Un agente sin modelo propio corre con el más barato que sirva.
  on('agent.spawn', async ($, e, next) => {
    const omitir = e.fork || e.isTeammate === true || e.workflow !== undefined || !(await read($, isAuto))
    // El director trabaja con el modelo que puso el selector, que puede no ser el de la sesión.
    const nivelSel = (await $.state.get(selectorNivel).catch(() => undefined))?.value
    const padreFam = typeof nivelSel === 'number' ? familiaDeNivel(nivelSel) : familiaDe(e.parentModel ?? '')
    let objetivo = omitir
      ? undefined
      : modeloParaAgente({ tipo: e.subagentType, pedido: e.model, padre: padreFam, fork: false, aprendido: (await read($, aprendizaje))[e.subagentType]?.nivel ?? undefined, dificultad: dificultadDe(e.description, e.prompt) })
    // El tope del presupuesto vale también para los agentes, pida lo que pida quien los lanza.
    const tope = omitir ? undefined : (await $.state.get(presupuestoEstado).catch(() => undefined))?.value?.topeMax
    if (typeof tope === 'number') {
      const techo = familiaDeNivel(tope)
      const pedida = objetivo ?? e.model
      if (rango(pedida === undefined || pedida === '' || pedida === 'inherit' ? padreFam : familiaDe(pedida)) > rango(techo)) objetivo = techo
    }
    const mide = !(e.fork || e.isTeammate === true || e.workflow !== undefined) && (await read($, isAuto))
    if (mide) {
      const ahora = await $.clock.now()
      const activos = (await read($, agentes)).filter(r => r.estado === 'trabajando' && ahora - r.at < COLGADO_MS).length
      if (activos + reservas >= MAX_PARALELO) return { deny: `Ya hay ${MAX_PARALELO} agentes trabajando a la vez. Espera a que termine alguno (o haz tú este paso) y vuelve a pedirlo.` }
      if (lanzadosEnTurno >= MAX_TURNO) return { deny: `Ya se lanzaron ${MAX_TURNO} agentes en esta tarea: más cuesta más de lo que ahorra. Integra lo que tienes o haz tú el resto.` }
      reservas += 1
      lanzadosEnTurno += 1
    }
    let lanzado
    try {
      lanzado = await next(objetivo === undefined ? e : { ...e, model: objetivo })
    } catch (error) {
      if (mide) reservas -= 1
      throw error
    }
    if (lanzado.deny !== undefined || lanzado.agentId === undefined) {
      if (mide) {
        reservas -= 1
        lanzadosEnTurno -= 1
      }

      return lanzado
    }

    const id = lanzado.agentId
    const reg: Registro = {
      id,
      tipo: e.subagentType,
      descripcion: e.description,
      modelo: lanzado.model,
      familia: familiaDe(lanzado.model),
      padre: padreFam,
      at: await $.clock.now(),
      fin: null,
      estado: 'trabajando',
      nuevo: 0,
      cache: 0,
      escrito: 0,
      encargo: Math.ceil(e.prompt.length / 4),
    }
    await update($, agentes, l => [reg, ...l].slice(0, MAX))
    if (mide) reservas -= 1

    return lanzado
  }).catch(($, e, next) => next(e))

  // 3. Lo que gastó cada agente y su respuesta.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const id = e.agentId
    if (id === undefined) {
      obreros = []
      lanzadosEnTurno = 0

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
        const entrada = entradaPizarra(reg.tipo, reg.descripcion, e.answer, hoy)
        // Una a una: dos agentes que terminan a la vez no pisan la entrada del otro.
        colaPizarra = colaPizarra.then(async () => {
          const previa = pizarraNueva ? '' : await $.fs.read(PIZARRA).then(r => (typeof r === 'string' ? r : ''), () => '')
          pizarraNueva = false
          await $.fs.write(PIZARRA, sumarEntrada(previa, entrada)).catch(() => undefined)
        })
        await colaPizarra.catch(() => undefined)
      }
      // Una interrupción (Esc) o un error de la API no dicen nada de la calidad del agente: no se aprende de eso.
      if (e.reason === 'answer') await recordar($, a => aprender(a, reg.tipo, reg.familia, bueno, costo(reg, reg.familia), ahorro(reg)))
      if (reg.tipo === 'equipo:obrero') obreros = [...obreros, { familia: reg.familia }].slice(-3)
      // El revisor encontró problemas en lo que hicieron los obreros: eso sí es un fallo de ellos.
      if (reg.tipo === 'equipo:revisor' && bueno && typeof e.answer === 'string' && !/TODO BIEN/.test(e.answer) && obreros.length > 0) {
        // Solo el último obrero: el problema puede ser del director o de cualquiera de los anteriores.
        const culpables = obreros.slice(-1)
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
    if (antes !== null && antes.estado === 'trabajando' && (await $.clock.now()) - antes.at < INVESTIGAR_MAX_MS) return { text: `Ya estoy investigando: ${antes.pregunta}. Espera a que termine.` }
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

  // La herramienta que ve Claude: texto a OmniRoute y de vuelta.
  on('tool.call', { tool: 'mcp__equipo__gratis' }, async ($, e) => {
    const a = e as unknown as { tarea?: unknown; contexto?: unknown; tipo?: unknown }
    if (typeof a.tarea !== 'string' || a.tarea.trim() === '') return { deny: 'Falta `tarea`: dime qué debe hacer.' }
    const r = await llamarGratis($, { tarea: a.tarea, contexto: typeof a.contexto === 'string' ? a.contexto : undefined, tipo: typeof a.tipo === 'string' ? a.tipo : undefined })

    return r.ok ? { result: r.texto } : { deny: r.motivo }
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'gratis' }, async ($, e) => {
    const arg = e.args.trim()
    const clave = await $.env.get('OMNIROUTE_API_KEY')
    if (arg === '' || arg.toLowerCase() === 'estado') {
      const base = (await $.env.get('OMNIROUTE_URL')) ?? URL_POR_DEFECTO
      try {
        const r = await $.http.fetch(`${base.replace(/\/+$/, '')}/models`, { headers: clave ? { authorization: `Bearer ${clave}` } : {} })
        await update($, gratis, (g): Gratis => ({ ...g, estado: r.ok ? 'conectado' : 'sin conexión' }))

        return { text: r.ok ? `OmniRoute responde en ${base}. ${clave ? 'La clave está puesta.' : 'Ojo: falta OMNIROUTE_API_KEY.'}` : `OmniRoute contestó ${r.status} en ${base}. Revisa la clave (OMNIROUTE_API_KEY).` }
      } catch {
        await update($, gratis, (g): Gratis => ({ ...g, estado: 'sin conexión' }))

        return { text: `No encuentro OmniRoute en ${base}. Enciéndelo (comando omniroute) y vuelve a probar.` }
      }
    }
    const r = await llamarGratis($, { tarea: arg })

    return { text: r.ok ? r.texto : r.motivo }
  })
}
