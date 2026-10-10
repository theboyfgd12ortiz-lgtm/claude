// Revisión de una página web: sin `$`. Recibe una función `get` para poder probarla sin red.

import type { Hallazgo, Informe, Servicio } from '../types'

export type Respuesta = { status: number; headers: Record<string, string>; text: string }
export type Get = (url: string) => Promise<Respuesta>

/** Deja una dirección lista para pedirla: añade https:// si falta y rechaza lo que no es una página. */
export const normalizarUrl = (entrada: string): string | null => {
  const t = entrada.trim().replace(/^<|>$/g, '')
  if (t === '' || /\s/.test(t)) return null
  const conEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(conEsquema)

    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

const atributos = (etiqueta: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const m of etiqueta.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[(m[1] ?? '').toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
  }

  return out
}

const etiquetas = (html: string, nombre: string): Record<string, string>[] =>
  [...html.matchAll(new RegExp(`<${nombre}\\b[^>]*>`, 'gi'))].map(m => atributos(m[0]))

const meta = (html: string, clave: string): string | undefined =>
  etiquetas(html, 'meta').find(a => (a.name ?? a.property ?? '').toLowerCase() === clave)?.content

const limpiar = (t: string): string => t.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

/** Los enlaces de la página que vale la pena comprobar: http(s), sin repetir, los del propio sitio primero. */
export const enlacesDe = (html: string, base: string, maximo: number): string[] => {
  const propio = new URL(base).host
  const vistos = new Set<string>()
  for (const a of etiquetas(html, 'a')) {
    const href = (a.href ?? '').trim()
    if (href === '' || href.startsWith('#') || /^(mailto|tel|javascript|sms|whatsapp):/i.test(href)) continue
    try {
      const u = new URL(href, base)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
      u.hash = ''
      vistos.add(u.toString())
    } catch {
      // Una dirección mal escrita en la página: ya se verá como falta de enlace.
    }
  }
  const todos = [...vistos]
  const delSitio = todos.filter(u => new URL(u).host === propio)

  return [...delSitio, ...todos.filter(u => !delSitio.includes(u))].slice(0, maximo)
}

/** Revisa el HTML de la página (sin red). Devuelve lo encontrado y los puntos que restan. */
export const analizarHtml = (html: string, url: string, respuesta: Pick<Respuesta, 'headers'>): { hallazgos: Hallazgo[]; resta: number } => {
  const hallazgos: Hallazgo[] = []
  let resta = 0
  const falla = (puntos: number, tono: 'warn' | 'bad', titulo: string, detalle: string) => {
    resta += puntos
    hallazgos.push({ tono, titulo, detalle })
  }
  const bien = (titulo: string, detalle: string) => hallazgos.push({ tono: 'ok', titulo, detalle })

  if (url.startsWith('https://')) bien('Conexión segura', 'La página usa https (candado).')
  else falla(15, 'bad', 'Sin candado (https)', 'Los navegadores marcan la página como "no segura" y Google la baja. Publícala con https.')

  const titulo = limpiar(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')
  if (titulo === '') falla(15, 'bad', 'Falta el título', 'Es lo que aparece en la pestaña y en Google. Sin él, la página se ve abandonada.')
  else if (titulo.length < 10 || titulo.length > 65) falla(4, 'warn', `Título de ${titulo.length} letras`, `"${titulo.slice(0, 60)}": lo ideal es entre 10 y 60 para que Google no lo corte.`)
  else bien('Título', `"${titulo}"`)

  const descripcion = (meta(html, 'description') ?? '').trim()
  if (descripcion === '') falla(10, 'bad', 'Falta la descripción', 'Es el texto que Google muestra bajo el título. Con 50 a 160 letras convence más gente de entrar.')
  else if (descripcion.length < 50 || descripcion.length > 170) falla(3, 'warn', `Descripción de ${descripcion.length} letras`, 'Lo ideal es entre 50 y 160.')
  else bien('Descripción para Google', `${descripcion.length} letras.`)

  if (meta(html, 'viewport') === undefined) falla(15, 'bad', 'No está preparada para el celular', 'Falta la etiqueta "viewport": en el teléfono se vería diminuta, y casi todos tus visitantes están en el teléfono.')
  else bien('Se adapta al celular', 'Tiene la etiqueta viewport.')

  const h1 = (html.match(/<h1\b/gi) ?? []).length
  if (h1 === 0) falla(8, 'warn', 'No hay un título principal (h1)', 'Cada página necesita uno: le dice a Google y a quien lee de qué trata.')
  else if (h1 > 1) falla(3, 'warn', `Hay ${h1} títulos principales`, 'Lo normal es uno por página.')
  else bien('Un título principal', 'Hay un solo h1.')

  if (!/<html\b[^>]*\blang\s*=/i.test(html)) falla(5, 'warn', 'No dice en qué idioma está', 'Agrega lang="es" a la etiqueta html: ayuda a Google y a los lectores de pantalla.')

  const imagenes = etiquetas(html, 'img')
  const sinAlt = imagenes.filter(a => a.alt === undefined).length
  if (sinAlt > 0) falla(Math.min(10, sinAlt * 2), 'warn', `${sinAlt} ${sinAlt === 1 ? 'imagen' : 'imágenes'} sin descripción`, 'Falta el texto "alt": sin él, las personas con lector de pantalla no saben qué muestran y Google tampoco.')
  else if (imagenes.length > 0) bien('Imágenes con descripción', `${imagenes.length} imágenes, todas con alt.`)

  if (!etiquetas(html, 'link').some(a => (a.rel ?? '').toLowerCase().includes('icon'))) falla(3, 'warn', 'Falta el ícono de la pestaña', 'Sin favicon, la pestaña muestra un cuadro en blanco.')
  if (meta(html, 'og:image') === undefined) falla(3, 'warn', 'No tiene imagen para compartir', 'Sin "og:image", al enviar el enlace por WhatsApp o redes no sale una vista previa.')

  if (url.startsWith('https://')) {
    const recursos = [...etiquetas(html, 'img'), ...etiquetas(html, 'script'), ...etiquetas(html, 'link')].filter(a => /^http:\/\//i.test(a.src ?? a.href ?? '')).length
    if (recursos > 0) falla(10, 'bad', `${recursos} recurso${recursos === 1 ? '' : 's'} sin https`, 'La página segura carga imágenes o archivos inseguros: el navegador los bloquea o muestra una advertencia.')
  }

  const cabecera = respuesta.headers['content-type'] ?? ''
  if (cabecera !== '' && !/text\/html/i.test(cabecera)) falla(0, 'warn', 'No es una página HTML', `El servidor responde "${cabecera.split(';')[0]}".`)

  return { hallazgos, resta }
}

const bytes = (t: string): number => new TextEncoder().encode(t).length

/**
 * Revisa una página: la pide, analiza su HTML y, si se pide, comprueba algunos enlaces.
 * `ahora` mide el tiempo de respuesta; `enlaces` en 0 hace una revisión rápida (la que corre al publicar).
 */
export const revisarSitio = async (get: Get, ahora: () => Promise<number>, url: string, enlaces: number, isAuto = false): Promise<Informe> => {
  const t0 = await ahora()
  let r: Respuesta
  try {
    r = await get(url)
  } catch {
    return {
      url,
      at: t0,
      puntos: 0,
      status: 0,
      ms: 0,
      kb: 0,
      hallazgos: [{ tono: 'bad', titulo: 'No se pudo abrir la página', detalle: 'La dirección no responde. Revisa que esté bien escrita y que el sitio esté publicado.' }],
      enlaces: null,
      isAuto,
    }
  }
  const ms = Math.max(0, (await ahora()) - t0)
  if (r.status >= 400) {
    return {
      url,
      at: t0,
      puntos: 0,
      status: r.status,
      ms,
      kb: Math.round(bytes(r.text) / 1024),
      hallazgos: [{ tono: 'bad', titulo: `La página responde error ${r.status}`, detalle: r.status === 404 ? 'No existe esa dirección (404).' : r.status >= 500 ? 'El servidor falla (error 5xx): el sitio está caído o roto.' : 'El servidor rechaza la visita.' }],
      enlaces: null,
      isAuto,
    }
  }

  const { hallazgos, resta } = analizarHtml(r.text, url, r)
  let puntos = 100 - resta
  const kb = Math.round(bytes(r.text) / 1024)
  if (ms > 3000) {
    puntos -= 10
    hallazgos.push({ tono: 'bad', titulo: `Tarda ${(ms / 1000).toFixed(1)} s en responder`, detalle: 'Más de 3 segundos hace que la gente se vaya. Revisa el alojamiento o el peso de la página.' })
  } else if (ms > 1500) {
    puntos -= 5
    hallazgos.push({ tono: 'warn', titulo: `Tarda ${(ms / 1000).toFixed(1)} s en responder`, detalle: 'Aceptable, pero lo ideal es menos de 1,5 segundos.' })
  } else hallazgos.push({ tono: 'ok', titulo: 'Responde rápido', detalle: `${ms} ms.` })
  if (kb > 500) {
    puntos -= 5
    hallazgos.push({ tono: 'warn', titulo: `El HTML pesa ${kb} KB`, detalle: 'Es mucho para una sola página; suele ser código o imágenes metidas dentro.' })
  }

  let resumen: Informe['enlaces'] = null
  if (enlaces > 0) {
    const lista = enlacesDe(r.text, url, enlaces)
    const rotos: string[] = []
    for (const e of lista) {
      try {
        const x = await get(e)
        // 403 y 429 suelen ser el sitio rechazando a un programa, no un enlace roto.
        if (x.status >= 400 && x.status !== 403 && x.status !== 429 && x.status !== 999) rotos.push(`${e} (${x.status})`)
      } catch {
        rotos.push(`${e} (no responde)`)
      }
    }
    resumen = { revisados: lista.length, rotos }
    if (rotos.length > 0) {
      puntos -= Math.min(20, rotos.length * 5)
      hallazgos.push({ tono: 'bad', titulo: `${rotos.length} enlace${rotos.length === 1 ? '' : 's'} roto${rotos.length === 1 ? '' : 's'}`, detalle: rotos.slice(0, 4).join(' · ') })
    } else if (lista.length > 0) hallazgos.push({ tono: 'ok', titulo: 'Los enlaces funcionan', detalle: `Probé ${lista.length} y todos responden.` })
  }

  const orden = { bad: 0, warn: 1, ok: 2 } as const

  return {
    url,
    at: t0,
    puntos: Math.max(0, Math.min(100, Math.round(puntos))),
    status: r.status,
    ms,
    kb,
    hallazgos: hallazgos.sort((a, b) => orden[a.tono] - orden[b.tono]),
    enlaces: resumen,
    isAuto,
  }
}

/** Los servicios que se consultan: todos publican su estado con el mismo formato (Statuspage). */
export const SERVICIOS = [
  { id: 'github', nombre: 'GitHub', url: 'https://www.githubstatus.com/api/v2/status.json' },
  { id: 'netlify', nombre: 'Netlify', url: 'https://www.netlifystatus.com/api/v2/status.json' },
  { id: 'supabase', nombre: 'Supabase', url: 'https://status.supabase.com/api/v2/status.json' },
  { id: 'claude', nombre: 'Claude', url: 'https://status.claude.com/api/v2/status.json' },
  { id: 'cloudflare', nombre: 'Cloudflare', url: 'https://www.cloudflarestatus.com/api/v2/status.json' },
] as const

const TRADUCCION: Record<string, string> = {
  'All Systems Operational': 'Todo funciona',
  'Minor Service Outage': 'Falla leve',
  'Partial System Outage': 'Falla parcial',
  'Major Service Outage': 'Caído',
  'Service Under Maintenance': 'En mantenimiento',
  'Partially Degraded Service': 'Servicio algo lento o con fallas',
  'Degraded Performance': 'Lento',
}

/** Lee la respuesta de una página de estado. */
export const leerEstado = (texto: string): { estado: Servicio['estado']; detalle: string } => {
  try {
    const s = (JSON.parse(texto) as { status?: { indicator?: string; description?: string } }).status
    const detalle = TRADUCCION[s?.description ?? ''] ?? s?.description ?? ''
    if (s?.indicator === 'none') return { estado: 'ok', detalle: detalle || 'Todo funciona' }
    if (s?.indicator === 'minor') return { estado: 'leve', detalle: detalle || 'Falla leve' }
    // Una falla "parcial" avisa, pero no es lo mismo que estar caído.
    if (s?.indicator === 'major' && /partial/i.test(s.description ?? '')) return { estado: 'leve', detalle }
    if (s?.indicator === 'major' || s?.indicator === 'critical') return { estado: 'grave', detalle: detalle || 'Caído' }
  } catch {
    // Una respuesta que no es JSON: se informa como desconocido.
  }

  return { estado: 'desconocido', detalle: 'No pude consultarlo' }
}

export const consultarServicios = async (get: Get, ahora: number): Promise<Servicio[]> =>
  Promise.all(
    SERVICIOS.map(async s => {
      try {
        const r = await get(s.url)

        return { id: s.id, nombre: s.nombre, at: ahora, ...(r.status === 200 ? leerEstado(r.text) : { estado: 'desconocido' as const, detalle: 'No pude consultarlo' }) }
      } catch {
        return { id: s.id, nombre: s.nombre, at: ahora, estado: 'desconocido' as const, detalle: 'No pude consultarlo' }
      }
    }),
  )

const COMANDO_PUBLICAR = /\b(netlify\s+deploy|vercel(\s+deploy|\s+--prod)?|firebase\s+deploy|wrangler\s+(pages\s+)?(deploy|publish)|surge|gh-pages|npm\s+run\s+(deploy|publish)|pnpm\s+(run\s+)?deploy)\b/i
const DIRECCION_PUBLICADA = /https:\/\/[\w.-]+\.(?:netlify\.app|vercel\.app|pages\.dev|web\.app|firebaseapp\.com|surge\.sh|github\.io|workers\.dev)(?:\/[^\s"')\]>]*)?/gi

/** Si un comando publicó un sitio, la dirección que imprimió (la última: es la definitiva). */
export const direccionPublicada = (comando: string, salida: string): string | null => {
  if (!COMANDO_PUBLICAR.test(comando)) return null
  const todas = salida.match(DIRECCION_PUBLICADA)

  return todas === null ? null : (todas[todas.length - 1] ?? null)
}
