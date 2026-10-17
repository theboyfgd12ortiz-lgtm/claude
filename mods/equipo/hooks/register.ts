import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Mision, Paso, Registro } from '../types'
import { AVISO_COMPACTAR, avisoDeTrabajo, denegarLecturaEnorme, LECTURA_ENORME, pistaDeEquipo, trabajoNuevo } from './contexto'
import type { Bitacora, Instantanea } from './mision'
import {
  alFallar,
  decidir,
  esTareaGrande,
  hayPruebasEnPackage,
  leerInstantanea,
  leerNoche,
  redactar,
  limpiarEnvoltorios,
  MAX_CONTINUACIONES,
  MAX_CONTINUACIONES_NOCHE,
  MENSAJE_NOCHE,
  planDeTexto,
  protocolo,
  recortar,
  resumenManana,
  resumenPlan,
  RUTA_MISION,
  RUTA_NOCHE,
  RUTA_RESUMEN,
  textoReintento,
  textoRetomar,
  topesDeNoche,
  unirPlan,
} from './mision'
import { AGENTES, ahorro, dificultadDe, familiaDe, familiaDeNivel, rango, GUIA, modeloParaAgente } from './reglas'

const VACIA: Mision = { activa: false, objetivo: '', hechos: 0, total: 0, siguiente: null, continuaciones: 0, max: MAX_CONTINUACIONES, fin: '', revision: 'sin revisar' }
const agentes = atom({ plugin: 'equipo', key: 'agentes' } as const, [])
const isAuto = atom({ plugin: 'equipo', key: 'isAuto' } as const, true)
const mision = atom({ plugin: 'equipo', key: 'mision' } as const, VACIA)
const pilotoAuto = atom({ plugin: 'equipo', key: 'pilotoAuto' } as const, false)
// Modo noche: el selector de modelo lo lee de aquí.
const modoNoche = atom({ plugin: 'equipo', key: 'modoNoche' } as const, false)
const selectorNivel = { plugin: 'selector-modelo', key: 'nivel' } as const
const presupuestoEstado = { plugin: 'selector-modelo', key: 'presupuesto' } as const

/** De dónde vienen los mensajes de la persona. */
const PERSONA = new Set(['composer', 'bridge', 'sdk', 'slack-ping', 'unclassified'])

/** Agentes a la vez y por turno: más que eso casi siempre gasta más de lo que ahorra. */
const MAX_PARALELO = 3
const MAX_TURNO = 6
/** Un agente "trabajando" desde hace más de esto se da por colgado y no cuenta. */
const COLGADO_MS = 15 * 60 * 1000

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

// Lo que el piloto recuerda entre turnos (a nivel del módulo: las funciones que reciben `$` se declaran fuera de register).
let plan: Paso[] = []
// Si TodoWrite dio el plan, las listas con casillas del texto no lo tocan.
let planDeTodoWrite = false
// Lo que el director lleva leído y editado él mismo en el turno actual.
let trabajo = trabajoNuevo()
let ultimoSiguiente: string | null = null
let repeticiones = 0
let yaRevisado = false
let veredicto: 'ok' | 'problemas' | null = null
let rondas = 0
let sinVeredicto = 0
// Modo noche y vigilancia de la noche (reintentos, topes, resumen de la mañana).
let noche = false
let enMarcha = false
let desde = 0
let semanaInicial: number | null = null
let reintentos = 0
// Textos que el propio piloto se manda (reanudar, continuar, retomar): no cuentan como la persona.
let propios: string[] = []
let reintentosTotal = 0
let esperasLimite = 0
let espera: Timer | undefined
let ultimoError: { tipo: string; at: number } | undefined
let bitacora: Bitacora[] = []
let fallos: string[] = []
let dudas: string[] = []

/** Los límites de uso de la suscripción: ventana de 5 horas y semana (null si no se conocen). */
const limites = async ($: EngineInterface) => {
  const lista = (await $.session.usage().catch(() => null))?.rateLimits ?? []

  return { cinco: lista.find(l => l.kind === 'five_hour'), semana: lista.find(l => l.kind === 'seven_day') }
}

