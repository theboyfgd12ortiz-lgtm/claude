import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Nota } from '../types'

/** Dónde queda el resumen, relativo a la carpeta de trabajo (si .claude/ no se puede crear, en la raíz). */
export const ARCHIVO = '.claude/traspaso.md'
export const ARCHIVO_RAIZ = 'traspaso.md'

/** Con la ventana de contexto así de llena se guarda sola; después, solo si crece otro tanto. */
export const UMBRAL_PORCIENTO = 45
export const UMBRAL_TOKENS = 90_000
export const CRECIMIENTO = 15
/** Y no más de una vez cada tanto, para no gastar de más. */
export const ESPERA_MS = 10 * 60_000

/** Lo que se le pide al resumir: lo justo para seguir sin releer toda la conversación. */
export const PEDIDO = `Escribe una nota de traspaso de esta conversación para retomarla en una conversación nueva, sin el historial. En español, en Markdown, máximo 400 palabras, con estas secciones:
## Objetivo
Qué quiere lograr el usuario y para quién.
## Hecho
Lo terminado, con las rutas de los archivos creados o cambiados.
## Decisiones
Lo decidido y lo descartado, con el porqué en una línea.
## Pendiente
Los siguientes pasos, en orden.
## Datos clave
Comandos que funcionan, nombres, URLs o valores que no hay que volver a buscar.
No incluyas código completo ni salidas largas. Responde solo con la nota.`

/** El mensaje que retoma el trabajo a partir de la nota. */
export const mensajeRetomar = (nota: string): string =>
  `Retomamos un trabajo de una conversación anterior. Esta es la nota de traspaso (también está en ${ARCHIVO}):\n\n${nota.trim()}\n\nConfirma en una línea dónde quedamos y sigue con el primer paso pendiente.`

/** ¿Toca guardar? Conversación llena, no hace poco, y que haya crecido desde la última nota. */
export const tocaGuardar = (a: {
  porciento: number | undefined
  tokens: number | undefined
  ahora: number
  ultimo: number
  porcientoUltimo: number
}): boolean => {
  const lleno = (a.porciento ?? 0) >= UMBRAL_PORCIENTO || (a.tokens ?? 0) >= UMBRAL_TOKENS
  if (!lleno) return false
  if (a.ahora - a.ultimo < ESPERA_MS) return false

  return a.ultimo === 0 || (a.porciento ?? 0) - a.porcientoUltimo >= CRECIMIENTO
}

/** Quita el comentario del principio de la nota guardada. */
const sinFecha = (texto: string): string => texto.replace(/^<!--[\s\S]*?-->\s*/, '')

