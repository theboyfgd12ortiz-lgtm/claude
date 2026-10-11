// El obrero gratis: un modelo de OmniRoute (https://github.com/diegosouzapw/OmniRoute) que solo recibe texto y devuelve texto.
// Pura: sin `$`, para probarla directamente.

export const URL_POR_DEFECTO = 'http://localhost:20128/v1'
/** Lo más que se manda: lo que sale va a proveedores gratuitos de terceros, así que se corta. */
export const ENTRADA_MAX = 16_000
export const RESPUESTA_MAX = 6_000

/** Los modelos de enrutado que OmniRoute documenta: `auto` y sus variantes. */
export const MODELO: Record<string, string> = { rapido: 'auto/fast', codigo: 'auto/coding', barato: 'auto/cheap' }
export const modeloPara = (tipo: string | undefined, preferido?: string): string => (preferido !== undefined && preferido !== '' ? preferido : (tipo !== undefined ? MODELO[tipo] : undefined) ?? 'auto')

const SECRETO = /(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_-]?key|secret|password|passwd|contraseña|token)\s*[:=]\s*\S{6,})/i

/** Si el texto parece traer una clave: eso no sale a un proveedor ajeno. */
export const traeSecreto = (texto: string): boolean => SECRETO.test(texto)

export const SISTEMA = 'Eres un ayudante de texto. Respondes en español, corto y directo, con el resultado primero. No tienes acceso a archivos, internet ni herramientas: trabajas solo con lo que se te da. Si te falta información, dilo en una línea en vez de inventar.'

/** La petición de chat (formato OpenAI) para OmniRoute. */
export const construirPeticion = (base: string, clave: string | undefined, modelo: string, tarea: string, contexto: string | undefined) => {
  const usuario = contexto !== undefined && contexto.trim() !== '' ? `${tarea}\n\n---\n${contexto}` : tarea

  return {
    url: `${base.replace(/\/+$/, '')}/chat/completions`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(clave !== undefined && clave !== '' ? { authorization: `Bearer ${clave}` } : {}) },
      body: JSON.stringify({ model: modelo, messages: [{ role: 'system', content: SISTEMA }, { role: 'user', content: usuario.slice(0, ENTRADA_MAX) }], max_tokens: 1500 }),
    },
  }
}

/** El texto de la respuesta, o el motivo del fallo. */
export const leerRespuesta = (status: number, texto: string): { ok: true; texto: string } | { ok: false; motivo: string } => {
  let json: unknown
  try {
    json = JSON.parse(texto)
  } catch {
    return { ok: false, motivo: status >= 400 ? `OmniRoute respondió ${status}` : 'OmniRoute no devolvió JSON' }
  }
  const j = json as { choices?: { message?: { content?: unknown } }[]; error?: { message?: string } | string }
  const contenido = j.choices?.[0]?.message?.content
  const plano = typeof contenido === 'string' ? contenido : Array.isArray(contenido) ? contenido.map(p => (typeof p === 'object' && p !== null && 'text' in p ? String((p as { text: unknown }).text) : '')).join('') : ''
  if (status < 400 && plano.trim() !== '') return { ok: true, texto: plano.trim().slice(0, RESPUESTA_MAX) }
  const err = typeof j.error === 'string' ? j.error : j.error?.message

  return { ok: false, motivo: err !== undefined ? `OmniRoute: ${err.slice(0, 160)}` : status >= 400 ? `OmniRoute respondió ${status}` : 'OmniRoute devolvió una respuesta vacía' }
}
