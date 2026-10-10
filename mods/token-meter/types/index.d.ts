export type TurnStats = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  seconds: number
  tools: number
  model: string
}

export type Totals = { turns: number; input: number; output: number; cacheRead: number; cacheWrite: number; tools: number }

declare module 'claude-code' {
  interface PluginState {
    'token-meter': { last: TurnStats | null; total: Totals; isHidden: boolean }
  }
}
