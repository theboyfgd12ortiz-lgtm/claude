import { expect, test } from 'claude-code/testing'

import { limpiar } from './register'

const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

test('limpia lo que rodea la respuesta', () => {
  expect(limpiar('Aquí está el pedido mejorado:\nHaz X')).toBe('Haz X')
  expect(limpiar('"Haz X"')).toBe('Haz X')
})

test('/mejorar deja el pedido mejorado en el cuadro', async ($, on) => {
  let cuadro = ''
  let pedido = ''
  on('model.complete', (_$, e) => {
    pedido = (e as { prompt: string }).prompt

    return { value: { isAnswered: true, text: 'Crea una landing para mi panadería.\nDetalles:\n- ...', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } } as never
  })
  on('prompt.fill', (_$, e) => {
    cuadro = (e as { text: string }).text

    return { isFilled: true, text: cuadro, cursor: 0 } as never
  })

  const r = await $.command.run({ command: 'mejorar', args: 'haz pagina panaderia', ...CMD } as never)
  expect(pedido).toBe('haz pagina panaderia')
  expect(cuadro).toMatch(/^Crea una landing/)
  expect(r.text).toMatch(/revísalo/)
})

test('/mejorar sin texto explica cómo usarlo', async $ => {
  const r = await $.command.run({ command: 'mejorar', args: '  ', ...CMD } as never)
  expect(r.text).toMatch(/Escribe el pedido/)
})
