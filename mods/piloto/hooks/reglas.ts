// Las reglas del piloto: sin `$`, para probarlas directamente.

import type { Paso } from '../types'

/** Cuántas veces sigue solo como mucho en una misión. */
export const MAX_CONTINUACIONES = 8

const ENVOLTURAS = /<(system-reminder|local-command-caveat|local-command-stdout|local-command-stderr|command-name|command-message|command-args)>[\s\S]*?<\/\1>/g
/** Pedidos de crear algo que casi siempre son trabajo grande aunque se escriban en una línea. */
const CREAR = /\b(haz(me)?|crea(me|r)?|constru\w+|desarroll\w+|mont\w+|genera(me|r)?|dise[ñn]a(me|r)?)\b[^.\n]{0,40}\b(p[aá]gina|sitio|web|landing|tienda|app|aplicaci[oó]n|sistema|dashboard|panel|bot|api|plataforma|portafolio|blog|cat[aá]logo|juego)\b/i
const PALABRAS_GRANDES = /\b(refactor\w*|migra\w*|reescrib\w*|rediseñ\w*|arquitectura|sistema completo|app completa|aplicaci[oó]n completa|todo el proyecto|de punta a punta|end[- ]to[- ]end|varios (archivos|m[oó]dulos|pasos)|desde cero|implementa\w* (un|una|el|la) \w+ (completo|completa)|p[aá]gina (web )?completa|sitio (web )?completo)\b/i

/** Si el pedido parece un trabajo grande: largo, con varias partes, o que lo dice con sus palabras. */
export const esTareaGrande = (texto: string): boolean => {
  const t = texto.replace(ENVOLTURAS, '').trim()
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

export const recortar = (texto: string, n: number): string => {
  const limpio = texto.replace(/\s+/g, ' ').trim()

  return limpio.length > n ? `${limpio.slice(0, n)}…` : limpio
}

/**
 * Lo que se le dice a Claude al empezar una misión (corto: va con el mensaje, no en el prompt de sistema).
 * Sigue el método de Everything Claude Code: plan, pruebas primero, revisión con contexto limpio, verificar, apuntar lo aprendido.
 */
export const protocolo = (objetivo: string, tienePruebas = false): string =>
  `<piloto>Misión: ${recortar(objetivo, 400)}. Trabaja de principio a fin sin pedirme confirmaciones, salvo que algo bloquee de verdad (si dudas, elige lo razonable y dilo en una línea). ` +
  '1) Haz el plan con TodoWrite: 3 a 8 pasos, cada uno con su criterio de "terminado". ' +
  '2) Ejecuta paso a paso como director: lo pesado de leer, buscar o hacer repártelo con el equipo (equipo:explorador, equipo:obrero, equipo:investigador), con "dificultad: baja|media|alta" en cada encargo; lo pequeño hazlo tú. Marca cada paso al terminarlo. ' +
  (tienePruebas
    ? 'Método: pruebas primero. En cada cambio de código escribe o ajusta una prueba que falle, haz que pase con el cambio mínimo y corre toda la suite antes del siguiente paso; si algo falla, equipo:arreglador. '
    : 'No hay suite de pruebas: comprueba cada paso de otra forma (ejecuta el código, abre el resultado, mira enlaces y vista de celular) y dime qué viste. ') +
  '3) Al final pasa equipo:revisor (si tocaste formularios, claves, red, archivos o permisos, que revise también la seguridad) y dame un resumen de 5 líneas: qué hiciste, cómo lo comprobaste y qué falta.</piloto>'

export const textoContinuar = (hechos: number, total: number, siguiente: string): string =>
  `Piloto: sigue con el paso ${hechos + 1} de ${total}: ${recortar(siguiente, 160)}. Reparte con el equipo lo que sea pesado y marca el paso al terminar.`

export const TEXTO_PLAN = 'Piloto: antes de seguir, haz el plan con TodoWrite (3 a 8 pasos con su criterio de "terminado") y empieza por el primero.'
export const MAX_RONDAS = 2
export const TEXTO_CORREGIR = (ronda: number): string =>
  `Piloto: el revisor encontró problemas (ronda ${ronda} de ${MAX_RONDAS}). Corrígelos uno por uno, comprueba que cada arreglo funciona y vuelve a pasar equipo:revisor.`
export const TEXTO_REVISION = 'Piloto: todos los pasos están hechos. Antes de darlo por terminado comprueba que funciona de verdad (corre las pruebas o la compilación, o abre y mira el resultado) y pasa equipo:revisor sobre todo lo cambiado. Su respuesta tiene que ser TODO BIEN; si no, corrige.'

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
}

export type Decision =
  | { accion: 'nada' }
  | { accion: 'continuar'; texto: string; revision?: true; correccion?: true }
  | { accion: 'terminar' | 'parar'; motivo: string; revision?: 'aprobada' | 'con observaciones' }

/** Qué hace el piloto cuando el director termina un turno. */
export const decidir = (a: Entrada): Decision => {
  if (!a.activa) return { accion: 'nada' }
  if (a.razon !== 'answer') return { accion: 'parar', motivo: 'lo interrumpiste' }
  if (a.presupuesto !== 'normal') return { accion: 'parar', motivo: 'queda poco límite de uso: paro para no gastarlo; sigue tú cuando quieras' }
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
