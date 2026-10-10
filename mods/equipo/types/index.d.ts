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
}

export type Investigacion = {
  id: string
  pregunta: string
  at: number
  estado: 'trabajando' | 'listo' | 'fallo'
  texto: string
  /** Si ya se guardó en el proyecto, dónde. */
  archivo: string | null
}

/** Lo que el equipo aprendió de un tipo de agente. */
export type Ruta = {
  /** Modelo que se le pone ahora, si el equipo decidió cambiarlo; vacío = el de siempre. */
  nivel: 'haiku' | 'sonnet' | null
  /** Últimos resultados con el modelo actual: true = bien. */
  recientes: boolean[]
  /** Aciertos seguidos desde el último cambio. */
  seguidos: number
  /** Cuántas veces trabajó y cuántos tokens (ponderados) gastó en total. */
  veces: number
  unidades: number
  /** Cuántas veces el equipo lo subió de nivel. */
  subidas: number
}

export type Aprendizaje = Record<string, Ruta>

declare module 'claude-code' {
  interface PluginState {
    equipo: { agentes: Registro[]; investigacion: Investigacion | null; isAuto: boolean; aprendizaje: Aprendizaje }
  }
}
