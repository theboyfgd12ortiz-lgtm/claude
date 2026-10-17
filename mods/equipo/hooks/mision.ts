// Las reglas de la misión (piloto): sin `$`, para probarlas directamente.

import type { Mision, Paso } from '../types'

/** Cuántas veces sigue solo como mucho en una misión. */
export const MAX_CONTINUACIONES = 8

/** Lo que se le dice a Claude en modo noche en vez de "pregúntale al usuario". */
export const DECIDE_TU = 'Decide tú con el criterio más prudente y sigue; anota la duda en el resumen de la mañana'
export const MENSAJE_NOCHE = `Modo noche: no hay nadie para contestar esa pregunta. ${DECIDE_TU}.`

const ENVOLTURAS = /<(system-reminder|local-command-caveat|local-command-stdout|local-command-stderr|command-name|command-message|command-args)>[\s\S]*?<\/\1>/g

/** Quita los envoltorios que el sistema pega al mensaje (system-reminder, comandos locales) para quedarse con lo que escribió la persona. */
export const limpiarEnvoltorios = (texto: string): string => texto.replace(ENVOLTURAS, '').trim()

/** Pedidos de crear algo que casi siempre son trabajo grande aunque se escriban en una línea. */
const CREAR = /\b(haz(me)?|crea(me|r)?|constru\w+|desarroll\w+|mont\w+|genera(me|r)?|dise[ñn]a(me|r)?)\b[^.\n]{0,40}\b(p[aá]gina|sitio|web|landing|tienda|app|aplicaci[oó]n|sistema|dashboard|panel|bot|api|plataforma|portafolio|blog|cat[aá]logo|juego)\b/i
const PALABRAS_GRANDES = /\b(refactor\w*|migra\w*|reescrib\w*|rediseñ\w*|arquitectura|sistema completo|app completa|aplicaci[oó]n completa|todo el proyecto|de punta a punta|end[- ]to[- ]end|varios (archivos|m[oó]dulos|pasos)|desde cero|implementa\w* (un|una|el|la) \w+ (completo|completa)|p[aá]gina (web )?completa|sitio (web )?completo)\b/i

/** Si el pedido parece un trabajo grande: largo, con varias partes, o que lo dice con sus palabras. */
export const esTareaGrande = (texto: string): boolean => {
  const t = limpiarEnvoltorios(texto)
  if (t.startsWith('/')) return false
  const partes = t.split('\n').filter(l => /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(l)).length

  return t.length >= 600 || partes >= 3 || PALABRAS_GRANDES.test(t) || CREAR.test(t)
}

/** Si el package.json define un script de pruebas de verdad (no el "no test specified" que npm pone por defecto). */
export const hayPruebasEnPackage = (texto: string): boolean => {
  try {
    const test = (JSON.parse(texto) as { scripts?: { test?: unknown } }).scripts?.test

    return typeof test === 'string' && test.trim() !== '' && !/no test specified/i.test(test)
  } catch {
    return false
  }
}

/** Claves que no deben quedar escritas en la misión ni en el resumen (mismas formas inconfundibles que vigila guardian). */
const SECRETOS: readonly RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|$)/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{20,}/g,
  /\b[sr]k_live_[A-Za-z0-9]{20,}/g,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]*/g,
  /\b(Bearer\s+)[A-Za-z0-9._~+\/=-]{20,}/gi,
  /\b((?:password|passwd|contraseña|secret|token|api[_-]?key)\s*[=:]\s*)[^\s"'&]{6,}/gi,
]

/** Cambia por [oculto] cualquier clave que se vea en el texto, antes de escribirlo en disco. */
export const redactar = (texto: string): string =>
  SECRETOS.reduce((t, p) => t.replace(p, (_m, pre) => `${typeof pre === 'string' ? pre : ''}[oculto]`), texto)

export const recortar = (texto: string, n: number): string => {
  const limpio = texto.replace(/\s+/g, ' ').trim()

  return limpio.length > n ? `${limpio.slice(0, n)}…` : limpio
}

