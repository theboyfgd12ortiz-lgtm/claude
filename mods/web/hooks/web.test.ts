import { expect, mock, test } from 'claude-code/testing'

import { analizarHtml, consultarServicios, direccionPublicada, enlacesDe, leerEstado, normalizarUrl, revisarSitio, type Get } from './sitio'

const BUENA = `<!doctype html><html lang="es"><head><title>Panadería Sol · pan artesanal en Cali</title>
<meta name="description" content="Pan artesanal hecho cada mañana en Cali. Pide por WhatsApp y recógelo caliente en nuestra tienda del barrio.">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta property="og:image" content="/og.png">
<link rel="icon" href="/favicon.ico"></head><body><h1>Pan de verdad</h1>
<img src="/a.jpg" alt="Pan recién horneado"><a href="/menu">Menú</a><a href="https://wa.me/573001112233">WhatsApp</a><a href="#top">arriba</a><a href="mailto:a@b.co">correo</a>
</body></html>`

const MALA = `<html><head></head><body><h1>Hola</h1><h1>Otra vez</h1><img src="http://cdn.x.com/a.jpg"><img src="b.jpg" alt=""><img src="c.jpg"></body></html>`

const pagina = (cuerpo: string, status = 200): Get => async () => ({ status, headers: { 'content-type': 'text/html; charset=utf-8' }, text: cuerpo })
const reloj = (...tiempos: number[]) => {
  let i = 0

  return async () => tiempos[Math.min(i++, tiempos.length - 1)] ?? 0
}

test('normaliza lo que la persona escribe', () => {
  expect(normalizarUrl('mi-sitio.netlify.app')).toBe('https://mi-sitio.netlify.app/')
  expect(normalizarUrl(' https://x.com/a?b=1 ')).toBe('https://x.com/a?b=1')
  expect(normalizarUrl('<http://localhost:3000>')).toBe('http://localhost:3000/')
  expect(normalizarUrl('javascript:alert(1)')).toBeNull()
  expect(normalizarUrl('ftp://x.com')).toBeNull()
  expect(normalizarUrl('dos palabras')).toBeNull()
  expect(normalizarUrl('')).toBeNull()
})

test('una página bien hecha saca buena nota y casi ningún problema', async () => {
  const r = await revisarSitio(pagina(BUENA), reloj(1000, 1300), 'https://panaderia.com/', 0)
  expect(r.puntos).toBeGreaterThanOrEqual(95)
  expect(r.ms).toBe(300)
  expect(r.hallazgos.filter(h => h.tono === 'bad')).toEqual([])
  expect(r.hallazgos.map(h => h.titulo)).toContain('Se adapta al celular')
})

test('una página descuidada dice qué falta, en palabras simples y lo urgente primero', async () => {
  const r = await revisarSitio(pagina(MALA), reloj(0, 4000), 'https://x.com/', 0)
  const titulos = r.hallazgos.map(h => h.titulo)
  expect(titulos).toContain('Falta el título')
  expect(titulos).toContain('Falta la descripción')
  expect(titulos).toContain('No está preparada para el celular')
  expect(titulos).toContain('Hay 2 títulos principales')
  expect(titulos).toContain('2 imágenes sin descripción') // alt="" es decorativa: solo cuentan las que no tienen alt
  expect(titulos).toContain('1 recurso sin https')
  expect(titulos).toContain('Tarda 4.0 s en responder')
  expect(r.puntos).toBeLessThan(25)
  expect(r.hallazgos[0]?.tono).toBe('bad')
})

test('una página caída o inexistente se dice sin más vueltas', async () => {
  const caida = await revisarSitio(pagina('', 500), reloj(0, 10), 'https://x.com/', 0)
  expect(caida.hallazgos[0]?.titulo).toBe('La página responde error 500')
  expect(caida.puntos).toBe(0)
  const sin: Get = async () => {
    throw new Error('red')
  }
  expect((await revisarSitio(sin, reloj(0), 'https://x.com/', 0)).hallazgos[0]?.titulo).toBe('No se pudo abrir la página')
})

