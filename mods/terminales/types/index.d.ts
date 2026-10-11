/** Una terminal de Claude Code abierta en este proyecto. */
export type Terminal = {
  id: string
  /** T1, T2…: el nombre corto con el que se las llama. */
  nombre: string
  inicio: number
  /** Última señal de vida (cada 30 s); 0 si la terminal se cerró. */
  ultimo: number
  /** Lo último grande que se le pidió. */
  tarea: string
  /** Archivos que está editando y cuándo tocó cada uno. */
  archivos: Record<string, number>
}

export type Mensaje = { de: string; texto: string; at: number }

/** Lo que la terminal sabe de sí y de las demás (para el panel). */
export type Estado = { yo: Terminal | null; otras: Terminal[]; recibidos: number }

declare module 'claude-code' {
  interface PluginState {
    terminales: { estado: Estado }
  }
}
