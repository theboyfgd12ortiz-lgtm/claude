/** What rtk reports with `rtk gain -f json` (tokens are rtk's own estimate). */
export type RtkInfo = { version: string; commands: number; saved: number; percent: number }

export type PanelExtras = {
  /** rtk's programme found and answering; null when it is not installed. */
  rtk: RtkInfo | null
  /** rtk's saved-token counter when the session started, to show this session's share. */
  rtkAtStart: number | null
  /** Plugins, by name, that have at least one command or skill loaded (caveman, ponytail...). */
  plugins: string[]
}

export type Tab = 'ahora' | 'ahorro' | 'modelo' | 'mods' | 'ayuda'

export type Tone = 'info' | 'ok' | 'warn' | 'bad'

/** One line of the activity feed. */
export type FeedItem = { at: number; icon: string; text: string; tone: Tone }

/** One step of Claude's own task list (TodoWrite / TaskCreate). */
export type PlanItem = { id: string; text: string; status: 'pending' | 'in_progress' | 'completed' }

/** The turn under way, for the "now" view. */
export type Live = {
  isWorking: boolean
  startedAt: number
  prompt: string
  tools: number
  /** What is running right now, in words; null between tools. */
  running: string | null
}

/** One answered turn, for the charts. */
export type TurnPoint = { at: number; fresh: number; cached: number; written: number; seconds: number; model: string }

declare module 'claude-code' {
  interface PluginState {
    'mods-panel': {
      extras: PanelExtras
      tab: Tab
      feed: FeedItem[]
      plan: PlanItem[]
      live: Live
      history: TurnPoint[]
    }
  }
}