test('comprueba los enlaces y avisa de los rotos', async () => {
  const get: Get = async url => {
    if (url === 'https://panaderia.com/') return { status: 200, headers: {}, text: BUENA }
    if (url.endsWith('/menu')) return { status: 404, headers: {}, text: '' }
    if (url.startsWith('https://wa.me')) return { status: 403, headers: {}, text: '' } // rechaza programas: no cuenta como roto

    return { status: 200, headers: {}, text: '' }
  }
  const r = await revisarSitio(get, reloj(0, 100), 'https://panaderia.com/', 12)
  expect(r.enlaces).toEqual({ revisados: 2, rotos: ['https://panaderia.com/menu (404)'] })
  expect(r.hallazgos.some(h => h.titulo === '1 enlace roto')).toBe(true)
})

test('los enlaces del propio sitio van primero y no se repiten', () => {
  const html = '<a href="https://otro.com/x">a</a><a href="/uno">b</a><a href="/uno#abajo">c</a><a href="javascript:void(0)">d</a>'
  expect(enlacesDe(html, 'https://sitio.com/', 10)).toEqual(['https://sitio.com/uno', 'https://otro.com/x'])
  expect(analizarHtml('<html lang="es"></html>', 'http://x.com/', { headers: {} }).hallazgos.some(h => h.titulo === 'Sin candado (https)')).toBe(true)
})

test('lee el estado de los servicios', async () => {
  expect(leerEstado('{"status":{"indicator":"none","description":"All Systems Operational"}}')).toEqual({ estado: 'ok', detalle: 'Todo funciona' })
  expect(leerEstado('{"status":{"indicator":"major","description":"Major Service Outage"}}')).toEqual({ estado: 'grave', detalle: 'Caído' })
  expect(leerEstado('{"status":{"indicator":"major","description":"Partial System Outage"}}')).toEqual({ estado: 'leve', detalle: 'Falla parcial' })
  expect(leerEstado('no es json').estado).toBe('desconocido')
  const get: Get = async url => {
    if (url.includes('netlify')) throw new Error('sin red')

    return { status: 200, headers: {}, text: '{"status":{"indicator":"minor","description":"Minor Service Outage"}}' }
  }
  const lista = await consultarServicios(get, 5)
  expect(lista.find(s => s.id === 'github')?.estado).toBe('leve')
  expect(lista.find(s => s.id === 'netlify')?.estado).toBe('desconocido')
})

test('reconoce una publicación y su dirección', () => {
  const salida = 'Deploying...\nWebsite URL: https://abc123--mi-sitio.netlify.app\nProduction URL: https://mi-sitio.netlify.app\n'
  expect(direccionPublicada('netlify deploy --prod', salida)).toBe('https://mi-sitio.netlify.app')
  expect(direccionPublicada('vercel --prod', 'Production: https://mi-app.vercel.app [3s]')).toBe('https://mi-app.vercel.app')
  expect(direccionPublicada('ls', salida)).toBeNull()
  expect(direccionPublicada('netlify deploy', 'sin direcciones')).toBeNull()
})

test('/sitio revisa la dirección y la deja para el panel; al publicar se revisa solo', async ($, on) => {
  const reloj_ = mock.clock(on)
  mock.store(on)
  on('ui.toast', (() => ({ value: undefined })) as never)
  const pedidas: string[] = []
  on('http.fetch', ((_$: unknown, e: { url: string }) => {
    pedidas.push(e.url)

    return { value: { status: 200, ok: true, headers: { 'content-type': 'text/html' }, text: e.url.includes('status.json') ? '{"status":{"indicator":"none"}}' : BUENA } }
  }) as never)
  on('tool.call', { tool: 'Bash' }, (() => ({ result: { stdout: 'Production URL: https://mi-sitio.netlify.app\n', stderr: '', interrupted: false } })) as never)
  const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

  const r = await $.command.run({ command: 'sitio', args: 'panaderia.com', ...CMD } as never)
  expect(r.text).toMatch(/^https:\/\/panaderia\.com\/: \d+\/100/)
  expect((await $.command.run({ command: 'sitio', args: 'dos palabras', ...CMD } as never)).text).toMatch(/Escribe la dirección/)

  await $.tool.call({ tool: 'Bash', command: 'netlify deploy --prod' } as never)
  await reloj_.advance(5000)
  expect(pedidas).toContain('https://mi-sitio.netlify.app')
})
