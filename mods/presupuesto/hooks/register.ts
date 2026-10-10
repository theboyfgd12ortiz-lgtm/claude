import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Estado } from '../types'
import { ETIQUETA, INSTRUCCIONES, nivelDe, TOPE } from './reglas'

const INICIAL: Estado = { nivel: 'normal', semana: null, cincoHoras: null, renuevaSemana: null, topeMax: null }
const estado = atom({ plugin: 'presupuesto', key: 'estado' } as const, INICIAL)
const isAuto = atom({ plugin: 'presupuesto', key: 'isAuto' } as const, true)

/** Lee los límites del plan y publica el nivel y el tope máximo; el selector de modelo lo lee solo. */
const revisar = async ($: EngineInterface) => {
  const uso = await $.session.usage().catch(() => null)
  if (uso === null) return
  const semana = uso.rateLimits.find(r => r.kind === 'seven_day')
  const cinco = uso.rateLimits.find(r => r.kind === 'five_hour')
  const antes = await read($, estado)
  const activo = await read($, isAuto)
  const nivel = activo ? nivelDe(semana?.percentUsed ?? null, cinco?.percentUsed ?? null) : 'normal'

  if (nivel !== antes.nivel && (nivel !== 'normal' || antes.semana !== null)) {
    $.ui.toast(
      nivel === 'normal'
        ? 'Presupuesto: tu límite se renovó, vuelvo al modo normal.'
        : `Presupuesto: ${ETIQUETA[nivel]} (semana ${Math.round(semana?.percentUsed ?? 0)}%). Modelo limitado al nivel ${TOPE[nivel]}.`,
    )
  }

  await update($, estado, () => ({
    nivel,
    semana: semana?.percentUsed ?? null,
    cincoHoras: cinco?.percentUsed ?? null,
    renuevaSemana: semana?.resetsAt ?? null,
    topeMax: TOPE[nivel],
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'presupuesto',
      description: 'Cuida tu límite de uso: /presupuesto (estado) · on · off',
      argumentHint: 'on | off',
    })
    // Apagado con /presupuesto off (o con el botón del panel) sigue apagado en las sesiones siguientes.
    if ((await $.store.get('isAuto').catch(() => undefined)) === false) await update($, isAuto, () => false)
    void revisar($)

    return next(e)
  })

  on('command.run', { command: 'presupuesto' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off' || arg === 'on') {
      await update($, isAuto, () => arg === 'on')
      await $.store.set('isAuto', arg === 'on').catch(() => undefined)
    }
    await revisar($)
    const x = await read($, estado)
    const pct = (n: number | null) => (n === null ? 'sin dato' : `${Math.round(n)}%`)

    return {
      text: `Presupuesto ${(await read($, isAuto)) ? 'activo' : 'apagado'} · ${ETIQUETA[x.nivel]} · semana ${pct(x.semana)} · 5 horas ${pct(x.cincoHoras)}`,
    }
  })

  // Después de cada respuesta los límites cambian: se vuelven a mirar.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) void revisar($)

    return done
  }).catch(($, e, next) => next(e))

  // En ahorro, una instrucción corta al final del prompt de sistema (después del corte de caché).
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (e.traits.includes('bare') || e.traits.includes('analysis')) return composed
    const texto = INSTRUCCIONES[(await read($, estado)).nivel]
    if (texto === null || !(await read($, isAuto))) return composed

    return { sections: [...composed.sections, { id: 'presupuesto:ahorro', text: texto, scope: 'session' }] }
  }).catch(($, e, next) => next(e))
}
