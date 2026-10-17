// Operaciones con git: sin `$`; reciben una función `run` para poder probarlas con git de verdad.

import type { Punto } from '../types'

export type Run = (argv: string[]) => Promise<{ code: number; out: string }>

/** Dónde guarda git los commits ocultos, para que no los recoja la limpieza. */
export const REF = 'refs/claude-mods/respaldo'
export const PUNTOS_MAX = 8
/** De noche se trabaja solo muchas horas: se guardan más puntos. */
export const PUNTOS_MAX_NOCHE = 30

const lineas = (texto: string): string[] => texto.split('\n').map(l => l.trim()).filter(l => l !== '')

/** Los archivos nuevos que git aún no sigue (y no están en .gitignore). */
const sinSeguimiento = async (run: Run): Promise<string[]> => lineas((await run(['git', 'ls-files', '--others', '--exclude-standard'])).out).slice(0, 3000)

/**
 * Anota cómo está el proyecto ahora. `git stash create` arma un commit con los cambios sin tocar
 * nada (ni ramas, ni índice, ni archivos); si no hay cambios se usa el commit actual.
 * Devuelve null fuera de un repositorio o sin ningún commit.
 */
export const crearPunto = async (run: Run, id: string, at: number, pedido: string): Promise<Punto | null> => {
  const dentro = await run(['git', 'rev-parse', '--is-inside-work-tree'])
  if (dentro.code !== 0 || dentro.out.trim() !== 'true') return null
  let sha = (await run(['git', 'stash', 'create'])).out.trim()
  if (sha === '') {
    const cabeza = await run(['git', 'rev-parse', 'HEAD'])
    if (cabeza.code !== 0) return null
    sha = cabeza.out.trim()
  }
  const guardado = await run(['git', 'update-ref', `${REF}/${id}`, sha])
  if (guardado.code !== 0) return null

  return { id, sha, at, pedido: pedido.replace(/\s+/g, ' ').trim().slice(0, 100), existentes: await sinSeguimiento(run) }
}

/** Borra los puntos que sobran (los más antiguos). */
export const podar = async (run: Run, puntos: readonly Punto[], max: number = PUNTOS_MAX): Promise<Punto[]> => {
  const quedan = puntos.slice(-max)
  for (const p of puntos.slice(0, Math.max(0, puntos.length - max))) await run(['git', 'update-ref', '-d', `${REF}/${p.id}`])

  return [...quedan]
}

/** Qué archivos cambiaron o se crearon desde el punto: lo que se tocaría al volver. */
export const cambiosDesde = async (run: Run, p: Punto): Promise<{ modificados: string[]; creados: string[] }> => {
  const modificados = lineas((await run(['git', 'diff', '--name-only', p.sha])).out)
  const creados = (await sinSeguimiento(run)).filter(f => !p.existentes.includes(f))

  return { modificados, creados }
}

/** Vuelve a como estaba: restaura los archivos cambiados y quita los creados después. No toca el índice ni las ramas. */
export const restaurar = async (run: Run, p: Punto): Promise<{ modificados: number; creados: number; error?: string }> => {
  const { modificados, creados } = await cambiosDesde(run, p)
  if (modificados.length > 0) {
    const r = await run(['git', 'restore', `--source=${p.sha}`, '--worktree', '--', ...modificados])
    if (r.code !== 0) return { modificados: 0, creados: 0, error: r.out.trim().split('\n')[0] ?? 'git no pudo restaurar' }
  }
  if (creados.length > 0) await run(['git', 'clean', '-f', '-q', '--', ...creados])

  return { modificados: modificados.length, creados: creados.length }
}
