import { atom, read, update } from 'claude-code'
import type { ElementConstructor, EngineInterface, InputProps, Register, SvgProps } from 'claude-code'

import type { Change, FeedItem, HealthCheck, Live, PanelExtras, RtkInfo, Tab, Tone } from '../types'
import {
  bar,
  CHANGES_MAX,
  CHART_COLORS,
  clipChange,
  chartSvg,
  clock,
  describeTool,
  duration,
  familyColor,
  hace,
  LADDER,
  parseRtk,
  percent,
  personText,
  resetLabel,
  usageColor,
  planAdd,
  planFromTodos,
  planUpdate,
  pushFeed,
  pushHistory,
  short,
  step,
  unifiedDiff,
} from './model'

export { parseRtk, percent, short } from './model'

const PANE = 'mods-panel'
const TITLE = 'Centro de control'

// ── What the other mods publish ($.state: any plugin reads, only the owner writes) ──
const guardianActive = { plugin: 'guardian', key: 'isActive' } as const
const guardianPaused = { plugin: 'guardian', key: 'isPaused' } as const
const guardianBlocks = { plugin: 'guardian', key: 'blocks' } as const
const trimActive = { plugin: 'output-trim', key: 'isActive' } as const
const trimStats = { plugin: 'output-trim', key: 'stats' } as const
const coachActive = { plugin: 'quality-coach', key: 'isActive' } as const
const coachStats = { plugin: 'quality-coach', key: 'stats' } as const
const meterActive = { plugin: 'token-meter', key: 'isActive' } as const
const meterTotal = { plugin: 'token-meter', key: 'total' } as const
const selNivel = { plugin: 'selector-modelo', key: 'nivel' } as const
const selModo = { plugin: 'selector-modelo', key: 'modo' } as const
const selTope = { plugin: 'selector-modelo', key: 'tope' } as const
const selHistorial = { plugin: 'selector-modelo', key: 'historial' } as const
const selUso = { plugin: 'selector-modelo', key: 'uso' } as const
const selClasificador = { plugin: 'selector-modelo', key: 'clasificador' } as const

// ── The panel's own state ──
const extrasRef = { plugin: 'mods-panel', key: 'extras' } as const
const extras = atom(extrasRef, { rtk: null, rtkAtStart: null, plugins: [] })
const tab = atom({ plugin: 'mods-panel', key: 'tab' } as const, 'ahora')
const feed = atom({ plugin: 'mods-panel', key: 'feed' } as const, [])
const plan = atom({ plugin: 'mods-panel', key: 'plan' } as const, [])
const IDLE: Live = { isWorking: false, startedAt: 0, prompt: '', tools: 0, running: null }
const live = atom({ plugin: 'mods-panel', key: 'live' } as const, IDLE)
const history = atom({ plugin: 'mods-panel', key: 'history' } as const, [])
const health = atom({ plugin: 'mods-panel', key: 'health' } as const, null)
const asked = atom({ plugin: 'mods-panel', key: 'asked' } as const, null)
const changes = atom({ plugin: 'mods-panel', key: 'changes' } as const, [])
const shown = atom({ plugin: 'mods-panel', key: 'shown' } as const, null)
const presupuestoEstado = { plugin: 'presupuesto', key: 'estado' } as const
const presupuestoAuto = { plugin: 'presupuesto', key: 'isAuto' } as const
const memoriaNotas = { plugin: 'memoria', key: 'notas' } as const
const memoriaCuando = { plugin: 'memoria', key: 'at' } as const
const memoriaAuto = { plugin: 'memoria', key: 'isAuto' } as const
const webInforme = { plugin: 'web', key: 'informe' } as const
const webServicios = { plugin: 'web', key: 'servicios' } as const
const webUrls = { plugin: 'web', key: 'urls' } as const
const webOcupado = { plugin: 'web', key: 'ocupado' } as const
const webAuto = { plugin: 'web', key: 'isAuto' } as const
const webUrl = atom({ plugin: 'mods-panel', key: 'webUrl' } as const, '')
const respaldoPuntos = { plugin: 'respaldo', key: 'puntos' } as const
const respaldoVista = { plugin: 'respaldo', key: 'vista' } as const
const respaldoMensaje = { plugin: 'respaldo', key: 'mensaje' } as const
const respaldoAuto = { plugin: 'respaldo', key: 'isAuto' } as const
const traspasoNota = { plugin: 'traspaso', key: 'nota' } as const
const traspasoAuto = { plugin: 'traspaso', key: 'isAuto' } as const
const mejorarAuto = { plugin: 'mejorar-prompt', key: 'isAuto' } as const
const mejorarAvisados = { plugin: 'mejorar-prompt', key: 'avisados' } as const

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'ahora', label: 'Ahora' },
  { id: 'cambios', label: 'Cambios' },
  { id: 'ahorro', label: 'Ahorro' },
  { id: 'modelo', label: 'Modelo' },
  { id: 'web', label: 'Web' },
  { id: 'mods', label: 'Mods' },
  { id: 'ayuda', label: 'Ayuda' },
]

/** Third-party plugins the installer adds, as the panel explains them, with a one-press action. */
export const EXTRAS = [
  {
    plugin: 'caveman',
    title: 'Caveman',
    what: 'Respuestas cortas, sin relleno.',
    action: { label: 'Apagar', fill: 'stop caveman' },
  },
  {
    plugin: 'ponytail',
    title: 'Ponytail',
    what: 'La solución más simple que funcione.',
    action: { label: 'Apagar', fill: '/ponytail off' },
  },
  {
    plugin: 'token-optimizer',
    title: 'Token Optimizer',
    what: 'Vigila qué llena el contexto y evita releer.',
    action: { label: 'Ver informe', fill: '/token-optimizer' },
  },
  {
    plugin: 'humanizer',
    title: 'Humanizer',
    what: 'Quita lo que suena a IA de un texto.',
    action: { label: 'Usar', fill: 'Humaniza este texto: ' },
  },
] as const

const TONE_COLOR: Record<Tone, string | undefined> = { info: undefined, ok: 'success', warn: 'warning', bad: 'error' }

/** Adds one line to the activity feed. */
const note = async ($: EngineInterface, icon: string, text: string, tone: Tone = 'info') => {
  const item: FeedItem = { at: await $.clock.now(), icon, text, tone }
  await update($, feed, list => pushFeed(list, item))
}

/** Runs rtk directly (Windows finds rtk.exe on PATH), then through sh with ~/.local/bin added. */
const runRtk = async ($: EngineInterface, args: string[]) => {
  try {
    const direct = await $.process.run(['rtk', ...args], { timeoutMs: 5000 })
    if (direct.exitCode === 0) return direct
  } catch {
    // Not on PATH as a plain program; try a shell below.
  }

  return $.process.run(['sh', '-c', `PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH" rtk ${args.join(' ')}`], {
    timeoutMs: 5000,
  })
}

/** Reads rtk's savings; null when rtk is not installed. */
const readRtk = async ($: EngineInterface): Promise<RtkInfo | null> => {
  try {
    const v = await runRtk($, ['--version'])
    if (v.exitCode !== 0) return null
    const g = await runRtk($, ['gain', '-f', 'json'])

    return parseRtk(v.stdout, g.exitCode === 0 ? g.stdout : '')
  } catch {
    return null
  }
}

