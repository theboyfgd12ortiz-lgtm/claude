// Reglas puras de las terminales: sin `$`, para probarlas directamente.

import type { Mensaje, Terminal } from '../types'

export const DIR = '.claude/terminales'
/** Se escribe una señal de vida cada tanto; sin ella por este tiempo, la terminal se da por cerrada. */
export const LATIDO_MS = 30_000
export const VIVA_MS = 90_000
/** Un archivo "reservado" por otra terminal deja de estarlo tras este tiempo sin tocarlo. */
export const RESERVA_MS = 10 * 60_000
export const MENSAJE_MAX = 500

export const estaViva = (t: Pick<Terminal, 'ultimo'>, ahora: number): boolean => t.ultimo > 0 && ahora - t.ultimo < VIVA_MS

/** El nombre más bajo que ninguna terminal viva usa: T1, T2… */
export const nombreLibre = (vivas: readonly Pick<Terminal, 'nombre'>[]): string => {
  const usados = new Set(vivas.map(t => t.nombre))
  for (let n = 1; ; n++) if (!usados.has(`T${n}`)) return `T${n}`
}

/** La ruta como se compara entre terminales: barras normales, sin la carpeta del proyecto y sin mayúsculas. */
export const rutaClave = (ruta: string, raiz: string): string => {
  const r = ruta.replace(/\\/g, '/')
  const base = raiz.replace(/\\/g, '/').replace(/\/+$/, '')

  return (base !== '' && r.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? r.slice(base.length + 1) : r).toLowerCase()
}

/** La otra terminal viva que reservó ese archivo hace poco, si hay. */
export const quienLoTiene = (clave: string, yo: string, otras: readonly Terminal[], ahora: number): Terminal | undefined =>
  otras.find(t => t.id !== yo && estaViva(t, ahora) && ahora - (t.archivos[clave] ?? 0) < RESERVA_MS)

/** Quita las reservas viejas para que el archivo no crezca. */
export const podarArchivos = (archivos: Record<string, number>, ahora: number, max = 40): Record<string, number> =>
  Object.fromEntries(
    Object.entries(archivos)
      .filter(([, t]) => ahora - t < RESERVA_MS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, max),
  )

export const recortar = (texto: string, n: number): string => {
  const limpio = texto.replace(/\s+/g, ' ').trim()

  return limpio.length > n ? `${limpio.slice(0, n)}…` : limpio
}

/** Lo que se le recuerda a Claude de las otras terminales (corto: se manda con el mensaje). */
export const pistaTerminales = (yo: string, otras: readonly Terminal[], ahora: number): string | undefined => {
  const vivas = otras.filter(t => estaViva(t, ahora))
  if (vivas.length === 0) return undefined
  const lista = vivas.map(t => `${t.nombre}${t.tarea !== '' ? ` (${recortar(t.tarea, 60)})` : ''}`).join(', ')

  return `<terminales>Tú eres ${yo}. Otras terminales en este proyecto: ${lista}. No edites los archivos que ellas están tocando; si necesitas algo de una, usa la herramienta mcp__terminales__enviar.</terminales>`
}

/** Un mensaje entrante, como lo lee Claude. */
export const textoMensajes = (ms: readonly Mensaje[]): string =>
  `<terminales>Mensajes de otras terminales: ${ms.map(m => `${m.de}: «${recortar(m.texto, MENSAJE_MAX)}»`).join(' · ')}</terminales>`

/** El nombre del archivo de un mensaje en la bandeja: ordenable por hora y único por remitente. */
export const archivoMensaje = (m: Mensaje, idRemitente: string): string => `${String(m.at).padStart(14, '0')}-${idRemitente}.json`

export const leerTerminal = (texto: string): Terminal | null => {
  try {
    const t = JSON.parse(texto) as Partial<Terminal>
    if (typeof t.id !== 'string' || typeof t.nombre !== 'string' || typeof t.ultimo !== 'number') return null

    return { id: t.id, nombre: t.nombre, inicio: t.inicio ?? 0, ultimo: t.ultimo, tarea: typeof t.tarea === 'string' ? t.tarea : '', archivos: typeof t.archivos === 'object' && t.archivos !== null ? t.archivos : {} }
  } catch {
    return null
  }
}

export const leerMensaje = (texto: string): Mensaje | null => {
  try {
    const m = JSON.parse(texto) as Partial<Mensaje>

    return typeof m.de === 'string' && typeof m.texto === 'string' && typeof m.at === 'number' ? { de: m.de, texto: m.texto, at: m.at } : null
  } catch {
    return null
  }
}

/** Un nombre de rama seguro para git a partir de lo que escribió la persona. */
export const nombreRama = (texto: string): string =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'paralelo'
