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

export const rutaVacia = (): Ruta => ({ nivel: null, recientes: [], seguidos: 0, veces: 0, unidades: 0, subidas: 0 })

/** El modelo que se debe usar ahora para un tipo: lo aprendido, si hay, o el de siempre. */
export const modeloAprendido = (a: Aprendizaje, tipo: string): 'haiku' | 'sonnet' | undefined => a[tipo]?.nivel ?? MODELO_POR_TIPO[tipo]

/** Un trabajo es bueno si el agente terminó con una respuesta que dice algo. */
export const esBueno = (reason: string, answer: unknown): boolean => reason === 'answer' && typeof answer === 'string' && answer.trim().length > 0

/**
 * Anota un resultado y decide si cambia el nivel. `familia` es el modelo con el que corrió:
 * solo cuenta si fue el que el equipo tenía para ese tipo (si alguien pidió otro a mano, no se aprende de eso).
 */
export const aprender = (a: Aprendizaje, tipo: string, familia: string, bueno: boolean, unidades: number): Aprendizaje => {
  const base = MODELO_POR_TIPO[tipo]
  if (base === undefined) return a
  const r = a[tipo] ?? rutaVacia()
  const actual = r.nivel ?? base
  const sumado: Ruta = { ...r, veces: r.veces + 1, unidades: r.unidades + Math.max(0, Math.round(unidades)) }
  if (familia !== actual) return { ...a, [tipo]: sumado }

  const recientes = [...r.recientes, bueno].slice(-VENTANA)
  const fallos = recientes.filter(x => !x).length
  const seguidos = bueno ? r.seguidos + 1 : 0

  // Falla seguido y se puede subir (solo hasta Sonnet: Opus no se pone solo por costo).
  if (!bueno && fallos >= FALLOS_PARA_SUBIR && actual === 'haiku') {
    return { ...a, [tipo]: { ...sumado, nivel: 'sonnet', recientes: [], seguidos: 0, subidas: r.subidas + 1 } }
  }
  // Acertó mucho con el nivel subido: se prueba de nuevo con el barato.
  if (bueno && r.nivel !== null && r.nivel !== base && seguidos >= ACIERTOS_PARA_BAJAR) {
    return { ...a, [tipo]: { ...sumado, nivel: null, recientes: [], seguidos: 0 } }
  }

  return { ...a, [tipo]: { ...sumado, recientes, seguidos } }
}

/** Frases cortas con lo aprendido, para la guía del director y para el panel. */
export const lecciones = (a: Aprendizaje): string[] =>
  Object.entries(a)
    .flatMap(([tipo, r]) => {
      const nombre = tipo.replace('equipo:', '')
      if (r.nivel !== null && r.nivel !== MODELO_POR_TIPO[tipo]) {
        return [`${nombre} falló con Haiku (${r.subidas} ${r.subidas === 1 ? 'vez' : 'veces'}): ahora corre con Sonnet. Dale instrucciones más precisas.`]
      }

      return r.subidas > 0 ? [`${nombre} ya vuelve a acertar con ${MODELO_POR_TIPO[tipo]}.`] : []
    })
    .slice(0, 5)

/** Cuántas unidades gasta de media un tipo (para el panel). */
export const promedio = (r: Ruta): number => (r.veces === 0 ? 0 : Math.round(r.unidades / r.veces))