/**
 * Lo que se le dice a Claude al empezar una misión (corto: va con el mensaje, no en el prompt de sistema).
 * Sigue el método de Everything Claude Code: plan, pruebas primero, revisión con contexto limpio, verificar, apuntar lo aprendido.
 */
export const protocolo = (objetivo: string, tienePruebas = false, noche = false): string =>
  `<piloto>Misión: ${recortar(limpiarEnvoltorios(objetivo), 400)}. ` +
  (noche
    ? `Modo noche: no hay nadie para contestar. ${DECIDE_TU}; sigue sin pedirme confirmaciones. `
    : 'Si falta algo que cambie mucho el resultado, pregunta antes de empezar; si no, sigue sin pedirme confirmaciones. ') +
  '1) Haz el plan con TodoWrite: 3 a 8 pasos, cada uno con su criterio de "terminado". Si no tienes TodoWrite, escríbelo como lista "- [ ] paso" y al final de cada respuesta repite la lista marcando "- [x]" lo hecho. ' +
  '2) Ejecuta paso a paso como director: lo pesado de leer, buscar o hacer repártelo con el equipo (equipo:explorador, equipo:obrero, equipo:investigador), con "dificultad: baja|media|alta" en cada encargo; lo pequeño hazlo tú. Marca cada paso al terminarlo. ' +
  (tienePruebas
    ? 'Método: pruebas primero. En cada cambio de código escribe o ajusta una prueba que falle, haz que pase con el cambio mínimo y corre toda la suite antes del siguiente paso; si algo falla, equipo:arreglador. '
    : 'No hay suite de pruebas: comprueba cada paso de otra forma (ejecuta el código, abre el resultado, mira enlaces y vista de celular) y dime qué viste. ') +
  '3) Al final pasa equipo:revisor (si tocaste formularios, claves, red, archivos o permisos, que revise también la seguridad) y dame un resumen de 5 líneas: qué hiciste, cómo lo comprobaste y qué falta.</piloto>'

export const textoContinuar = (hechos: number, total: number, siguiente: string): string =>
  `Piloto: sigue con el paso ${hechos + 1} de ${total}: ${recortar(siguiente, 160)}. Reparte con el equipo lo que sea pesado y marca el paso al terminar.`

export const TEXTO_PLAN = 'Piloto: antes de seguir, haz el plan con TodoWrite (3 a 8 pasos con su criterio de "terminado"; si no tienes TodoWrite, como lista "- [ ] paso") y empieza por el primero.'
export const MAX_RONDAS = 2
export const TEXTO_CORREGIR = (ronda: number): string =>
  `Piloto: el revisor encontró problemas (ronda ${ronda} de ${MAX_RONDAS}). Corrígelos uno por uno, comprueba que cada arreglo funciona y vuelve a pasar equipo:revisor.`
export const TEXTO_REVISION = 'Piloto: todos los pasos están hechos. Antes de darlo por terminado comprueba que funciona de verdad (corre las pruebas o la compilación, o abre y mira el resultado) y pasa equipo:revisor sobre todo lo cambiado. Su respuesta tiene que ser TODO BIEN; si no, corrige.'

/** El plan escrito como lista con casillas ("- [ ] paso", "- [x] paso") cuando no hay TodoWrite; si un paso sale dos veces, manda la última. */
export const planDeTexto = (texto: string): Paso[] => {
  const pasos = new Map<string, boolean>()
  for (const m of texto.matchAll(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/gm)) pasos.set((m[2] ?? '').trim(), m[1] !== ' ')

  return [...pasos].map(([texto, hecho]) => ({ texto, hecho }))
}

