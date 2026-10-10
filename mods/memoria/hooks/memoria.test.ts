import { expect, mock, test } from 'claude-code/testing'

import { aceptar, contarNotas, PEDIDO, sinCabecera, tocaActualizar } from './notas'

const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

test('acepta una lista corta y rechaza lo que no es una lista', () => {
  expect(aceptar('- Sitio estático en Netlify\n- Publicar: netlify deploy --prod')).toBe('- Sitio estático en Netlify\n- Publicar: netlify deploy --prod')
  expect(aceptar('* viñeta con asterisco\n• otra')).toBe('- viñeta con asterisco\n- otra')
  expect(aceptar('SIN_CAMBIOS')).toBeNull()
  expect(aceptar('Claro, aquí tienes las notas:\n- algo')).toBeNull()
  expect(aceptar('')).toBeNull()
  expect(aceptar(Array.from({ length: 30 }, (_, i) => `- nota ${i}`).join('\n'))).toBeNull()
})

test('nunca guarda claves, aunque el modelo las ponga', () => {
  expect(aceptar('- usa la clave ' + 'sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz')).toBeNull()
  expect(aceptar('- token ' + 'ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789')).toBeNull()
})

test('cuenta notas, quita la cabecera y decide cuándo actualizar', () => {
  expect(contarNotas('- a\n  detalle\n- b')).toBe(2)
  expect(sinCabecera('<!-- memoria 2026-10-10 -->\n\n- a\n')).toBe('- a')
  expect(tocaActualizar({ ediciones: 3, ahora: 10 * 60_000, ultimo: 0 })).toBe(true)
  expect(tocaActualizar({ ediciones: 1, ahora: 10 * 60_000, ultimo: 0 })).toBe(false)
  expect(tocaActualizar({ ediciones: 5, ahora: 60_000, ultimo: 0 })).toBe(false)
  expect(PEDIDO('- x')).toContain('- x')
})

test('lee las notas al empezar y las pone en el prompt; después de trabajar las actualiza solo', async ($, on) => {
  const reloj = mock.clock(on)
  mock.store(on)
  const archivos = new Map<string, string>([['.claude/memoria.md', '<!-- memoria 2026-10-01T00:00:00.000Z -->\n\n- Sitio de Panadería Sol, estático\n']])
  const quitar = (r: string) => r.replace(/^.*?(\.claude\/memoria\.md)$/, '$1')
  on('fs.read', ((_$: unknown, e: { path: string }) => {
    const t = archivos.get(quitar(e.path))
    if (t === undefined) throw new Error('no existe')

    return { value: t }
  }) as never)
  on('fs.write', ((_$: unknown, e: { path: string; text: string }) => {
    archivos.set(quitar(e.path), e.text)

    return { value: undefined }
  }) as never)
  on('command.register', (() => ({ value: { command: 'x' } })) as never)
  on('session.start', (() => ({ cwd: '/r' })) as never)
  on('prompt.compose', (() => ({ sections: [{ id: 'intro', text: 'hola', scope: 'shared' }] })) as never)
  on('tool.call', { tool: 'Edit' }, (() => ({ result: { filePath: 'x' } })) as never)
  on('turn.complete', (() => ({ text: 'ok' })) as never)
  let pregunta = ''
  on('model.fork', ((_$: unknown, e: { prompt: string }) => {
    pregunta = e.prompt

    return { value: { isAnswered: true, text: '- Sitio de Panadería Sol, estático\n- Publicar: netlify deploy --prod', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
  }) as never)

  await $.session.start({ cwd: '/r', surface: 'desktop', isInteractive: true, source: 'startup' } as never)
  const compuesto = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
  expect(compuesto.sections.map(s => s.id)).toContain('memoria:proyecto')
  expect(compuesto.sections.find(s => s.id === 'memoria:proyecto')?.text).toMatch(/Panadería Sol/)

  for (const n of [1, 2]) await $.tool.call({ tool: 'Edit', file_path: `/r/p${n}.html`, old_string: 'a', new_string: 'b' } as never)
  await reloj.advance(10 * 60_000)
  await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't' } as never)
  await reloj.advance(0)
  expect(pregunta).toMatch(/Panadería Sol/)
  expect(archivos.get('.claude/memoria.md')).toMatch(/netlify deploy --prod/)
})

test('/memoria muestra, actualiza y borra', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('fs.read', (() => {
    throw new Error('no existe')
  }) as never)
  on('fs.write', (() => ({ value: undefined })) as never)
  expect((await $.command.run({ command: 'memoria', args: '', ...CMD } as never)).text).toMatch(/Todavía no hay notas/)
  expect((await $.command.run({ command: 'memoria', args: 'borrar', ...CMD } as never)).text).toMatch(/Memoria borrada/)
})
