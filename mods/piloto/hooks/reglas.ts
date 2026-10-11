// Las reglas del piloto: sin `$`, para probarlas directamente.

import type { Paso } from '../types'

/** Cuántas veces sigue solo como mucho en una misión. */
export const MAX_CONTINUACIONES = 8

const ENVOLTURAS = /<(system-reminder|local-command-caveat|local-command-stdout|local-command-stderr|command-name|command-message|command-args)>[\s\S]*?<\/\1>/g
const PALABRAS_GRANDES = /\b(refactor\w*|migra\w*|reescrib\w*|rediseñ\w*|arquitectura|sistema completo|app completa|aplicaci[oó]n completa|todo el proyecto|de punta a punta|end[- ]to[- ]end|varios (archivos|m[oó]dulos|pasos)|desde cero|implementa\w* (un|una|el|la) \w+ (completo|completa)|p[aá]gina (web )?completa|sitio (web )?completo)\b/i

/** Si el pedido parece un trabajo grande: largo, con varias partes, o que lo dice con sus palabras. */
export const esTareaGrande = (texto: string): boolean => {
  const t = texto.replace(ENVOLTURAS, '').trim()
  if (t.startsWith('/')) return false
  const partes = t.split('\n').filter(l => /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(l)).length

  return t.length >= 600 || partes >= 3 || PALABRAS_GRANDES.test(t)
}

export const recortar = (texto: string, n: number): string => {
  const limpio = texto.replace(/\s+/g, ' ').trim()

  return limpio.length > n ? `${limpio.slice(0, n)}…` : limpio
}

/** Lo que se le dice a Claude al empezar una misión (corto: va con el mensaje, no en el prompt de sistema). */
export const protocolo = (objetivo: string): string =>
  `<piloto>Misión: ${recortar(objetivo, 400)}. Trabaja de principio a fin sin pedirme confirmaciones, salvo que algo bloquee de verdad (si dudas, elige lo razonable y dilo en una línea). ` +
  '1) Haz el plan con TodoWrite: 3 a 8 pasos, cada uno con su criterio de "terminado". ' +
  '2) Ejecuta paso a paso como director: lo pesado de leer, buscar o hacer repártelo con el equipo (equipo:explorador, equipo:obrero, equipo:investigador), con "dificultad: baja|media|alta" en cada encargo; lo pequeño hazlo tú. Marca cada paso al terminarlo. ' +
  '3) Al final pasa equipo:revisor y dame un resumen de 5 líneas: qué hiciste, cómo lo comprobaste y qué falta.</piloto>'

export const textoContinuar = (hechos: number, total: number, siguiente: string): string =>
  `Piloto: sigue con el paso ${hechos + 1} de ${total}: ${recortar(siguiente, 160)}. Reparte con el equipo lo que sea pesado y marca el paso al terminar.`

export const TEXTO_PLAN = 'Piloto: antes de seguir, haz el plan con TodoWrite (3 a 8 pasos con su criterio de "terminado") y empieza por el primero.'
export const TEXTO_REVISION = 'Piloto: todos los pasos están hechos. Pasa equipo:revisor sobre lo cambiado, corrige lo que encuentre y dame el resumen de 5 líneas (qué hiciste, cómo lo comprobaste, qué falta).'

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
}

export type Decision = { accion: 'nada' } | { accion: 'continuar'; texto: string; revision?: true } | { accion: 'terminar' | 'parar'; motivo: string }

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
    return a.yaRevisado || a.total < 3 ? { accion: 'terminar', motivo: 'listo' } : { accion: 'continuar', texto: TEXTO_REVISION, revision: true }
  }
  if (a.continuaciones >= a.max) return { accion: 'parar', motivo: `llegué al tope de ${a.max} pasos seguidos; dime si sigo` }
  if (a.repeticiones >= 2) return { accion: 'parar', motivo: 'parece atascado en el mismo paso; mira qué lo detiene' }

  return { accion: 'continuar', texto: textoContinuar(a.hechos, a.total, a.siguiente) }
}
