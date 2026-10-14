import { expect, test } from 'claude-code/testing'

import { AVISO_COMPACTAR, pistaDeEquipo } from './contexto'

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
