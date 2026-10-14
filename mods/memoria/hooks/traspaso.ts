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
export const sinFecha = (texto: string): string => texto.replace(/^<!--[\s\S]*?-->\s*/, '')

/** La primera línea con contenido del objetivo, para mostrarla en el panel. */
export const resumenDe = (texto: string): string => {
  const cuerpo = sinFecha(texto)
  const objetivo = cuerpo.match(/## Objetivo\s*\n+([^\n#][^\n]*)/)?.[1]

  return (objetivo ?? cuerpo.split('\n').find(l => l.trim() !== '' && !l.startsWith('#')) ?? '').trim().slice(0, 140)
}
