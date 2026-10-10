// Pure rules: no `$`, so tests can call them directly.

/** Paths whose recursive removal would wipe the machine or the home folder. */
const ROOTISH = /^(\/|\/\*|~|~\/|~\/\*|\$HOME|\$HOME\/|\$HOME\/\*|\$\{HOME\}\/?|\.\.\/?\.\.|\/home\/?|\/root\/?|\/Users\/?)$/

/** Files whose content is a secret: reading them puts credentials in context. */
const SECRET_FILE =
  /(^|[\/\s'"=])(\.env(\.(?!example\b|sample\b|template\b|dist\b|defaults\b)[\w.-]+)?|id_(rsa|dsa|ecdsa|ed25519)|[\w.-]+\.(pem|p12|pfx|key)|\.netrc|\.pgpass|credentials(\.json)?|\.aws\/credentials|\.npmrc|\.pypirc)(?=$|[\s'";|&)<>])/

const READERS = /^(cat|less|more|head|tail|bat|xxd|od|strings|base64|curl|source|grep|rg|awk|nl|tac)$/

/** Splits a shell line into its simple commands, roughly (&&, ||, ;, |, newlines). */
const segments = (command: string): string[] =>
  command
    .split(/&&|\|\||;|\n|\|/)
    .map(part => part.trim())
    .filter(part => part.length > 0)

const words = (segment: string): string[] => segment.split(/\s+/).map(w => w.replace(/^['"]|['"]$/g, ''))

const isRecursiveRemove = (w: string[]): boolean => {
  const at = w.findIndex(x => x === 'rm' || x.endsWith('/rm'))
  if (at < 0) return false
  const flags = w.slice(at + 1).filter(x => x.startsWith('-'))
  return flags.some(f => f === '--recursive' || (/^-[a-zA-Z]+$/.test(f) && /r/i.test(f)))
}

/** Why a Bash command must not run, or undefined when it may. */
export const judgeCommand = (command: string): string | undefined => {
  for (const segment of segments(command)) {
    const w = words(segment)

    if (isRecursiveRemove(w)) {
      const target = w.slice(1).find(x => !x.startsWith('-') && x !== 'rm' && ROOTISH.test(x))
      if (target !== undefined) {
        return `recursive delete of "${target}" would wipe the system or the home folder`
      }
    }

    if (/^git\b/.test(segment) && /\bpush\b/.test(segment)) {
      const isForced = w.some(x => x === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(x))
      const isLeased = w.some(x => x.startsWith('--force-with-lease') || x.startsWith('--force-if-includes'))
      if (isForced && !isLeased) {
        return 'force push can overwrite other people\'s commits; use --force-with-lease instead'
      }
      if (/(^|\s)\+?(refs\/heads\/)?(main|master)(\s|$)/.test(segment) && w.some(x => x.startsWith('+'))) {
        return 'forced refspec onto main/master; use --force-with-lease on a feature branch instead'
      }
    }

    if (/\bmkfs(\.\w+)?\b/.test(segment)) return 'formatting a filesystem'
    if (/\bdd\b.*\bof=\/dev\/(sd|nvme|hd|disk|xvd|vd)/.test(segment)) return 'writing raw bytes onto a disk device'
    if (/>\s*\/dev\/(sd|nvme|hd|disk|xvd|vd)\w*/.test(segment)) return 'redirecting output onto a disk device'
    if (/\bchmod\b.*-R\b.*\b(777|a\+rwx)\b.*\s\/(\s|$)/.test(segment)) return 'making the whole filesystem world-writable'
    if (/\bchown\b.*-R\b.*\s\/(\s|$)/.test(segment)) return 'changing ownership of the whole filesystem'

    if (READERS.test(w[0] ?? '') && SECRET_FILE.test(segment)) {
      return 'it reads a secrets file (.env, private key, credentials) into the conversation'
    }
  }

  if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(command)) return 'fork bomb'

  return undefined
}

/** Why reading this path must not happen, or undefined when it may. */
export const judgeSecretPath = (path: string): string | undefined =>
  SECRET_FILE.test(path) ? 'it is a secrets file (.env, private key, credentials)' : undefined

/** Commands that throw away uncommitted work. */
export const discardsWork = (command: string): boolean =>
  segments(command).some(segment =>
    /^git\s+(reset\s+.*--hard|reset\s+--hard|checkout\s+(--\s+)?\.(\s|$)|restore\s+(--\S+\s+)*\.(\s|$)|clean\s+-[a-zA-Z]*f|stash\s+drop|stash\s+clear)/.test(segment),
  )
