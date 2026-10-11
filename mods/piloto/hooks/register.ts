import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mision, Paso } from '../types'
import { decidir, esTareaGrande, MAX_CONTINUACIONES, protocolo, recortar, resumenPlan } from './reglas'

const VACIA: Mision = { activa: false, objetivo: '', hechos: 0, total: 0, siguiente: null, continuaciones: 0, max: MAX_CONTINUACIONES, fin: '', revision: 'sin revisar' }
const mision = atom({ plugin: 'piloto', key: 'mision' } as const, VACIA)
const isAuto = atom({ plugin: 'piloto', key: 'isAuto' } as const, true)
const presupuestoEstado = { plugin: 'presupuesto', key: 'estado' } as const

const DE_LA_PERSONA = new Set(['composer', 'bridge', 'sdk', 'slack-ping', 'unclassified'])

// Lo que el piloto recuerda entre turnos (a nivel del módulo: las funciones que reciben `$` se declaran fuera de register).
let plan: Paso[] = []
let ultimoSiguiente: string | null = null
let repeticiones = 0
let yaRevisado = false
let veredicto: 'ok' | 'problemas' | null = null
let rondas = 0
let sinVeredicto = 0

/** Si la respuesta de ese agente es del revisor (según el mod equipo); sin equipo, cualquier agente cuenta. */
const esRevisor = async ($: EngineInterface, id: string): Promise<boolean> => {
  const r = await $.state.get({ plugin: 'equipo', key: 'agentes' } as never).catch(() => undefined)
  const lista = (r as { value?: { id: string; tipo: string }[] } | undefined)?.value
  if (!Array.isArray(lista) || lista.length === 0) return true

  return lista.find(a => a.id === id)?.tipo === 'equipo:revisor'
}

const empezar = async ($: EngineInterface, objetivo: string) => {
  plan = []
  ultimoSiguiente = null
  repeticiones = 0
  yaRevisado = false
  veredicto = null
  rondas = 0
  sinVeredicto = 0
  await update($, mision, () => ({ ...VACIA, activa: true, objetivo: recortar(objetivo, 160) }))
}

