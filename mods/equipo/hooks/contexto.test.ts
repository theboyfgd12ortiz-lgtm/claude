import { expect, mock, test } from 'claude-code/testing'

import { AVISO_COMPACTAR, avisoDeTrabajo, LIMITE, pistaDeEquipo, trabajoNuevo } from './contexto'

test('la pista depende del contexto; sin nada que decir no añade nada', () => {
  expect(pistaDeEquipo({ contexto: 20 })).toBeUndefined()
  const p = pistaDeEquipo({ contexto: 55 })
  expect(p).toMatch(/al 55%.*explorador/)
  expect(p?.startsWith('<equipo>')).toBe(true)
  expect(pistaDeEquipo({ contexto: 82 })).toMatch(/al 82%.*\/compact/)
})

test('con ventana grande el contexto también se mide en tokens', () => {
  expect(pistaDeEquipo({ contexto: 12, tokens: 90_000 })).toMatch(/~90k tokens/)
  expect(pistaDeEquipo({ contexto: 15, tokens: 160_000 })).toMatch(/\/compact/)
  expect(pistaDeEquipo({ contexto: 5, tokens: 20_000 })).toBeUndefined()
})

test('al compactar solo se pide conservar el plan', () => {
  expect(AVISO_COMPACTAR).toMatch(/plan.*hechos o pendientes/)
  expect(AVISO_COMPACTAR).not.toMatch(/pizarra/)
})

test('con el presupuesto apretado la pista manda no delegar', () => {
  expect(pistaDeEquipo({ contexto: 0, apretado: true })).toMatch(/solo lo fundamental.*máximo 2 agentes/)
})

test('avisa una vez por tipo cuando el director lee o edita mucho él mismo', () => {
  expect(avisoDeTrabajo({ ...trabajoNuevo(), lecturas: LIMITE.lecturas - 1 })).toBeUndefined()
  expect(avisoDeTrabajo({ ...trabajoNuevo(), lecturas: LIMITE.lecturas })?.texto).toMatch(/equipo:explorador/)
  expect(avisoDeTrabajo({ ...trabajoNuevo(), caracteres: LIMITE.caracteres })?.tipo).toBe('leer')
  expect(avisoDeTrabajo({ ...trabajoNuevo(), ediciones: LIMITE.ediciones })?.texto).toMatch(/equipo:mecanico/)
  expect(avisoDeTrabajo({ ...trabajoNuevo(), lecturas: 9, avisadoLeer: true })).toBeUndefined()
})

test('el aviso de delegar llega junto al resultado de la quinta lectura del director, no a los agentes', async ($, on) => {
  mock.store(on)
  on('tool.call', { tool: 'Read' }, () => ({ result: { type: 'text', file: { filePath: 'x', content: 'a', numLines: 1, startLine: 1, totalLines: 1 } } }) as never)
  const leer = (agentId?: string) => $.tool.call({ tool: 'Read', file_path: '/r/a.ts', ...(agentId === undefined ? {} : { agentId }) } as never)
  for (let i = 0; i < 4; i += 1) expect((await leer()).context ?? []).toEqual([])
  for (let i = 0; i < 6; i += 1) expect((await leer('agente')).context ?? []).toEqual([])
  expect(((await leer()).context ?? []).join(' ')).toMatch(/equipo:explorador/)
  expect((await leer()).context ?? []).toEqual([])
})
