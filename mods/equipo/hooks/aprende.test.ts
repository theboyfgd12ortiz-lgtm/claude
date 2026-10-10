import { expect, test } from 'claude-code/testing'

import { aprender, cumpleContrato, esBueno, lecciones, modeloAprendido, promedio } from './aprende'
import type { Aprendizaje } from '../types'

const T = 'equipo:explorador'
const rep = (a: Aprendizaje, n: number, bueno: boolean, familia = 'haiku'): Aprendizaje => {
  let x = a
  for (let i = 0; i < n; i++) x = aprender(x, T, familia, bueno, 100)

  return x
}

test('un resultado es bueno solo si terminó con respuesta que dice algo', () => {
  expect(esBueno('answer', 'hallé X')).toBe(true)
  expect(esBueno('answer', '  ')).toBe(false)
  expect(esBueno('error', 'x')).toBe(false)
  expect(esBueno('answer', undefined)).toBe(false)
})

test('sin historia se usa el modelo de siempre', () => {
  expect(modeloAprendido({}, T)).toBe('haiku')
  expect(modeloAprendido({}, 'equipo:obrero')).toBe('sonnet')
  expect(modeloAprendido({}, 'otro-tipo')).toBeUndefined()
})

test('dos fallos seguidos con Haiku suben el tipo a Sonnet y queda la lección', () => {
  const a = rep({}, 2, false)
  expect(modeloAprendido(a, T)).toBe('sonnet')
  expect(a[T]?.subidas).toBe(1)
  expect(lecciones(a)[0]).toMatch(/explorador falló con haiku/)
})

test('un fallo suelto entre aciertos no cambia nada', () => {
  const a = rep(rep(rep({}, 3, true), 1, false), 3, true)
  expect(modeloAprendido(a, T)).toBe('haiku')
})

test('tras 8 aciertos con el nivel subido vuelve a probar el barato', () => {
  const subido = rep({}, 2, false)
  expect(modeloAprendido(rep(subido, 7, true, 'sonnet'), T)).toBe('sonnet')
  const vuelto = rep(subido, 8, true, 'sonnet')
  expect(modeloAprendido(vuelto, T)).toBe('haiku')
  expect(lecciones(vuelto)[0]).toMatch(/vuelve a acertar con haiku/)
})

test('no aprende de lo que corrió con otro modelo que el del equipo, ni de tipos ajenos', () => {
  expect(modeloAprendido(rep({}, 4, false, 'opus'), T)).toBe('haiku')
  expect(aprender({}, 'otro-tipo', 'haiku', false, 1)).toEqual({})
})

test('lleva la cuenta del gasto medio', () => {
  expect(promedio(rep({}, 3, true)[T]!)).toBe(100)
})

test('un obrero que falla con Sonnet sube a Opus, y baja un escalón tras 8 aciertos', () => {
  const O = 'equipo:obrero'
  let a: Aprendizaje = {}
  for (let i = 0; i < 2; i++) a = aprender(a, O, 'sonnet', false, 100)
  expect(modeloAprendido(a, O)).toBe('opus')
  for (let i = 0; i < 8; i++) a = aprender(a, O, 'opus', true, 100)
  expect(modeloAprendido(a, O)).toBe('sonnet')
})

test('el contrato de cada tipo: ruta, fuentes, veredicto', () => {
  expect(cumpleContrato('equipo:explorador', 'Está en src/login.ts:42')).toBe(true)
  expect(cumpleContrato('equipo:explorador', 'No lo encontré; miré en src y lib')).toBe(true)
  expect(cumpleContrato('equipo:explorador', 'creo que sí')).toBe(false)
  expect(cumpleContrato('equipo:investigador', 'Resumen.\nFuentes: https://a.com')).toBe(true)
  expect(cumpleContrato('equipo:investigador', 'Resumen sin enlaces')).toBe(false)
  expect(cumpleContrato('equipo:revisor', 'TODO BIEN')).toBe(true)
  expect(cumpleContrato('equipo:revisor', 'todo parece correcto')).toBe(false)
  expect(esBueno('answer', 'hallé algo vago', 'equipo:explorador')).toBe(false)
})

test('un tipo que en 5 trabajos no ahorra nada recibe la lección de hacerlo uno mismo', () => {
  let a: Aprendizaje = {}
  for (let i = 0; i < 5; i++) a = aprender(a, 'equipo:explorador', 'haiku', true, 100, -50)
  expect(lecciones(a).join(' ')).toMatch(/explorador no está saliendo a cuenta/)
  for (let i = 0; i < 5; i++) a = aprender(a, 'equipo:explorador', 'haiku', true, 100, 500)
  expect(lecciones(a).join(' ')).not.toMatch(/a cuenta/)
})
