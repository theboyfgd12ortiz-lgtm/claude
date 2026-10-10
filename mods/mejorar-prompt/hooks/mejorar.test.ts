import { expect, test } from 'claude-code/testing'

import { AVISO, esVago, limpiar } from './register'

const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

test('limpia lo que rodea la respuesta', () => {
  expect(limpiar('Aquí está el pedido mejorado:\nHaz X')).toBe('Haz X')
  expect(limpiar('"Haz X"')).toBe('Haz X')
})

test('reconoce un pedido corto de crear algo y deja pasar lo demás', () => {
  expect(esVago('haz una página para mi panadería')).toBe(true)
  expect(esVago('necesito un logo para mi negocio')).toBe(true)
  expect(esVago('hola')).toBe(false)
  expect(esVago('sí, hazlo')).toBe(false)
  expect(esVago('¿cómo funciona esto?')).toBe(false)
  expect(esVago('/mods')).toBe(false)
  expect(esVago('arregla el error de login en app.ts')).toBe(false)
  expect(esVago('crea una página con estas secciones:\n- inicio\n- precios\n- contacto')).toBe(false)
})

test('un pedido vago llega con la indicación para Claude y el texto intacto', async ($, on) => {
  let visto: { text: string; context?: readonly string[] } | undefined
  on('prompt.submit', (_$, e) => {
    visto = { text: e.text, context: e.context }

    return { text: e.text, context: e.context } as never
  })
  await $.prompt.submit({ text: 'haz una página para mi panadería', wait: false, origin: { kind: 'composer' } } as never)
  expect(visto?.text).toBe('haz una página para mi panadería')
  expect(visto?.context).toContain(AVISO)

  await $.prompt.submit({ text: 'gracias, perfecto', wait: false, origin: { kind: 'composer' } } as never)
  expect(visto?.context ?? []).not.toContain(AVISO)
})

test('/mejorar usa el borrador del cuadro y lo deja mejorado', async ($, on) => {
  let cuadro = ''
  let pedido = ''
  on('prompt.read', () => ({ value: { text: 'haz pagina panaderia', cursor: 0 } }) as never)
  on('model.complete', (_$, e) => {
    pedido = (e as { prompt: string }).prompt

    return { value: { isAnswered: true, text: 'Crea una landing para mi panadería.\nDetalles:\n- ...', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } } as never
  })
  on('prompt.fill', (_$, e) => {
    cuadro = (e as { text: string }).text

    return { isFilled: true, text: cuadro, cursor: 0 } as never
  })

  const r = await $.command.run({ command: 'mejorar', args: '', ...CMD } as never)
  expect(pedido).toBe('haz pagina panaderia')
  expect(cuadro).toMatch(/^Crea una landing/)
  expect(r.text).toMatch(/revísalo/)
})

test('/mejorar con el cuadro vacío explica qué hacer', async ($, on) => {
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
  const r = await $.command.run({ command: 'mejorar', args: '  ', ...CMD } as never)
  expect(r.text).toMatch(/Escribe tu pedido/)
})
