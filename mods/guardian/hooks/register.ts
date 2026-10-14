import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GuardianBlock } from '../types'
import { cambiosDesde, crearPunto, podar, restaurar, type Run } from './git'
import { discardsWork, judgeCommand, judgeSecretPath, secretoEn } from './rules'

const ASK = 'If the user explicitly wants this, ask them to run it themselves or to type /guardian off.'

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

  // Destructive shell commands.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (await read($, isPaused)) return next(e)

    const why = judgeCommand(e.command)
    if (why !== undefined) {
      return refuse($, e.command, why, `${$.plugin.name}: blocked: ${why}. ${ASK}`)
    }

    if (discardsWork(e.command)) {
      const status = await $.process.run(['git', 'status', '--porcelain'], { timeoutMs: 5000 }).catch(() => undefined)
      const dirty = status?.stdout.trim() ?? ''
      if (dirty.length > 0) {
        const files = dirty.split('\n').slice(0, 8).join(', ')
        const reason = `borraría cambios sin commitear (${files})`

        return refuse(
          $,
          e.command,
          reason,
          `${$.plugin.name}: blocked: ${reason}. Commit or \`git stash\` them first, or confirm with the user. ${ASK}`,
        )
      }
    }

    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its safety check failed; ${ASK}` }))

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
          `${$.plugin.name}: not reading ${e.file_path}: ${why}. Refer to variable names, or use the .example file. ${ASK}`,
        )
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its safety check failed; ${ASK}` }))

  // Claves que se escribirían en un archivo del proyecto (subirlas a GitHub o a un sitio publicado las expone).
  const AVISO_SECRETO = (donde: string, que: string) =>
    `guardian: no escribo ${que} en ${donde}: las claves no van dentro del código. Guárdala en un archivo .env (que no se sube) y léela desde ahí con una variable de entorno. Si de verdad es una clave pública, avisa al usuario.`

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    if (await read($, isPaused)) return next(e)
    const que = secretoEn(e.file_path, e.content)

    return que === undefined ? next(e) : refuse($, `Write ${e.file_path}`, `iba a escribir ${que}`, AVISO_SECRETO(e.file_path, que))
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its safety check failed; ${ASK}` }))

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    if (await read($, isPaused)) return next(e)
    const que = secretoEn(e.file_path, e.new_string)

    return que === undefined ? next(e) : refuse($, `Edit ${e.file_path}`, `iba a escribir ${que}`, AVISO_SECRETO(e.file_path, que))
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its safety check failed; ${ASK}` }))

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
          const podados = await podar(correr($), [...lista, nuevo])
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
