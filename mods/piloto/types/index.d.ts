export type Paso = { texto: string; hecho: boolean }

/** El avance de una misión del piloto. */
export type Mision = {
  activa: boolean
  objetivo: string
  hechos: number
  total: number
  siguiente: string | null
  /** Cuántas veces el piloto siguió solo, y el tope. */
  continuaciones: number
  max: number
  /** Por qué terminó o paró la última misión (vacío mientras corre). */
  fin: string
  /** La revisión final: sin empezar, en marcha, aprobada o con observaciones que quedaron. */
  revision: 'sin revisar' | 'revisando' | 'corrigiendo' | 'aprobada' | 'con observaciones'
}

declare module 'claude-code' {
  interface PluginState {
    piloto: { mision: Mision; isAuto: boolean }
  }
}
