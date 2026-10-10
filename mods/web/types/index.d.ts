export type Tono = 'ok' | 'warn' | 'bad'

/** Una cosa que se encontró en la página, dicha en palabras simples. */
export type Hallazgo = { tono: Tono; titulo: string; detalle: string }

export type Informe = {
  url: string
  at: number
  /** 0 a 100. */
  puntos: number
  status: number
  /** Tiempo de respuesta de la página, en milisegundos. */
  ms: number
  kb: number
  hallazgos: Hallazgo[]
  /** Enlaces comprobados y los que fallaron; null si no se comprobaron (revisión rápida). */
  enlaces: { revisados: number; rotos: string[] } | null
  /** Si salió de una revisión automática al publicar. */
  isAuto: boolean
}

export type Estado = 'ok' | 'leve' | 'grave' | 'desconocido'

/** Estado de un servicio que usas, según su página oficial de estado. */
export type Servicio = { id: string; nombre: string; estado: Estado; detalle: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    web: { informe: Informe | null; servicios: Servicio[]; urls: string[]; ocupado: string | null; isAuto: boolean }
  }
}
