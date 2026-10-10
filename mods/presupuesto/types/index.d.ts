export type Nivel = 'normal' | 'ahorro' | 'critico'

export type Estado = {
  nivel: Nivel
  /** Uso de la semana y de las 5 horas, 0-100; null si el plan no informa límites. */
  semana: number | null
  cincoHoras: number | null
  renuevaSemana: string | null
  /** El nivel más alto del selector que se permite ahora; null mientras no hay límite. El selector lo lee solo. */
  topeMax: number | null
}

declare module 'claude-code' {
  interface PluginState {
    presupuesto: { estado: Estado; isAuto: boolean }
  }
}
