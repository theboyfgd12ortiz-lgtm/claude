import { expect, test } from 'claude-code/testing'

import { AVISO_COMPACTAR, entradaPizarra, esTareaGrande, PIZARRA_MAX, pistaDeEquipo, sumarEntrada } from './contexto'

test('reconoce una tarea grande por tamaño, partes o palabras', () => {
  expect(esTareaGrande('arregla el botón del login')).toBe(false)
  expect(esTareaGrande('/equipo probar')).toBe(false)
  expect(esTareaGrande('hola, ¿cómo va?')).toBe(false)
  expect(esTareaGrande('quiero esto:\n- login\n- registro\n- recuperar clave')).toBe(true)
  expect(esTareaGrande('migra todo el proyecto a TypeScript')).toBe(true)
  expect(esTareaGrande('x'.repeat(650))).toBe(true)
})

test('la pista depende del contexto y del tamaño; sin nada que decir no añade nada', () => {
  expect(pistaDeEquipo({ contexto: 20, grande: false, hayPizarra: false })).toBeUndefined()
  expect(pistaDeEquipo({ contexto: 55, grande: false, hayPizarra: false })).toMatch(/al 55%.*explorador/)
  expect(pistaDeEquipo({ contexto: 82, grande: false, hayPizarra: true })).toMatch(/al 82%.*pizarra\.md.*\/compact/)
  const g = pistaDeEquipo({ contexto: 10, grande: true, hayPizarra: false })
  expect(g).toMatch(/TodoWrite.*6 agentes.*revisor/)
  expect(g?.startsWith('<equipo>')).toBe(true)
})

test('con ventana grande el contexto también se mide en tokens', () => {
  expect(pistaDeEquipo({ contexto: 12, tokens: 90_000, grande: false, hayPizarra: false })).toMatch(/~90k tokens/)
  expect(pistaDeEquipo({ contexto: 15, tokens: 160_000, grande: false, hayPizarra: false })).toMatch(/\/compact/)
  expect(pistaDeEquipo({ contexto: 5, tokens: 20_000, grande: false, hayPizarra: false })).toBeUndefined()
})

test('la pizarra guarda lo esencial y no pasa de su tope: se van las entradas más viejas', () => {
  const e = entradaPizarra('equipo:explorador', 'buscar login', `Está en src/login.ts:42\n\n\n${'x'.repeat(900)}`, '10:30')
  expect(e).toMatch(/^## 10:30 · explorador · buscar login/)
  expect(e.length).toBeLessThan(700)
  let p = ''
  for (let i = 0; i < 30; i++) p = sumarEntrada(p, entradaPizarra('equipo:obrero', `paso ${i}`, `hecho ${i} ${'y'.repeat(300)}`, '10:00'))
  expect(p.length).toBeLessThanOrEqual(PIZARRA_MAX)
  expect(p).toMatch(/^# Pizarra del equipo/)
  expect(p).toContain('paso 29')
  expect(p).not.toContain('paso 0 ')
})

test('al compactar se pide conservar el plan y la pizarra', () => {
  expect(AVISO_COMPACTAR).toMatch(/pizarra\.md/)
})

test('con el presupuesto apretado la pista manda no delegar', () => {
  expect(pistaDeEquipo({ contexto: 0, grande: false, hayPizarra: false, apretado: true })).toMatch(/no lances agentes/)
})
