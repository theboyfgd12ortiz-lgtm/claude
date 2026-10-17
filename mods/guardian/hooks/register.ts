import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GuardianBlock } from '../types'
import { cambiosDesde, crearPunto, podar, PUNTOS_MAX, PUNTOS_MAX_NOCHE, restaurar, type Run } from './git'
import { discardsWork, judgeCommand, judgePowerShell, judgeSecretPath, modoNocheActivo, secretoEn, tipoDescarte } from './rules'

const ASK = 'If the user explicitly wants this, ask them to run it themselves or to type /guardian off.'
// Con el modo noche nadie contesta: Claude busca otra salida segura, anota la duda y sigue con otro paso.
const ASK_NOCHE =
  'Modo noche: no esperes al usuario ni le preguntes. Busca una alternativa segura; si no la hay, anota la duda en "Para ortiz" y sigue con otro paso.'

const isActive = atom({ plugin: 'guardian', key: 'isActive' } as const, false)
const isPaused = atom({ plugin: 'guardian', key: 'isPaused' } as const, false)
const blocks = atom({ plugin: 'guardian', key: 'blocks' } as const, [])

const respaldoPuntos = atom({ plugin: 'guardian', key: 'respaldoPuntos' } as const, [])
const respaldoAuto = atom({ plugin: 'guardian', key: 'respaldoAuto' } as const, true)
const respaldoVista = atom({ plugin: 'guardian', key: 'respaldoVista' } as const, null)
const respaldoMensaje = atom({ plugin: 'guardian', key: 'respaldoMensaje' } as const, null)

// Las confirmaciones y los commits ocultos necesitan una identidad; no se toca la de la persona.
const ENTORNO = {
  GIT_AUTHOR_NAME: 'claude-mods',
  GIT_AUTHOR_EMAIL: 'claude-mods@localhost',
  GIT_COMMITTER_NAME: 'claude-mods',
  GIT_COMMITTER_EMAIL: 'claude-mods@localhost',
}

const correr = ($: EngineInterface): Run => async argv => {
  try {
    const r = await $.process.run(argv, { env: ENTORNO, timeoutMs: 20_000 })

    return { code: r.exitCode, out: r.exitCode === 0 ? r.stdout : `${r.stdout}${r.stderr}` }
  } catch {
    return { code: 127, out: '' }
  }
}

/** ¿Está activo el modo noche? Lo marca ~/.claude/modo-noche.json; si falta, está mal formado o no se puede leer, está apagado. */
const esNoche = async ($: EngineInterface): Promise<boolean> => {
  try {
    const casa = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    if (casa === undefined || casa === '') return false

    return modoNocheActivo(await $.fs.read(`${casa.replace(/[\\/]+$/, '')}/.claude/modo-noche.json`), await $.clock.now())
  } catch {
    return false
  }
}

/** La frase final de los bloqueos: pedir ayuda a la persona, o (de noche) buscar otra salida. */
const pedir = async ($: EngineInterface): Promise<string> => ((await esNoche($)) ? ASK_NOCHE : ASK)

/** El pedido tal como lo escribió la persona (lo guarda prompt.submit antes de que otros le añadan contexto). */
let pedidoActual = ''

/** Records the block for the panel, tells the person, and refuses the call. */
const refuse = async (
  $: EngineInterface,
  command: string,
  why: string,
  deny: string,
) => {
  // The refusal must stand even if the bookkeeping fails.
  try {
    const block: GuardianBlock = { at: await $.clock.now(), command: command.slice(0, 120), why }
    await update($, blocks, list => [...list, block].slice(-20))
    $.ui.toast(`guardian bloqueó: ${command.slice(0, 60)}`)
  } catch {
    // Nothing to record; still refuse.
  }

  return { deny } as const
}

/** Anota un punto de restauración nuevo y poda los que sobran (30 de noche, 8 de día). */
const guardarPunto = async ($: EngineInterface, id: string, pedido: string) => {
  const nuevo = await crearPunto(correr($), id, await $.clock.now(), pedido)
  if (nuevo === null) return null
  const max = (await esNoche($)) ? PUNTOS_MAX_NOCHE : PUNTOS_MAX
  const podados = await podar(correr($), [...(await read($, respaldoPuntos)), nuevo], max)
  await update($, respaldoPuntos, () => podados)

  return nuevo
}

/** Lo que decide el guardián para un comando de shell: bloquearlo o dejarlo pasar con un aviso (tras un respaldo). */
type Veredicto = { deny: string } | { aviso: string }

