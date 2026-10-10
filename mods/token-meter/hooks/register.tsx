import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Totals, TurnStats } from '../types'

const EMPTY: Totals = { turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, tools: 0 }

const last = atom({ plugin: 'token-meter', key: 'last' } as const, null)
const total = atom({ plugin: 'token-meter', key: 'total' } as const, EMPTY)
const isHidden = atom({ plugin: 'token-meter', key: 'isHidden' } as const, false)

/** A turn reading this many input tokens or more earns a toast. */
const HEAVY_TURN = 200_000

/** 1234 -> "1.2k", 1234567 -> "1.23M". */
export const compact = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n)

/** Share of the prompt the cache served, as a whole percent. */
export const cacheShare = (s: { input: number; cacheRead: number; cacheWrite: number }): number => {
  const all = s.input + s.cacheRead + s.cacheWrite

  return all === 0 ? 0 : Math.round((s.cacheRead / all) * 100)
}

export const describeTurn = (t: TurnStats): string =>
  `Último turno: ${compact(t.input + t.cacheRead + t.cacheWrite)} entrada (${cacheShare(t)}% caché) · ` +
  `${compact(t.output)} salida · ${t.seconds}s · ${t.tools} herramientas`

export const describeTotals = (t: Totals): string =>
  `Sesión: ${t.turns} turnos · ${compact(t.input + t.cacheRead + t.cacheWrite)} entrada (${cacheShare(t)}% caché) · ` +
  `${compact(t.output)} salida · ${t.tools} herramientas`

export const register: Register = on => {
  let startedAt = 0
  let tools = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tokens', description: 'Token use of this session: /tokens [show|hide|reset]' })

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    startedAt = await $.clock.now()
    tools = 0

    return next(e)
  })

  on('tool.call', ($, e, next) => {
    tools += 1

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const usage = e.usage
    if (e.agentId !== undefined || usage === undefined) return done

    const turn: TurnStats = {
      input: usage.input_tokens,
      output: usage.output_tokens,
      cacheRead: usage.cache_read_input_tokens,
      cacheWrite: usage.cache_creation_input_tokens,
      seconds: Math.round((startedAt === 0 ? e.durationMs : (await $.clock.now()) - startedAt) / 1000),
      tools,
      model: usage.model,
    }
    await update($, last, () => turn)
    await update($, total, t => ({
      turns: t.turns + 1,
      input: t.input + turn.input,
      output: t.output + turn.output,
      cacheRead: t.cacheRead + turn.cacheRead,
      cacheWrite: t.cacheWrite + turn.cacheWrite,
      tools: t.tools + turn.tools,
    }))

    const read_ = turn.input + turn.cacheRead + turn.cacheWrite
    if (read_ >= HEAVY_TURN) {
      $.ui.toast(`token-meter: turno pesado (${compact(read_)} tokens). Considera /compact o una tarea más acotada.`)
    }

    return done
  })

  on('command.run', { command: 'tokens' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'hide') await update($, isHidden, () => true)
    if (arg === 'show') await update($, isHidden, () => false)
    if (arg === 'reset') {
      await update($, total, () => EMPTY)
      await update($, last, () => null)
    }
    const t = await read($, total)
    const l = await read($, last)

    return { text: [describeTotals(t), l === null ? 'Aún no hay turnos medidos.' : describeTurn(l)].join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const turn = await read($, last)
    if (e.props.hasSurvey || turn === null || (await read($, isHidden))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>{describeTurn(turn)} </Text>
        <Button key="hide" label="Ocultar" plain onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}
