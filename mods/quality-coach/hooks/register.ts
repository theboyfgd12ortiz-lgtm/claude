import { atom, update } from 'claude-code'
import type { Register } from 'claude-code'

import { COMPACT_HINT, isCodeFile, isVerification, RULES, runsEdited } from './rules'

const isActive = atom({ plugin: 'quality-coach', key: 'isActive' } as const, false)
const stats = atom({ plugin: 'quality-coach', key: 'stats' } as const, { codeTurns: 0, verifiedTurns: 0, lastWarning: null })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, isActive, () => true)

    return next(e)
  })

  let edited = new Set<string>()
  let verifications = 0

  // 1. A short set of working rules, after the cache boundary.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (e.traits.includes('bare') || e.traits.includes('analysis')) return composed

    return { sections: [...composed.sections, { id: 'quality-coach:rules', text: RULES, scope: 'session' }] }
  })

  // 2. What each turn changed and whether it was checked.
  on('turn.start', ($, e, next) => {
    edited = new Set()
    verifications = 0

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran

    if (e.tool === 'Edit' || e.tool === 'Write') {
      if (isCodeFile(e.file_path)) edited.add(e.file_path)
    } else if (e.tool === 'NotebookEdit') {
      edited.add(e.notebook_path)
    } else if (e.tool === 'Bash' && (isVerification(e.command) || runsEdited(e.command, edited))) {
      verifications += 1
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer') return done

    if (edited.size === 0) return done
    const isVerified = verifications > 0
    const names = [...edited].map(path => path.split('/').pop()).slice(0, 5).join(', ')
    await update($, stats, s => ({
      codeTurns: s.codeTurns + 1,
      verifiedTurns: s.verifiedTurns + (isVerified ? 1 : 0),
      lastWarning: isVerified ? s.lastWarning : `${names}: cambiado sin tests, lint ni build`,
    }))

    if (!isVerified) {
      $.ui.toast(`quality-coach: ${edited.size} archivo(s) de código cambiados (${names}) sin tests, lint ni build`)
      await $.session
        .append({
          message: {
            type: 'user',
            content: [
              {
                type: 'text',
                text:
                  `<quality-coach>Last turn changed ${names} but ran no test, lint, typecheck or build. ` +
                  'Before building further on it, verify it where the project allows, or say why it cannot be verified.</quality-coach>',
              },
            ],
          },
        })
        .catch(() => undefined)
    }

    return done
  })

  // 3. Compaction keeps what the work depends on.
  on('session.compact', ($, e, next) =>
    next({ ...e, instructions: e.instructions === undefined ? COMPACT_HINT : `${e.instructions}\n\n${COMPACT_HINT}` }),
  ).catch(($, e, next) => next(e))
}