/** Why a shell command must be refused (a deny result), or undefined when it may run. */
const blockShell = async (
  $: EngineInterface,
  command: string,
  judge: (command: string) => string | undefined,
): Promise<Veredicto | undefined> => {
  const why = judge(command)
  if (why !== undefined) {
    return refuse($, command, why, `${$.plugin.name}: blocked: ${why}. ${await pedir($)}`)
  }

  if (discardsWork(command)) {
    const status = await $.process.run(['git', 'status', '--porcelain'], { timeoutMs: 5000 }).catch(() => undefined)
    const dirty = status?.stdout.trim() ?? ''
    if (dirty.length > 0) {
      const files = dirty.split('\n').slice(0, 8).join(', ')
      const reason = `borraría cambios sin commitear (${files})`

      // Salida segura: si solo pisa archivos con cambios, se guarda un respaldo y se deja pasar.
      if (tipoDescarte(command) === 'recuperable' && (await read($, respaldoAuto))) {
        try {
          const punto = await guardarPunto($, `pre-${await $.clock.now()}`, `antes de: ${command}`)
          if (punto !== null) {
            $.ui.toast(`guardian: respaldo antes de ${command.slice(0, 50)}`)

            return {
              aviso: `${$.plugin.name}: guardé un respaldo ("${punto.id}") antes de este comando, porque borraba cambios sin commitear. Se deshace con /respaldo.`,
            }
          }
        } catch {
          // Sin un respaldo comprobado no se deja pasar: cae al bloqueo de abajo.
        }
      }

      const final = (await esNoche($)) ? ASK_NOCHE : `Or confirm with the user. ${ASK}`

      return refuse(
        $,
        command,
        reason,
        `${$.plugin.name}: blocked: ${reason}. Safe alternative: \`git stash push -u\` or a commit first (new files and stashes cannot be backed up). ${final}`,
      )
    }
  }

  return undefined
}

/** Aplica el veredicto a una llamada de shell: bloquea, o deja pasar y añade el aviso del respaldo. */
const juzgarShell = async (
  $: EngineInterface,
  command: string,
  judge: (command: string) => string | undefined,
  e: unknown,
  next: (e: never) => Promise<{ deny?: string; context?: readonly string[] }>,
) => {
  if (await read($, isPaused)) return next(e as never)
  const v = await blockShell($, command, judge)
  if (v === undefined) return next(e as never)
  if ('deny' in v) return v
  const r = await next(e as never)

  return r.deny === undefined ? { ...r, context: [...(r.context ?? []), v.aviso] } : r
}

