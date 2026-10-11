import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mensaje, Terminal } from '../types'
import { archivoMensaje, DIR, estaViva, LATIDO_MS, leerMensaje, leerTerminal, MENSAJE_MAX, nombreLibre, nombreRama, pistaTerminales, podarArchivos, quienLoTiene, recortar, rutaClave, textoMensajes } from './reglas'

const estado = atom({ plugin: 'terminales', key: 'estado' } as const, { yo: null, otras: [], recibidos: 0 })

const DE_LA_PERSONA = new Set(['composer', 'bridge', 'sdk', 'slack-ping', 'unclassified'])
/** Cada cuánto se vuelve a leer a las demás como mucho (no en cada acción). */
const REFRESCO_MS = 15_000
/** Un mensaje del que se avisa de las otras terminales cada tantos pedidos, aunque nada haya cambiado. */
const PISTA_CADA = 8

// El estado de esta terminal vive a nivel del módulo: las funciones que reciben `$` se declaran fuera de register.
let yo: Terminal | null = null
let raiz = ''
let ultimoRefresco = 0
let pedidos = 0
let firmaVista = ''
const leidos = new Set<string>()
const avisados = new Set<string>()
let latido: { cancel: () => void } | undefined

const escribirYo = async ($: EngineInterface) => {
  if (yo === null) return
  await $.fs.write(`${DIR}/${yo.id}.json`, JSON.stringify(yo)).catch(() => undefined)
}

/** Lee los archivos de las demás terminales y deja en el estado las que siguen vivas. */
const refrescar = async ($: EngineInterface): Promise<Terminal[]> => {
  const ahora = await $.clock.now()
  ultimoRefresco = ahora
  const entradas = await $.fs.list(DIR).catch(() => [])
  const otras: Terminal[] = []
  for (const f of entradas) {
    if (f.kind !== 'file' || !f.name.endsWith('.json') || (yo !== null && f.name === `${yo.id}.json`)) continue
    const t = await $.fs.read(`${DIR}/${f.name}`).then(r => (typeof r === 'string' ? leerTerminal(r) : null), () => null)
    if (t !== null && estaViva(t, ahora)) otras.push(t)
  }
  otras.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
  await update($, estado, e => ({ ...e, yo, otras }))

  return otras
}

/** Los archivos de las terminales y de la pizarra cambian cada pocos segundos: se dejan fuera de git (solo en esta copia, sin tocar el proyecto). */
const ignorarEnGit = async ($: EngineInterface) => {
  const ruta = '.git/info/exclude'
  const previo = await $.fs.read(ruta).then(r => (typeof r === 'string' ? r : null), () => null)
  if (previo === null) return
  const faltan = ['.claude/terminales/', '.claude/equipo/'].filter(l => !previo.split('\n').some(x => x.trim() === l))
  if (faltan.length > 0) await $.fs.write(ruta, `${previo.replace(/\n*$/, '\n')}${faltan.join('\n')}\n`).catch(() => undefined)
}

const pulso = async ($: EngineInterface) => {
  if (yo === null) return
  yo = { ...yo, ultimo: await $.clock.now() }
  await escribirYo($)
  await refrescar($)
}