/** Plugins that have at least one command or skill loaded, by name. */
const listPlugins = async ($: EngineInterface): Promise<string[]> => {
  const list = await $.command.list().catch(() => [])

  return [...new Set(list.flatMap(c => [c.plugin ?? '', c.name.split(':')[0] ?? '']))].filter(Boolean)
}

/** Looks again at rtk's counters and the plugins present; reports rtk's savings since last time. */
const refresh = async ($: EngineInterface) => {
  const rtk = await readRtk($)
  const plugins = await listPlugins($)
  const before = await read($, extras)
  if (rtk !== null && before.rtk !== null && rtk.saved > before.rtk.saved) {
    const n = rtk.commands - before.rtk.commands
    await note($, '⚡', `rtk acortó ${n} comando${n === 1 ? '' : 's'} y ahorró ~${short(rtk.saved - before.rtk.saved)} tokens`, 'ok')
  }
  await update($, extras, x => ({ rtk, plugins, rtkAtStart: x.rtkAtStart ?? rtk?.saved ?? null }) satisfies PanelExtras)
}

/** Runs a program's version check; the first line it prints, or null when it is missing. */
const version = async ($: EngineInterface, argv: string[]): Promise<string | null> => {
  try {
    const r = await $.process.run(argv, { timeoutMs: 5000 })
    const line = `${r.stdout}${r.stderr}`.trim().split('\n')[0] ?? ''

    return r.exitCode === 0 && line !== '' ? line.slice(0, 40) : null
  } catch {
    return null
  }
}

/** Checks what the mods need on this machine and writes the result for the Mods tab. */
const checkHealth = async ($: EngineInterface) => {
  const rtk = (await readRtk($))?.version ?? null
  const jq = await version($, ['jq', '--version'])
  const python = (await version($, ['python3', '--version'])) ?? (await version($, ['python', '--version']))
  const node = await version($, ['node', '--version'])
  const bash = await version($, ['bash', '--version'])
  const checks: HealthCheck[] = [
    { name: 'rtk', isOk: rtk !== null, detail: rtk ?? 'no encontrado', why: 'acorta git, ls, grep y tests (Windows: winget install rtk-ai.rtk)' },
    { name: 'jq', isOk: jq !== null, detail: jq ?? 'no encontrado', why: 'lo necesita el puente de rtk (Windows: winget install jqlang.jq)' },
    { name: 'bash', isOk: bash !== null, detail: bash === null ? 'no encontrado' : 'ok', why: 'corre los hooks (en Windows viene con Git for Windows)' },
    { name: 'Python', isOk: python !== null, detail: python ?? 'no encontrado', why: 'lo necesita Token Optimizer (python.org)' },
    { name: 'Node.js', isOk: node !== null, detail: node ?? 'no encontrado', why: 'lo necesitan caveman y ponytail (nodejs.org)' },
  ]
  await update($, health, () => checks)
  const bad = checks.filter(c => !c.isOk)
  await note($, bad.length === 0 ? '🩺' : '⚠', bad.length === 0 ? 'Revisión: todo instalado y funcionando' : `Revisión: falta ${bad.map(c => c.name).join(', ')}`, bad.length === 0 ? 'ok' : 'warn')
}

/** Opens the pane on a tab. */
const openOn = async ($: EngineInterface, which: Tab | undefined) => {
  if (which !== undefined) await update($, tab, () => which)

  return $.ui.open({ id: PANE, title: TITLE })
}

/** Puts text in the prompt box for the person to send (nothing runs by itself). */
const offer = async ($: EngineInterface, text: string) => {
  await $.prompt.fill({ text })
  $.ui.toast('Listo en el cuadro de mensaje: pulsa Enter para enviarlo.')
}

/** The panel's main facts as text, for surfaces that draw no pane. */
const summary = async ($: EngineInterface): Promise<string> => {
  const n = (await $.state.get(selNivel)).value
  const modo = (await $.state.get(selModo)).value ?? 'auto'
  const x = await read($, extras)
  const trim = (await $.state.get(trimStats)).value ?? { trims: 0, savedChars: 0 }
  const rtkSession = x.rtk !== null && x.rtkAtStart !== null ? Math.max(0, x.rtk.saved - x.rtkAtStart) : 0
  const paused = (await $.state.get(guardianPaused)).value ?? false
  const blocks = (await $.state.get(guardianBlocks)).value ?? []
  const steps = await read($, plan)
  const items = (await read($, feed)).slice(-8)
  const plugins = x.plugins.length > 0 ? x.plugins : await listPlugins($)
  const lines = [
    '**Centro de control** (aquí no se puede dibujar el panel; este es el resumen)',
    '',
    n === undefined ? '- Modelo: el selector elige al enviar tu primer mensaje' : `- Modelo: ${step(n).model}, nivel ${n} de 9 (${modo === 'auto' ? 'automático' : 'fijo'})`,
    `- Ahorro en esta sesión: ~${short(rtkSession + Math.round(trim.savedChars / 4))} tokens (rtk ${short(rtkSession)}, recortes ${trim.trims})`,
    `- Guardián: ${paused ? 'en pausa' : 'protegiendo'} · ${blocks.length} bloqueos`,
    `- rtk: ${x.rtk === null ? 'no instalado' : `versión ${x.rtk.version}`}`,
    `- Plugins activos: ${plugins.filter(p => !p.includes(' ')).join(', ') || 'ninguno detectado'}`,
  ]
  if (steps.length > 0) {
    lines.push('', `**Plan** ${steps.filter(p => p.status === 'completed').length}/${steps.length}`)
    for (const p of steps.slice(0, 10)) lines.push(`- ${p.status === 'completed' ? '✓' : p.status === 'in_progress' ? '▶' : '○'} ${p.text}`)
  }
  if (items.length > 0) {
    lines.push('', '**Actividad reciente**')
    for (const i of items) lines.push(`- ${clock(i.at)} ${i.icon} ${i.text}`)
  }

  return lines.join('\n')
}

