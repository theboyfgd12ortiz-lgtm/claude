/** Un punto de restauración: cómo estaba el proyecto justo antes de un pedido. */
export type Punto = {
  id: string
  /** Commit oculto (refs/claude-mods/respaldo/<id>) con el estado de los archivos. */
  sha: string
  at: number
  /** El pedido, para reconocer el punto en la lista. */
  pedido: string
  /** Archivos nuevos (sin seguimiento de git) que ya existían, para no borrarlos al volver. */
  existentes: string[]
}

/** Lo que pasaría al volver a un punto, calculado antes de pedir confirmación. */
export type Vista = { id: string; modificados: string[]; creados: string[] }

declare module 'claude-code' {
  interface PluginState {
    respaldo: { puntos: Punto[]; isAuto: boolean; vista: Vista | null; mensaje: string | null }
  }
}