const AVISO_SECRETO = async ($: EngineInterface, donde: string, que: string) =>
  `guardian: no escribo ${que} en ${donde}: las claves no van dentro del código. Guárdala en un archivo .env (que no se sube) y léela desde ahí con una variable de entorno. ${(await esNoche($)) ? ASK_NOCHE : 'Si de verdad es una clave pública, avisa al usuario.'}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'guardian',
      description: 'Guardian safety checks: /guardian off | on | status',
      argumentHint: 'off | on | status',
    })
    await $.command.register({
      name: 'respaldo',
      description: 'Puntos de restauración: /respaldo (estado) · on · off · volver (al último punto)',
      argumentHint: 'on | off | volver',
    })
    if ((await $.store.get('respaldoAuto').catch(() => undefined)) === false) await update($, respaldoAuto, () => false)
    await update($, isActive, () => true)

    return next(e)
  })

  on('command.run', { command: 'guardian' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off') await update($, isPaused, () => true)
    if (arg === 'on') await update($, isPaused, () => false)
    const paused = await read($, isPaused)
    $.ui.status(paused ? 'guardian: en pausa' : undefined)

    return { text: `Guardian está ${paused ? 'EN PAUSA en esta sesión (/guardian on para reactivarlo)' : 'ACTIVO'}.` }
  })

  // Destructive shell commands: Bash, and PowerShell on Windows.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => juzgarShell($, e.command, judgeCommand, e, next as never) as never).catch(
    async ($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its safety check failed; ${await pedir($)}` }),
  )
  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => juzgarShell($, e.command, judgePowerShell, e, next as never) as never).catch(
    async ($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its safety check failed; ${await pedir($)}` }),
  )

  // Secrets read into the conversation.
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    if (await read($, isPaused)) return next(e)

    const why = judgeSecretPath(e.file_path)

    return why === undefined
      ? next(e)
      : refuse(
          $,
          `Read ${e.file_path}`,
          why,
          `${$.plugin.name}: not reading ${e.file_path}: ${why}. Refer to variable names, or use the .example file. ${await pedir($)}`,
        )
  }).catch(async ($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its safety check failed; ${await pedir($)}` }))

  // Claves que se escribirían en un archivo del proyecto (subirlas a GitHub o a un sitio publicado las expone).

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    if (await read($, isPaused)) return next(e)
    const que = secretoEn(e.file_path, e.content)

    return que === undefined ? next(e) : refuse($, `Write ${e.file_path}`, `iba a escribir ${que}`, await AVISO_SECRETO($, e.file_path, que))
  }).catch(async ($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its safety check failed; ${await pedir($)}` }))

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    if (await read($, isPaused)) return next(e)
    const que = secretoEn(e.file_path, e.new_string)

    return que === undefined ? next(e) : refuse($, `Edit ${e.file_path}`, `iba a escribir ${que}`, await AVISO_SECRETO($, e.file_path, que))
  }).catch(async ($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its safety check failed; ${await pedir($)}` }))

  on('prompt.submit', async ($, e, next) => {
    const quien = (e.origin as { kind?: string } | undefined)?.kind
    if (quien === undefined || ['composer', 'bridge', 'sdk', 'slack-ping', 'unclassified'].includes(quien)) {
      pedidoActual = e.text.replace(/<(system-reminder|local-command-caveat|local-command-stdout|local-command-stderr|command-name|command-message|command-args)>[\s\S]*?<\/\1>/g, '')
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // Antes de que Claude empiece a trabajar, se anota cómo está el proyecto.
  on('turn.start', async ($, e, next) => {
    if (await read($, respaldoAuto)) {
      try {
        const lista = await read($, respaldoPuntos)
        const nuevo = await crearPunto(correr($), e.turnId.replace(/[^\w-]/g, '').slice(0, 24) || String(lista.length), await $.clock.now(), pedidoActual)
        const ultimo = lista.at(-1)
        // Si nada cambió desde el último punto, ese ya sirve.
        if (nuevo !== null && !(ultimo && ultimo.sha === nuevo.sha && ultimo.existentes.length === nuevo.existentes.length)) {
          const podados = await podar(correr($), [...lista, nuevo], (await esNoche($)) ? PUNTOS_MAX_NOCHE : PUNTOS_MAX)
          await update($, respaldoPuntos, () => podados)
        }
      } catch {
        // Un respaldo que falla nunca frena el pedido.
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'respaldo' }, async ($, e) => {
    const [accion = '', id = ''] = e.args.trim().split(/\s+/)
    const lista = await read($, respaldoPuntos)

    if (accion === 'on' || accion === 'off') {
      await update($, respaldoAuto, () => accion === 'on')
      await $.store.set('respaldoAuto', accion === 'on').catch(() => undefined)

      return { text: `Respaldo automático ${accion === 'on' ? 'activado' : 'apagado'}.` }
    }

    // "preparar" calcula qué pasaría y lo deja a la vista del panel; no cambia ningún archivo.
    if (accion === 'preparar' || accion === 'volver') {
      const punto = id === '' ? lista.at(-1) : lista.find(p => p.id === id)
      if (punto === undefined) return { text: 'No hay un punto de restauración todavía (hace falta un proyecto con git y haber hecho un pedido).' }
      const c = await cambiosDesde(correr($), punto)
      await update($, respaldoVista, () => ({ id: punto.id, ...c }))

      return { text: `Volver a "${punto.pedido}" tocaría ${c.modificados.length} archivos y quitaría ${c.creados.length} nuevos. Confírmalo en el panel.` }
    }

    if (accion === 'aplicar') {
      const punto = lista.find(p => p.id === id)
      if (punto === undefined) return { text: 'Ese punto ya no existe.' }
      const r = await restaurar(correr($), punto)
      await update($, respaldoVista, () => null)
      if (r.error !== undefined) {
        await update($, respaldoMensaje, () => `No se pudo volver: ${r.error}`)

        return { text: `No se pudo volver: ${r.error}` }
      }
      const texto = `Listo: volví al estado anterior a "${punto.pedido}" (${r.modificados} archivos restaurados, ${r.creados} quitados).`
      await update($, respaldoMensaje, () => texto)
      $.ui.toast(texto)

      return { text: texto }
    }

    if (accion === 'cancelar') {
      await update($, respaldoVista, () => null)

      return { text: 'Cancelado: no se cambió nada.' }
    }

    return {
      text: `Respaldo ${(await read($, respaldoAuto)) ? 'activo' : 'apagado'} · ${lista.length} puntos${lista.at(-1) ? ` · el último: "${lista.at(-1)?.pedido}"` : ''}`,
    }
  })
}