/** Junta el plan anterior con la lista nueva: lo que no se repite conserva su estado, lo repetido toma la marca nueva. */
export const unirPlan = (antes: readonly Paso[], ahora: readonly Paso[]): Paso[] => {
  const pasos = new Map(antes.map(p => [p.texto, p.hecho]))
  for (const p of ahora) pasos.set(p.texto, p.hecho)

  return [...pasos].map(([texto, hecho]) => ({ texto, hecho }))
}

export const resumenPlan = (pasos: readonly Paso[]): { hechos: number; total: number; siguiente: string | null } => ({
  hechos: pasos.filter(p => p.hecho).length,
  total: pasos.length,
  siguiente: pasos.find(p => !p.hecho)?.texto ?? null,
})

export type Entrada = {
  activa: boolean
  /** Por qué terminó el turno del director: "answer" si respondió con normalidad. */
  razon: string
  continuaciones: number
  max: number
  total: number
  hechos: number
  siguiente: string | null
  /** El presupuesto del plan: solo con "normal" se sigue solo. */
  presupuesto: string
  /** Cuántas veces seguidas el siguiente paso fue el mismo (señal de atasco). */
  repeticiones: number
  yaRevisado: boolean
  /** Lo que dijo el revisor tras la última revisión: TODO BIEN o una lista de problemas; null si aún no hubo. */
  veredicto: 'ok' | 'problemas' | null
  /** Cuántas rondas de corrección van y cuántas veces se pidió la revisión sin que llegara veredicto. */
  rondas: number
  sinVeredicto: number
  /** Modo noche: el presupuesto apretado no para la misión (lo hacen los topes de noche). */
  noche?: boolean
}

export type Decision =
  | { accion: 'nada' }
  | { accion: 'continuar'; texto: string; revision?: true; correccion?: true }
  | { accion: 'terminar' | 'parar'; motivo: string; revision?: 'aprobada' | 'con observaciones' }

/** Qué hace el piloto cuando el director termina un turno. */
export const decidir = (a: Entrada): Decision => {
  if (!a.activa) return { accion: 'nada' }
  if (a.razon === 'error') return { accion: 'parar', motivo: 'hubo un error de la API' }
  if (a.razon !== 'answer') return { accion: 'parar', motivo: 'lo interrumpiste' }
  // De noche el límite de uso lo manejan los topes de noche (pausa y reanuda; la semana al 80% sí para).
  if (a.presupuesto !== 'normal' && a.noche !== true) return { accion: 'parar', motivo: 'queda poco límite de uso: paro para no gastarlo; sigue tú cuando quieras' }
  if (a.total === 0) {
    // Sin plan: se le pide una vez; si aun así no lo hay, la tarea era corta y ya está.
    return a.continuaciones === 0 ? { accion: 'continuar', texto: TEXTO_PLAN } : { accion: 'terminar', motivo: 'listo' }
  }
  if (a.hechos >= a.total || a.siguiente === null) {
    if (a.total < 3) return { accion: 'terminar', motivo: 'listo' }
    if (!a.yaRevisado) return { accion: 'continuar', texto: TEXTO_REVISION, revision: true }
    if (a.veredicto === 'ok') return { accion: 'terminar', motivo: 'listo y revisado', revision: 'aprobada' }
    if (a.veredicto === 'problemas') {
      return a.rondas < MAX_RONDAS
        ? { accion: 'continuar', texto: TEXTO_CORREGIR(a.rondas + 1), correccion: true }
        : { accion: 'terminar', motivo: 'quedan observaciones del revisor: están en el resumen', revision: 'con observaciones' }
    }

    // Se pidió revisar y no llegó veredicto: se insiste una vez.
    return a.sinVeredicto < 1 ? { accion: 'continuar', texto: TEXTO_REVISION, revision: true } : { accion: 'terminar', motivo: 'listo, pero el revisor no llegó a opinar', revision: 'con observaciones' }
  }
  if (a.continuaciones >= a.max) return { accion: 'parar', motivo: `llegué al tope de ${a.max} pasos seguidos; dime si sigo` }
  if (a.repeticiones >= 2) return { accion: 'parar', motivo: 'parece atascado en el mismo paso; mira qué lo detiene' }

  return { accion: 'continuar', texto: textoContinuar(a.hechos, a.total, a.siguiente) }
}

