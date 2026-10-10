import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GuardianBlock } from '../types'
import { discardsWork, judgeCommand, judgeSecretPath, secretoEn } from './rules'

const ASK = 'If the user explicitly wants this, ask them to run it themselves or to type /guardian off.'

const isActive = atom({ plugin: 'guardian', key: 'isActive' } as const, false)
const isPaused = atom({ plugin: 'guardian', key: 'isPaused' } as const, false)
const blocks = atom({ plugin: 'guardian', key: 'blocks' } as const, [])

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
}