export const register: Register = on => {
  // ── Session ──
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mods',
      description: 'Abre el Centro de control: actividad, ahorro, modelo y mods',
      argumentHint: '[ahora | ahorro | modelo | mods | ayuda]',
    })
    void $.ui.open({ id: PANE, title: TITLE })
    void refresh($)

    return next(e)
  })

  on('command.run', { command: 'mods' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const which = TABS.find(t => t.id === arg)?.id
    const opened = await openOn($, which)

    // Where nothing draws a pane (a cloud session, the VS Code chat), answer with the same facts as text.
    return { text: opened.isPlaced ? 'Centro de control abierto.' : await summary($) }
  })

  // ── What the person typed, before other plugins and settings hooks add their context ──
  on('prompt.submit', async ($, e, next) => {
    const kind = (e.origin as { kind?: string } | undefined)?.kind
    const isPerson = kind === undefined || ['composer', 'bridge', 'sdk', 'slack-ping', 'unclassified'].includes(kind)
    const text = personText(e.text)
    if (isPerson && text !== '' && !text.startsWith('/')) {
      const at = await $.clock.now()
      await update($, asked, () => ({ at, text: text.slice(0, 160) }))
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // ── A turn begins: what was asked and which model the selector chose ──
  on('turn.start', async ($, e, next) => {
    const at = await $.clock.now()
    const said = await read($, asked)
    const words = said !== null && at - said.at < 120_000 ? said.text : ''
    await update($, asked, () => null)
    await update($, live, () => ({ isWorking: true, startedAt: at, prompt: words.slice(0, 120), tools: 0, running: null }))
    if (words !== '') await note($, '💬', `Pediste: ${words.slice(0, 70)}`)

    const choice = ((await $.state.get(selHistorial)).value ?? []).at(-1)
    if (choice !== undefined && at - choice.hora < 60_000) {
      const s = step(choice.nivel)
      await note($, '🧭', `Modelo: ${s.model} (nivel ${choice.nivel}, esfuerzo ${s.effort})${choice.motivo ? ` · ${choice.motivo}` : ''}`)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // ── Every tool call: live status, the feed, and Claude's own task list ──
  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const isMain = e.agentId === undefined
    const said = describeTool(e.tool, input)
    const isPlanTool = e.tool === 'TodoWrite' || e.tool === 'TaskCreate' || e.tool === 'TaskUpdate'
    const trimBefore = (await $.state.get(trimStats)).value?.trims ?? 0
    const startedAt = await $.clock.now()
    if (isMain && !isPlanTool) await update($, live, l => ({ ...l, running: said.text }))

    const ran = await next(e)

    const took = (await $.clock.now()) - startedAt

    // Every successful file edit, for the Cambios tab.
    if (ran.deny === undefined && ran.isError !== true && (e.tool === 'Edit' || e.tool === 'Write' || String(e.tool) === 'MultiEdit')) {
      const file = String(input.file_path ?? '')
      const edits =
        e.tool === 'Write'
          ? [{ before: '', after: String(input.content ?? ''), kind: 'creó' as const }]
          : e.tool === 'Edit'
            ? [{ before: String(input.old_string ?? ''), after: String(input.new_string ?? ''), kind: 'editó' as const }]
            : ((input.edits as { old_string: string; new_string: string }[] | undefined) ?? []).map(x => ({ before: x.old_string, after: x.new_string, kind: 'editó' as const }))
      const made: Change[] = edits.map(x => ({ at: startedAt, file, kind: x.kind, before: clipChange(x.before), after: clipChange(x.after) }))
      if (made.length > 0) await update($, changes, list => [...list, ...made].slice(-CHANGES_MAX))
    }
    if (isMain) await update($, live, l => ({ ...l, running: null, tools: l.tools + 1 }))

    if (e.tool === 'TodoWrite' && ran.deny === undefined) {
      const todos = (input.todos as { content: string; status: 'pending' | 'in_progress' | 'completed' }[]) ?? []
      await update($, plan, () => planFromTodos(todos))
    } else if (e.tool === 'TaskCreate' && ran.deny === undefined && ran.isError !== true) {
      const id = (ran.result as { task?: { id?: string } } | undefined)?.task?.id
      if (id !== undefined) await update($, plan, p => planAdd(p, id, String(input.subject ?? '')))
    } else if (e.tool === 'TaskUpdate' && ran.deny === undefined && ran.isError !== true) {
      const change = { status: input.status as 'pending' | 'in_progress' | 'completed' | 'deleted' | undefined, subject: input.subject as string | undefined }
      await update($, plan, p => planUpdate(p, String(input.taskId ?? ''), change))
    } else if (ran.deny !== undefined) {
      const isGuardian = ran.deny.startsWith('guardian:')
      await note(
        $,
        isGuardian ? '🛡' : '⛔',
        isGuardian ? `Guardián bloqueó: ${ran.deny.replace(/^guardian: (blocked: |not reading [^:]+: )?/, '').split('. ')[0]}` : `No se ejecutó: ${said.text}`,
        'warn',
      )
    } else if (!isPlanTool) {
      const where = isMain ? '' : ' (subagente)'
      await note($, ran.isError === true ? '✕' : said.icon, `${said.text}${where} · ${duration(took)}`, ran.isError === true ? 'bad' : 'info')
    }

    const trimAfter = (await $.state.get(trimStats)).value?.trims ?? 0
    if (trimAfter > trimBefore) await note($, '✂', 'Salida muy larga recortada (se guardó completa en /tmp)', 'ok')

    return ran
  }).catch(($, e, next) => next(e))

  // ── A turn ends: cost of the answer, warnings, rtk's savings ──
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done

    const now = await $.clock.now()
    const was = await read($, live)
    await update($, live, l => ({ ...l, isWorking: false, running: null }))

    // A long task finished while you may be elsewhere: a system notification says so.
    if (e.durationMs >= 60_000 && !e.isAborted) {
      void $.ui.notify(`Terminé en ${duration(e.durationMs)}${was.prompt ? `: ${was.prompt.slice(0, 60)}` : ''}`, { title: 'Claude' }).catch(() => undefined)
    }

    const u = e.usage
    if (u !== undefined) {
      const fresh = u.input_tokens + u.cache_creation_input_tokens
      await update($, history, h =>
        pushHistory(h, { at: now, fresh, cached: u.cache_read_input_tokens, written: u.output_tokens, seconds: Math.round(e.durationMs / 1000), model: u.model }),
      )
      const all = fresh + u.cache_read_input_tokens
      await note(
        $,
        e.isAborted ? '⏹' : '✅',
        `${e.isAborted ? 'Detenido' : 'Respuesta lista'} en ${duration(e.durationMs)} · ${was.tools} herramientas · ${short(all)} leídos (${percent(u.cache_read_input_tokens, all)}% caché)`,
        e.isAborted ? 'warn' : 'ok',
      )
    }

    const choice = ((await $.state.get(selHistorial)).value ?? []).at(-1)
    if (choice !== undefined && choice.final > choice.nivel && now - choice.hora < 3_600_000) {
      await note($, '📈', `La tarea resultó más difícil: el selector subió del nivel ${choice.nivel} al ${choice.final}`, 'warn')
    }
    const warning = (await $.state.get(coachStats)).value?.lastWarning
    if (warning && was.isWorking) await note($, '⚠', `Calidad: ${warning}`, 'warn')

    void refresh($)

    return done
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    await note($, '🗜', 'Conversación resumida para liberar espacio')

    return done
  }).catch(($, e, next) => next(e))

  // ── The pane ──
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Code, Text } = $.ui.resolve(e)
    // El campo de texto no existe en el móvil: ahí se escribe la dirección con /sitio.
    const Input = e.surface === 'mobile' ? undefined : ($.ui.resolve(e) as unknown as { Input: ElementConstructor<InputProps> }).Input
    // Desktop and mobile draw a real chart; the terminal gets text bars.
    const Svg =
      e.surface === 'desktop' || e.surface === 'mobile'
        ? ($.ui.resolve(e) as unknown as { Svg: ElementConstructor<SvgProps> }).Svg
        : undefined
    const width = Math.max(30, e.props.bodyColumns)
    const current = await read($, tab)
    const now = await $.clock.now()

    // Shared reads.
    const stored = await read($, extras)
    // Before the first refresh (right at start-up) ask for the plugin list directly.
    const x = stored.plugins.length > 0 ? stored : { ...stored, plugins: await listPlugins($) }
    const nivel = (await $.state.get(selNivel)).value ?? 4
    const modo = (await $.state.get(selModo)).value ?? 'auto'
    const hasSelector = x.plugins.includes('selector-modelo') || (await $.state.get(selNivel)).version > 0
    const s = step(nivel)
    const paused = (await $.state.get(guardianPaused)).value ?? false
    const guardianOn = ((await $.state.get(guardianActive)).value ?? false) && !paused
    const trim = (await $.state.get(trimStats)).value ?? { trims: 0, savedChars: 0 }
    const rtkSession = x.rtk !== null && x.rtkAtStart !== null ? Math.max(0, x.rtk.saved - x.rtkAtStart) : 0
    const savedSession = rtkSession + Math.round(trim.savedChars / 4)

    const Section = (p: { title: string; children?: unknown }) => (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>{p.title}</Text>
        {p.children as never}
      </Box>
    )

    // ── Header: three facts at a glance, then the tabs ──
    // Context and plan limits: what the Token Optimizer band showed below the prompt, here instead.
    const usage = await $.session.usage().catch(() => null)
    const limit = (kind: string) => usage?.rateLimits.find(r => r.kind === kind)
    const fiveHour = limit('five_hour')
    const week = limit('seven_day')
    const contextPct = usage?.context.percent
    const budget = (await $.state.get(presupuestoEstado)).value

    const header = (
      <Box flexDirection="column">
        {(contextPct !== undefined || fiveHour !== undefined || week !== undefined) && (
          <Box flexDirection="row" columnGap={2} flexWrap="wrap">
            {contextPct !== undefined && (
              <Text>
                <Text dimColor>contexto</Text> <Text color={usageColor(contextPct)}>{Math.round(contextPct)}%</Text>
              </Text>
            )}
            {fiveHour !== undefined && (
              <Text>
                <Text dimColor>5 horas</Text> <Text color={usageColor(fiveHour.percentUsed)}>{Math.round(fiveHour.percentUsed)}%</Text>
              </Text>
            )}
            {week !== undefined && (
              <Text>
                <Text dimColor>semana</Text> <Text color={usageColor(week.percentUsed)} bold={week.percentUsed >= 90}>{Math.round(week.percentUsed)}%</Text>
                {week.percentUsed >= 70 && resetLabel(week.resetsAt) !== '' && <Text dimColor> · se renueva {resetLabel(week.resetsAt)}</Text>}
              </Text>
            )}
          </Box>
        )}
        <Box flexDirection="row" columnGap={2} flexWrap="wrap">
          {hasSelector && (
            <Text>
              <Text color={familyColor(s.model)} bold>
                ● {s.model}
              </Text>{' '}
              <Text dimColor>nivel {nivel}{modo === 'auto' ? ' auto' : ' fijo'}</Text>
            </Text>
          )}
          <Text>
            <Text color="success" bold>
              ↓ {short(savedSession)}
            </Text>{' '}
            <Text dimColor>tokens ahorrados</Text>
          </Text>
          <Text color={guardianOn ? 'success' : 'warning'}>{guardianOn ? '🛡 protegido' : '🛡 en pausa'}</Text>
          {budget !== undefined && budget.nivel !== 'normal' && (
            <Text color={budget.nivel === 'critico' ? 'error' : 'warning'} bold>
              {budget.nivel === 'critico' ? '💰 ahorro máximo' : '💰 modo ahorro'}
            </Text>
          )}
        </Box>
        <Box flexDirection="row" columnGap={1} flexWrap="wrap" marginTop={1}>
          {TABS.map(t => (
            <Button key={`tab-${t.id}`} label={t.label} variant={current === t.id ? 'primary' : 'secondary'} onPress={() => update($, tab, () => t.id)} />
          ))}
        </Box>
      </Box>
    )

    let body: unknown

    if (current === 'ahora') {
      const l = await read($, live)
      const steps = await read($, plan)
      const items = (await read($, feed)).slice(-12).reverse()
      const doneSteps = steps.filter(p => p.status === 'completed').length
      const saved = (await $.state.get(traspasoNota)).value
      const ctx = usage?.context.percent ?? 0
      // A saved note is worth offering in a fresh conversation (little context), when it is recent enough.
      const offerNote = saved !== undefined && saved !== null && ctx < 20 && saved.at > 0 && now - saved.at < 3 * 86_400_000
      // A long conversation with a saved note: say how to continue clean.
      const suggestClean = saved !== undefined && saved !== null && ctx >= 45 && !l.isWorking && now - saved.at < 3_600_000
      body = (
        <Box flexDirection="column">
          {offerNote && (
            <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="suggestion" paddingX={1}>
              <Text bold>📌 Hay un trabajo guardado ({hace(saved.at, now)})</Text>
              {saved.resumen !== '' && <Text wrap="wrap">{saved.resumen}</Text>}
              <Box flexDirection="row" columnGap={1} marginTop={1}>
                <Button key="note-resume" variant="primary" label="Retomar" onPress={() => $.command.run({ command: 'retomar' })} />
                <Button key="note-drop" label="Descartar" onPress={() => $.command.run({ command: 'traspaso', args: 'descartar' })} />
              </Box>
            </Box>
          )}
          {suggestClean && (
            <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="warning" paddingX={1}>
              <Text bold>🧹 Tu charla está larga ({Math.round(ctx)}% del contexto)</Text>
              <Text wrap="wrap">Ya guardé el progreso. Escribe /clear para empezar limpio (gastas mucho menos) y aquí te aparecerá "Retomar".</Text>
            </Box>
          )}
          <Section title={l.isWorking ? '⏳ TRABAJANDO' : '✓ EN ESPERA'}>
            {l.isWorking ? (
              <Box flexDirection="column">
                <Text wrap="truncate-end">{l.prompt || 'Continuando la tarea'}</Text>
                <Text dimColor>
                  {duration(now - l.startedAt)} · {l.tools} herramientas usadas
                </Text>
                {l.running !== null && <Text color="suggestion" wrap="truncate-end">→ {l.running}</Text>}
              </Box>
            ) : (
              <Text dimColor>Escribe un mensaje y aquí verás qué hago, paso a paso.</Text>
            )}
          </Section>

          {steps.length > 0 && (
            <Section title={`📋 PLAN  ${doneSteps}/${steps.length}`}>
              <Text color="success">{bar(doneSteps, steps.length, Math.min(30, width - 4))}</Text>
              {steps.slice(0, 10).map(p => (
                <Text
                  color={p.status === 'in_progress' ? 'suggestion' : undefined}
                  dimColor={p.status === 'completed'}
                  strikethrough={p.status === 'completed'}
                  wrap="truncate-end"
                >
                  {p.status === 'completed' ? '✓' : p.status === 'in_progress' ? '▶' : '○'} {p.text}
                </Text>
              ))}
            </Section>
          )}

          <Section title="ACTIVIDAD">
            {items.length === 0 && <Text dimColor>Todavía no hay actividad en esta sesión.</Text>}
            {items.map(i => (
              <Text color={TONE_COLOR[i.tone]} wrap="truncate-end">
                <Text dimColor>{clock(i.at)}</Text> {i.icon} {i.text}
              </Text>
            ))}
            {items.length > 0 && (
              <Box marginTop={1}>
                <Button key="feed-clear" plain label="Limpiar actividad" onPress={() => update($, feed, () => [])} />
              </Box>
            )}
          </Section>
        </Box>
      )
    } else if (current === 'cambios') {
      const list = await read($, changes)
      const open = await read($, shown)
      const files = new Set(list.map(c => c.file)).size
      const recent = list.map((c, i) => ({ c, i })).slice(-10).reverse()
      const puntosR = (await $.state.get(respaldoPuntos)).value ?? []
      const vistaR = (await $.state.get(respaldoVista)).value
      const mensajeR = (await $.state.get(respaldoMensaje)).value
      const ultimosPuntos = puntosR.slice(-4).reverse()
      body = (
        <Box flexDirection="column">
          <Section title="↶ DESHACER">
            {puntosR.length === 0 && (
              <Text dimColor>
                Antes de cada pedido guardo un punto de restauración (hace falta un proyecto con git). Aún no hay ninguno.
              </Text>
            )}
            {mensajeR && <Text color="success">{mensajeR}</Text>}
            {vistaR && (
              <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1} marginTop={1}>
                <Text bold>¿Volver atrás?</Text>
                <Text wrap="wrap">
                  Restauro {vistaR.modificados.length} archivo{vistaR.modificados.length === 1 ? '' : 's'}
                  {vistaR.modificados.length > 0 ? ` (${vistaR.modificados.slice(0, 4).join(', ')}${vistaR.modificados.length > 4 ? '…' : ''})` : ''} y quito{' '}
                  {vistaR.creados.length} nuevo{vistaR.creados.length === 1 ? '' : 's'}
                  {vistaR.creados.length > 0 ? ` (${vistaR.creados.slice(0, 4).join(', ')}${vistaR.creados.length > 4 ? '…' : ''})` : ''}. Lo que hayas escrito tú antes de ese pedido no se pierde.
                </Text>
                <Box flexDirection="row" columnGap={1} marginTop={1}>
                  <Button key="undo-yes" variant="primary" label="Sí, volver" onPress={() => $.command.run({ command: 'respaldo', args: `aplicar ${vistaR.id}` })} />
                  <Button key="undo-no" label="Cancelar" onPress={() => $.command.run({ command: 'respaldo', args: 'cancelar' })} />
                </Box>
              </Box>
            )}
            {!vistaR &&
              ultimosPuntos.map((p, i) => (
                <Box key={`pt-${p.id}`} flexDirection="row" justifyContent="space-between" columnGap={1} marginTop={1}>
                  <Text wrap="truncate-end">
                    <Text dimColor>{clock(p.at)}</Text> {i === 0 ? 'Antes de' : 'Antes de'} <Text bold>{p.pedido || '(un pedido)'}</Text>
                  </Text>
                  <Button key={`undo-${p.id}`} label="Volver aquí" onPress={() => $.command.run({ command: 'respaldo', args: `preparar ${p.id}` })} />
                </Box>
              ))}
          </Section>
          <Section title={`CAMBIOS  ${list.length} ediciones · ${files} archivos`}>
            {list.length === 0 && <Text dimColor>Cuando edite o cree archivos, aquí verás cada cambio con el antes (−) y el después (+).</Text>}
            {recent.map(({ c, i }) => (
              <Box key={`chg-${i}`} flexDirection="column" marginTop={1}>
                <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
                  <Text wrap="truncate-end">
                    <Text dimColor>{clock(c.at)}</Text> {c.kind === 'creó' ? '🆕' : '✏️'} <Text bold>{c.file.split(/[\\/]/).pop()}</Text>{' '}
                    <Text dimColor>{c.kind}</Text>
                  </Text>
                  <Button key={`chg-btn-${i}`} label={open === i ? 'Ocultar' : 'Ver'} onPress={() => update($, shown, v => (v === i ? null : i))} />
                </Box>
                {open === i && <Code source={unifiedDiff(c.file, c.before, c.after)} format="diff" path={c.file} />}
              </Box>
            ))}
            {list.length > 0 && (
              <Box marginTop={1}>
                <Button key="chg-clear" plain label="Limpiar lista" onPress={() => update($, changes, () => [])} />
              </Box>
            )}
          </Section>
          <Text dimColor>Para deshacer: pídeme "deshaz el último cambio de X", o usa /rewind para volver a un punto anterior de la conversación.</Text>
        </Box>
      )
    } else if (current === 'ahorro') {
      const hist = await read($, history)
      const total = (await $.state.get(meterTotal)).value
      const read_ = total ? total.input + total.cacheRead + total.cacheWrite : 0
      const last = hist.at(-1)
      const base = hist.length > 0 ? Math.min(...hist.map(p => p.fresh + p.cached)) : 0
      body = (
        <Box flexDirection="column">
          <Section title="ESTA SESIÓN">
            <Text>
              <Text color="success" bold>
                ~{short(savedSession)}
              </Text>{' '}
              tokens que no se gastaron
            </Text>
            <Text dimColor>
              rtk {short(rtkSession)} · recortes {short(Math.round(trim.savedChars / 4))}
            </Text>
            {total !== undefined && (
              <Text dimColor>
                {total.turns} respuestas · {short(read_)} leídos ({percent(total.cacheRead, read_)}% de caché) · {short(total.output)} escritos
              </Text>
            )}
          </Section>

          <Section title="GASTO POR RESPUESTA">
            {hist.length === 0 && <Text dimColor>Aparece después de tu primera respuesta.</Text>}
            {hist.length > 0 && Svg !== undefined && (
              <Box flexDirection="column">
                <Svg source={chartSvg(hist, Math.min(420, width * 7))} alt={`Tokens de las últimas ${Math.min(12, hist.length)} respuestas`} />
                <Text>
                  <Text color={CHART_COLORS.cached}>■ caché (barato)</Text> <Text color={CHART_COLORS.fresh}>■ nuevo (caro)</Text>{' '}
                  <Text color={CHART_COLORS.written}>■ escrito</Text>
                </Text>
              </Box>
            )}
            {hist.length > 0 &&
              Svg === undefined &&
              hist.slice(-8).map(p => (
                <Text wrap="truncate-end">
                  <Text dimColor>{clock(p.at)}</Text> {bar(p.fresh + p.cached, Math.max(...hist.map(q => q.fresh + q.cached)), 16)} {short(p.fresh + p.cached)}
                </Text>
              ))}
          </Section>

          {last !== undefined && (
            <Section title="QUÉ SIGNIFICA">
              <Text dimColor>
                Cada respuesta relee la conversación. Lo que sale de la caché cuesta ~10 veces menos que lo nuevo.
              </Text>
              <Text dimColor>
                Contexto base: ~{short(base)} tokens por petición (instrucciones, herramientas y plugins).
              </Text>
              {percent(last.cached, last.cached + last.fresh) < 50 && (
                <Text color="warning">
                  La última respuesta usó poca caché: pasa al cambiar de modelo o tras una pausa larga.
                </Text>
              )}
              <Text dimColor>Consejo: si cambias de tema, escribe /clear; si la charla es larga, /compact.</Text>
            </Section>
          )}
        </Box>
      )
    } else if (current === 'modelo') {
      const tope = (await $.state.get(selTope)).value ?? 9
      const hist = ((await $.state.get(selHistorial)).value ?? []).slice(-6).reverse()
      const uso = (await $.state.get(selUso)).value
      const clas = (await $.state.get(selClasificador)).value
      const ultima = hist[0]
      const calls = uso ? uso.haiku.llamadas + uso.sonnet.llamadas + uso.opus.llamadas : 0
      body = !hasSelector ? (
        <Section title="SELECTOR DE MODELO">
          <Text dimColor>No está instalado. Corre el instalador para tenerlo.</Text>
        </Section>
      ) : (
        <Box flexDirection="column">
          <Section title={`NIVEL ${nivel} DE 9 · ${s.name.toUpperCase()}`}>
            <Text>
              <Text color={familyColor(s.model)} bold>
                {s.model}
              </Text>{' '}
              · esfuerzo {s.effort} · {modo === 'auto' ? 'automático' : 'fijado a mano'}
              {tope < 9 ? ` · tope ${tope}` : ''}
            </Text>
            <Box flexDirection="row" columnGap={0} flexWrap="wrap" marginTop={1}>
              {LADDER.map(r => (
                <Button
                  key={`lvl-${r.n}`}
                  label={` ${r.n} `}
                  variant={r.n === nivel ? 'primary' : 'secondary'}
                  onPress={() => $.command.run({ command: 'nivel', args: String(r.n) })}
                />
              ))}
            </Box>
            <Text dimColor>1-2 Haiku (barato) · 3-5 Sonnet · 6-9 Opus (el mejor)</Text>
            <Box flexDirection="row" columnGap={1} flexWrap="wrap" marginTop={1}>
              <Button key="sel-auto" label="Automático" variant={modo === 'auto' ? 'primary' : 'secondary'} onPress={() => $.command.run({ command: 'nivel', args: 'auto' })} />
              <Button key="sel-tope-down" label="Tope −" onPress={() => $.command.run({ command: 'nivel', args: `tope ${Math.max(1, tope - 1)}` })} />
              <Button key="sel-tope-up" label="Tope +" onPress={() => $.command.run({ command: 'nivel', args: `tope ${Math.min(9, tope + 1)}` })} />
            </Box>
            <Text dimColor>Tocar un número lo fija a mano; "Automático" deja que elija solo. El tope es el nivel máximo que puede usar.</Text>
            {budget?.topeMax != null && (
              <Text color="warning">💰 Presupuesto: tu límite semanal va por {Math.round(budget.semana ?? 0)}%, así que el modelo no pasa del nivel {budget.topeMax} por ahora.</Text>
            )}
          </Section>

          {ultima !== undefined && (
            <Section title="ÚLTIMA DECISIÓN">
              <Text wrap="truncate-end">"{ultima.texto}"</Text>
              <Text dimColor>Por qué: {ultima.motivo || 'sin motivo'}</Text>
              {ultima.puntos && (
                <Text dimColor wrap="truncate-end">
                  trabajo {bar(ultima.puntos.alcance, 3, 3)} pensar {bar(ultima.puntos.razonamiento, 3, 3)} riesgo {bar(ultima.puntos.riesgo, 3, 3)} acabado{' '}
                  {bar(ultima.puntos.calidad, 3, 3)}
                </Text>
              )}
            </Section>
          )}

          {uso !== undefined && calls > 0 && (
            <Section title="REPARTO DE ESTA SESIÓN">
              {(['haiku', 'sonnet', 'opus'] as const).map(f => (
                <Text>
                  <Text color={familyColor(f === 'haiku' ? 'Haiku' : f === 'sonnet' ? 'Sonnet' : 'Opus')}>
                    {(f === 'haiku' ? 'Haiku ' : f === 'sonnet' ? 'Sonnet' : 'Opus  ') + ' ' + bar(uso[f].llamadas, calls, 12)}
                  </Text>{' '}
                  <Text dimColor>
                    {uso[f].llamadas} · {short(uso[f].entrada + uso[f].salida)} tokens
                  </Text>
                </Text>
              ))}
              {clas !== undefined && <Text dimColor>Decidir costó {short(clas.tokens)} tokens en {clas.consultas} consultas.</Text>}
            </Section>
          )}

          {hist.length > 0 && (
            <Section title="ÚLTIMOS PEDIDOS">
              {hist.map(d => (
                <Text wrap="truncate-end">
                  <Text color={familyColor(step(d.final).model)}>
                    {d.final} {step(d.final).model.padEnd(6)}
                  </Text>{' '}
                  {d.texto}
                  {d.final > d.nivel ? ' ↑' : ''}
                </Text>
              ))}
            </Section>
          )}
        </Box>
      )
    } else if (current === 'web') {
      const informeW = (await $.state.get(webInforme)).value
      const serviciosW = (await $.state.get(webServicios)).value ?? []
      const recientes = (await $.state.get(webUrls)).value ?? []
      const ocupadoW = (await $.state.get(webOcupado)).value
      const escrita = await read($, webUrl)
      const autoWeb = (await $.state.get(webAuto)).value ?? true
      const hayWeb = x.plugins.includes('web') || informeW !== undefined || serviciosW.length > 0
      const colorNota = (n: number) => (n >= 85 ? 'success' : n >= 60 ? 'warning' : 'error')
      const TONO = { ok: '✓', warn: '△', bad: '✕' } as const
      const COLOR_TONO = { ok: 'success', warn: 'warning', bad: 'error' } as const
      body = !hayWeb ? (
        <Section title="WEB">
          <Text dimColor>El mod "web" no está instalado. Corre el instalador para tenerlo.</Text>
        </Section>
      ) : (
        <Box flexDirection="column">
          <Section title="REVISAR UNA PÁGINA">
            <Text dimColor>Escribe la dirección de un sitio (el de tu cliente, el que acabas de publicar) y te digo qué falta.</Text>
            {Input !== undefined && (
              <Input
                key="web-url"
                label="Dirección "
                placeholder="mi-sitio.netlify.app"
                value={escrita !== '' ? escrita : (recientes[0] ?? '')}
                submitLabel="revisar"
                onInput={(v: string) => update($, webUrl, () => v)}
                onSubmit={(v: string) => $.command.run({ command: 'sitio', args: v })}
              />
            )}
            <Box flexDirection="row" columnGap={1} flexWrap="wrap" marginTop={1}>
              <Button key="web-go" variant="primary" label={ocupadoW ? 'Revisando…' : 'Revisar'} onPress={() => $.command.run({ command: 'sitio', args: escrita !== '' ? escrita : (recientes[0] ?? '') })} />
              {recientes.slice(0, 3).map((u, i) => (
                <Button key={`web-recent-${i}`} label={u.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 28)} onPress={() => $.command.run({ command: 'sitio', args: u })} />
              ))}
            </Box>
            {ocupadoW && <Text color="suggestion">Revisando {ocupadoW} (puede tardar unos segundos)…</Text>}
          </Section>

          {informeW && (
            <Section title={`RESULTADO  ${informeW.isAuto ? '(al publicar) ' : ''}${informeW.url.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 40)}`}>
              {informeW.status > 0 && informeW.status < 400 && (
                <Text>
                  <Text color={colorNota(informeW.puntos)} bold>
                    {informeW.puntos}/100
                  </Text>{' '}
                  <Text color={colorNota(informeW.puntos)}>{bar(informeW.puntos, 100, 20)}</Text>
                </Text>
              )}
              <Text dimColor>
                {informeW.status > 0 ? `responde ${informeW.status}` : 'sin respuesta'} · {informeW.ms} ms · {informeW.kb} KB · {clock(informeW.at)}
                {informeW.enlaces ? ` · ${informeW.enlaces.revisados} enlaces probados, ${informeW.enlaces.rotos.length} rotos` : ''}
              </Text>
              {informeW.hallazgos.map((hz, i) => (
                <Box key={`hall-${i}`} flexDirection="column" marginTop={hz.tono === 'ok' ? 0 : 1}>
                  <Text color={COLOR_TONO[hz.tono]} wrap="wrap">
                    {TONO[hz.tono]} <Text bold>{hz.titulo}</Text>
                  </Text>
                  {hz.tono !== 'ok' && <Text dimColor wrap="wrap">  {hz.detalle}</Text>}
                </Box>
              ))}
              {informeW.hallazgos.some(x2 => x2.tono !== 'ok') && (
                <Box marginTop={1}>
                  <Button
                    key="web-fix"
                    label="Pedirle a Claude que lo arregle"
                    onPress={() =>
                      offer(
                        $,
                        `Revisé ${informeW.url} y saqué ${informeW.puntos}/100. Arregla esto en el código de la página, sin cambiar el diseño:\n${informeW.hallazgos
                          .filter(x2 => x2.tono !== 'ok')
                          .map(x2 => `- ${x2.titulo}: ${x2.detalle}`)
                          .join('\n')}`,
                      )
                    }
                  />
                </Box>
              )}
            </Section>
          )}

          <Section title="¿ESTÁN CAÍDOS?">
            {serviciosW.length === 0 && <Text dimColor>Consultando…</Text>}
            {serviciosW.map(sv => (
              <Text key={`sv-${sv.id}`} wrap="truncate-end">
                <Text color={sv.estado === 'ok' ? 'success' : sv.estado === 'leve' ? 'warning' : sv.estado === 'grave' ? 'error' : 'inactive'}>{sv.estado === 'ok' ? '●' : sv.estado === 'desconocido' ? '○' : '▲'}</Text>{' '}
                <Text bold>{sv.nombre}</Text> <Text dimColor>{sv.detalle}</Text>
              </Text>
            ))}
            <Box flexDirection="row" columnGap={1} marginTop={1}>
              <Button key="web-refresh" label="Actualizar" onPress={() => $.command.run({ command: 'sitio', args: 'servicios' })} />
              <Button
                key="web-auto"
                label={autoWeb ? 'Revisar al publicar: sí' : 'Revisar al publicar: no'}
                onPress={() => $.command.run({ command: 'sitio', args: `auto ${autoWeb ? 'off' : 'on'}` })}
              />
            </Box>
            <Text dimColor>Si algo falla y aquí sale ▲, el problema no es tuyo: espera a que lo arreglen.</Text>
          </Section>
        </Box>
      )
    } else if (current === 'mods') {
      const blocks = (await $.state.get(guardianBlocks)).value ?? []
      const coach = (await $.state.get(coachStats)).value ?? { codeTurns: 0, verifiedTurns: 0, lastWarning: null }
      const rows: { key: string; on: boolean; name: string; what: string; stat?: string; action?: { label: string; press: () => unknown } }[] = [
        {
          key: 'guardian',
          on: guardianOn,
          name: 'Guardián',
          what: 'Bloquea borrados masivos, push forzados y lectura de contraseñas.',
          stat: `${blocks.length} bloqueos${blocks.at(-1) ? ` · último: ${blocks.at(-1)?.why}` : ''}`,
          action: { label: paused ? 'Reactivar' : 'Pausar', press: () => $.command.run({ command: 'guardian', args: paused ? 'on' : 'off' }) },
        },
        {
          key: 'rtk',
          on: x.rtk !== null,
          name: 'rtk',
          what: 'git, ls, grep y tests me devuelven solo lo importante.',
          stat: x.rtk !== null ? `${x.rtk.commands} comandos · ~${short(x.rtk.saved)} tokens (${x.rtk.percent}%) en total` : 'no instalado: corre el instalador (instala rtk y jq)',
        },
        {
          key: 'trim',
          on: (await $.state.get(trimActive)).value ?? false,
          name: 'Recorte de salidas',
          what: 'Si una salida es enorme, me pasa solo el inicio y el final.',
          stat: `${trim.trims} recortes`,
        },
        {
          key: 'coach',
          on: (await $.state.get(coachActive)).value ?? false,
          name: 'Control de calidad',
          what: 'Me recuerda probar el código antes de decir "listo".',
          stat: `${coach.verifiedTurns}/${coach.codeTurns} cambios verificados`,
        },
        {
          key: 'meter',
          on: (await $.state.get(meterActive)).value ?? false,
          name: 'Medidor de tokens',
          what: 'La barra sobre el cuadro de mensaje con el gasto de cada respuesta.',
          action: { label: 'Reiniciar', press: () => $.command.run({ command: 'tokens', args: 'reset' }) },
        },
        {
          key: 'memoria',
          on: x.plugins.includes('memoria') && ((await $.state.get(memoriaAuto)).value ?? true),
          name: 'Memoria del proyecto',
          what: 'Apunta solo lo importante de cada proyecto (cómo probarlo, publicarlo, decisiones) y lo recuerda en la próxima charla.',
          stat: !x.plugins.includes('memoria')
            ? 'no instalado'
            : `${(await $.state.get(memoriaNotas)).value ?? 0} notas${((await $.state.get(memoriaCuando)).value ?? 0) > 0 ? ` · actualizada ${hace((await $.state.get(memoriaCuando)).value ?? now, now)}` : ''}`,
          action: x.plugins.includes('memoria') ? { label: 'Actualizar ahora', press: () => $.command.run({ command: 'memoria', args: 'actualizar' }) } : undefined,
        },
        {
          key: 'web',
          on: x.plugins.includes('web'),
          name: 'Web',
          what: 'Revisa páginas, avisa si GitHub/Netlify/Supabase están caídos y revisa solo tu sitio al publicarlo.',
          stat: !x.plugins.includes('web') ? 'no instalado' : (await $.state.get(webInforme)).value ? `última revisión: ${(await $.state.get(webInforme)).value?.puntos}/100` : 'aún no revisaste ninguna página',
          action: x.plugins.includes('web') ? { label: 'Abrir', press: () => update($, tab, () => 'web' as const) } : undefined,
        },
        {
          key: 'respaldo',
          on: x.plugins.includes('respaldo') && ((await $.state.get(respaldoAuto)).value ?? true),
          name: 'Respaldo',
          what: 'Antes de cada pedido guardo un punto de restauración, para poder deshacer sin miedo.',
          stat: !x.plugins.includes('respaldo') ? 'no instalado' : `${((await $.state.get(respaldoPuntos)).value ?? []).length} puntos guardados`,
          action: x.plugins.includes('respaldo') ? { label: 'Ver y deshacer', press: () => update($, tab, () => 'cambios' as const) } : undefined,
        },
        {
          key: 'presupuesto',
          on: x.plugins.includes('presupuesto') && ((await $.state.get(presupuestoAuto)).value ?? true),
          name: 'Presupuesto',
          what: 'Si tu límite semanal se llena, baja el modelo y pide respuestas más económicas.',
          stat:
            budget === undefined
              ? x.plugins.includes('presupuesto') ? undefined : 'no instalado'
              : `${budget.nivel === 'normal' ? 'normal' : budget.nivel === 'ahorro' ? 'modo ahorro' : 'ahorro máximo'}${budget.semana !== null ? ` · semana ${Math.round(budget.semana)}%` : ''}`,
          action: x.plugins.includes('presupuesto')
            ? (await $.state.get(presupuestoAuto)).value === false
              ? { label: 'Activar', press: () => $.command.run({ command: 'presupuesto', args: 'on' }) }
              : { label: 'Apagar', press: () => $.command.run({ command: 'presupuesto', args: 'off' }) }
            : undefined,
        },
        {
          key: 'traspaso',
          on: x.plugins.includes('traspaso') && ((await $.state.get(traspasoAuto)).value ?? true),
          name: 'Traspaso',
          what: 'Guarda solo el progreso cuando la charla se llena, para seguir en una limpia sin perder nada.',
          stat: !x.plugins.includes('traspaso')
            ? 'no instalado'
            : (await $.state.get(traspasoNota)).value
              ? `nota guardada ${hace((await $.state.get(traspasoNota)).value?.at ?? now, now)}`
              : 'aún no hay nota guardada',
          action: x.plugins.includes('traspaso') ? { label: 'Guardar ahora', press: () => $.command.run({ command: 'guardar' }) } : undefined,
        },
        {
          key: 'mejorar',
          on: x.plugins.includes('mejorar-prompt') && ((await $.state.get(mejorarAuto)).value ?? true),
          name: 'Mejorar pedido',
          what: 'Si escribes algo corto y vago, Claude pregunta lo que falta antes de construir. Tu texto no cambia.',
          stat: !x.plugins.includes('mejorar-prompt') ? 'no instalado' : `${(await $.state.get(mejorarAvisados)).value ?? 0} pedidos vagos atendidos`,
          action: x.plugins.includes('mejorar-prompt')
            ? { label: 'Mejorar mi borrador', press: () => $.command.run({ command: 'mejorar' }) }
            : undefined,
        },
        ...EXTRAS.map(t => ({
          key: t.plugin,
          on: x.plugins.includes(t.plugin),
          name: t.title,
          what: t.what,
          stat: x.plugins.includes(t.plugin) ? undefined : t.plugin === 'token-optimizer' ? 'no instalado: necesita Python 3' : 'no instalado',
          action: x.plugins.includes(t.plugin) ? { label: t.action.label, press: () => offer($, t.action.fill) } : undefined,
        })),
      ]
      const active = rows.filter(r => r.on).length
      const checks = await read($, health)
      body = (
        <Box flexDirection="column">
          <Section title="¿FUNCIONA TODO?">
            {checks === null && <Text dimColor>Pulsa el botón y reviso lo que los mods necesitan en esta máquina.</Text>}
            {checks?.map(c => (
              <Text wrap="wrap">
                <Text color={c.isOk ? 'success' : 'error'}>{c.isOk ? '✓' : '✕'}</Text> <Text bold>{c.name}</Text> <Text dimColor>{c.isOk ? c.detail : c.why}</Text>
              </Text>
            ))}
            <Box marginTop={1}>
              <Button key="health" label={checks === null ? 'Revisar instalación' : 'Revisar otra vez'} onPress={() => checkHealth($)} />
            </Box>
          </Section>
          <Section title={`MODS  ${active}/${rows.length} activos`}>
            {rows.map(r => (
              <Box key={`row-${r.key}`} flexDirection="column" marginTop={1}>
                <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
                  <Text bold>
                    <Text color={r.on ? 'success' : 'inactive'}>{r.on ? '●' : '○'}</Text> {r.name}
                  </Text>
                  {r.action !== undefined && <Button key={`act-${r.key}`} label={r.action.label} onPress={r.action.press} />}
                </Box>
                <Text dimColor>{r.what}</Text>
                {r.stat !== undefined && <Text color={r.on ? undefined : 'warning'}>{r.stat}</Text>}
              </Box>
            ))}
          </Section>
        </Box>
      )
    } else {
      body = (
        <Box flexDirection="column">
          <Section title="COMANDOS">
            <Text>/mods · este panel</Text>
            <Text>/nivel 1-9 · auto · tope N · el modelo</Text>
            <Text>/guardian off · on · protecciones</Text>
            <Text>/presupuesto · on · off · cuidar el límite</Text>
            <Text>/guardar · /retomar · seguir en una charla limpia</Text>
            <Text>/mejorar &lt;pedido&gt; · pedidos claros</Text>
            <Text>/respaldo · puntos de restauración (el botón Deshacer está en Cambios)</Text>
            <Text>/sitio &lt;dirección&gt; · revisar una página (todo está en la pestaña Web)</Text>
            <Text>/memoria · lo que Claude recuerda del proyecto · borrar</Text>
            <Text>/tokens · gasto de la sesión</Text>
            <Text>/caveman · stop caveman · respuestas cortas</Text>
            <Text>/ponytail off · soluciones mínimas</Text>
            <Text>/token-optimizer · informe de contexto</Text>
          </Section>
          <Section title="PALABRAS">
            <Text>
              <Text bold>Token:</Text> <Text dimColor>unos ¾ de palabra. Se paga lo que leo y lo que escribo.</Text>
            </Text>
            <Text>
              <Text bold>Caché:</Text> <Text dimColor>lo que ya leí hace poco; releerlo cuesta ~10 veces menos.</Text>
            </Text>
            <Text>
              <Text bold>Contexto:</Text> <Text dimColor>todo lo que tengo presente: la charla, archivos y resultados.</Text>
            </Text>
            <Text>
              <Text bold>Nivel:</Text> <Text dimColor>qué tan potente es el modelo; más alto, mejor y más caro.</Text>
            </Text>
          </Section>
          <Section title="TRUCOS">
            <Text dimColor>• Un tema por conversación; para otro, /clear.</Text>
            <Text dimColor>• Para algo delicado (un cliente), sube el nivel o apaga caveman y ponytail.</Text>
            <Text dimColor>• Pide "haz un plan primero" y verás los pasos en la pestaña Ahora.</Text>
            <Text dimColor>• Charla muy larga: /guardar, luego /clear y /retomar. Sigues igual y gastas mucho menos.</Text>
            <Text dimColor>• Pedido vago: /mejorar antes de enviarlo te ahorra idas y vueltas.</Text>
          </Section>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingX={1}>
        {header}
        {body as never}
      </Box>
    )
  })
}
