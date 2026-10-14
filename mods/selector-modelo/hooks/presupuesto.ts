// Reglas puras: sin `$`, para probarlas directamente.

import type { Nivel } from '../types'

/** A partir de aquí se ahorra: el tope del selector baja a Sonnet. */
export const UMBRAL_AHORRO = 80
/** A partir de aquí se ahorra todo lo posible: el tope baja a Haiku, que cuesta unas 20 veces menos que Sonnet. */
export const UMBRAL_CRITICO = 95

/** El tope del selector en cada nivel (null: no se toca). */
export const TOPE: Record<Nivel, number | null> = { normal: null, ahorro: 5, critico: 2 }

/** El nivel según el uso más alto de los dos límites; las 5 horas pesan solo si van muy altas. */
export const nivelDe = (semana: number | null, cincoHoras: number | null): Nivel => {
  const s = semana ?? 0
  const h = cincoHoras ?? 0
  if (s >= UMBRAL_CRITICO || h >= 97) return 'critico'
  if (s >= UMBRAL_AHORRO || h >= 90) return 'ahorro'

  return 'normal'
}

/** Lo que se le pide a Claude en cada nivel, añadido al final del prompt de sistema. */
export const INSTRUCCIONES: Record<Nivel, string | null> = {
  normal: null,
  ahorro: `# Modo ahorro (presupuesto)
Al usuario le queda poco de su límite de uso. Sin bajar la calidad de lo que entregas:
- Primero lo que pidió la persona, directo. Puedes usar una skill si de verdad mejora el resultado (máximo una por pedido, nunca "por si acaso"); nada de exploración previa.
- Lee solo las líneas que necesitas; no releas archivos ni repitas comandos.
- Lo pesado de leer o buscar delégalo a equipo:explorador (corre con un modelo barato); máximo 2 agentes.
- Respuestas cortas: el resultado y lo imprescindible.`,
  critico: `# Modo ahorro máximo (presupuesto)
Al usuario casi no le queda límite de uso esta semana. Cada token cuenta:
- Haz solo lo que se pidió, en el mínimo de pasos. Una skill como mucho, y solo si es imprescindible para la calidad; nada de exploración amplia; si hay que leer mucho, un solo equipo:explorador (barato).
- Si la tarea es grande, propón hacerla por partes y empieza por la más importante.
- Respuestas de pocas líneas.`,
}

export const ETIQUETA: Record<Nivel, string> = { normal: 'normal', ahorro: 'modo ahorro', critico: 'ahorro máximo' }

/** Con el presupuesto bajo se permite una skill por pedido: las que ayudan siguen, las de "por si acaso" no. */
export const SKILLS_POR_PEDIDO = 1

/** El aviso que recibe Claude cuando pide otra skill en el mismo pedido. */
export const LIMITE_SKILLS = 'Presupuesto bajo: ya cargaste una skill en este pedido. Sigue con ella (o con lo que ya sabes) y no abras otra.'

/** Los milisegundos que faltan para una fecha ISO; null si no hay fecha o ya pasó. */
export const faltaPara = (iso: string | undefined, ahora: number): number | null => {
  if (iso === undefined) return null
  const t = Date.parse(iso)

  return Number.isNaN(t) || t <= ahora ? null : t - ahora
}

/** "1 h 20 min", "35 min". */
export const duracion = (ms: number): string => {
  const min = Math.max(1, Math.round(ms / 60_000))

  return min >= 60 ? `${Math.floor(min / 60)} h${min % 60 > 0 ? ` ${min % 60} min` : ''}` : `${min} min`
}

/** El límite de 5 horas llegó al tope: no se puede seguir hasta que se renueve. */
export const estaAgotado = (cincoHoras: number | null, semana: number | null): boolean => (cincoHoras ?? 0) >= 100 || (semana ?? 0) >= 100
