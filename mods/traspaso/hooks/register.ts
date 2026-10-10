import type { Register } from 'claude-code'

/** Dónde queda el resumen, relativo a la carpeta de trabajo (si .claude/ no se puede crear, en la raíz). */
export const ARCHIVO = '.claude/traspaso.md'
export const ARCHIVO_RAIZ = 'traspaso.md'

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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'guardar',
      description: 'Resume la conversación en .claude/traspaso.md para seguir después en una limpia',
      argumentHint: '[nota extra opcional]',
    })
    await $.command.register({ name: 'retomar', description: 'Continúa el trabajo guardado con /guardar' })

    return next(e)
  })

  on('command.run', { command: 'guardar' }, async ($, e) => {
    // Un fork pregunta sobre la conversación tal cual, con su caché: resumir sale barato.
    const extra = e.args.trim()
    const r = await $.model.fork({ prompt: extra === '' ? PEDIDO : `${PEDIDO}\n\nTen en cuenta también: ${extra}` })
    if (!r.isAnswered) {
      return { text: r.reason === 'nothing-to-fork' ? 'Todavía no hay nada que guardar en esta conversación.' : `No pude resumir ahora (${r.reason}). Prueba otra vez.` }
    }
    const fecha = new Date(await $.clock.now()).toLocaleString('es')
    const contenido = `<!-- Nota de traspaso · ${fecha} -->\n\n${r.text.trim()}\n`
    let donde = ARCHIVO
    try {
      await $.fs.write(ARCHIVO, contenido)
    } catch {
      try {
        await $.fs.write(ARCHIVO_RAIZ, contenido)
        donde = ARCHIVO_RAIZ
      } catch {
        return { text: `No pude escribir la nota en esta carpeta. Aquí está:\n\n${r.text.trim()}` }
      }
    }
    $.ui.toast('Guardado. Escribe /clear para empezar limpio y luego /retomar.')

    return { text: `Nota guardada en ${donde}. Ahora puedes escribir /clear (conversación nueva, mucho más barata) y luego /retomar.` }
  })

  on('command.run', { command: 'retomar' }, async $ => {
    let nota: string | null = null
    for (const ruta of [ARCHIVO, ARCHIVO_RAIZ]) {
      nota = await $.fs.read(ruta).catch(() => null)
      if (nota !== null) break
    }
    if (nota === null) return { text: `No hay nota guardada en esta carpeta (${ARCHIVO}). Usa /guardar primero.` }
    await $.prompt.fill({ text: mensajeRetomar(nota.replace(/^<!--[\s\S]*?-->\s*/, '')) })

    return { text: 'Dejé la nota en el cuadro de mensaje: revísala y pulsa Enter para continuar.' }
  })
}