/** La primera línea con contenido del objetivo, para mostrarla en el panel. */
export const resumenDe = (texto: string): string => {
  const cuerpo = sinFecha(texto)
  const objetivo = cuerpo.match(/## Objetivo\s*\n+([^\n#][^\n]*)/)?.[1]

  return (objetivo ?? cuerpo.split('\n').find(l => l.trim() !== '' && !l.startsWith('#')) ?? '').trim().slice(0, 140)
}

const nota = atom({ plugin: 'traspaso', key: 'nota' } as const, null)
const isAuto = atom({ plugin: 'traspaso', key: 'isAuto' } as const, true)

let ultimo = 0
let porcientoUltimo = 0

/** Lee la nota de la carpeta de trabajo y la publica para el panel. */
const leerNota = async ($: EngineInterface): Promise<Nota | null> => {
  for (const ruta of [ARCHIVO, ARCHIVO_RAIZ]) {
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
  await update($, nota, () => actual)

  return actual
}

/** Resume la conversación con un fork (reutiliza la caché) y la guarda; devuelve dónde, o un texto de error. */
const guardarNota = async ($: EngineInterface, extra: string, auto: boolean): Promise<{ donde: string } | { error: string }> => {
  const r = await $.model.fork({ prompt: extra === '' ? PEDIDO : `${PEDIDO}\n\nTen en cuenta también: ${extra}` })
  if (!r.isAnswered) {
    return { error: r.reason === 'nothing-to-fork' ? 'Todavía no hay nada que guardar en esta conversación.' : `No pude resumir ahora (${r.reason}).` }
  }
  const ahora = await $.clock.now()
  const contenido = `<!-- traspaso ${new Date(ahora).toISOString()}${auto ? ' auto' : ''} -->\n\n${r.text.trim()}\n`
  let donde = ARCHIVO
  try {
    await $.fs.write(ARCHIVO, contenido)
  } catch {
    try {
      await $.fs.write(ARCHIVO_RAIZ, contenido)
      donde = ARCHIVO_RAIZ
    } catch {
      return { error: `No pude escribir la nota en esta carpeta. Aquí está:\n\n${r.text.trim()}` }
    }
  }
  ultimo = ahora
  await publicar($)

  return { donde }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'guardar',
      description: 'Guarda el progreso en .claude/traspaso.md (también se guarda solo cuando la charla se llena)',
      argumentHint: '[nota extra opcional]',
    })
    await $.command.register({ name: 'retomar', description: 'Continúa el trabajo guardado' })
    if ((await $.store.get('isAuto').catch(() => undefined)) === false) await update($, isAuto, () => false)
    ultimo = 0
    porcientoUltimo = 0
    await publicar($)

    return next(e)
  })

  // Tras un /clear no hay session.start: se vuelve a mirar la carpeta para que el panel ofrezca retomar.
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    await publicar($)

    return r
  }).catch(($, e, next) => next(e))

  // Guardado automático: al terminar una respuesta con la conversación ya larga.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer' || !(await read($, isAuto))) return done

    const uso = await $.session.usage().catch(() => null)
    const ahora = await $.clock.now()
    const porciento = uso?.context.percent
    if (!tocaGuardar({ porciento, tokens: uso?.context.tokens, ahora, ultimo, porcientoUltimo })) return done

    porcientoUltimo = porciento ?? 0
    // Fuera de este turno: guardar no demora la respuesta ni su aviso.
    void guardarNota($, '', true).then(r => {
      if ('donde' in r) $.ui.toast('Tu conversación ya está larga: guardé el progreso. Cuando quieras empezar limpio, usa el botón del panel.')
    })

    return done
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'guardar' }, async ($, e) => {
    const r = await guardarNota($, e.args.trim(), false)
    if ('error' in r) return { text: r.error }
    $.ui.toast('Guardado. Para seguir en una charla limpia: /clear y luego /retomar (o el botón del panel).')

    return { text: `Nota guardada en ${r.donde}. Ahora puedes escribir /clear (conversación nueva, mucho más barata) y luego /retomar.` }
  })

  on('command.run', { command: 'retomar' }, async $ => {
    let texto: string | null = null
    for (const ruta of [ARCHIVO, ARCHIVO_RAIZ]) {
      texto = await $.fs.read(ruta).catch(() => null)
      if (texto !== null) break
    }
    if (texto === null) return { text: `No hay nota guardada en esta carpeta (${ARCHIVO}). Usa /guardar primero.` }
    await $.prompt.fill({ text: mensajeRetomar(sinFecha(texto)) })

    return { text: 'Dejé la nota en el cuadro de mensaje: revísala y pulsa Enter para continuar.' }
  })

  // Descartar la nota (botón del panel): se borra el archivo y deja de ofrecerse.
  on('command.run', { command: 'traspaso' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'descartar') {
      for (const ruta of [ARCHIVO, ARCHIVO_RAIZ]) await $.fs.write(ruta, '<!-- traspaso 1970-01-01T00:00:00.000Z descartada -->\n').catch(() => undefined)
      await update($, nota, () => null)

      return { text: 'Nota descartada.' }
    }
    if (arg === 'off' || arg === 'on') {
      await update($, isAuto, () => arg === 'on')
      await $.store.set('isAuto', arg === 'on').catch(() => undefined)
    }

    return { text: `Guardado automático ${(await read($, isAuto)) ? 'activo' : 'apagado'}.` }
  })
}
