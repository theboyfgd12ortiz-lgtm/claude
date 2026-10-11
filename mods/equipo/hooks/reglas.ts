// Reglas puras del equipo: sin `$`, para probarlas directamente.

import type { Familia, Registro } from '../types'

export const FAMILIAS: readonly Familia[] = ['haiku', 'sonnet', 'opus']

export const familiaDe = (modelo: string): Familia => {
  const m = modelo.toLowerCase()
  if (m.includes('haiku')) return 'haiku'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('opus')) return 'opus'

  return 'otro'
}

/**
 * Precio de entrada relativo a Haiku (precios publicados por millón de tokens: Haiku 5.5 $0.10, Sonnet 5.5 $2, Opus 5.5 $4... la proporción
 * que usa el equipo es 1 : 20 : 40; la salida cuesta 5 veces la entrada en los tres). Es una estimación, no una factura.
 */
export const PRECIO: Record<Familia, number> = { haiku: 1, sonnet: 20, opus: 40, otro: 20 }
/** Lo que cuesta leer de la caché, como fracción de la entrada normal (Sonnet y Opus: $0.20 por millón). */
export const CACHE: Record<Familia, number> = { haiku: 0.1, sonnet: 0.1, opus: 0.05, otro: 0.1 }
const RANGO: Record<Familia, number> = { haiku: 1, sonnet: 2, opus: 3, otro: 2 }
export const rango = (f: Familia): number => RANGO[f]

/** La familia del escalón del selector (1-2 Haiku, 3-5 Sonnet, 6-9 Opus): el modelo con el que de verdad trabaja el director. */
export const familiaDeNivel = (n: number): Familia => (n <= 2 ? 'haiku' : n <= 5 ? 'sonnet' : 'opus')

/**
 * Costo relativo de un trabajo, en "unidades Haiku": lo escrito pesa 5 veces lo leído nuevo,
 * y lo que sale de la caché cuesta una décima parte.
 */
export const costo = (r: Pick<Registro, 'nuevo' | 'cache' | 'escrito'>, familia: Familia): number =>
  (r.nuevo + r.cache * CACHE[familia] + r.escrito * 5) * PRECIO[familia]

const delDirector = (r: Pick<Registro, 'padre'>): Familia => (r.padre === 'otro' ? 'opus' : r.padre)

/** Lo que cuesta delegar al director: escribir el encargo (salida) y leer la respuesta (entrada). */
export const sobrecosto = (r: Pick<Registro, 'padre' | 'encargo' | 'respuesta'>): number =>
  ((r.encargo ?? 0) * 5 + (r.respuesta ?? 0)) * PRECIO[delDirector(r)]

/** El ahorro neto de un agente: lo que habría costado con el modelo del director, menos lo que costó, menos el costo de delegar. Puede salir negativo. */
export const ahorro = (r: Registro): number => costo(r, delDirector(r)) - costo(r, r.familia) - sobrecosto(r)

/** Con qué modelo corre cada tipo de agente cuando quien lo lanza no pidió uno. */
export const MODELO_POR_TIPO: Record<string, 'haiku' | 'sonnet'> = {
  'equipo:explorador': 'haiku',
  'equipo:investigador': 'haiku',
  'equipo:obrero': 'sonnet',
  'equipo:revisor': 'sonnet',
  'equipo:arreglador': 'sonnet',
  // Explore de siempre heredaría el costo del director. general-purpose no se toca: lo suele lanzar quien ya decidió que la tarea es difícil.
  Explore: 'haiku',
}

export type Dificultad = 'baja' | 'media' | 'alta'
const NIVELES = ['haiku', 'sonnet', 'opus'] as const

/** La dificultad que el director escribió en el encargo ("dificultad: alta"), o undefined si no dijo. */
export const dificultadDe = (descripcion: string, prompt: string): Dificultad | undefined => {
  const m = /dificultad\s*[:=]\s*(baja|media|alta|f[aá]cil|dif[ií]cil)/i.exec(`${descripcion}\n${prompt.slice(0, 300)}`)
  const d = m?.[1]?.toLowerCase()
  if (d === undefined) return undefined

  return d === 'baja' || d.startsWith('f') ? 'baja' : d === 'media' ? 'media' : 'alta'
}

