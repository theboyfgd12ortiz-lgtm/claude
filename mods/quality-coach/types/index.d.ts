export type CoachStats = { codeTurns: number; verifiedTurns: number; lastWarning: string | null }

declare module 'claude-code' {
  interface PluginState {
    'quality-coach': { isActive: boolean; stats: CoachStats }
  }
}