// ---------------------------------------------------------------------------
// Modo noche, errores de la API, resumen de la mañana y misión en disco.
// ---------------------------------------------------------------------------

/** Dónde se guarda si el modo noche está activo (lo leen varios mods). */
export const RUTA_NOCHE = 'C:\\Users\\thebo\\.claude\\modo-noche.json'
/** El resumen que ortiz lee al despertar. */
export const RUTA_RESUMEN = 'C:\\Users\\thebo\\OneDrive\\Desktop\\resumen-de-la-manana.md'
/** La misión en curso, en la carpeta del proyecto: sobrevive a cerrar Claude Code. */
export const RUTA_MISION = '.claude/mision.json'

/** Vueltas seguidas de noche (de día son 8). */
export const MAX_CONTINUACIONES_NOCHE = 25
/** Esperas tras un error pasajero de la API: 1, 5 y 15 minutos. */
export const ESPERAS_MIN: readonly number[] = [1, 5, 15]
/** Topes de una noche: reintentos en total, esperas por el límite de 5 horas, y puntos de la semana. */
export const MAX_REINTENTOS_NOCHE = 12
export const MAX_ESPERAS_LIMITE = 3
export const SEMANA_PARO = 80
export const SEMANA_MAX_NOCHE = 15
/** Margen tras la hora de renovación del límite antes de seguir. */
export const MARGEN_RENOVACION_MS = 60_000
/** Hora (local) en que la noche se corta sola. */
export const HORA_CORTE = 7

/** Horas máximas que el modo noche puede quedar encendido aunque nadie lo apague. */
export const NOCHE_MAX_HORAS = 12

/** Si el modo noche sigue vigente: desde la hora de corte (7:00) o 12 h, lo que llegue antes. Sin `desde` válido, ya caducó. */
export const nocheVigente = (desde: string, ahora: number): boolean => {
  const t = Date.parse(desde)
  if (Number.isNaN(t)) return false

  return ahora < Math.min(horaDeCorte(t), t + NOCHE_MAX_HORAS * 3_600_000)
}

/** Si el archivo del modo noche dice que está activo (y no caducó, si se da `ahora`); tolera que no exista o venga roto. */
export const leerNoche = (texto: string | undefined, ahora?: number): { activo: boolean; desde: string } => {
  try {
    const d = JSON.parse(texto ?? '') as { activo?: unknown; desde?: unknown }
    const desde = typeof d.desde === 'string' ? d.desde : ''

    return { activo: d.activo === true && (ahora === undefined || nocheVigente(desde, ahora)), desde }
  } catch {
    return { activo: false, desde: '' }
  }
}

/** La próxima hora de corte (las 7:00 locales) después de `desde`. */
export const horaDeCorte = (desde: number): number => {
  const c = new Date(desde)
  c.setHours(HORA_CORTE, 0, 0, 0)
  if (c.getTime() <= desde) c.setDate(c.getDate() + 1)

  return c.getTime()
}

/** Si un tope de la noche obliga a parar limpio (motivo), o null. */
export const topesDeNoche = (a: { ahora: number; desde: number; semana: number | null; semanaInicial: number | null }): string | null => {
  if (a.ahora >= horaDeCorte(a.desde)) return `llegó la hora de corte (${HORA_CORTE}:00)`
  if (a.semana !== null && a.semana >= SEMANA_PARO) return `el límite de la semana va en ${Math.round(a.semana)}%: paro para no dejarte sin uso`
  if (a.semana !== null && a.semanaInicial !== null && a.semana - a.semanaInicial >= SEMANA_MAX_NOCHE) return `ya gasté ${SEMANA_MAX_NOCHE} puntos del límite semanal esta noche`

  return null
}

