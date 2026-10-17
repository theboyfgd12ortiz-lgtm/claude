import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Nota } from '../types'
import { aceptar, ARCHIVO, contarNotas, PEDIDO, SECCION, sinCabecera, tocaActualizar } from './notas'
import { ARCHIVO as ARCHIVO_TRASPASO, ARCHIVO_RAIZ, mensajeRetomar, PEDIDO as PEDIDO_TRASPASO, resumenDe, sinFecha, tocaGuardar } from './traspaso'

const estado = atom({ plugin: 'memoria', key: 'notas' } as const, 0)
// Apagado por defecto: la memoria propia de Claude (cerebro global en ~/.claude/cerebro) ya apunta lo importante.
const isAuto = atom({ plugin: 'memoria', key: 'isAuto' } as const, false)
const cuando = atom({ plugin: 'memoria', key: 'at' } as const, 0)
const traspaso = atom({ plugin: 'memoria', key: 'traspaso' } as const, null)
const traspasoAuto = atom({ plugin: 'memoria', key: 'traspasoAuto' } as const, true)

// Lo que se lee al empezar: se guarda aquí para no leer el archivo en cada petición.
let notas = ''
// Lo que va en el prompt de sistema: se fija al empezar (o tras /clear) y no cambia a mitad de charla, porque cualquier cambio ahí tira la caché de toda la conversación.
let notasFijas = ''
let ediciones = 0
let ultimo = 0
let ultimoTraspaso = 0
let porcientoUltimo = 0

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

/** Lee la nota de la carpeta de trabajo y la publica para el panel. */
const leerNota = async ($: EngineInterface): Promise<Nota | null> => {
  for (const ruta of [ARCHIVO_TRASPASO, ARCHIVO_RAIZ]) {
    const texto = await $.fs.read(ruta).catch(() => null)
    if (texto === null || texto.includes('descartada')) continue
    const fecha = Date.parse(texto.match(/<!-- traspaso (\S+?)( auto)? -->/)?.[1] ?? '')

    return {
      at: Number.isNaN(fecha) ? 0 : fecha,
      donde: ruta,
      resumen: resumenDe(texto),
      isAuto: /<!-- traspaso \S+ auto -->/.test(texto),
    }
  }

  return null
}

const publicar = async ($: EngineInterface) => {
  const actual = await leerNota($)
  await update($, traspaso, () => actual)

  return actual
}

