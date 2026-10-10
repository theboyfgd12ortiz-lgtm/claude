export type GuardianBlock = { at: number; command: string; why: string }

declare module 'claude-code' {
  interface PluginState {
    guardian: { isActive: boolean; isPaused: boolean; blocks: GuardianBlock[] }
  }
}