/** Errores de la API que pueden pasar solos. */
const PASAJEROS = new Set(['rate_limit', 'overloaded', 'server_error'])

/** Milisegundos hasta una fecha ISO; null si no hay fecha o ya pasó. */
const faltanMs = (iso: string | undefined, ahora: number): number | null => {
  if (iso === undefined) return null
  const t = Date.parse(iso)

  return Number.isNaN(t) || t <= ahora ? null : t - ahora
}

export type Espera = { accion: 'esperar'; ms: number; motivo: string; limite: boolean } | { accion: 'parar'; motivo: string }

/** Qué hace el piloto cuando un turno termina por un error de la API: esperar y seguir, o parar. */
export const alFallar = (a: {
  error: string
  /** Reintentos seguidos sin un turno bueno en medio, y en toda la misión. */
  reintentos: number
  reintentosTotal: number
  esperasLimite: number
  cincoHoras: number | null
  semana: number | null
  resetsAt?: string
  ahora: number
}): Espera => {
  if (a.semana !== null && a.semana >= SEMANA_PARO) return { accion: 'parar', motivo: `el límite de la semana va en ${Math.round(a.semana)}%: paro para no dejarte sin uso` }
  if (!PASAJEROS.has(a.error)) return { accion: 'parar', motivo: `error de la API (${a.error}) que no se arregla esperando` }
  if (a.error === 'rate_limit' && (a.cincoHoras ?? 0) >= 100) {
    const falta = faltanMs(a.resetsAt, a.ahora)
    if (falta !== null) {
      if (a.esperasLimite >= MAX_ESPERAS_LIMITE) return { accion: 'parar', motivo: `ya esperé ${MAX_ESPERAS_LIMITE} veces a que se renovara el límite esta noche` }

      return { accion: 'esperar', ms: falta + MARGEN_RENOVACION_MS, motivo: 'se acabó el límite de 5 horas: espero a que se renueve', limite: true }
    }
  }
  if (a.reintentos >= ESPERAS_MIN.length) return { accion: 'parar', motivo: `la API sigue fallando (${a.error}) tras ${ESPERAS_MIN.length} reintentos` }
  if (a.reintentosTotal >= MAX_REINTENTOS_NOCHE) return { accion: 'parar', motivo: `llegué al tope de ${MAX_REINTENTOS_NOCHE} reintentos por la API` }
  const min = ESPERAS_MIN[a.reintentos] ?? 15

  return { accion: 'esperar', ms: min * 60_000, motivo: `error pasajero de la API (${a.error}): reintento en ${min} min`, limite: false }
}

/** Lo que se manda al volver de una espera. */
export const textoReintento = (hechos: number, total: number, siguiente: string | null): string =>
  siguiente === null
    ? 'Piloto: la espera terminó. Sigue donde quedaste (el plan y lo ya hecho siguen igual).'
    : `Piloto: la espera terminó. Sigue con el paso ${hechos + 1} de ${total}: ${recortar(siguiente, 160)}. Lo ya hecho sigue hecho.`

export type Bitacora = { hora: number; texto: string }

export type Instantanea = {
  version: 1
  guardado: number
  mision: Mision
  plan: Paso[]
  planDeTodoWrite: boolean
  ultimoSiguiente: string | null
  yaRevisado: boolean
  veredicto: 'ok' | 'problemas' | null
  rondas: number
  sinVeredicto: number
  noche: boolean
  desde: number
  semanaInicial: number | null
  reintentosTotal: number
  esperasLimite: number
  bitacora: Bitacora[]
  fallos: string[]
  dudas: string[]
}