/** Resume la conversación con un fork (reutiliza la caché) y la guarda; devuelve dónde, o un texto de error. */
const guardarNota = async ($: EngineInterface, extra: string, auto: boolean): Promise<{ donde: string } | { error: string }> => {
  const r = await $.model.fork({ prompt: extra === '' ? PEDIDO_TRASPASO : `${PEDIDO_TRASPASO}\n\nTen en cuenta también: ${extra}` })
  if (!r.isAnswered) {
    return { error: r.reason === 'nothing-to-fork' ? 'Todavía no hay nada que guardar en esta conversación.' : `No pude resumir ahora (${r.reason}).` }
  }
  const ahora = await $.clock.now()
  const contenido = `<!-- traspaso ${new Date(ahora).toISOString()}${auto ? ' auto' : ''} -->\n\n${r.text.trim()}\n`
  let donde = ARCHIVO_TRASPASO
  try {
    await $.fs.write(ARCHIVO_TRASPASO, contenido)
  } catch {
    try {
      await $.fs.write(ARCHIVO_RAIZ, contenido)
      donde = ARCHIVO_RAIZ
    } catch {
      return { error: `No pude escribir la nota en esta carpeta. Aquí está:\n\n${r.text.trim()}` }
    }
  }
  ultimoTraspaso = ahora
  await publicar($)

  return { donde }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'memoria', description: 'Las notas que Claude recuerda de este proyecto: /memoria · actualizar · borrar · on · off', argumentHint: 'actualizar | borrar | on | off' })
    if ((await $.store.get('isAuto').catch(() => undefined)) === true) await update($, isAuto, () => true)
    await $.command.register({
      name: 'guardar',
      description: 'Guarda el progreso en .claude/traspaso.md (también se guarda solo cuando la charla se llena)',
      argumentHint: '[nota extra opcional]',
    })
    await $.command.register({ name: 'retomar', description: 'Continúa el trabajo guardado' })
    if ((await $.store.get('traspasoAuto').catch(() => undefined)) === false) await update($, traspasoAuto, () => false)
    ediciones = 0
    ultimo = await $.clock.now()
    ultimoTraspaso = 0
    porcientoUltimo = 0
    await cargar($)
    await publicar($).catch(() => undefined)

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
    // Tras un /clear no hay session.start: se vuelve a mirar la carpeta para que el panel ofrezca retomar.
    await publicar($)

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
    if (e.agentId !== undefined || e.reason !== 'answer') return done

    // Tras un trabajo de verdad (varias ediciones), se actualizan las notas sin esperar a nadie.
    if (await read($, isAuto)) {
      const ahora = await $.clock.now()
      if (tocaActualizar({ ediciones, ahora, ultimo })) {
        ediciones = 0
        ultimo = ahora
        void actualizar($).catch(() => undefined)
      }
    }

    // Guardado automático del progreso: al terminar una respuesta con la conversación ya larga.
    if (await read($, traspasoAuto)) {
      const uso = await $.session.usage().catch(() => null)
      const ahora = await $.clock.now()
      const porciento = uso?.context.percent
      if (tocaGuardar({ porciento, tokens: uso?.context.tokens, ahora, ultimo: ultimoTraspaso, porcientoUltimo })) {
        porcientoUltimo = porciento ?? 0
        // Fuera de este turno: guardar no demora la respuesta ni su aviso.
        void guardarNota($, '', true).then(r => {
          if ('donde' in r) $.ui.toast('Tu conversación ya está larga: guardé el progreso. Cuando quieras empezar limpio, usa el botón del panel.')
        })
      }
    }

    return done
  }).catch(($, e, next) => next(e))

  // Antes de compactar (sola o con /compact) se guarda la nota: así siempre se puede retomar en un chat nuevo.
  on('session.compact', async ($, e, next) => {
    if (e.trigger !== 'precompute' && (await read($, traspasoAuto))) await guardarNota($, '', true).catch(() => undefined)

    return next(e)
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

    return { text: notas.trim() === '' ? 'Todavía no hay notas de este proyecto. Lo general ya lo guarda la memoria de Claude; aquí se apuntan con /memoria actualizar (o /memoria on para que sea solo).' : `Lo que recuerdo de este proyecto (${ARCHIVO}):\n${notas}` }
  })

  on('command.run', { command: 'guardar' }, async ($, e) => {
    const r = await guardarNota($, e.args.trim(), false)
    if ('error' in r) {
      if (r.error.startsWith('Todavía')) return { text: r.error }
      // El resumen aparte falló (error de la API, conversación muy larga): que lo escriba Claude en la conversación.
      await $.prompt.fill({ text: `${PEDIDO_TRASPASO.replace(' Usa solo lo que ya está en la conversación, sin abrir archivos ni usar herramientas.', '').replace(' Responde solo con la nota.', '')}\n\nGuárdala con la herramienta Write en ${ARCHIVO_TRASPASO}, empezando con la línea <!-- traspaso ${new Date(await $.clock.now()).toISOString()} -->${e.args.trim() === '' ? '' : `\nTen en cuenta también: ${e.args.trim()}`}` })

      return { text: 'El resumen automático falló. Dejé el pedido en el cuadro de mensaje: pulsa Enter y Claude guarda la nota.' }
    }
    $.ui.toast('Guardado. Para seguir en una charla limpia: /clear y luego /retomar (o el botón del panel).')

    return { text: `Nota guardada en ${r.donde}. Ahora puedes escribir /clear (conversación nueva, mucho más barata) y luego /retomar.` }
  })

  on('command.run', { command: 'retomar' }, async $ => {
    let texto: string | null = null
    for (const ruta of [ARCHIVO_TRASPASO, ARCHIVO_RAIZ]) {
      texto = await $.fs.read(ruta).catch(() => null)
      if (texto !== null) break
    }
    if (texto === null) return { text: `No hay nota guardada en esta carpeta (${ARCHIVO_TRASPASO}). Usa /guardar primero.` }
    await $.prompt.fill({ text: mensajeRetomar(sinFecha(texto)) })

    return { text: 'Dejé la nota en el cuadro de mensaje: revísala y pulsa Enter para continuar.' }
  })

  // Descartar la nota (botón del panel): se borra el archivo y deja de ofrecerse.
  on('command.run', { command: 'traspaso' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'descartar') {
      for (const ruta of [ARCHIVO_TRASPASO, ARCHIVO_RAIZ]) await $.fs.write(ruta, '<!-- traspaso 1970-01-01T00:00:00.000Z descartada -->\n').catch(() => undefined)
      await update($, traspaso, () => null)

      return { text: 'Nota descartada.' }
    }
    if (arg === 'off' || arg === 'on') {
      await update($, traspasoAuto, () => arg === 'on')
      await $.store.set('traspasoAuto', arg === 'on').catch(() => undefined)
    }

    return { text: `Guardado automático ${(await read($, traspasoAuto)) ? 'activo' : 'apagado'}.` }
  })
}
