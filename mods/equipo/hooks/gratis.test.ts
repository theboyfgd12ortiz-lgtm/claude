import { expect, test } from 'claude-code/testing'

import { construirPeticion, leerRespuesta, modeloPara, traeSecreto } from './gratis'

test('arma la petición de chat para OmniRoute, con la clave solo si hay', () => {
  const p = construirPeticion('http://localhost:20128/v1/', 'k123', 'auto/cheap', 'resume esto', 'texto largo')
  expect(p.url).toBe('http://localhost:20128/v1/chat/completions')
  expect(p.init.headers.authorization).toBe('Bearer k123')
  const cuerpo = JSON.parse(p.init.body)
  expect(cuerpo.model).toBe('auto/cheap')
  expect(cuerpo.messages[1].content).toContain('texto largo')
  expect(construirPeticion('http://x/v1', undefined, 'auto', 't', undefined).init.headers).not.toHaveProperty('authorization')
})

test('elige el modelo de enrutado según el tipo, o el que la persona fijó', () => {
  expect(modeloPara(undefined)).toBe('auto')
  expect(modeloPara('codigo')).toBe('auto/coding')
  expect(modeloPara('rapido')).toBe('auto/fast')
  expect(modeloPara('codigo', 'glm/glm-5.2')).toBe('glm/glm-5.2')
})

test('lee la respuesta o explica el fallo', () => {
  expect(leerRespuesta(200, JSON.stringify({ choices: [{ message: { content: ' Hola ' } }] }))).toEqual({ ok: true, texto: 'Hola' })
  expect(leerRespuesta(200, JSON.stringify({ choices: [{ message: { content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] } }] }))).toEqual({ ok: true, texto: 'AB' })
  expect(leerRespuesta(429, JSON.stringify({ error: { message: 'rate limit' } }))).toEqual({ ok: false, motivo: 'OmniRoute: rate limit' })
  expect(leerRespuesta(502, '<html>')).toEqual({ ok: false, motivo: 'OmniRoute respondió 502' })
  expect(leerRespuesta(200, JSON.stringify({ choices: [] })).ok).toBe(false)
})

test('no deja salir claves a proveedores ajenos', () => {
  expect(traeSecreto('mi api_key = abcdef123456')).toBe(true)
  expect(traeSecreto('sk-ant-api03-abcdefghijklmnop')).toBe(true)
  expect(traeSecreto('-----BEGIN RSA PRIVATE KEY-----')).toBe(true)
  expect(traeSecreto('resume este párrafo sobre panadería')).toBe(false)
})
