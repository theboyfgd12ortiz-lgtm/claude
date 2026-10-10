import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Investigacion, Registro } from '../types'
import { AGENTES, ahorro, familiaDe, GUIA, modeloParaAgente, slug } from './reglas'

const agentes = atom({ plugin: 'equipo', key: 'agentes' } as const, [])
const investigacion = atom({ plugin: 'equipo', key: 'investigacion' } as const, null)
const isAuto = atom({ plugin: 'equipo', key: 'isAuto' } as const, true)

/** Cuántos agentes se recuerdan para el panel. */
const MAX = 40

const num = (n: number | undefined): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

/** Resumen corto del equipo, para /equipo y para el panel sin pantalla. */
export const resumenEquipo = (lista: readonly Registro[]): string => {
  if (lista.length === 0) return 'Aún no trabajó ningún agente del equipo.'
  const trabajando = lista.filter(r => r.estado === 'trabajando').length
  const ahorrado = lista.reduce((s, r) => s + ahorro(r), 0)
  const porModelo = ['haiku', 'sonnet', 'opus', 'otro']
    .map(f => [f, lista.filter(r => r.familia === f).length] as const)
    .filter(([, n]) => n > 0)
    .map(([f, n]) => `${n} con ${f}`)
    .join(', ')

  return `${lista.length} agentes (${porModelo})${trabajando > 0 ? `, ${trabajando} trabajando` : ''} · ahorro estimado ~${Math.round(ahorrado / 1000).toLocaleString('es')}k unidades (comparado con hacerlo todo con el modelo del director; es una estimación).`
}

const guardar = async ($: EngineInterface, i: Investigacion): Promise<string> => {
  const archivo = `.claude/investigaciones/${slug(i.pregunta)}.md`
  await $.fs.write(archivo, `# ${i.pregunta}\n\n${i.texto}\n`)
  await update($, investigacion, v => (v === null ? v : { ...v, archivo }))

  return archivo
}

export const register: Register = on => {
  // Agente que corresponde a la investigación en curso.
  let investigadorId: string | undefined

  on('session.start', async ($, e, next) => {
    for (const spec of AGENTES) await $.agent.register(spec).catch(() => undefined)
    await $.command.register({
      name: 'equipo',
      description: 'Equipo de agentes con modelos baratos: /equipo · on|off',
      argumentHint: 'on|off',
    })
    await $.command.register({
      name: 'investigar',
      description: 'Investiga en internet con un agente barato: /investigar <pregunta> · guardar',
      argumentHint: '<pregunta> | guardar',
    })
    if ((await $.store.get('isAuto').catch(() => undefined)) === false) await update($, isAuto, () => false)

    return next(e)
  })

  // 1. El director sabe cómo repartir el trabajo.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (e.traits.includes('bare') || e.traits.includes('analysis') || !(await read($, isAuto))) return composed

    return { sections: [...composed.sections, { id: 'equipo:guia', text: GUIA, scope: 'session' }] }
  })

  // 2. Un agente sin modelo propio corre con el más barato que sirva.
  on('agent.spawn', async ($, e, next) => {
    const objetivo = (await read($, isAuto))
      ? modeloParaAgente({ tipo: e.subagentType, pedido: e.model, padre: e.parentModel, fork: e.subagentType === 'fork' })
      : undefined
    const lanzado = await next(objetivo === undefined ? e : { ...e, model: objetivo })
    if (lanzado.deny !== undefined || lanzado.agentId === undefined) return lanzado

    const id = lanzado.agentId
    const reg: Registro = {
      id,
      tipo: e.subagentType,
      descripcion: e.description,
      modelo: lanzado.model,
      familia: familiaDe(lanzado.model),
      padre: familiaDe(e.parentModel),
      at: await $.clock.now(),
      fin: null,
      estado: 'trabajando',
      nuevo: 0,
      cache: 0,
      escrito: 0,
    }
    await update($, agentes, l => [reg, ...l].slice(0, MAX))

    return lanzado
  }).catch(($, e, next) => next(e))

  // 3. Lo que gastó cada agente y su respuesta.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const id = e.agentId
    if (id === undefined) return done

    const u = e.usage
    if (u !== undefined) {
      await update($, agentes, l =>
        l.map(r =>
          r.id === id
            ? { ...r, nuevo: r.nuevo + num(u.input_tokens) + num(u.cache_creation_input_tokens), cache: r.cache + num(u.cache_read_input_tokens), escrito: r.escrito + num(u.output_tokens) }
            : r,
        ),
      )
    }
    if (e.reason === 'answer') {
      const fin = await $.clock.now()
      await update($, agentes, l => l.map(r => (r.id === id ? { ...r, estado: 'listo' as const, fin } : r)))
      if (id === investigadorId) {
        investigadorId = undefined
        const texto = typeof e.answer === 'string' ? e.answer.trim() : ''
        await update($, investigacion, v => (v === null ? v : { ...v, estado: texto === '' ? ('fallo' as const) : ('listo' as const), texto }))
        $.ui.toast(texto === '' ? 'equipo: la investigación no devolvió nada.' : 'equipo: investigación lista. Míralo en /mods → Web.')
      }
    }

    return done
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'equipo' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await update($, isAuto, () => arg === 'on')
      await $.store.set('isAuto', arg === 'on').catch(() => undefined)
    }
    const auto = await read($, isAuto)

    return { text: `Equipo ${auto ? 'activo' : 'apagado'}. ${resumenEquipo(await read($, agentes))}` }
  })

  on('command.run', { command: 'investigar' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === '') return { text: 'Uso: /investigar <qué quieres saber> · /investigar guardar' }

    if (arg.toLowerCase() === 'guardar') {
      const actual = await read($, investigacion)
      if (actual === null || actual.estado !== 'listo') return { text: 'No hay una investigación lista para guardar.' }

      return { text: `Guardada en ${await guardar($, actual)}.` }
    }

    const nueva: Investigacion = { id: String(await $.clock.now()), pregunta: arg, at: await $.clock.now(), estado: 'trabajando', texto: '', archivo: null }
    await update($, investigacion, () => nueva)
    try {
      const r = await $.agent.spawn({ prompt: arg, description: `Investigar: ${arg.slice(0, 40)}`, subagentType: 'equipo:investigador' })
      if (r.deny !== undefined) throw new Error(r.deny)
      investigadorId = r.agentId
    } catch (error) {
      await update($, investigacion, v => (v === null ? v : { ...v, estado: 'fallo' as const }))
      // Sin agente, Claude lo hace con sus propias herramientas.
      await $.prompt.fill({ text: `Investiga en internet y respóndeme con fuentes: ${arg}` }).catch(() => undefined)

      return { text: `No pude lanzar el investigador (${error instanceof Error ? error.message : String(error)}); dejé la pregunta lista para enviar.` }
    }

    return { text: 'Investigando con un agente barato (Haiku). Te aviso cuando termine; el resultado queda en /mods → Web.' }
  })
}
