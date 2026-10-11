// Cómo aprende el equipo: sin `$`, para probarlo directamente.
// Regla: un tipo de agente barato que falla seguido sube a Sonnet; cuando vuelve a acertar muchas veces seguidas, se prueba de nuevo el barato.

import type { Aprendizaje, Ruta } from '../types'
import { MODELO_POR_TIPO } from './reglas'

/** Resultados que se recuerdan para decidir. */
export const VENTANA = 4
/** Fallos dentro de la ventana que hacen subir de nivel. */
export const FALLOS_PARA_SUBIR = 2
/** Aciertos seguidos con el nivel subido para volver a probar el barato. */
export const ACIERTOS_PARA_BAJAR = 8

export const rutaVacia = (): Ruta => ({ nivel: null, recientes: [], seguidos: 0, veces: 0, unidades: 0, subidas: 0, neto: 0 })

/** El modelo que se debe usar ahora para un tipo: lo aprendido, si hay, o el de siempre. */
export const modeloAprendido = (a: Aprendizaje, tipo: string): 'haiku' | 'sonnet' | 'opus' | undefined => a[tipo]?.nivel ?? MODELO_POR_TIPO[tipo]

/** Lo que debe tener la respuesta de cada tipo según el formato que se le pidió; si no lo trae, el trabajo no sirvió. */
export const cumpleContrato = (tipo: string, answer: string): boolean => {
  const t = answer.trim()
  if (tipo === 'equipo:explorador' || tipo === 'Explore') return /[\w-]+\.\w{1,5}\b|\/\w|:\d+|no (lo )?encontr|no hay/i.test(t)
  if (tipo === 'equipo:investigador') return /https?:\/\/|fuentes?:/i.test(t)
  if (tipo === 'equipo:revisor') return /TODO BIEN|^\s*(?:[-*•]|\d+[.)])/m.test(t)
  if (tipo === 'equipo:obrero' || tipo === 'equipo:arreglador') return t.length >= 20

  return true
}

/** Un trabajo es bueno si el agente terminó con una respuesta que cumple el formato pedido (no solo "algo"). */
export const esBueno = (reason: string, answer: unknown, tipo = ''): boolean =>
  reason === 'answer' && typeof answer === 'string' && answer.trim().length > 0 && cumpleContrato(tipo, answer)

/**
 * Anota un resultado y decide si cambia el nivel. `familia` es el modelo con el que corrió:
 * solo cuenta si fue el que el equipo tenía para ese tipo (si alguien pidió otro a mano, no se aprende de eso).
 */
export const aprender = (a: Aprendizaje, tipo: string, familia: string, bueno: boolean, unidades: number, neto = 0, cuenta = true): Aprendizaje => {
  const base = MODELO_POR_TIPO[tipo]
  if (base === undefined) return a
  const r = a[tipo] ?? rutaVacia()
  const actual = r.nivel ?? base
  const sumado: Ruta = cuenta ? { ...r, veces: r.veces + 1, unidades: r.unidades + Math.max(0, Math.round(unidades)), neto: (r.neto ?? 0) + Math.round(neto) } : r
  if (familia !== actual) return { ...a, [tipo]: sumado }

  const recientes = [...r.recientes, bueno].slice(-VENTANA)
  const fallos = recientes.filter(x => !x).length
  const seguidos = bueno ? r.seguidos + 1 : 0

  // Falla seguido: sube un escalón (Haiku → Sonnet → Opus). Es lo que cuesta, pero un agente que falla cuesta más.
  if (!bueno && fallos >= FALLOS_PARA_SUBIR && actual !== 'opus') {
    return { ...a, [tipo]: { ...sumado, nivel: actual === 'haiku' ? 'sonnet' : 'opus', recientes: [], seguidos: 0, subidas: r.subidas + 1 } }
  }
  // Acertó mucho con el nivel subido: baja un escalón para probar de nuevo lo más barato.
  if (bueno && r.nivel !== null && r.nivel !== base && seguidos >= ACIERTOS_PARA_BAJAR) {
    const abajo = r.nivel === 'opus' ? 'sonnet' : 'haiku'

    return { ...a, [tipo]: { ...sumado, nivel: abajo === base ? null : abajo, recientes: [], seguidos: 0 } }
  }

  return { ...a, [tipo]: { ...sumado, recientes, seguidos } }
}

/** Trabajos mínimos antes de juzgar si un tipo sale a cuenta. */
export const MIN_RENTABLE = 5

/** Frases cortas con lo aprendido, para la guía del director y para el panel. */
export const lecciones = (a: Aprendizaje): string[] =>
  Object.entries(a)
    .flatMap(([tipo, r]) => {
      const nombre = tipo.replace('equipo:', '')
      const out: string[] = []
      if (r.nivel !== null && r.nivel !== MODELO_POR_TIPO[tipo]) {
        out.push(`${nombre} falló con ${MODELO_POR_TIPO[tipo]} (${r.subidas} ${r.subidas === 1 ? 'vez' : 'veces'}): ahora corre con ${r.nivel}. Dale instrucciones más precisas.`)
      } else if (r.subidas > 0) {
        out.push(`${nombre} ya vuelve a acertar con ${MODELO_POR_TIPO[tipo]}.`)
      }
      if (r.veces >= MIN_RENTABLE && (r.neto ?? 0) <= 0) out.push(`${nombre} no está saliendo a cuenta (${r.veces} trabajos sin ahorro): hazlo tú mismo salvo que sea muy grande.`)

      return out
    })
    .slice(0, 5)

/** Cuántas unidades gasta de media un tipo (para el panel). */
export const promedio = (r: Ruta): number => (r.veces === 0 ? 0 : Math.round(r.unidades / r.veces))
