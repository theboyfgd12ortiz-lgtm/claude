import { expect, test } from 'claude-code/testing'

import { leerPuntos, limpiarTexto, puntosANivel, peldano } from '../hooks/register'

test('quita el aviso de la app y deja el saludo', () => {
  const texto = '<system-reminder>\nThe user started this session...\n</system-reminder>\nhola'
  expect(limpiarTexto(texto)).toBe('hola')
})

test('un saludo va a Haiku', () => {
  const leido = leerPuntos('{"alcance":0,"razonamiento":0,"riesgo":0,"dudas":0,"calidad":0,"tema_nuevo":false,"motivo":"saludo"}')
  expect(leido).toBeDefined()
  expect(peldano(puntosANivel(leido!.puntos)).familia).toBe('haiku')
  expect(leido!.temaNuevo).toBe(false)
})

test('deja intacto un mensaje sin avisos', () => {
  expect(limpiarTexto('arregla <b>esto</b>')).toBe('arregla <b>esto</b>')
})
