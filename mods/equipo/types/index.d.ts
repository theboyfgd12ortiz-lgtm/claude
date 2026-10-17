export type Familia = 'haiku' | 'sonnet' | 'opus' | 'otro'

/** Un agente que trabajó para el director: qué tipo, con qué modelo y cuánto gastó. */
export type Registro = {
  id: string
  tipo: string
  descripcion: string
  modelo: string
  familia: Familia
  /** El modelo del director cuando lo lanzó: con qué se compara el ahorro. */
  padre: Familia
  at: number
  fin: number | null
  estado: 'trabajando' | 'listo'
  /** Tokens: leídos nuevos, leídos de caché y escritos. */
  nuevo: number
  cache: number
  escrito: number
  /** Tokens estimados (caracteres/4) de lo que el director le encargó y de lo que le respondió: delegar también cuesta. */
  encargo?: number
  respuesta?: number
}

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
    equipo: { agentes: Registro[]; isAuto: boolean; mision: Mision; pilotoAuto: boolean; modoNoche: boolean }
  }
}
