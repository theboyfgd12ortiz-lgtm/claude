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

declare module 'claude-code' {
  interface PluginState {
    equipo: { agentes: Registro[]; investigacion: Investigacion | null; isAuto: boolean }
  }
}
