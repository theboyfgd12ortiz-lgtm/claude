import type { Register } from 'claude-code'

import { discardsWork, judgeCommand, judgeSecretPath } from './rules'

const ASK = 'If the user explicitly wants this, ask them to run it themselves or to type /guardian off.'

export const register: Register = on => {
  let isPaused = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'guardian',
      description: 'Guardian safety checks: /guardian off | on | status',
      argumentHint: 'off | on | status',
    })

    return next(e)
  })

  on('command.run', { command: 'guardian' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off') isPaused = true
    if (arg === 'on') isPaused = false
    $.ui.status(isPaused ? 'guardian: en pausa' : undefined)

    return { text: `Guardian está ${isPaused ? 'EN PAUSA en esta sesión (/guardian on para reactivarlo)' : 'ACTIVO'}.` }
  })

  // Destructive shell commands.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (isPaused) return next(e)

    const why = judgeCommand(e.command)
    if (why !== undefined) {
      $.ui.toast(`guardian bloqueó: ${e.command.slice(0, 60)}`)

      return { deny: `${$.plugin.name}: blocked because ${why}. ${ASK}` }
    }

    if (discardsWork(e.command)) {
      const status = await $.process.run(['git', 'status', '--porcelain'], { timeoutMs: 5000 }).catch(() => undefined)
      const dirty = status?.stdout.trim() ?? ''
      if (dirty.length > 0) {
        const files = dirty.split('\n').slice(0, 8).join(', ')

        return {
          deny:
            `${$.plugin.name}: blocked because this discards uncommitted changes (${files}). ` +
            'Commit or `git stash` them first, or confirm with the user. ' + ASK,
        }
      }
    }

    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its safety check failed; ${ASK}` }))

  // Secrets read into the conversation.
  on('tool.call', { tool: 'Read' }, ($, e, next) => {
    if (isPaused) return next(e)

    const why = judgeSecretPath(e.file_path)

    return why === undefined
      ? next(e)
      : { deny: `${$.plugin.name}: not reading ${e.file_path} because ${why}. Refer to variable names, or use the .example file. ${ASK}` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its safety check failed; ${ASK}` }))
}
