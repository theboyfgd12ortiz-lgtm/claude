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

/** Lo que el director lleva hecho a mano en el turno actual; cada aviso sale una vez por turno. */
export type Trabajo = { lecturas: number; caracteres: number; ediciones: number; avisadoLeer: boolean; avisadoEditar: boolean }
export const trabajoNuevo = (): Trabajo => ({ lecturas: 0, caracteres: 0, ediciones: 0, avisadoLeer: false, avisadoEditar: false })
export const LIMITE = { lecturas: 5, caracteres: 60_000, ediciones: 6 } as const

/** Aviso para el director caro cuando ya leyó o editó mucho él mismo en este turno, o undefined. */
export const avisoDeTrabajo = (t: Trabajo): { tipo: 'leer' | 'editar'; texto: string } | undefined => {
  if (!t.avisadoLeer && (t.lecturas >= LIMITE.lecturas || t.caracteres >= LIMITE.caracteres)) {
    return {
      tipo: 'leer',
      texto: `<equipo>Llevas ${t.lecturas} lecturas (~${Math.round(t.caracteres / 4000)}k tokens) en este turno con el modelo caro. Lo que falte por leer o buscar, mándalo a equipo:explorador (Haiku) y pide solo rutas, líneas y conclusiones.</equipo>`,
    }
  }
  if (!t.avisadoEditar && t.ediciones >= LIMITE.ediciones) {
    return {
      tipo: 'editar',
      texto: `<equipo>Llevas ${t.ediciones} ediciones en este turno con el modelo caro. Si lo que queda es repetir el mismo tipo de cambio o escribir código de relleno, escribe la especificación exacta (archivos, qué cambiar, cómo comprobarlo) y dásela a equipo:mecanico (Haiku); tú revisa el resultado.</equipo>`,
    }
  }

  return undefined
}

/** Una lectura de este tamaño (caracteres) es "enorme" y, con el contexto ya caro, no debe entrar al chat caro. */
export const LECTURA_ENORME = 60_000
/** Contexto (tokens) a partir del cual cada byte que entra se paga muy caro en cada mensaje. */
export const CONTEXTO_CARO = 100_000

/** Mensaje de rechazo si una lectura enorme entraría a un chat caro con el contexto ya grande; undefined si puede pasar. */
export const denegarLecturaEnorme = (a: { caracteres: number; tokens: number; haiku: boolean }): string | undefined =>
  !a.haiku && a.caracteres >= LECTURA_ENORME && a.tokens >= CONTEXTO_CARO
    ? `Ese archivo es muy grande (~${Math.round(a.caracteres / 4000)}k tokens) y el contexto ya lleva ~${Math.round(a.tokens / 1000)}k: cada mensaje lo volvería a pagar. Pídele a equipo:explorador que lo lea y te dé solo lo que buscas, o lee un trozo (offset y limit).`
    : undefined

/** Qué debe sobrevivir a una compactación. */
export const AVISO_COMPACTAR = 'Conserva el plan y qué pasos están hechos o pendientes. Conserva también lo que se estaba haciendo justo ahora (archivos, qué falta, comandos de prueba) y las instrucciones del usuario, para seguir sin volver a preguntar.'
