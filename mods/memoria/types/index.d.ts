/** La nota de traspaso guardada en la carpeta de trabajo, tal como la ve el panel. */
export type Nota = {
  /** Cuándo se guardó (ms). */
  at: number
  donde: string
  /** La primera línea del objetivo, para mostrarla. */
  resumen: string
  /** Si la guardó solo el mod (conversación llena) o la persona con /guardar. */
  isAuto: boolean
}

declare module 'claude-code' {
  interface PluginState {
    memoria: { notas: number; at: number; isAuto: boolean; traspaso: Nota | null; traspasoAuto: boolean }
  }
}
