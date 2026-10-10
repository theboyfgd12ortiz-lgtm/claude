import { atom, read, update } from 'claude-code'
import type { ElementConstructor, EngineInterface, Register, SvgProps } from 'claude-code'

import type { FeedItem, Live, PanelExtras, RtkInfo, Tab, Tone } from '../types'
import {
  bar,
  CHART_COLORS,
  chartSvg,
  clock,
  describeTool,
  duration,
  familyColor,
  LADDER,
  parseRtk,
  percent,
  planAdd,
  planFromTodos,
  planUpdate,
  pushFeed,
  pushHistory,
  short,
  step,
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

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'ahora', label: 'Ahora' },
  { id: 'ahorro', label: 'Ahorro' },
  { id: 'modelo', label: 'Modelo' },
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

  // ── A turn begins: what was asked and which model the selector chose ──
  on('turn.start', async ($, e, next) => {
    const at = await $.clock.now()
    const asked = e.text.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '').trim()
    await update($, live, () => ({ isWorking: true, startedAt: at, prompt: asked.slice(0, 120), tools: 0, running: null }))
    if (asked !== '') await note($, '💬', `Pediste: ${asked.replace(/\s+/g, ' ').slice(0, 70)}`)

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
    const { Box, Button, Text } = $.ui.resolve(e)
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
    const header = (
      <Box flexDirection="column">
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
      body = (
        <Box flexDirection="column">
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
      body = (
        <Box flexDirection="column">
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
