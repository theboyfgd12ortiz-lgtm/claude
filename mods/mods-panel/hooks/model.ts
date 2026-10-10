// Pure logic of the panel: no `$`, so tests can call it directly.

import type { FeedItem, PlanItem, RtkInfo, TurnPoint } from '../types'

export const FEED_MAX = 40
export const HISTORY_MAX = 24

/** 1234 -> "1.2k", 1234567 -> "1.23M". */
export const short = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(Math.round(n))

export const percent = (part: number, all: number): number => (all === 0 ? 0 : Math.round((part / all) * 100))

/** "hace 3 min", "12:04" style label for a feed line. */
export const clock = (at: number): string => {
  const d = new Date(at)

  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Seconds as "45s" or "2m 05s". */
export const duration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))

  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

/** A progress bar of `width` cells. */
export const bar = (value: number, total: number, width: number): string => {
  const full = total > 0 ? Math.min(width, Math.max(0, Math.round((value / total) * width))) : 0

  return '█'.repeat(full) + '░'.repeat(width - full)
}

export const pushFeed = (feed: readonly FeedItem[], item: FeedItem): FeedItem[] => [...feed, item].slice(-FEED_MAX)

const fileName = (path: unknown): string => (typeof path === 'string' ? (path.split(/[\\/]/).pop() ?? path) : '')