const mandar = async ($: EngineInterface, a: string, texto: string): Promise<string> => {
  if (yo === null) return 'Esta terminal todavía no está registrada.'
  const otras = await refrescar($)
  const destino = otras.find(t => t.nombre.toLowerCase() === a.toLowerCase())
  if (destino === undefined) return `No hay una terminal viva llamada ${a}. Activas: ${otras.map(t => t.nombre).join(', ') || 'ninguna'}.`
  const m: Mensaje = { de: yo.nombre, texto: texto.slice(0, MENSAJE_MAX), at: await $.clock.now() }
  await $.fs.write(`${DIR}/bandeja/${destino.id}/${archivoMensaje(m, yo.id)}`, JSON.stringify(m))

  return `Mensaje enviado a ${destino.nombre}. Lo verá en su próximo mensaje.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    raiz = e.cwd
    const ahora = await $.clock.now()
    const id = `${ahora.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
    yo = { id, nombre: 'T?', inicio: ahora, ultimo: ahora, tarea: '', archivos: {} }
    const otras = await refrescar($)
    yo = { ...yo, nombre: nombreLibre(otras) }
    await escribirYo($)
    await refrescar($)
    await ignorarEnGit($)
    latido = $.clock.every(LATIDO_MS, () => void pulso($).catch(() => undefined))
    await $.command.register({
      name: 'terminal',
      description: 'Las terminales de este proyecto: /terminal · enviar T2 <texto> · tarea <texto> · paralelo <nombre>',
      argumentHint: 'enviar T2 <texto> | tarea <texto> | paralelo <nombre>',
    })
    await $.tool
      .register({
        name: 'enviar',
        description: 'Manda un mensaje corto a otra terminal de Claude Code abierta en este proyecto (T1, T2…). Úsalo para avisarle de un cambio que le afecta o pedirle algo concreto.',
        inputSchema: {
          type: 'object',
          properties: { a: { type: 'string', description: 'El nombre de la terminal, por ejemplo T2.' }, texto: { type: 'string', description: 'El mensaje, breve y completo.' } },
          required: ['a', 'texto'],
        },
      })
      .catch(() => undefined)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    latido?.cancel()
    if (yo !== null) {
      yo = { ...yo, ultimo: 0 }
      await escribirYo($)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // Lo que le pides a esta terminal queda como su tarea; llegan los mensajes de las demás y se recuerda quién más está.
  on('prompt.submit', async ($, e, next) => {
    const origen = (e.origin as { kind?: string } | undefined)?.kind
    if ((origen !== undefined && !DE_LA_PERSONA.has(origen)) || yo === null) return next(e)
    const ahora = await $.clock.now()
    const texto = e.text.trim()
    if (!texto.startsWith('/') && texto.length >= 25) {
      yo = { ...yo, tarea: recortar(texto, 120), ultimo: ahora }
      await escribirYo($)
    }
    const otras = ahora - ultimoRefresco > REFRESCO_MS ? await refrescar($) : (await read($, estado)).otras

    const contexto: string[] = []
    const nuevos: Mensaje[] = []
    for (const f of await $.fs.list(`${DIR}/bandeja/${yo.id}`).catch(() => [])) {
      if (f.kind !== 'file' || leidos.has(f.name)) continue
      leidos.add(f.name)
      const m = await $.fs.read(`${DIR}/bandeja/${yo.id}/${f.name}`).then(r => (typeof r === 'string' ? leerMensaje(r) : null), () => null)
      if (m !== null && m.at >= yo.inicio) nuevos.push(m)
    }
    if (nuevos.length > 0) {
      contexto.push(textoMensajes(nuevos))
      await update($, estado, s => ({ ...s, recibidos: s.recibidos + nuevos.length }))
      $.ui.toast(`${nuevos[0]?.de ?? 'Otra terminal'} te escribió.`)
    }
    pedidos += 1
    const firma = otras.map(t => t.nombre).join(',')
    if (firma !== firmaVista || pedidos % PISTA_CADA === 0) {
      firmaVista = firma
      const pista = pistaTerminales(yo.nombre, otras, ahora)
      if (pista !== undefined) contexto.push(pista)
    }

    return next(contexto.length === 0 ? e : { ...e, context: [...(e.context ?? []), ...contexto] })
  }).catch(($, e, next) => next(e))

  // Dos terminales no deben editar el mismo archivo a la vez: la segunda recibe un aviso (una vez) y luego puede seguir.
  on('tool.call', async ($, e, next) => {
    if (yo === null) return next(e)
    const ruta = e.tool === 'Edit' || e.tool === 'Write' ? e.file_path : e.tool === 'NotebookEdit' ? e.notebook_path : String(e.tool) === 'MultiEdit' ? (e as unknown as { file_path?: string }).file_path : undefined
    if (typeof ruta !== 'string') return next(e)
    const ahora = await $.clock.now()
    const clave = rutaClave(ruta, raiz)
    const otras = ahora - ultimoRefresco > REFRESCO_MS ? await refrescar($) : (await read($, estado)).otras
    const dueña = quienLoTiene(clave, yo.id, otras, ahora)
    if (dueña !== undefined && !avisados.has(clave)) {
      avisados.add(clave)

      return { deny: `${dueña.nombre} está editando ${ruta} ahora mismo${dueña.tarea !== '' ? ` (${recortar(dueña.tarea, 60)})` : ''}. Avísale con mcp__terminales__enviar o trabaja en otra parte; si insistes, el segundo intento pasa.` }
    }
    yo = { ...yo, archivos: podarArchivos({ ...yo.archivos, [clave]: ahora }, ahora), ultimo: ahora }
    await escribirYo($)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'mcp__terminales__enviar' }, async ($, e) => {
    const a = e as unknown as { a?: unknown; texto?: unknown }
    if (typeof a.a !== 'string' || typeof a.texto !== 'string' || a.texto.trim() === '') return { deny: 'Faltan `a` (por ejemplo T2) y `texto`.' }

    return { result: await mandar($, a.a, a.texto) }
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'terminal' }, async ($, e) => {
    if (yo === null) return { text: 'Esta terminal todavía no está registrada.' }
    const [sub = '', ...resto] = e.args.trim().split(/\s+/)
    const baja = sub.toLowerCase()

    if (baja === 'enviar') {
      const [a = '', ...palabras] = resto

      return { text: a === '' || palabras.length === 0 ? 'Uso: /terminal enviar T2 <mensaje>' : await mandar($, a, palabras.join(' ')) }
    }
    if (baja === 'tarea') {
      yo = { ...yo, tarea: recortar(resto.join(' '), 120) }
      await escribirYo($)

      return { text: `Tarea de ${yo.nombre}: ${yo.tarea || '(vacía)'}` }
    }
    if (baja === 'paralelo') {
      const rama = nombreRama(resto.join(' '))
      const carpeta = `${raiz.replace(/[\\/]+$/, '')}-${rama}`
      const r = await $.process.run(['git', 'worktree', 'add', carpeta, '-b', rama], { timeoutMs: 20_000 }).catch(() => undefined)
      if (r === undefined || r.exitCode !== 0) return { text: `No pude crear la copia: ${(r?.stderr ?? 'git no respondió').trim().slice(0, 200)}` }

      return { text: `Listo. Abre otra terminal y escribe:\n  cd "${carpeta}"\n  claude\nEs una copia del proyecto en la rama "${rama}": no se pisa con esta. Cuando termine, se junta con "git merge ${rama}".` }
    }
    const otras = await refrescar($)

    return {
      text: [`Esta terminal: ${yo.nombre}${yo.tarea !== '' ? ` · ${yo.tarea}` : ''}`, ...(otras.length === 0 ? ['No hay otras terminales abiertas en este proyecto.'] : otras.map(t => `${t.nombre} · ${t.tarea || 'sin tarea'} · ${Object.keys(t.archivos).length} archivos`))].join('\n'),
    }
  })
}
