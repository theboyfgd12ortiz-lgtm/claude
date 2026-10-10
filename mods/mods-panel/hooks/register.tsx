import { atom, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PanelExtras, RtkInfo } from '../types'

const PANE = 'mods-panel'
const TITLE = 'Mis mods'

// What each mod publishes ($.state: any plugin reads, only the owner writes).
const guardianActive = { plugin: 'guardian', key: 'isActive' } as const
const guardianPaused = { plugin: 'guardian', key: 'isPaused' } as const
const guardianBlocks = { plugin: 'guardian', key: 'blocks' } as const
const trimActive = { plugin: 'output-trim', key: 'isActive' } as const
const trimStats = { plugin: 'output-trim', key: 'stats' } as const
const coachActive = { plugin: 'quality-coach', key: 'isActive' } as const
const coachStats = { plugin: 'quality-coach', key: 'stats' } as const
const meterActive = { plugin: 'token-meter', key: 'isActive' } as const
const meterLast = { plugin: 'token-meter', key: 'last' } as const
const meterTotal = { plugin: 'token-meter', key: 'total' } as const
const selectorNivel = { plugin: 'selector-modelo', key: 'nivel' } as const
const selectorModo = { plugin: 'selector-modelo', key: 'modo' } as const
const selectorHistorial = { plugin: 'selector-modelo', key: 'historial' } as const

const extrasRef = { plugin: 'mods-panel', key: 'extras' } as const
const extras = atom(extrasRef, { rtk: null, hasCaveman: false })

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

/** Reads rtk's savings; null when rtk is not installed. */
const readRtk = async ($: EngineInterface): Promise<RtkInfo | null> => {
  try {
    const run = (args: string) =>
      $.process.run(['sh', '-c', `PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH" rtk ${args}`], { timeoutMs: 5000 })
    const v = await run('--version')
    if (v.exitCode !== 0) return null
    const g = await run('gain -f json')

    return parseRtk(v.stdout, g.exitCode === 0 ? g.stdout : '')
  } catch {
    return null
  }
}

/** Looks again at the programmes the panel reports on (rtk) and the commands present (caveman). */
const refresh = async ($: EngineInterface) => {
  const rtk = await readRtk($)
  const names = await $.command.list().then(list => list.map(c => c.name), () => [] as string[])
  const hasCaveman = names.some(n => n === 'caveman' || n.startsWith('caveman:') || n.includes(':caveman'))
  await update($, extras, () => ({ rtk, hasCaveman }) satisfies PanelExtras)
}

/** The selector's ladder in short: 1-2 Haiku, 3-5 Sonnet, 6-9 Opus. */
export const modeloDe = (n: number): string => (n <= 2 ? 'Haiku (barato)' : n <= 5 ? 'Sonnet (equilibrado)' : 'Opus (el más potente)')

/** 1234 -> "1.2k". */
export const short = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n)

export const percent = (part: number, all: number): number => (all === 0 ? 0 : Math.round((part / all) * 100))