const terminar = async ($: EngineInterface, motivo: string, aviso: string, revision?: Mision['revision']) => {
  await update($, mision, m => ({ ...m, activa: false, fin: motivo, revision: revision ?? m.revision }))
  $.ui.toast(aviso)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'piloto',
      description: 'Dile qué quieres lograr y se hace solo: /piloto <objetivo> · parar · auto on|off',
      argumentHint: '<objetivo> | parar | auto on|off',
    })
    if ((await $.store.get('isAuto').catch(() => undefined)) === false) await update($, isAuto, () => false)

    return next(e)
  })

  // El plan que Claude va marcando con TodoWrite es el avance de la misión.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || e.agentId !== undefined) return ran
    plan = e.todos.map(t => ({ texto: t.content, hecho: t.status === 'completed' }))
    const r = resumenPlan(plan)
    await update($, mision, m => ({ ...m, hechos: r.hechos, total: r.total, siguiente: r.siguiente }))

    return ran
  }).catch(($, e, next) => next(e))

  // Un pedido grande de la persona arranca una misión solo (si está en automático); uno nuevo reinicia la cuenta.
  on('prompt.submit', async ($, e, next) => {
    const origen = (e.origin as { kind?: string } | undefined)?.kind
    if (origen !== undefined && !DE_LA_PERSONA.has(origen)) return next(e)
    const m = await read($, mision)
    if (m.activa && !e.text.trim().startsWith('/')) await update($, mision, x => ({ ...x, continuaciones: 0 }))
    if (m.activa || !(await read($, isAuto)) || !esTareaGrande(e.text)) return next(e)
    const apretado = ((await $.state.get(presupuestoEstado).catch(() => undefined))?.value?.nivel ?? 'normal') !== 'normal'
    if (apretado) return next(e)
    await empezar($, e.text)
    $.ui.toast('Piloto: lo llevo de principio a fin. Para frenarlo: /piloto parar')

    return next({ ...e, context: [...(e.context ?? []), protocolo(e.text)] })
  }).catch(($, e, next) => next(e))

  // Al terminar el turno del director: si quedan pasos, sigue solo; si no, cierra la misión.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) {
      // La respuesta del revisor, tras pedir la revisión, es el veredicto.
      if (yaRevisado && typeof e.answer === 'string' && e.answer.trim() !== '' && (await read($, mision)).activa && (await esRevisor($, e.agentId))) {
        veredicto = /TODO BIEN/.test(e.answer) ? 'ok' : 'problemas'
      }

      return done
    }
    const m = await read($, mision)
    if (!m.activa) return done
    const r = resumenPlan(plan)
    repeticiones = r.siguiente !== null && r.siguiente === ultimoSiguiente ? repeticiones + 1 : 0
    ultimoSiguiente = r.siguiente
    const presupuesto = (await $.state.get(presupuestoEstado).catch(() => undefined))?.value?.nivel ?? 'normal'
    const d = decidir({ activa: true, razon: e.reason, continuaciones: m.continuaciones, max: m.max, total: r.total, hechos: r.hechos, siguiente: r.siguiente, presupuesto, repeticiones, yaRevisado, veredicto, rondas, sinVeredicto })

    if (d.accion === 'continuar') {
      if (d.revision === true) {
        if (yaRevisado && veredicto === null) sinVeredicto += 1
        yaRevisado = true
        veredicto = null
      }
      if (d.correccion === true) {
        rondas += 1
        yaRevisado = false
        veredicto = null
      }
      await update($, mision, x => ({ ...x, continuaciones: x.continuaciones + 1, revision: d.revision === true ? 'revisando' : d.correccion === true ? 'corrigiendo' : x.revision }))
      void $.prompt.submit({ text: d.texto, wait: false } as never).catch(() => undefined)
    } else if (d.accion === 'terminar') {
      await terminar($, d.motivo, d.revision === 'aprobada' ? 'Piloto: terminé y el revisor lo aprobó.' : 'Piloto: terminé. Revisa el resumen.', d.revision)
    } else if (d.accion === 'parar') {
      await terminar($, d.motivo, `Piloto: paré (${d.motivo}).`)
    }

    return done
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'piloto' }, async ($, e) => {
    const arg = e.args.trim()
    const baja = arg.toLowerCase()
    if (baja === 'parar' || baja === 'stop') {
      await terminar($, 'lo paraste tú', 'Piloto: parado.')

      return { text: 'Piloto parado. Lo que quedó hecho se queda; lo demás lo sigues tú.' }
    }
    if (baja === 'auto on' || baja === 'auto off') {
      await update($, isAuto, () => baja === 'auto on')
      await $.store.set('isAuto', baja === 'auto on').catch(() => undefined)

      return { text: `Piloto automático ${baja === 'auto on' ? 'activo: los pedidos grandes se llevan solos' : 'apagado: solo arranca con /piloto <objetivo>'}.` }
    }
    if (arg === '') {
      const m = await read($, mision)
      const auto = await read($, isAuto)

      return {
        text: m.activa
          ? `Piloto en marcha: ${m.objetivo} · ${m.hechos} de ${m.total} pasos · siguió solo ${m.continuaciones}/${m.max} veces.`
          : `Piloto ${auto ? 'en automático' : 'solo manual'}. ${m.fin !== '' ? `La última misión terminó: ${m.fin}.` : 'Escribe /piloto <qué quieres lograr>.'}`,
      }
    }
    await empezar($, arg)
    void $.prompt.submit({ text: `${arg}\n\n${protocolo(arg)}`, wait: false } as never).catch(() => undefined)

    return { text: 'Piloto en marcha. Planea, reparte con el equipo y avanza solo; te aviso al terminar. /piloto parar lo frena.' }
  })
}