/** Lee la misión guardada; null si no hay o está rota. */
export const leerInstantanea = (texto: string | undefined): Instantanea | null => {
  try {
    const d = JSON.parse(texto ?? '') as Partial<Instantanea>
    if (d.version !== 1 || typeof d.mision?.activa !== 'boolean' || typeof d.mision.objetivo !== 'string' || !Array.isArray(d.plan)) return null
    const lista = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])

    return {
      version: 1,
      guardado: typeof d.guardado === 'number' ? d.guardado : 0,
      mision: d.mision,
      plan: d.plan.filter(p => typeof p?.texto === 'string').map(p => ({ texto: p.texto, hecho: p.hecho === true })),
      planDeTodoWrite: d.planDeTodoWrite === true,
      ultimoSiguiente: typeof d.ultimoSiguiente === 'string' ? d.ultimoSiguiente : null,
      yaRevisado: d.yaRevisado === true,
      veredicto: d.veredicto === 'ok' || d.veredicto === 'problemas' ? d.veredicto : null,
      rondas: typeof d.rondas === 'number' ? d.rondas : 0,
      sinVeredicto: typeof d.sinVeredicto === 'number' ? d.sinVeredicto : 0,
      noche: d.noche === true,
      desde: typeof d.desde === 'number' ? d.desde : 0,
      semanaInicial: typeof d.semanaInicial === 'number' ? d.semanaInicial : null,
      reintentosTotal: typeof d.reintentosTotal === 'number' ? d.reintentosTotal : 0,
      esperasLimite: typeof d.esperasLimite === 'number' ? d.esperasLimite : 0,
      bitacora: lista<Bitacora>(d.bitacora),
      fallos: lista<string>(d.fallos),
      dudas: lista<string>(d.dudas),
    }
  } catch {
    return null
  }
}

/** Lo que se le dice a Claude al retomar una misión guardada (la conversación nueva no recuerda nada). */
export const textoRetomar = (i: Instantanea): string => {
  const plan = i.plan.map(p => `- [${p.hecho ? 'x' : ' '}] ${p.texto}`).join('\n')

  return (
    `Piloto: retomamos una misión que quedó a medias.\nMisión: ${i.mision.objetivo}\n` +
    (plan === ''
      ? 'Aún no había plan: haz el plan con TodoWrite y empieza.'
      : `Plan (lo marcado ya está hecho):\n${plan}\nSigue con el primer paso sin marcar; si no estás seguro de que algo marcado esté bien, compruébalo rápido.`)
  )
}

const hhmm = (ms: number): string => {
  const d = new Date(ms)

  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** El resumen de la mañana: se reescribe entero después de cada paso. */
export const resumenManana = (a: {
  objetivo: string
  estado: 'en marcha' | 'terminada' | 'parada'
  motivo: string
  ahora: number
  desde: number
  plan: readonly Paso[]
  revision: string
  bitacora: readonly Bitacora[]
  fallos: readonly string[]
  dudas: readonly string[]
}): string => {
  const lista = (xs: readonly string[], vacio: string) => (xs.length === 0 ? `- ${vacio}` : xs.map(x => `- ${x}`).join('\n'))
  const hechos = a.plan.filter(p => p.hecho).map(p => `[x] ${p.texto}`)
  const faltan = a.plan.filter(p => !p.hecho).map(p => `[ ] ${p.texto}`)

  return [
    '# Resumen de la mañana',
    '',
    `**Misión:** ${a.objetivo}`,
    `**Estado:** ${a.estado}${a.motivo !== '' ? ` (${a.motivo})` : ''} · revisión: ${a.revision} · empezó ${a.desde > 0 ? hhmm(a.desde) : '?'} · actualizado ${hhmm(a.ahora)}`,
    '',
    '## Qué se hizo',
    lista(hechos, 'todavía nada marcado'),
    '',
    '## Qué falta',
    lista(faltan, 'nada pendiente en el plan'),
    '',
    '## Qué falló',
    lista(a.fallos, 'nada registrado'),
    '',
    '## Dudas que decidí yo (revísalas)',
    lista(a.dudas, 'ninguna'),
    '',
    '## Bitácora',
    lista(
      a.bitacora.map(b => `${hhmm(b.hora)} ${b.texto}`),
      'sin eventos',
    ),
    '',
  ].join('\n')
}
