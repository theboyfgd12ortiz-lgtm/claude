// Lógica pura de la memoria: sin `$`.

export const ARCHIVO = '.claude/memoria.md'
/** Lo más que se lee al empezar: las notas son para ahorrar tokens, no para gastarlos. */
export const MAX_CARACTERES = 2500
export const SIN_CAMBIOS = 'SIN_CAMBIOS'
/** Una actualización como mucho cada tanto, y solo tras trabajo de verdad. */
export const ESPERA_MS = 8 * 60_000
export const EDICIONES_MINIMAS = 2

export const PEDIDO = (actuales: string): string =>
  `Actualiza las notas de memoria de este proyecto, que Claude leerá al empezar futuras conversaciones.

Notas actuales:
${actuales.trim() === '' ? '(todavía no hay)' : actuales.trim()}

Reglas:
- Devuelve la lista COMPLETA ya actualizada, solo con viñetas que empiezan con "- ", máximo 15 viñetas y 2000 caracteres, en español.
- Incluye solo hechos duraderos que ahorren tiempo en el futuro: tecnologías y estructura, cómo ejecutar, probar y publicar, convenciones del proyecto, decisiones tomadas con su porqué en pocas palabras, datos del cliente o del negocio, errores que no hay que repetir.
- No incluyas nada temporal (lo que se está haciendo ahora), código, ni claves, contraseñas o tokens.
- Si algo de las notas actuales ya no es cierto, corrígelo o quítalo. Si dos notas dicen lo mismo, únelas.
- Si de esta conversación no hay nada nuevo que valga la pena apuntar, responde exactamente ${SIN_CAMBIOS}.
- Responde solo con la lista (o con ${SIN_CAMBIOS}), sin introducción.`

/** Lo que Claude lee al empezar. */
export const SECCION = (notas: string): string =>
  `# Memoria del proyecto
Notas guardadas de conversaciones anteriores sobre este proyecto (no hace falta releerlas ni explorarlo todo de nuevo para saber esto). Si algo no coincide con lo que ves, confía en lo que ves y dilo.
${notas.trim()}`

const SECRETO = /sk-ant-|\bsk-[A-Za-z0-9_-]{32,}|ghp_[A-Za-z0-9]{30,}|github_pat_|\bAKIA[A-Z0-9]{16}|PRIVATE KEY|xox[abprs]-|[sr]k_live_/

/** Valida lo que respondió el modelo: debe ser una lista corta y sin secretos. Devuelve las notas limpias o null. */
export const aceptar = (respuesta: string): string | null => {
  const t = respuesta.trim()
  if (t === '' || t === SIN_CAMBIOS) return null
  const lineas = t.split('\n').map(l => l.trimEnd()).filter(l => l.trim() !== '')
  if (lineas.length > 20 || !lineas.every(l => /^\s*[-*•]\s+\S/.test(l) || /^\s{2,}\S/.test(l))) return null
  const limpio = lineas.map(l => l.replace(/^(\s*)[*•]/, '$1-')).join('\n')
  if (limpio.length > MAX_CARACTERES || SECRETO.test(limpio)) return null

  return limpio
}

export const contarNotas = (notas: string): number => notas.split('\n').filter(l => /^\s*-\s/.test(l)).length

/** Quita el comentario del principio del archivo. */
export const sinCabecera = (texto: string): string => texto.replace(/^<!--[\s\S]*?-->\s*/, '').trim()

export const tocaActualizar = (a: { ediciones: number; ahora: number; ultimo: number }): boolean =>
  a.ediciones >= EDICIONES_MINIMAS && a.ahora - a.ultimo >= ESPERA_MS
