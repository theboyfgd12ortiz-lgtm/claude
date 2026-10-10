import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Informe } from '../types'
import { consultarServicios, direccionPublicada, normalizarUrl, revisarSitio, type Get } from './sitio'

const informe = atom({ plugin: 'web', key: 'informe' } as const, null)
const servicios = atom({ plugin: 'web', key: 'servicios' } as const, [])
const urls = atom({ plugin: 'web', key: 'urls' } as const, [])
const ocupado = atom({ plugin: 'web', key: 'ocupado' } as const, null)
const isAuto = atom({ plugin: 'web', key: 'isAuto' } as const, true)

/** Enlaces que se comprueban en una revisión completa (la rápida, al publicar, no comprueba ninguno). */
const ENLACES = 12

/** Pide una dirección a través del anfitrión; una respuesta de error (404, 500…) también es una respuesta. */
const pedir = ($: EngineInterface): Get => async url => {
  const r = await $.http.fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; claude-mods-web/1.0)', accept: 'text/html,application/json;q=0.9,*/*;q=0.5' } })

  return { status: r.status, headers: r.headers, text: r.text }
}

const recordarUrl = async ($: EngineInterface, url: string) => {
  const lista = [url, ...(await read($, urls)).filter(u => u !== url)].slice(0, 5)
  await update($, urls, () => lista)
  await $.store.set('urls', lista).catch(() => undefined)
}

const refrescarServicios = async ($: EngineInterface) => {
  const lista = await consultarServicios(pedir($), await $.clock.now())
  await update($, servicios, () => lista)

  return lista
}

/** Revisa una página, guarda el informe para el panel y devuelve un resumen corto. */
const revisar = async ($: EngineInterface, url: string, enlaces: number, auto: boolean): Promise<Informe> => {
  await update($, ocupado, () => url)
  try {
    const r = await revisarSitio(pedir($), () => $.clock.now(), url, enlaces, auto)
    await update($, informe, () => r)
    await recordarUrl($, url)

    return r
  } finally {
    await update($, ocupado, () => null)
  }
}

const resumen = (r: Informe): string => {
  const malos = r.hallazgos.filter(h => h.tono === 'bad').map(h => h.titulo)
  const flojos = r.hallazgos.filter(h => h.tono === 'warn').length
  if (r.status === 0 || r.status >= 400) return `${r.url}: ${r.hallazgos[0]?.titulo ?? 'no se pudo revisar'}.`

  return `${r.url}: ${r.puntos}/100 · responde en ${r.ms} ms${malos.length > 0 ? ` · urge: ${malos.slice(0, 3).join(', ')}` : ''}${flojos > 0 ? ` · ${flojos} cosas por mejorar` : ''}. Detalle en /mods → Web.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sitio',
      description: 'Revisa una página web: /sitio <dirección> · servicios · auto on|off',
      argumentHint: '<dirección> | servicios | auto on|off',
    })
    const guardadas = await $.store.get('urls').catch(() => undefined)
    if (Array.isArray(guardadas)) await update($, urls, () => guardadas.filter((u): u is string => typeof u === 'string').slice(0, 5))
    if ((await $.store.get('isAuto').catch(() => undefined)) === false) await update($, isAuto, () => false)
    // El estado de los servicios se mira al empezar, sin que nadie espere por eso.
    void refrescarServicios($).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'sitio' }, async ($, e) => {
    const arg = e.args.trim()
    const baja = arg.toLowerCase()

    if (baja === 'servicios') {
      const lista = await refrescarServicios($)

      return { text: lista.map(s => `${s.estado === 'ok' ? '✓' : s.estado === 'desconocido' ? '?' : '✕'} ${s.nombre}: ${s.detalle}`).join('\n') }
    }
    if (baja === 'auto on' || baja === 'auto off') {
      const on_ = baja.endsWith('on')
      await update($, isAuto, () => on_)
      await $.store.set('isAuto', on_).catch(() => undefined)

      return { text: `Revisión automática al publicar ${on_ ? 'activada' : 'apagada'}.` }
    }

    const url = normalizarUrl(arg === '' ? ((await read($, urls))[0] ?? '') : arg)
    if (url === null) return { text: 'Escribe la dirección de la página, por ejemplo: /sitio mi-panaderia.netlify.app' }
    const r = await revisar($, url, ENLACES, false)

    return { text: resumen(r) }
  })

  // Publicar es el momento de mirar: si un comando de publicación imprimió la dirección, se revisa solo.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true || !(await read($, isAuto))) return ran
    const salida = `${ran.result.stdout}\n${ran.result.stderr}`
    const direccion = direccionPublicada(e.command, salida)
    if (direccion === null) return ran

    // Sin esperar: la respuesta de Claude no se demora por esta revisión.
    void (async () => {
      // Las plataformas tardan unos segundos en servir lo recién publicado.
      await $.clock.sleep(4000)
      const r = await revisar($, direccion, 0, true)
      $.ui.toast(r.status === 0 || r.status >= 400 ? `Publicado, pero ${direccion} responde ${r.status || 'sin conexión'}: revísalo.` : `Publicado: ${direccion} → ${r.puntos}/100 en ${r.ms} ms.`)
    })().catch(() => undefined)

    return ran
  }).catch(($, e, next) => next(e))
}
