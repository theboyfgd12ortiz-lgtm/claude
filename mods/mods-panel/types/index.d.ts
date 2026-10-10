/** What rtk reports with `rtk gain -f json` (tokens are rtk's own estimate). */
export type RtkInfo = { version: string; commands: number; saved: number; percent: number }

export type PanelExtras = {
  /** rtk's programme found and answering; null when it is not installed. */
  rtk: RtkInfo | null
  /** Plugins, by name, that have at least one command or skill loaded (caveman, ponytail...). */
  plugins: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'mods-panel': { extras: PanelExtras }
  }
}