/** Everything the panel shows, read in one go. */
export const snapshot = async ($: EngineInterface) => {
  const get = async <T,>(p: Promise<{ value?: T; version: number }>) => {
    const r = await p

    return { value: r.value, isLoaded: r.version > 0 }
  }

  return {
    guardian: {
      ...(await get($.state.get(guardianActive))),
      isPaused: (await $.state.get(guardianPaused)).value ?? false,
      blocks: (await $.state.get(guardianBlocks)).value ?? [],
    },
    trim: { ...(await get($.state.get(trimActive))), stats: (await $.state.get(trimStats)).value },
    coach: { ...(await get($.state.get(coachActive))), stats: (await $.state.get(coachStats)).value },
    selector: {
      nivel: (await $.state.get(selectorNivel)).value ?? 4,
      modo: (await $.state.get(selectorModo)).value ?? 'auto',
      ultima: ((await $.state.get(selectorHistorial)).value ?? []).at(-1),
    },
    // Which mods with a slash command are installed; an empty set if the listing fails.
    extras: (await $.state.get(extrasRef)).value ?? { rtk: null, hasCaveman: false },
    commands: new Set(await $.command.list().then(list => list.map(c => c.name), () => [] as string[])),
    meter: {
      ...(await get($.state.get(meterActive))),
      last: (await $.state.get(meterLast)).value ?? null,
      total: (await $.state.get(meterTotal)).value,
    },
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mods', description: 'Abre el panel "Mis mods": qué hace cada mod y su estado' })
    // Unasked, a pane only shows where the terminal is wide enough to dock it.
    void $.ui.open({ id: PANE, title: TITLE })
    void refresh($)

    return next(e)
  })

  // rtk's counters move as commands run; look again when a turn ends.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) void refresh($)

    return done
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'mods' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE })

    return { text: opened.isPlaced ? 'Panel "Mis mods" abierto.' : 'El panel está listo; agranda la ventana para verlo.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const s = await snapshot($)

    const Head = (p: { name: string; isOn: boolean; label?: string }) => (
      <Text bold>
        <Text color={p.isOn ? 'green' : 'gray'}>{p.isOn ? '●' : '○'}</Text> {p.name}{' '}
        <Text dimColor>{p.label ?? (p.isOn ? 'activo' : 'no instalado')}</Text>
      </Text>
    )

    const g = s.guardian
    const sel = s.selector
    const hasSelector = s.commands.has('nivel')
    const lastBlock = g.blocks[g.blocks.length - 1]
    const trim = s.trim.stats ?? { trims: 0, savedChars: 0 }
    const coach = s.coach.stats ?? { codeTurns: 0, verifiedTurns: 0, lastWarning: null }
    const total = s.meter.total ?? { turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, tools: 0 }
    const totalIn = total.input + total.cacheRead + total.cacheWrite
    const last = s.meter.last

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Head name="Guardián" isOn={g.isLoaded && !g.isPaused} label={g.isLoaded ? (g.isPaused ? 'EN PAUSA' : 'activo') : undefined} />
          <Text dimColor>Evita desastres: no deja borrar todo el disco, forzar un push ni leer tus contraseñas (.env).</Text>
          {g.isLoaded && (
            <Text>
              Bloqueos en esta sesión: {g.blocks.length}
              {lastBlock !== undefined && <Text dimColor> · último: {lastBlock.why}</Text>}
            </Text>
          )}
          {g.isLoaded && (
            <Button
              key="guardian-toggle"
              label={g.isPaused ? 'Reactivar guardián' : 'Pausar guardián'}
              onPress={() => $.command.run({ command: 'guardian', args: g.isPaused ? 'on' : 'off' })}
            />
          )}
        </Box>

        <Box flexDirection="column">
          <Head name="Recorte de salidas" isOn={s.trim.isLoaded} />
          <Text dimColor>Si un comando imprime muchísimo texto, me pasa solo el principio y el final. Ahorra tokens.</Text>
          {s.trim.isLoaded && (
            <Text>
              Recortes: {trim.trims} · ahorro aprox.: {short(Math.round(trim.savedChars / 4))} tokens
            </Text>
          )}
        </Box>

        <Box flexDirection="column">
          <Head name="Control de calidad" isOn={s.coach.isLoaded} />
          <Text dimColor>Me recuerda probar el código (tests, lint, build) antes de decirte "listo".</Text>
          {s.coach.isLoaded && (
            <Text>
              Turnos con cambios de código: {coach.codeTurns} · verificados: {coach.verifiedTurns} (
              {percent(coach.verifiedTurns, coach.codeTurns)}%)
            </Text>
          )}
          {coach.lastWarning !== null && <Text color="yellow">Último aviso: {coach.lastWarning}</Text>}
        </Box>

        <Box flexDirection="column">
          <Head name="Medidor de tokens" isOn={s.meter.isLoaded} />
          <Text dimColor>Cuenta cuánto gasta cada respuesta. La caché es texto reutilizado: cuanto más alto el %, más barato.</Text>
          {s.meter.isLoaded && (
            <Text>
              Sesión: {total.turns} respuestas · {short(totalIn)} leídos ({percent(total.cacheRead, totalIn)}% caché) ·{' '}
              {short(total.output)} escritos
            </Text>
          )}
          {last !== null && (
            <Text dimColor>
              Última respuesta: {short(last.input + last.cacheRead + last.cacheWrite)} leídos · {short(last.output)} escritos ·{' '}
              {last.seconds}s · modelo {last.model}
            </Text>
          )}
        </Box>

        <Box flexDirection="column">
          <Head name="rtk (comandos más cortos)" isOn={s.extras.rtk !== null} label={s.extras.rtk === null ? 'no instalado' : `versión ${s.extras.rtk.version}`} />
          <Text dimColor>Cuando corro git, ls, grep o tests, rtk me entrega solo lo importante en vez de todo el texto.</Text>
          {s.extras.rtk !== null && (
            <Text>
              Comandos acortados: {s.extras.rtk.commands} · ahorro aprox.: {short(s.extras.rtk.saved)} tokens ({s.extras.rtk.percent}%)
            </Text>
          )}
        </Box>

        <Box flexDirection="column">
          <Head name="Caveman (respuestas cortas)" isOn={s.extras.hasCaveman} />
          <Text dimColor>Respondo sin relleno: solo lo necesario y el código exacto. Para apagarlo di "stop caveman".</Text>
        </Box>

        <Box flexDirection="column">
          <Head name="Selector de modelos" isOn={hasSelector} label={hasSelector ? (sel.modo === 'auto' ? 'automático' : 'fijo a mano') : undefined} />
          <Text dimColor>Elige solo qué tan potente (y caro) es el modelo para cada pedido: 1 = barato y rápido, 9 = máximo.</Text>
          {hasSelector && (
            <Text>
              Ahora: nivel {sel.nivel} de 9 · {modeloDe(sel.nivel)}
            </Text>
          )}
          {hasSelector && sel.ultima !== undefined && (
            <Text dimColor>
              Último pedido → nivel {sel.ultima.final}
              {sel.ultima.motivo ? ` · por qué: ${sel.ultima.motivo}` : ''}
            </Text>
          )}
          {hasSelector && (
            <Box flexDirection="row" columnGap={1} flexWrap="wrap">
              <Button key="sel-auto" label="Automático" variant={sel.modo === 'auto' ? 'primary' : 'secondary'} onPress={() => $.command.run({ command: 'nivel', args: 'auto' })} />
              <Button key="sel-down" label="Más barato" onPress={() => $.command.run({ command: 'nivel', args: String(Math.max(1, sel.nivel - 1)) })} />
              <Button key="sel-up" label="Más potente" onPress={() => $.command.run({ command: 'nivel', args: String(Math.min(9, sel.nivel + 1)) })} />
              <Button key="sel-open" label="Ver detalle" onPress={() => $.command.run({ command: 'nivel' })} />
            </Box>
          )}
        </Box>

        <Text dimColor>Comandos: /mods este panel · /nivel selector · /guardian off|on · /tokens totales · /caveman</Text>
        <Text dimColor>Token ≈ ¾ de palabra. "Leídos" = lo que reviso para responder; "escritos" = lo que genero.</Text>
      </Box>
    )
  })
}