/** Alta sube un escalón; baja lo deja en Haiku, pero solo si el equipo no lo había subido por sus fallos (no se pisa lo aprendido). */
export const nivelPorDificultad = (base: 'haiku' | 'sonnet' | 'opus', dificultad: Dificultad | undefined, sinAprender: boolean): 'haiku' | 'sonnet' | 'opus' => {
  if (dificultad === 'alta') return NIVELES[Math.min(2, NIVELES.indexOf(base) + 1)] ?? base
  if (dificultad === 'baja' && sinAprender) return 'haiku'

  return base
}

/**
 * El modelo que se pone a un subagente que no trae uno, o undefined si no hay que tocar nada:
 * quien lo lanza ya eligió, es una bifurcación, no hay regla, o el director ya es igual de barato.
 */
export const modeloParaAgente = (a: {
  tipo: string
  pedido: string | undefined
  padre: string
  fork: boolean
  /** Lo que el equipo aprendió para este tipo; si falta, vale el de siempre. */
  aprendido?: 'haiku' | 'sonnet' | 'opus' | undefined
  /** Lo que el director dijo de este encargo: más fácil o más difícil de lo normal. */
  dificultad?: Dificultad | undefined
}): string | undefined => {
  if (a.fork || (a.pedido !== undefined && a.pedido !== '')) return undefined
  const base: 'haiku' | 'sonnet' | 'opus' | undefined = a.aprendido ?? MODELO_POR_TIPO[a.tipo]
  if (base === undefined) return undefined
  const objetivo = nivelPorDificultad(base, a.dificultad, a.aprendido === undefined)
  const rangoPadre = RANGO[familiaDe(a.padre)]
  // Un agente del equipo trae su propio modelo fijo: se pone siempre, y nunca más caro que el director.
  if (a.tipo.startsWith('equipo:')) return rangoPadre < RANGO[objetivo] ? a.padre : objetivo

  return rangoPadre <= RANGO[objetivo] ? undefined : objetivo
}

const FORMATO = 'Responde en español, corto y directo: el resultado primero y nada de relleno ni saludos.'

