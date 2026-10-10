import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { aceptar, ARCHIVO, contarNotas, PEDIDO, SECCION, sinCabecera, tocaActualizar } from './notas'

const estado = atom({ plugin: 'memoria', key: 'notas' } as const, 0)
const isAuto = atom({ plugin: 'memoria', key: 'isAuto' } as const, true)
const cuando = atom({ plugin: 'memoria', key: 'at' } as const, 0)

// Lo que se lee al empezar: se guarda aquí para no leer el archivo en cada petición.
let notas = ''
// Lo que va en el prompt de sistema: se fija al empezar (o tras /clear) y no cambia a mitad de charla, porque cualquier cambio ahí tira la caché de toda la conversación.
let notasFijas = ''
let ediciones = 0
let ultimo = 0

const cargar = async ($: EngineInterface) => {
  const t = await $.fs.read(ARCHIVO).catch(() => null)
  notas = t === null ? '' : sinCabecera(t)
  notasFijas = notas
  await update($, estado, () => contarNotas(notas))
}

/** Pide al modelo (con la caché de la conversación) las notas al día y las guarda si valen. */
const actualizar = async ($: EngineInterface): Promise<'guardado' | 'sin cambios' | 'no disponible'> => {
  const r = await $.model.fork({ prompt: PEDIDO(notas) })
  if (!r.isAnswered) return 'no disponible'
  const nuevas = aceptar(r.text)
  if (nuevas === null || nuevas === notas) return 'sin cambios'
  const ahora = await $.clock.now()
  try {
    await $.fs.write(ARCHIVO, `<!-- memoria ${new Date(ahora).toISOString()} -->\n\n${nuevas}\n`)
  } catch {
    return 'no disponible'
  }
  notas = nuevas
  await update($, estado, () => contarNotas(nuevas))
  await update($, cuando, () => ahora)

  return 'guardado'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'memoria', description: 'Las notas que Claude recuerda de este proyecto: /memoria · actualizar · borrar · on · off', argumentHint: 'actualizar | borrar | on | off' })
    if ((await $.store.get('isAuto').catch(() => undefined)) === false) await update($, isAuto, () => false)
    ediciones = 0
    ultimo = await $.clock.now()
    await cargar($)

    return next(e)
  })

  // Una nota por conversación nueva (también tras /clear): lo que Claude lee al empezar.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (notasFijas.trim() === '' || e.traits.includes('bare') || e.traits.includes('analysis')) return composed

    return { sections: [...composed.sections, { id: 'memoria:proyecto', text: SECCION(notasFijas), scope: 'session' }] }
  }).catch(($, e, next) => next(e))

  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    await cargar($)

    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.deny === undefined && ran.isError !== true && (e.tool === 'Edit' || e.tool === 'Write' || String(e.tool) === 'MultiEdit')) ediciones += 1

    return ran
  }).catch(($, e, next) => next(e))

  // Tras un trabajo de verdad (varias ediciones), se actualizan las notas sin esperar a nadie.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer' || !(await read($, isAuto))) return done
    const ahora = await $.clock.now()
    if (!tocaActualizar({ ediciones, ahora, ultimo })) return done
    ediciones = 0
    ultimo = ahora
    void actualizar($).catch(() => undefined)

    return done
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'memoria' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'borrar') {
      await $.fs.write(ARCHIVO, '<!-- memoria vacía -->\n').catch(() => undefined)
      notas = ''
      notasFijas = ''
      await update($, estado, () => 0)

      return { text: 'Memoria borrada: Claude ya no recuerda nada de este proyecto.' }
    }
    if (arg === 'actualizar') {
      const r = await actualizar($)

      return { text: r === 'guardado' ? `Memoria actualizada (${contarNotas(notas)} notas).` : r === 'sin cambios' ? 'No encontré nada nuevo que valga la pena apuntar.' : 'No pude actualizar la memoria ahora.' }
    }
    if (arg === 'on' || arg === 'off') {
      await update($, isAuto, () => arg === 'on')
      await $.store.set('isAuto', arg === 'on').catch(() => undefined)

      return { text: `Memoria automática ${arg === 'on' ? 'activada' : 'apagada'}.` }
    }

    return { text: notas.trim() === '' ? 'Todavía no hay notas de este proyecto. Se apuntan solas después de un trabajo importante.' : `Lo que recuerdo de este proyecto (${ARCHIVO}):\n${notas}` }
  })
}
