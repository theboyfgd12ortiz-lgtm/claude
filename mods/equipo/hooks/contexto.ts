import type { AvancePlan } from '../types'

// Pizarra y pistas según el tamaño de la tarea y lo lleno que está el contexto: sin `$`, para probarlo directamente.

export const PIZARRA = '.claude/equipo/pizarra.md'
export const PLAN = '.claude/equipo/plan.md'
/** Tope de la pizarra en caracteres (unos 1.500 tokens): se conservan las entradas más nuevas. */
export const PIZARRA_MAX = 6000
/** Lo que se copia de la respuesta de cada agente. */
export const ENTRADA_MAX = 500

const ENVOLTURAS = /<(system-reminder|local-command-caveat|local-command-stdout|local-command-stderr|command-name|command-message|command-args)>[\s\S]*?<\/\1>/g

/** Una entrada de la pizarra: quién, qué hizo y lo esencial de su respuesta. */
export const entradaPizarra = (tipo: string, descripcion: string, respuesta: string, hora: string): string => {
  const limpia = respuesta.trim().replace(/\n{2,}/g, '\n')
  const corta = limpia.length > ENTRADA_MAX ? `${limpia.slice(0, ENTRADA_MAX)}…` : limpia

  return `## ${hora} · ${tipo.replace('equipo:', '')} · ${descripcion.slice(0, 80)}\n${corta}\n`
}

/** Añade una entrada y recorta por el principio (entradas enteras) si pasa del tope. */
export const sumarEntrada = (actual: string, entrada: string): string => {
  const base = actual.trim() === '' ? '# Pizarra del equipo\nResultados de los agentes, lo más nuevo al final. Sirve para no perder nada al compactar.\n\n' : `${actual.trimEnd()}\n\n`
  let texto = base + entrada
  while (texto.length > PIZARRA_MAX) {
    const siguiente = texto.indexOf('\n## ', texto.indexOf('\n## ') + 1)
    if (siguiente === -1) return texto.slice(-PIZARRA_MAX)
    const cabecera = texto.slice(0, texto.indexOf('\n## ') + 1)
    texto = cabecera + texto.slice(siguiente + 1)
  }

  return texto
}

const PALABRAS_GRANDES = /\b(refactor\w*|migra\w*|reescrib\w*|rediseñ\w*|arquitectura|sistema completo|app completa|aplicaci[oó]n completa|todo el proyecto|de punta a punta|end[- ]to[- ]end|varios (archivos|m[oó]dulos|pasos)|implementa\w* (un|una|el|la) \w+ (completo|completa))\b/i

/** Si el pedido parece un trabajo grande: largo, con varias partes, o que lo dice con sus palabras. */
export const esTareaGrande = (texto: string): boolean => {
  const t = texto.replace(ENVOLTURAS, '').trim()
  if (t.startsWith('/')) return false
  const partes = t.split('\n').filter(l => /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(l)).length

  return t.length >= 600 || partes >= 3 || PALABRAS_GRANDES.test(t)
}

/**
 * Pista corta que viaja con el mensaje (no en el prompt de sistema: así la caché no se rompe).
 * Devuelve undefined si no hace falta nada.
 */
export const pistaDeEquipo = (a: { contexto: number; grande: boolean; hayPizarra: boolean; plan?: AvancePlan | null }): string | undefined => {
  const lineas: string[] = []
  if (a.plan != null && a.plan.siguiente !== null) {
    lineas.push(`Plan en curso (${PLAN}): ${a.plan.hechos} de ${a.plan.total} pasos hechos. Sigue: ${a.plan.siguiente}. Marca cada paso con [x] al terminarlo.`)
  }
  if (a.contexto >= 70) {
    lineas.push(`El contexto está al ${Math.round(a.contexto)}%: no leas archivos grandes tú. Delega leer y buscar a equipo:explorador${a.hayPizarra ? `, mira ${PIZARRA} antes de releer nada` : ''}, y cuando cierres este paso sugiere /compact.`)
  } else if (a.contexto >= 50) {
    lineas.push(`El contexto está al ${Math.round(a.contexto)}%: delega lo que sea leer o buscar mucho a equipo:explorador${a.hayPizarra ? ` y mira ${PIZARRA} antes de releer` : ''}.`)
  }
  if (a.grande) {
    lineas.push(
      `Tarea grande: antes de tocar nada escribe el plan en ${PLAN} (pasos con su criterio de "terminado"). Puedes usar hasta 6 agentes, 3 a la vez, uno por paso independiente; cada encargo al obrero debe bastarse solo (objetivo, archivos, qué no tocar, cómo comprobarlo). Los resultados quedan en ${PIZARRA}. Cierra con equipo:revisor.`,
    )
  }

  return lineas.length === 0 ? undefined : `<equipo>${lineas.join(' ')}</equipo>`
}

/** Lee las casillas del plan ("- [ ] paso" / "- [x] paso"): cuántas van, cuántas hay y cuál sigue. null si no hay casillas. */
export const leerPlan = (texto: string): AvancePlan | null => {
  const pasos = texto.split('\n').flatMap(l => {
    const m = /^\s*(?:[-*]|\d+[.)])\s*\[( |x|X)\]\s*(.+)$/.exec(l)

    return m === null ? [] : [{ hecho: m[1] !== ' ', texto: (m[2] ?? '').trim() }]
  })
  if (pasos.length === 0) return null

  return { hechos: pasos.filter(p => p.hecho).length, total: pasos.length, siguiente: pasos.find(p => !p.hecho)?.texto.slice(0, 120) ?? null }
}

/** Qué debe sobrevivir a una compactación para no perder el trabajo repartido. */
export const AVISO_COMPACTAR = `Conserva también: el plan del equipo (${PLAN}), que los resultados de los agentes están en ${PIZARRA} y qué pasos del plan están hechos o pendientes.`