/** Lee el archivo del modo noche (si no existe, está apagado) y avisa al resto de mods. */
const leerModoNoche = async ($: EngineInterface): Promise<boolean> => {
  const texto = await $.fs.read(RUTA_NOCHE).then(r => (typeof r === 'string' ? r : undefined), () => undefined)
  noche = leerNoche(texto, await $.clock.now()).activo
  await update($, modoNoche, () => noche)

  return noche
}

/** Apunta algo en la bitácora del resumen de la mañana. */
const anotar = async ($: EngineInterface, texto: string) => {
  bitacora = [...bitacora, { hora: await $.clock.now(), texto: recortar(texto, 200) }].slice(-60)
}

/** Guarda la misión en la carpeta del proyecto y, de noche, reescribe el resumen de la mañana. */
const guardar = async ($: EngineInterface, estado: 'en marcha' | 'terminada' | 'parada' = 'en marcha', motivo = '') => {
  const m = await read($, mision)
  const ahora = await $.clock.now()
  const snap: Instantanea = {
    version: 1,
    guardado: ahora,
    mision: m,
    plan,
    planDeTodoWrite,
    ultimoSiguiente,
    yaRevisado,
    veredicto,
    rondas,
    sinVeredicto,
    noche,
    desde,
    semanaInicial,
    reintentosTotal,
    esperasLimite,
    bitacora,
    fallos,
    dudas,
  }
  await $.fs.write(RUTA_MISION, redactar(JSON.stringify(snap))).catch(() => undefined)
  if (noche && (enMarcha || estado !== 'en marcha')) {
    const texto = resumenManana({ objetivo: m.objetivo, estado, motivo, ahora, desde, plan, revision: m.revision, bitacora, fallos, dudas })
    await $.fs.write(RUTA_RESUMEN, redactar(texto)).catch(() => undefined)
  }
}

/** Si el proyecto tiene una suite de pruebas: entonces la misión trabaja con pruebas primero. */
const hayPruebas = async ($: EngineInterface): Promise<boolean> => {
  for (const f of ['pytest.ini', 'tox.ini', 'conftest.py', 'go.mod', 'Cargo.toml', 'phpunit.xml']) if (await $.fs.exists(f).catch(() => false)) return true
  const pkg = await $.fs.read('package.json').then(r => (typeof r === 'string' ? r : ''), () => '')

  return hayPruebasEnPackage(pkg)
}

const empezar = async ($: EngineInterface, objetivo: string) => {
  plan = []
  planDeTodoWrite = false
  ultimoSiguiente = null
  repeticiones = 0
  yaRevisado = false
  veredicto = null
  rondas = 0
  sinVeredicto = 0
  await leerModoNoche($)
  enMarcha = true
  desde = await $.clock.now()
  semanaInicial = (await limites($)).semana?.percentUsed ?? null
  reintentos = 0
  reintentosTotal = 0
  esperasLimite = 0
  bitacora = []
  fallos = []
  dudas = []
  espera?.cancel()
  espera = undefined
  await update($, mision, () => ({ ...VACIA, activa: true, objetivo: recortar(limpiarEnvoltorios(objetivo), 160), max: noche ? MAX_CONTINUACIONES_NOCHE : MAX_CONTINUACIONES }))
  await anotar($, noche ? 'Empezó la misión (modo noche)' : 'Empezó la misión')
  await guardar($)
}

const terminar = async ($: EngineInterface, motivo: string, aviso: string, revision?: Mision['revision'], estado: 'terminada' | 'parada' = 'parada') => {
  espera?.cancel()
  espera = undefined
  await update($, mision, m => ({ ...m, activa: false, fin: motivo, revision: revision ?? m.revision }))
  await anotar($, `${estado === 'terminada' ? 'Terminó' : 'Paró'}: ${motivo}`)
  await guardar($, estado, motivo)
  enMarcha = false
  $.ui.toast(aviso)
}

