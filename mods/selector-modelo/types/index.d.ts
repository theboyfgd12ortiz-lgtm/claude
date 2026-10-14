export type Familia = 'haiku' | 'sonnet' | 'opus'

/** Lo que el clasificador puntúa de cada petición, cada cosa de 0 a 3. */
export type Puntos = {
  alcance: number
  razonamiento: number
  riesgo: number
  dudas: number
  calidad: number
}

export type Origen = 'clasificador' | 'respaldo' | 'seguimiento' | 'fijo'

/** Una petición y lo que el selector decidió para ella. */
export type Decision = {
  hora: number
  texto: string
  /** El nivel con el que empezó el turno. */
  nivel: number
  /** El nivel con el que terminó (mayor si subió solo a mitad de la tarea). */
  final: number
  origen: Origen
  motivo: string
  puntos: Puntos | null
  pasos: number
  errores: number
  tokens: number
}

export type Consumo = { llamadas: number; entrada: number; salida: number }
export type Uso = Record<Familia, Consumo>

/** 'auto' o un nivel fijo del 1 al 9. */
export type Modo = 'auto' | number

export type Nivel = 'normal' | 'ahorro' | 'critico'

export type Estado = {
  nivel: Nivel
  /** Uso de la semana y de las 5 horas, 0-100; null si el plan no informa límites. */
  semana: number | null
  cincoHoras: number | null
  renuevaSemana: string | null
  /** El nivel más alto que se permite ahora; null mientras no hay límite. */
  topeMax: number | null
}

export type CoachStats = { codeTurns: number; verifiedTurns: number; lastWarning: string | null }

declare module 'claude-code' {
  interface PluginState {
    'selector-modelo': {
      nivel: number
      modo: Modo
      tope: number
      historial: Decision[]
      uso: Uso
      clasificador: { consultas: number; tokens: number }
      presupuesto: Estado
      presupuestoAuto: boolean
      mejorarAuto: boolean
      avisados: number
      calidad: CoachStats
    }
  }
}