const clip = (text: string, max: number): string => {
  const one = text.replace(/\s+/g, ' ').trim()

  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

/** A tool call, in words a person reads ("Leyendo app.ts"). */
export const describeTool = (tool: string, input: Record<string, unknown>): { icon: string; text: string } => {
  switch (tool) {
    case 'Bash':
      return { icon: '▸', text: `Comando: ${clip(String(input.command ?? ''), 60)}` }
    case 'Read':
      return { icon: '📄', text: `Leyendo ${fileName(input.file_path)}` }
    case 'Edit':
    case 'MultiEdit':
      return { icon: '✏️', text: `Editando ${fileName(input.file_path)}` }
    case 'Write':
      return { icon: '✏️', text: `Escribiendo ${fileName(input.file_path)}` }
    case 'NotebookEdit':
      return { icon: '✏️', text: `Editando ${fileName(input.notebook_path)}` }
    case 'Grep':
    case 'Glob':
      return { icon: '🔎', text: `Buscando ${clip(String(input.pattern ?? ''), 50)}` }
    case 'Agent':
    case 'Task':
      return { icon: '🤖', text: `Subagente: ${clip(String(input.description ?? input.subagent_type ?? ''), 50)}` }
    case 'WebSearch':
      return { icon: '🌐', text: `Buscando en la web: ${clip(String(input.query ?? ''), 45)}` }
    case 'WebFetch':
      return { icon: '🌐', text: `Abriendo ${clip(String(input.url ?? ''), 50)}` }
    case 'Skill':
      return { icon: '🧩', text: `Usando la skill ${clip(String(input.skill ?? ''), 40)}` }
    default:
      return { icon: '🔧', text: tool.startsWith('mcp__') ? `Herramienta ${tool.split('__').slice(1).join(' · ')}` : `Herramienta ${tool}` }
  }
}

/** TodoWrite replaces the whole list. */
export const planFromTodos = (todos: readonly { content: string; status: PlanItem['status'] }[]): PlanItem[] =>
  todos.map((t, i) => ({ id: `todo-${i}`, text: t.content, status: t.status }))

export const planAdd = (plan: readonly PlanItem[], id: string, text: string): PlanItem[] =>
  plan.some(p => p.id === id) ? [...plan] : [...plan, { id, text, status: 'pending' }]

export const planUpdate = (
  plan: readonly PlanItem[],
  id: string,
  change: { status?: PlanItem['status'] | 'deleted'; subject?: string },
): PlanItem[] => {
  const status = change.status
  if (status === 'deleted') return plan.filter(p => p.id !== id)

  return plan.map(p => (p.id === id ? { ...p, status: status ?? p.status, text: change.subject ?? p.text } : p))
}

export const pushHistory = (history: readonly TurnPoint[], point: TurnPoint): TurnPoint[] =>
  [...history, point].slice(-HISTORY_MAX)

/** Turns the output of `rtk --version` and `rtk gain -f json` into what the panel shows. */
export const parseRtk = (version: string, gain: string): RtkInfo => {
  let sum: Record<string, number> | undefined
  try {
    sum = (JSON.parse(gain) as { summary?: Record<string, number> }).summary
  } catch {
    sum = undefined
  }

  return {
    version: version.trim().replace(/^rtk\s+/, ''),
    commands: sum?.total_commands ?? 0,
    saved: sum?.total_saved ?? 0,
    percent: Math.round(sum?.avg_savings_pct ?? 0),
  }
}

const COLORS = { cached: '#7c8db5', fresh: '#d97757', written: '#5fa777', label: '#8a8a8a' }

/**
 * A stacked bar per answered turn: tokens read from the cache, tokens read new
 * (the expensive part) and tokens written. Mid-tone colours read on light and dark.
 */
export const chartSvg = (history: readonly TurnPoint[], width: number): string => {
  const points = history.slice(-12)
  const height = 120
  const top = Math.max(1, ...points.map(p => p.cached + p.fresh + p.written))
  const slot = width / Math.max(points.length, 1)
  const barW = Math.max(4, Math.min(28, slot * 0.6))
  const scale = (n: number) => (n / top) * (height - 22)

  const bars = points
    .map((p, i) => {
      const x = i * slot + (slot - barW) / 2
      let y = height - 14
      const rect = (n: number, color: string) => {
        const h = scale(n)
        y -= h

        return h > 0.5 ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="1"/>` : ''
      }

      return rect(p.cached, COLORS.cached) + rect(p.fresh, COLORS.fresh) + rect(p.written, COLORS.written)
    })
    .join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    `<text x="0" y="10" font-size="10" fill="${COLORS.label}" font-family="sans-serif">máx ${short(top)} tokens</text>` +
    bars +
    `<line x1="0" y1="${height - 13}" x2="${width}" y2="${height - 13}" stroke="${COLORS.label}" stroke-width="0.5"/>` +
    `<text x="0" y="${height - 2}" font-size="9" fill="${COLORS.label}" font-family="sans-serif">más antigua</text>` +
    `<text x="${width}" y="${height - 2}" font-size="9" fill="${COLORS.label}" font-family="sans-serif" text-anchor="end">última</text>` +
    `</svg>`
  )
}

export const CHART_COLORS = COLORS

/** The selector's ladder, as the panel names it (kept in step with selector-modelo). */
export const LADDER = [
  { n: 1, name: 'Trivial', model: 'Haiku', effort: 'bajo' },
  { n: 2, name: 'Muy fácil', model: 'Haiku', effort: 'medio' },
  { n: 3, name: 'Fácil', model: 'Sonnet', effort: 'bajo' },
  { n: 4, name: 'Normal', model: 'Sonnet', effort: 'medio' },
  { n: 5, name: 'Exigente', model: 'Sonnet', effort: 'alto' },
  { n: 6, name: 'Difícil', model: 'Opus', effort: 'medio' },
  { n: 7, name: 'Muy difícil', model: 'Opus', effort: 'alto' },
  { n: 8, name: 'Experto', model: 'Opus', effort: 'muy alto' },
  { n: 9, name: 'Máximo', model: 'Opus', effort: 'máximo' },
] as const

export const step = (n: number) => LADDER[Math.min(9, Math.max(1, Math.round(n))) - 1] ?? LADDER[3]

export const familyColor = (model: string): string =>
  model === 'Haiku' ? 'success' : model === 'Sonnet' ? 'suggestion' : 'claude'

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** "mié 1:00" for an ISO time; '' when there is none. */
export const resetLabel = (iso: string | undefined): string => {
  if (iso === undefined) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  return `${DAYS[d.getDay()]} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Colour for a usage percentage: green, then yellow from 70, red from 90. */
export const usageColor = (pct: number): string => (pct >= 90 ? 'error' : pct >= 70 ? 'warning' : 'success')

/** The person's own words: the app's wrappers (<system-reminder> and the like) taken out. */
export const personText = (text: string): string =>
  text
    .replace(/<(system-reminder|local-command-caveat|local-command-stdout|local-command-stderr|command-name|command-message|command-args)>[\s\S]*?<\/\1>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