/** Tras un turno que acabó en error: si es pasajero, espera y sigue; si no, o si se acabaron los topes, para limpio. */
const alFallarMision = async ($: EngineInterface) => {
  const m = await read($, mision)
  if (!m.activa) return
  const ahora = await $.clock.now()
  const tipo = ultimoError !== undefined && ahora - ultimoError.at < 120_000 ? ultimoError.tipo : 'unknown'
  const { cinco, semana } = await limites($)
  fallos = [...fallos, `error de la API: ${tipo}`].slice(-20)
  const r = alFallar({ error: tipo, reintentos, reintentosTotal, esperasLimite, cincoHoras: cinco?.percentUsed ?? null, semana: semana?.percentUsed ?? null, resetsAt: cinco?.resetsAt, ahora })
  if (r.accion === 'parar') {
    await terminar($, r.motivo, `Piloto: paré (${r.motivo}).`)

    return
  }
  if (r.limite) esperasLimite += 1
  else {
    reintentos += 1
    reintentosTotal += 1
  }
  await anotar($, r.motivo)
  await guardar($)
  espera?.cancel()
  espera = $.clock.after(r.ms, () => {
    espera = undefined
    void reanudar($)
  })
}

/** El piloto se manda un mensaje a sí mismo; se recuerda para no confundirlo con uno de la persona. */
const enviarPropio = ($: EngineInterface, text: string) => {
  propios = [...propios, text].slice(-5)
  void $.prompt.submit({ text, wait: false } as never).catch(() => undefined)
}

/** Termina la espera: mira los topes y, si todo sigue bien, le pide a Claude que continúe. */
const reanudar = async ($: EngineInterface) => {
  const m = await read($, mision)
  if (!m.activa) return
  const ahora = await $.clock.now()
  const { semana } = await limites($)
  const motivo = topesDeNoche({ ahora, desde: noche ? desde : ahora, semana: semana?.percentUsed ?? null, semanaInicial: noche ? semanaInicial : null })
  if (motivo !== null) {
    await terminar($, motivo, `Piloto: paré (${motivo}).`)

    return
  }
  const r = resumenPlan(plan)
  await anotar($, 'Terminó la espera: sigo')
  await guardar($)
  enviarPropio($, textoReintento(r.hechos, r.total, r.siguiente))
}

