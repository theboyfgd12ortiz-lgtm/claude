// Pistas según lo lleno que está el contexto y el presupuesto: sin `$`, para probarlo directamente.

/**
 * Pista corta que viaja con el mensaje (no en el prompt de sistema: así la caché no se rompe).
 * Devuelve undefined si no hace falta nada.
 */
export const pistaDeEquipo = (a: { contexto: number; tokens?: number; apretado?: boolean }): string | undefined => {
  const lineas: string[] = []
  if (a.apretado === true) lineas.push('Presupuesto apretado: haz solo lo fundamental y sin bajar la calidad. Lo pesado de leer o buscar, a equipo:explorador (barato); máximo 2 agentes y una skill como mucho.')
  // La ventana puede ser de 1M: el porcentaje casi nunca llega, así que también se mira en tokens absolutos.
  const tokens = a.tokens ?? 0
  const lleno = a.contexto >= 70 || tokens >= 150_000
  const medio = a.contexto >= 50 || tokens >= 80_000
  const cuanto = tokens > 0 ? `lleva ~${Math.round(tokens / 1000)}k tokens` : `está al ${Math.round(a.contexto)}%`
  if (lleno) lineas.push(`El contexto ${cuanto}: no leas archivos grandes tú. Delega leer y buscar a equipo:explorador y, cuando cierres este paso, sugiere /compact.`)
  else if (medio) lineas.push(`El contexto ${cuanto}: delega lo que sea leer o buscar mucho a equipo:explorador.`)

  return lineas.length === 0 ? undefined : `<equipo>${lineas.join(' ')}</equipo>`
}

/** Qué debe sobrevivir a una compactación. */
export const AVISO_COMPACTAR = 'Conserva el plan y qué pasos están hechos o pendientes.'
