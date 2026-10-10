import { expect, mock, test } from 'claude-code/testing'

import { ARCHIVO, mensajeRetomar, resumenDe, tocaGuardar } from './register'

const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
const OK = { isAnswered: true, text: '## Objetivo\nLanding de la panadería\n## Hecho\nnada', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
const quitarRuta = (ruta: string) => ruta.replace(/^.*?(\.claude\/|(?=traspaso\.md$))/, '$1')

test('decide cuándo guardar solo', () => {
  const base = { ahora: 1_000_000, ultimo: 0, porcientoUltimo: 0 }
  expect(tocaGuardar({ ...base, porciento: 20, tokens: 30_000 })).toBe(false)
  expect(tocaGuardar({ ...base, porciento: 50, tokens: 100_000 })).toBe(true)
  expect(tocaGuardar({ ...base, porciento: undefined, tokens: 95_000 })).toBe(true)
  // Ya guardó hace poco, o la charla casi no creció desde entonces.
  expect(tocaGuardar({ ahora: 1_000_000, ultimo: 900_000, porciento: 60, tokens: 1, porcientoUltimo: 40 })).toBe(false)
  expect(tocaGuardar({ ahora: 5_000_000, ultimo: 900_000, porciento: 50, tokens: 1, porcientoUltimo: 46 })).toBe(false)
  expect(tocaGuardar({ ahora: 5_000_000, ultimo: 900_000, porciento: 62, tokens: 1, porcientoUltimo: 46 })).toBe(true)
})

test('toma el objetivo como resumen', () => {
  expect(resumenDe('<!-- traspaso 2026-10-10T10:00:00.000Z -->\n\n## Objetivo\nLanding de la panadería\n## Hecho\nx')).toBe('Landing de la panadería')
})

test('/guardar resume con un fork y /retomar deja la nota en el cuadro', async ($, on) => {
  mock.clock(on)
  const archivos = new Map<string, string>()
  let cuadro = ''
  on('model.fork', () => ({ value: OK }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('fs.write', (_$, e) => {
    archivos.set(quitarRuta((e as { path: string }).path), (e as { text: string }).text)

    return { value: undefined } as never
  })
  on('fs.read', (_$, e) => {
    const t = archivos.get(quitarRuta((e as { path: string }).path))
    if (t === undefined) throw new Error('no existe')

    return { value: t } as never
  })
  on('prompt.fill', (_$, e) => {
    cuadro = (e as { text: string }).text

    return { isFilled: true, text: cuadro, cursor: cuadro.length } as never
  })

  const guardado = await $.command.run({ command: 'guardar', args: '', ...CMD } as never)
  expect(guardado.text).toMatch(/Nota guardada en \.claude\/traspaso\.md/)
  expect(archivos.get(ARCHIVO)).toMatch(/Landing de la panadería/)

  await $.command.run({ command: 'retomar', args: '', ...CMD } as never)
  expect(cuadro).toBe(mensajeRetomar('## Objetivo\nLanding de la panadería\n## Hecho\nnada\n'))
})

test('guarda solo al terminar una respuesta con la conversación llena', async ($, on) => {
  const reloj = mock.clock(on)
  mock.store(on)
  const archivos = new Map<string, string>()
  let forks = 0
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 55, tokens: 110_000 }, rateLimits: [] } }) as never)
  on('model.fork', () => {
    forks += 1

    return { value: OK } as never
  })
  on('ui.toast', () => ({ value: undefined }) as never)
  on('fs.write', (_$, e) => {
    archivos.set(quitarRuta((e as { path: string }).path), (e as { text: string }).text)

    return { value: undefined } as never
  })
  on('fs.read', (_$, e) => {
    const t = archivos.get(quitarRuta((e as { path: string }).path))
    if (t === undefined) throw new Error('no existe')

    return { value: t } as never
  })
  on('turn.complete', () => ({ text: 'ok' }))
  const turno = { reason: 'answer', answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't' } as never

  await reloj.advance(1_000_000)
  await $.turn.complete(turno)
  await reloj.advance(0)
  expect(forks).toBe(1)
  expect(archivos.get(ARCHIVO)).toMatch(/<!-- traspaso \S+ auto -->/)

  // Otra respuesta enseguida: no vuelve a guardar.
  await $.turn.complete(turno)
  await reloj.advance(0)
  expect(forks).toBe(1)
})

test('sin conversación no hay nada que guardar', async ($, on) => {
  on('model.fork', () => ({ value: { isAnswered: false, reason: 'nothing-to-fork', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) as never)
  const r = await $.command.run({ command: 'guardar', args: '', ...CMD } as never)
  expect(r.text).toMatch(/Todavía no hay nada/)
})
