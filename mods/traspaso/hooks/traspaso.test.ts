import { expect, mock, test } from 'claude-code/testing'

import { ARCHIVO, mensajeRetomar } from './register'

const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

test('/guardar resume con un fork y /retomar deja la nota en el cuadro', async ($, on) => {
  mock.clock(on)
  const archivos = new Map<string, string>()
  let cuadro = ''
  on('model.fork', () => ({ value: { isAnswered: true, text: '## Objetivo\nLanding de la panadería', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) as never)
  on('fs.write', (_$, e) => {
    // The engine hands the path resolved against the working folder; keep it relative, as the mod wrote it.
    archivos.set((e as { path: string }).path.replace(/^.*?(\.claude\/|(?=traspaso\.md$))/, '$1'), (e as { text: string }).text)

    return { value: undefined } as never
  })
  on('fs.read', (_$, e) => {
    const t = archivos.get((e as { path: string }).path.replace(/^.*?(\.claude\/|(?=traspaso\.md$))/, '$1'))
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
  expect(cuadro).toBe(mensajeRetomar('## Objetivo\nLanding de la panadería\n'))
})

test('sin conversación no hay nada que guardar', async ($, on) => {
  on('model.fork', () => ({ value: { isAnswered: false, reason: 'nothing-to-fork', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) as never)
  const r = await $.command.run({ command: 'guardar', args: '', ...CMD } as never)
  expect(r.text).toMatch(/Todavía no hay nada/)
})