export const register: Register = on => {
  // La guía tal como se mandó en esta sesión.
  let guiaFija: string | undefined

  // Lanzamientos en vuelo y en lo que va del turno del director (se cuentan sin esperar, para que los paralelos no se cuelen).
  let reservas = 0
  let lanzadosEnTurno = 0

  // Agente de la autoprueba en curso.
  let pruebaId: string | undefined

  on('session.start', async ($, e, next) => {
    guiaFija = undefined
    for (const spec of AGENTES) await $.agent.register(spec).catch(() => undefined)
    await $.command.register({
      name: 'equipo',
      description: 'Equipo de agentes con modelos baratos: /equipo · on|off · probar',
      argumentHint: 'on|off|probar',
    })
    await $.command.register({
      name: 'piloto',
      description: 'Dile qué quieres lograr y se hace solo: /piloto <objetivo> · parar · retomar · auto on|off',
      argumentHint: '<objetivo> | parar | retomar | auto on|off',
    })
    await $.command.register({
      name: 'noche',
      description: 'Modo noche: el piloto decide solo, sigue tras errores y deja un resumen para la mañana: /noche [on|off]',
      argumentHint: 'on|off',
    })
    await leerModoNoche($).catch(() => undefined)
    // Una misión que quedó a medias en esta carpeta se ofrece retomar.
    const guardada = leerInstantanea(await $.fs.read(RUTA_MISION).then(r => (typeof r === 'string' ? r : undefined), () => undefined))
    if (guardada?.mision.activa === true) $.ui.toast(`Quedó una misión a medias: ${recortar(guardada.mision.objetivo, 80)}. Para seguirla: /piloto retomar`)
    if ((await $.store.get('isAuto').catch(() => undefined)) === false) await update($, isAuto, () => false)
    if ((await $.store.get('pilotoAuto').catch(() => undefined)) === true) await update($, pilotoAuto, () => true)

    return next(e)
  })

  // Contexto lleno o presupuesto apretado: una pista corta con el mensaje (fuera del prompt de sistema, para no romper la caché).
  // Y un pedido grande arranca una misión solo si el piloto automático está encendido.
  on('prompt.submit', async ($, e, next) => {
    trabajo = trabajoNuevo()
    const origen = (e.origin as { kind?: string } | undefined)?.kind
    if (origen !== undefined && !PERSONA.has(origen)) return next(e)
    const texto = limpiarEnvoltorios(e.text)
    const extra: string[] = []
    // Volvió la persona: ya no hace falta la espera por un error de la API, y el modo noche puede haber cambiado.
    // Los mensajes que el piloto se manda solo no cuentan: así la escalera de reintentos 1/5/15 min sigue su curso.
    const propio = propios.find(p => e.text.includes(p))
    if (propio === undefined) {
      espera?.cancel()
      espera = undefined
      reintentos = 0
    } else propios = propios.filter(p => p !== propio)
    await leerModoNoche($).catch(() => undefined)
    const nivelPresupuesto = (await $.state.get(presupuestoEstado).catch(() => undefined))?.value?.nivel ?? 'normal'

    const m = await read($, mision)
    if (propio === undefined && m.activa && !texto.startsWith('/')) await update($, mision, x => ({ ...x, continuaciones: 0 }))
    if (!m.activa && texto !== '' && nivelPresupuesto === 'normal' && (await read($, pilotoAuto)) && esTareaGrande(texto)) {
      await empezar($, texto)
      $.ui.toast('Piloto: lo llevo de principio a fin. Para frenarlo: /piloto parar')
      extra.push(protocolo(texto, await hayPruebas($), noche))
    }

    if (await read($, isAuto)) {
      const apretado = typeof (await $.state.get(presupuestoEstado).catch(() => undefined))?.value?.topeMax === 'number'
      const usage = await $.session.usage().catch(() => null)
      const pista = pistaDeEquipo({ contexto: usage?.context.percent ?? 0, tokens: usage?.context.tokens ?? 0, apretado })
      if (pista !== undefined) extra.push(pista)
    }

    return next(extra.length === 0 ? e : { ...e, context: [...(e.context ?? []), ...extra] })
  }).catch(($, e, next) => next(e))

  // Al compactar se conserva el plan.
  on('session.compact', async ($, e, next) => {
    guiaFija = undefined

    return next({ ...e, instructions: e.instructions === undefined ? AVISO_COMPACTAR : `${e.instructions}\n\n${AVISO_COMPACTAR}` })
  }).catch(($, e, next) => next(e))

  // El director caro no debe gastar el turno leyendo o repitiendo ediciones él mismo: se le avisa en el momento, junto al resultado.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && enMarcha && noche && ran.isError === true) fallos = [...fallos, `${String(e.tool)} falló: ${recortar(ran.text ?? '', 100)}`].slice(-20)
    if (e.agentId !== undefined || ran.deny !== undefined || !(await read($, isAuto))) return ran
    const tool = String(e.tool)
    // `text` lo pone el núcleo; si falta (resultado puesto por otro hook), se mide el resultado.
    const salida = ran.text?.length ?? JSON.stringify(ran.result ?? '').length
    // Un archivo enorme no entra al chat caro cuando el contexto ya está grande: cada mensaje lo pagaría de nuevo.
    if (tool === 'Read' && salida >= LECTURA_ENORME) {
      const tokens = (await $.session.usage().catch(() => null))?.context.tokens ?? 0
      const sel = (await $.state.get(selectorNivel).catch(() => undefined))?.value
      const denegar = denegarLecturaEnorme({ caracteres: salida, tokens, haiku: typeof sel === 'number' && familiaDeNivel(sel) === 'haiku' })
      if (denegar !== undefined) return { deny: denegar }
    }
    if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') {
      trabajo.lecturas += 1
      trabajo.caracteres += salida
    } else if (tool === 'Bash' || tool === 'PowerShell') {
      trabajo.caracteres += salida
    } else if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
      trabajo.ediciones += 1
    } else {
      return ran
    }
    const nivelSel = (await $.state.get(selectorNivel).catch(() => undefined))?.value
    if (typeof nivelSel === 'number' && familiaDeNivel(nivelSel) === 'haiku') return ran
    const aviso = avisoDeTrabajo(trabajo)
    if (aviso === undefined) return ran
    if (aviso.tipo === 'leer') trabajo.avisadoLeer = true
    else trabajo.avisadoEditar = true

    return { ...ran, context: [...(ran.context ?? []), aviso.texto] }
  }).catch(($, e, next) => next(e))

  // De noche no hay nadie para contestar: la pregunta se rechaza, se anota para la mañana y Claude decide solo.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (!(await leerModoNoche($).catch(() => false))) return next(e)
    const preguntas = (e as unknown as { questions?: { question?: unknown }[] }).questions ?? []
    const textos = preguntas.map(p => (typeof p?.question === 'string' ? p.question : '')).filter(t => t !== '')
    for (const t of textos.length === 0 ? ['(pregunta sin texto)'] : textos) dudas = [...dudas, recortar(t, 200)].slice(-20)
    await anotar($, 'Claude quiso preguntar algo; decidió solo')
    if (enMarcha) await guardar($)

    return { deny: MENSAJE_NOCHE }
  }).catch(($, e, next) => next(e))

  // El tipo de error de la API que Claude Code ya clasificó (para saber si vale la pena esperar).
  on('classic.StopFailure', async ($, e, next) => {
    ultimoError = { tipo: String(e.error), at: await $.clock.now() }

    return next(e)
  }).catch(($, e, next) => next(e))

  // El plan que Claude va marcando con TodoWrite es el avance de la misión.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || e.agentId !== undefined) return ran
    plan = e.todos.map(t => ({ texto: t.content, hecho: t.status === 'completed' }))
    planDeTodoWrite = true
    const r = resumenPlan(plan)
    await update($, mision, m => ({ ...m, hechos: r.hechos, total: r.total, siguiente: r.siguiente }))

    return ran
  }).catch(($, e, next) => next(e))

  // 1. El director sabe cómo repartir el trabajo.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (e.traits.includes('bare') || e.traits.includes('analysis') || !(await read($, isAuto))) return composed
    // El texto se fija al empezar (y tras compactar): un cambio en el prompt de sistema tira la caché de toda la conversación.
    guiaFija ??= GUIA

    return { sections: [...composed.sections, { id: 'equipo:guia', text: guiaFija, scope: 'session' }] }
  })

  // 2. Un agente sin modelo propio corre con el más barato que sirva.
  on('agent.spawn', async ($, e, next) => {
    const omitir = e.fork || e.isTeammate === true || e.workflow !== undefined || !(await read($, isAuto))
    // El director trabaja con el modelo que puso el selector, que puede no ser el de la sesión.
    const nivelSel = (await $.state.get(selectorNivel).catch(() => undefined))?.value
    const padreFam = typeof nivelSel === 'number' ? familiaDeNivel(nivelSel) : familiaDe(e.parentModel ?? '')
    let objetivo = omitir ? undefined : modeloParaAgente({ tipo: e.subagentType, pedido: e.model, padre: padreFam, fork: false, dificultad: dificultadDe(e.description, e.prompt) })
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
      // Con el presupuesto apretado, menos agentes: solo lo fundamental.
      const apretado = typeof (await $.state.get(presupuestoEstado).catch(() => undefined))?.value?.topeMax === 'number'
      const maxParalelo = apretado ? 2 : MAX_PARALELO
      const maxTurno = apretado ? 2 : MAX_TURNO
      if (activos + reservas >= maxParalelo) return { deny: `Ya hay ${maxParalelo} agentes trabajando a la vez. Espera a que termine alguno (o haz tú este paso) y vuelve a pedirlo.` }
      if (lanzadosEnTurno >= maxTurno) return { deny: `Ya se lanzaron ${maxTurno} agentes en esta tarea: más cuesta más de lo que ahorra. Integra lo que tienes o haz tú el resto.` }
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

  // 3. Lo que gastó cada agente; y al terminar el turno del director, si la misión sigue, el siguiente paso.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const id = e.agentId
    if (id !== undefined) {
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
      if (id === pruebaId) {
        pruebaId = undefined
        const ok = e.reason === 'answer' && typeof e.answer === 'string' && e.answer.trim() !== ''
        $.ui.toast(ok ? 'equipo: autoprueba superada, el agente respondió.' : 'equipo: autoprueba falló, el agente no respondió.')
      }
      const fin = await $.clock.now()
      const respuesta = typeof e.answer === 'string' ? Math.ceil(e.answer.length / 4) : 0
      const lista = await update($, agentes, l => l.map(r => (r.id === id ? { ...r, estado: 'listo' as const, fin, respuesta } : r)))
      // La respuesta del revisor, tras pedir la revisión, es el veredicto.
      if (yaRevisado && typeof e.answer === 'string' && e.answer.trim() !== '' && lista.find(r => r.id === id)?.tipo === 'equipo:revisor' && (await read($, mision)).activa) {
        veredicto = /TODO BIEN/.test(e.answer) ? 'ok' : 'problemas'
      }

      return done
    }

    lanzadosEnTurno = 0
    const m = await read($, mision)
    if (!m.activa) return done
    // Error de la API: se espera un momento a que llegue su clasificación (StopFailure) y se decide si reintentar.
    if (e.reason === 'error' && (await leerModoNoche($).catch(() => false))) {
      void $.clock.after(1500, () => void alFallarMision($))

      return done
    }
    if (e.reason === 'answer') reintentos = 0
    // Sin TodoWrite (app de escritorio) el plan llega como lista con casillas en la respuesta.
    const escrito = !planDeTodoWrite && typeof e.answer === 'string' ? planDeTexto(e.answer) : []
    if (escrito.length > 0) plan = unirPlan(plan, escrito)
    const r = resumenPlan(plan)
    if (escrito.length > 0) await update($, mision, x => ({ ...x, hechos: r.hechos, total: r.total, siguiente: r.siguiente }))
    repeticiones = r.siguiente !== null && r.siguiente === ultimoSiguiente ? repeticiones + 1 : 0
    ultimoSiguiente = r.siguiente
    const presupuesto = (await $.state.get(presupuestoEstado).catch(() => undefined))?.value?.nivel ?? 'normal'
    if (noche) {
      const semana = (await limites($)).semana?.percentUsed ?? null
      const tope = topesDeNoche({ ahora: await $.clock.now(), desde, semana, semanaInicial })
      if (tope !== null) {
        await terminar($, tope, `Piloto: paré (${tope}).`)

        return done
      }
    }
    const d = decidir({ activa: true, razon: e.reason, continuaciones: m.continuaciones, max: m.max, total: r.total, hechos: r.hechos, siguiente: r.siguiente, presupuesto, repeticiones, yaRevisado, veredicto, rondas, sinVeredicto, noche })

    if (d.accion === 'continuar') {
      if (d.revision === true) {
        if (yaRevisado && veredicto === null) sinVeredicto += 1
        yaRevisado = true
        veredicto = null
      }
      if (d.correccion === true) {
        rondas += 1
        yaRevisado = false
        veredicto = null
      }
      await update($, mision, x => ({ ...x, continuaciones: x.continuaciones + 1, revision: d.revision === true ? 'revisando' : d.correccion === true ? 'corrigiendo' : x.revision }))
      await anotar($, `Paso ${r.hechos} de ${r.total} hechos; sigo: ${recortar(d.texto, 100)}`)
      await guardar($)
      enviarPropio($, d.texto)
    } else if (d.accion === 'terminar') {
      await terminar($, d.motivo, d.revision === 'aprobada' ? 'Piloto: terminé y el revisor lo aprobó.' : 'Piloto: terminé. Revisa el resumen.', d.revision, 'terminada')
    } else if (d.accion === 'parar') {
      await terminar($, d.motivo, `Piloto: paré (${d.motivo}).`)
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
    const auto = await read($, isAuto)

    return { text: `Equipo ${auto ? 'activo' : 'apagado'}. ${resumenEquipo(await read($, agentes))}` }
  })

  // Alterna el modo noche. No hay forma de borrar archivos desde un mod: apagarlo escribe `activo:false`, que vale lo mismo que no tener el archivo.
  on('command.run', { command: 'noche' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const nuevo = arg === 'on' ? true : arg === 'off' ? false : !(await leerModoNoche($))
    const ahora = await $.clock.now()
    try {
      await $.fs.write(RUTA_NOCHE, JSON.stringify({ activo: nuevo, desde: new Date(ahora).toISOString() }))
    } catch (error) {
      return { text: `No pude guardar el modo noche (${error instanceof Error ? error.message : String(error)}).` }
    }
    await leerModoNoche($)
    if (nuevo && enMarcha) {
      // La misión que ya corría pasa a modo noche desde ahora.
      desde = ahora
      semanaInicial = (await limites($)).semana?.percentUsed ?? null
      await update($, mision, m => ({ ...m, max: MAX_CONTINUACIONES_NOCHE }))
      await anotar($, 'Se activó el modo noche')
      await guardar($)
    }

    return {
      text: nuevo
        ? `Modo noche activo: el piloto decide solo (sin preguntar), sigue tras el límite de 5 horas y los errores pasajeros de la API, y escribe el resumen en ${RUTA_RESUMEN}. Corta solo a las 7:00 o si la semana llega a 80%. /noche lo apaga.`
        : 'Modo noche apagado: vuelve a preguntarte lo importante.',
    }
  })

  on('command.run', { command: 'piloto' }, async ($, e) => {
    const arg = e.args.trim()
    const baja = arg.toLowerCase()
    if (baja === 'retomar') {
      const i = leerInstantanea(await $.fs.read(RUTA_MISION).then(r => (typeof r === 'string' ? r : undefined), () => undefined))
      if (i === null || !i.mision.activa) return { text: 'No hay una misión a medias en esta carpeta.' }
      await leerModoNoche($)
      const ahora = await $.clock.now()
      plan = i.plan
      planDeTodoWrite = i.planDeTodoWrite
      ultimoSiguiente = i.ultimoSiguiente
      repeticiones = 0
      yaRevisado = i.yaRevisado
      veredicto = i.veredicto
      rondas = i.rondas
      sinVeredicto = i.sinVeredicto
      enMarcha = true
      desde = i.noche && noche && i.desde > 0 ? i.desde : ahora
      semanaInicial = i.noche && noche ? i.semanaInicial : ((await limites($)).semana?.percentUsed ?? null)
      reintentos = 0
      reintentosTotal = i.reintentosTotal
      esperasLimite = i.esperasLimite
      bitacora = i.bitacora
      fallos = i.fallos
      dudas = i.dudas
      espera?.cancel()
      espera = undefined
      await update($, mision, () => ({ ...i.mision, activa: true, continuaciones: 0, max: noche ? MAX_CONTINUACIONES_NOCHE : MAX_CONTINUACIONES }))
      await anotar($, 'Se retomó la misión guardada')
      await guardar($)
      enviarPropio($, textoRetomar(i))

      return { text: `Retomo la misión: ${i.mision.objetivo} (${resumenPlan(i.plan).hechos} de ${i.plan.length} pasos hechos).` }
    }
    if (baja === 'parar' || baja === 'stop') {
      await terminar($, 'lo paraste tú', 'Piloto: parado.')

      return { text: 'Piloto parado. Lo que quedó hecho se queda; lo demás lo sigues tú.' }
    }
    if (baja === 'auto on' || baja === 'auto off') {
      await update($, pilotoAuto, () => baja === 'auto on')
      await $.store.set('pilotoAuto', baja === 'auto on').catch(() => undefined)

      return { text: `Piloto automático ${baja === 'auto on' ? 'activo: los pedidos grandes se llevan solos' : 'apagado: solo arranca con /piloto <objetivo>'}.` }
    }
    if (arg === '') {
      const m = await read($, mision)
      const auto = await read($, pilotoAuto)

      return {
        text: m.activa
          ? `Piloto en marcha: ${m.objetivo} · ${m.hechos} de ${m.total} pasos · siguió solo ${m.continuaciones}/${m.max} veces.`
          : `Piloto ${auto ? 'en automático' : 'solo manual'}. ${m.fin !== '' ? `La última misión terminó: ${m.fin}.` : 'Escribe /piloto <qué quieres lograr>.'}`,
      }
    }
    await empezar($, arg)
    void $.prompt.submit({ text: `${limpiarEnvoltorios(arg)}\n\n${protocolo(arg, await hayPruebas($), noche)}`, wait: false } as never).catch(() => undefined)

    return { text: 'Piloto en marcha. Planea, reparte con el equipo y avanza solo; te aviso al terminar. /piloto parar lo frena.' }
  })
}
