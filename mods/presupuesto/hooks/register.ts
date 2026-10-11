import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Estado } from '../types'
import { duracion, estaAgotado, ETIQUETA, faltaPara, INSTRUCCIONES, LIMITE_SKILLS, nivelDe, SKILLS_POR_PEDIDO, TOPE } from './reglas'

const DE_LA_PERSONA = new Set(['composer', 'bridge', 'sdk', 'slack-ping', 'unclassified'])
const INICIAL: Estado = { nivel: 'normal', semana: null, cincoHoras: null, renuevaSemana: null, topeMax: null }
const estado = atom({ plugin: 'presupuesto', key: 'estado' } as const, INICIAL)
const isAuto = atom({ plugin: 'presupuesto', key: 'isAuto' } as const, true)

// Skills cargadas desde el último mensaje de la persona.
let skillsEnPedido = 0

// El aviso de "ya puedes seguir" (uno solo a la vez).
let avisoRenovacion: { cancel: () => void } | undefined

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

  // Límite agotado: se dice cuándo vuelve y se avisa solo cuando ya se puede seguir (el trabajo queda guardado por el mod traspaso).
  const agotado = activo && estaAgotado(cinco?.percentUsed ?? null, semana?.percentUsed ?? null)
  if (agotado && avisoRenovacion === undefined) {
    const cuando = (cinco?.percentUsed ?? 0) >= 100 ? cinco?.resetsAt : semana?.resetsAt
    const falta = faltaPara(cuando, await $.clock.now())
    if (falta !== null) {
      $.ui.toast(`Presupuesto: se acabó el límite. Vuelve en ${duracion(falta)}; tu trabajo queda guardado y te aviso cuando puedas seguir.`)
      avisoRenovacion = $.clock.after(falta + 30_000, () => {
        avisoRenovacion = undefined
        void $.ui.notify('Tu límite de uso se renovó: ya puedes seguir. Escribe /retomar para continuar donde quedaste.', { title: 'Claude Code' }).catch(() => undefined)
        void revisar($)
      })
    }
  } else if (!agotado && avisoRenovacion !== undefined) {
    avisoRenovacion.cancel()
    avisoRenovacion = undefined
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

  // En ahorro, una instrucción corta con cada mensaje de la persona. Va con el mensaje y no en el prompt de sistema:
  // el nivel cambia a mitad de charla y un cambio en el sistema tiraría la caché de toda la conversación.
  on('prompt.submit', async ($, e, next) => {
    const origen = (e.origin as { kind?: string } | undefined)?.kind
    if (origen !== undefined && !DE_LA_PERSONA.has(origen)) return next(e)
    skillsEnPedido = 0
    const texto = INSTRUCCIONES[(await read($, estado)).nivel]
    if (texto === null || !(await read($, isAuto))) return next(e)

    return next({ ...e, context: [...(e.context ?? []), `<presupuesto>${texto}</presupuesto>`] })
  }).catch(($, e, next) => next(e))

  // Con poco límite se puede usar una skill por pedido (las que ayudan a la calidad); la segunda se rechaza.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    if ((await read($, estado)).nivel === 'normal' || !(await read($, isAuto))) return next(e)
    if (skillsEnPedido >= SKILLS_POR_PEDIDO) return { deny: LIMITE_SKILLS }
    skillsEnPedido += 1

    return next(e)
  }).catch(($, e, next) => next(e))
}