/** Los agentes del equipo: cada uno con su modelo, esfuerzo y herramientas, y un formato de respuesta corto (lo que llega al director cuesta). */
export const AGENTES = [
  {
    name: 'explorador',
    description: 'Busca y lee código o archivos por ti y devuelve solo lo importante (rutas y líneas). Úsalo antes de leer muchos archivos tú mismo.',
    prompt: `Eres el explorador del equipo. Tu trabajo es encontrar y entender cosas en el proyecto para otro agente que NO ve lo que tú lees.
- Busca con Grep y Glob; lee solo los trozos que necesitas, nunca archivos enteros sin motivo.
- Responde con máximo 200 palabras: qué encontraste, con rutas y números de línea, y cualquier cosa que sorprenda. No pegues código largo. Si no lo encuentras, dilo y di dónde miraste.
${FORMATO}`,
    tools: ['Read', 'Grep', 'Glob'],
    model: 'haiku',
    effort: 'low',
    maxTurns: 14,
    omitClaudeMd: true as const,
  },
  {
    name: 'investigador',
    description: 'Investiga en internet y devuelve un resumen con fuentes. Úsalo para buscar información, documentación, ejemplos o datos actuales.',
    prompt: `Eres el investigador del equipo. Buscas información en internet y la entregas ordenada.
- Usa WebSearch y abre las mejores 2 o 4 fuentes con WebFetch. Prefiere fuentes oficiales y recientes.
- Responde así: primero un resumen de máximo 200 palabras con lo esencial; luego "Datos clave:" con viñetas (cifras, nombres, pasos); luego "Fuentes:" con las direcciones que usaste.
- No inventes nada: si no encuentras algo o las fuentes se contradicen, dilo.
${FORMATO}`,
    tools: ['WebSearch', 'WebFetch', 'Read'],
    model: 'haiku',
    effort: 'medium',
    maxTurns: 16,
    omitClaudeMd: true as const,
  },
  {
    name: 'obrero',
    description: 'Ejecuta UN paso claro del plan (cambiar archivos, crear algo, probarlo). Dale una especificación completa: no ve la conversación.',
    prompt: `Eres el obrero del equipo. Recibes un paso concreto de un plan y lo haces bien, sin salirte de él.
- Haz solo lo que se te pide. Sigue el estilo del código que ya existe. No refactorices ni añadas nada extra.
- Antes de terminar, comprueba que funciona (corre las pruebas o la compilación si existen; si no, lee lo que cambiaste).
- Responde con máximo 120 palabras: qué cambiaste (rutas), cómo lo verificaste y su resultado, y cualquier duda real que dejes.
${FORMATO}`,
    disallowedTools: ['Agent'],
    model: 'sonnet',
    effort: 'medium',
    maxTurns: 30,
  },
  {
    name: 'arreglador',
    description: 'Arregla una prueba, compilación o lint que falla: dale el comando y el error. Hace el arreglo mínimo y lo vuelve a correr hasta que pase.',
    prompt: `Eres el arreglador del equipo. Recibes un comando que falla y su error, y lo dejas funcionando.
- Reproduce el fallo corriendo el comando. Busca la causa de raíz leyendo solo lo necesario; no adivines.
- Haz el cambio mínimo que lo arregla, en el estilo del código que ya existe. Nunca borres, saltes ni debilites una prueba para que pase.
- Vuelve a correr el comando. Si sigue fallando, prueba otra causa; máximo 3 intentos y, si no sale, di exactamente qué probaste y qué crees que pasa.
- Responde con máximo 100 palabras: la causa, qué cambiaste (rutas) y el resultado de volver a correrlo.
${FORMATO}`,
    tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'],
    disallowedTools: ['Agent'],
    model: 'sonnet',
    effort: 'medium',
    maxTurns: 20,
    omitClaudeMd: true as const,
  },
  {
    name: 'revisor',
    description: 'Revisa lo que se hizo (cambios, página, código) antes de darlo por terminado y avisa de errores. No modifica nada.',
    prompt: `Eres el revisor del equipo. Revisas el trabajo hecho y buscas lo que está mal: errores, casos que no se probaron, cosas que no cumplen lo pedido, claves o datos expuestos.
- Mira los cambios con git diff y lee los archivos tocados. No modifiques nada.
- Además de lo funcional, mira la seguridad: claves o datos expuestos, entradas de usuario sin validar o sin escapar (formularios, URLs, SQL, HTML), permisos o rutas de archivo mal controlados, dependencias dudosas.
- Responde con máximo 150 palabras: una lista de problemas, cada uno con el archivo, qué pasa y por qué importa, ordenados del más grave al menos. Si todo está bien, responde exactamente: TODO BIEN.
${FORMATO}`,
    tools: ['Read', 'Grep', 'Glob', 'Bash'],
    model: 'sonnet',
    effort: 'low',
    maxTurns: 14,
    omitClaudeMd: true as const,
  },
] as const

/** Cómo debe repartir el trabajo el director (se añade al prompt de sistema). */
export const GUIA = `# Equipo de trabajo (para gastar poco y hacerlo bien)
Tú diriges (si la tarea es grande, planifica antes en pasos cortos). Para trabajo grande reparte lo pesado entre agentes más baratos; lo pequeño hazlo tú.
1. Reparte con la herramienta Agent:
- equipo:explorador (Haiku): buscar o leer en muchos archivos. Pídele rutas y líneas, no archivos enteros.
- equipo:investigador (Haiku): buscar en internet; devuelve resumen con fuentes.
- equipo:obrero (Sonnet): hacer UN paso claro. Dale una especificación completa y autosuficiente (archivos, qué cambiar, cuándo está listo): no ve esta conversación.
- equipo:arreglador (Sonnet): cuando una prueba, compilación o lint falla: dale el comando y el error.
- equipo:revisor (Sonnet): solo si cambiaste 3 o más archivos de código; en cambios pequeños revisa tú.
2. Lanza en paralelo lo independiente (varias llamadas Agent en el mismo mensaje).
3. En la descripción de cada encargo escribe "dificultad: baja", "media" o "alta": el equipo ajusta el modelo (baja = más barato, alta = un escalón más fuerte). Pon primero lo que bloquea a los demás pasos.
4. Pide respuestas cortas. Integra sus resultados; no repitas su trabajo ni releas lo que ya resumieron.
5. Como mucho 3 agentes a la vez y 6 por tarea (el sistema rechaza el resto). Si dudas de que valga la pena delegar, hazlo tú.`

export const slug = (texto: string): string =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'investigacion'
