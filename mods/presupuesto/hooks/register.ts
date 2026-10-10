import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Estado } from '../types'
import { ETIQUETA, INSTRUCCIONES, nivelDe, TOPE } from './reglas'

const INICIAL: Estado = { nivel: 'normal', semana: null, cincoHoras: null, renuevaSemana: null, topeAnterior: null }
const estado = atom({ plugin: 'presupuesto', key: 'estado' } as const, INICIAL)
const isAuto = atom({ plugin: 'presupuesto', key: 'isAuto' } as const, true)
const topeSelector = { plugin: 'selector-modelo', key: 'tope' } as const

/** Lee los límites del plan y, si el nivel cambió, ajusta el tope del selector. */
const revisar = async ($: EngineInterface) => {
  const uso = await $.session.usage().catch(() => null)
  if (uso === null) return
  const semana = uso.rateLimits.find(r => r.kind === 'seven_day')
  const cinco = uso.rateLimits.find(r => r.kind === 'five_hour')
  const antes = await read($, estado)
  const nivel = nivelDe(semana?.percentUsed ?? null, cinco?.percentUsed ?? null)
  // El tope que había antes de bajarlo vive en $.store: el del selector también dura entre sesiones.
  const guardado = await $.store.get('topeAnterior').catch(() => undefined)
  let topeAnterior = antes.topeAnterior ?? (typeof guardado === 'number' ? guardado : null)
  const cambio = nivel !== antes.nivel

  if (await read($, isAuto)) {
    const comandos = await $.command.list().catch(() => [])
    const haySelector = comandos.some(c => c.name === 'nivel')
    const objetivo = TOPE[nivel]
    if (haySelector && objetivo !== null && cambio) {
      const actual = (await $.state.get(topeSelector)).value ?? 9
      if (topeAnterior === null) {
        topeAnterior = actual
        await $.store.set('topeAnterior', actual).catch(() => undefined)
      }
      if (objetivo < actual) await $.command.run({ command: 'nivel', args: `tope ${objetivo}` }).catch(() => undefined)
    } else if (haySelector && objetivo === null && topeAnterior !== null) {
      // Límite renovado (en esta sesión o en otra): el tope vuelve a como estaba.
      await $.command.run({ command: 'nivel', args: `tope ${topeAnterior}` }).catch(() => undefined)
      topeAnterior = null
      await $.store.delete('topeAnterior').catch(() => undefined)
    }
    if (cambio && (nivel !== 'normal' || antes.semana !== null)) {
      $.ui.toast(
        nivel === 'normal'
          ? 'Presupuesto: tu límite se renovó, vuelvo al modo normal.'
          : `Presupuesto: ${ETIQUETA[nivel]} (semana ${Math.round(semana?.percentUsed ?? 0)}%).${haySelector && objetivo !== null ? ` Tope del modelo: nivel ${objetivo}.` : ''}`,
      )
    }
  }

  await update($, estado, () => ({
    nivel,
    semana: semana?.percentUsed ?? null,
    cincoHoras: cinco?.percentUsed ?? null,
    renuevaSemana: semana?.resetsAt ?? null,
    topeAnterior,
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'presupuesto',
      description: 'Cuida tu límite de uso: /presupuesto (estado) · on · off',
      argumentHint: 'on | off',
    })
    // Apagado con /presupuesto off sigue apagado en las sesiones siguientes.
    if ((await $.store.get('isAuto').catch(() => undefined)) === false) await update($, isAuto, () => false)
    void revisar($)

    return next(e)
  })

  on('command.run', { command: 'presupuesto' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off') {
      await update($, isAuto, () => false)
      await $.store.set('isAuto', false).catch(() => undefined)
      const e0 = await read($, estado)
      if (e0.topeAnterior !== null) await $.command.run({ command: 'nivel', args: `tope ${e0.topeAnterior}` }).catch(() => undefined)
      await $.store.delete('topeAnterior').catch(() => undefined)
      await update($, estado, x => ({ ...x, nivel: 'normal' as const, topeAnterior: null }))

      return { text: 'Presupuesto apagado: no tocaré el modelo ni pediré ahorro.' }
    }
    if (arg === 'on') {
      await update($, isAuto, () => true)
      await $.store.set('isAuto', true).catch(() => undefined)
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
