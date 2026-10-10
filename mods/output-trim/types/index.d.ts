export type TrimStats = { trims: number; savedChars: number }

declare module 'claude-code' {
  interface PluginState {
    'output-trim': { isActive: boolean; stats: TrimStats }
  }
}
