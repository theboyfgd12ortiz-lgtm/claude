// Pure rules: no `$`, so tests can call them directly.

/** Paths whose recursive removal would wipe the machine or the home folder. */
const ROOTISH = /^(\/|\/\*|~|~\/|~\/\*|\$HOME|\$HOME\/|\$HOME\/\*|\$\{HOME\}\/?|\.\.\/?\.\.|\/home\/?|\/root\/?|\/Users\/?)$/

/** Files whose content is a secret: reading them puts credentials in context. */
const SECRET_FILE =
  /(^|[\/\s'"=])(\.env(\.(?!example\b|sample\b|template\b|dist\b|defaults\b)[\w.-]+)?|id_(rsa|dsa|ecdsa|ed25519)|[\w.-]+\.(pem|p12|pfx|key)|\.netrc|\.pgpass|credentials(\.json)?|\.aws\/credentials|\.npmrc|\.pypirc)(?=$|[\s'";|&)<>])/

const READERS = /^(cat|less|more|head|tail|bat|xxd|od|strings|base64|curl|source|grep|rg|awk|nl|tac)$/

/** Words that only wrap the real command: `sudo rm ...`, `env X=1 rm ...`. */
const WRAPPERS = new Set(['sudo', 'doas', 'env', 'command', 'builtin', 'exec', 'time', 'nohup', 'nice', 'xargs', 'then', 'do', 'else', '!', '{', '('])

type Segment = { text: string; words: string[] }

/**
 * Splits a shell line into its simple commands (&&, ||, ;, |, newlines) and each into
 * words, both outside quotes only: a quoted `rm -rf /` is an argument, not a command.
 */
const parse = (command: string): Segment[] => {
  const out: Segment[] = []
  let text = ''
  let words: string[] = []
  let word = ''
  let quote: '"' | "'" | null = null

  const endWord = () => {
    if (word !== '') words.push(word)
    word = ''
  }
  const endSegment = () => {
    endWord()
    if (words.length > 0) out.push({ text: text.trim(), words })
    text = ''
    words = []
  }

  for (let i = 0; i < command.length; i += 1) {
    const c = command[i] as string
    if (quote !== null) {
      text += c
      if (c === quote) quote = null
      else word += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      text += c
      continue
    }
    const two = command.slice(i, i + 2)
    if (two === '&&' || two === '||') {
      endSegment()
      i += 1
    } else if (c === ';' || c === '|' || c === '\n') {
      endSegment()
    } else {
      text += c
      if (/\s/.test(c)) endWord()
      else word += c
    }
  }
  endSegment()

  return out
}

/** The words from the command itself on: wrappers and VAR=value prefixes skipped. */
const commandWords = (w: string[]): string[] => {
  let i = 0
  while (i < w.length && (WRAPPERS.has(w[i] ?? '') || /^[A-Za-z_]\w*=/.test(w[i] ?? ''))) i += 1

  return w.slice(i)
}

const isRecursiveRemove = (c: string[]): boolean => {
  if (!(c[0] === 'rm' || c[0]?.endsWith('/rm'))) return false
  const flags = c.slice(1).filter(x => x.startsWith('-'))

  return flags.some(f => f === '--recursive' || (/^-[a-zA-Z]+$/.test(f) && /r/i.test(f)))
}

/** The script a `bash -c "..."` or `eval "..."` runs, so it is judged like a command line. */
const nestedScript = (c: string[]): string | undefined => {
  if (c[0] === 'eval') return c.slice(1).join(' ')
  if (/^(bash|sh|zsh|dash)$/.test(c[0] ?? '')) {
    const at = c.findIndex(x => /^-\w*c$/.test(x))

    return at >= 0 ? c[at + 1] : undefined
  }

  return undefined
}

/** Why a Bash command must not run, or undefined when it may. */
export const judgeCommand = (command: string): string | undefined => {
  for (const { text, words } of parse(command)) {
    const c = commandWords(words)

    const nested = nestedScript(c)
    if (nested !== undefined) {
      const inner = judgeCommand(nested)
      if (inner !== undefined) return inner
    }

    if (isRecursiveRemove(c)) {
      const target = c.slice(1).find(x => !x.startsWith('-') && ROOTISH.test(x))
      if (target !== undefined) {
        return `borrado recursivo de "${target}": borraría el sistema o tu carpeta personal`
      }
    }

    if (c[0] === 'git' && c.includes('push')) {
      const isForced = c.some(x => x === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(x))
      const isLeased = c.some(x => x.startsWith('--force-with-lease') || x.startsWith('--force-if-includes'))
      if (isForced && !isLeased) {
        return 'push forzado: puede sobrescribir commits de otros (usa --force-with-lease)'
      }
      if (c.some(x => /^\+(refs\/heads\/)?(main|master)\b/.test(x) || /^\+\S*:(refs\/heads\/)?(main|master)$/.test(x))) {
        return 'push forzado sobre main/master (usa --force-with-lease en otra rama)'
      }
    }

    if (/^mkfs(\.\w+)?$/.test(c[0] ?? '')) return 'formatea un disco'
    if (c[0] === 'dd' && c.some(x => /^of=\/dev\/(sd|nvme|hd|disk|xvd|vd)/.test(x))) return 'escribe directamente sobre un disco'
    if (/>\s*\/dev\/(sd|nvme|hd|disk|xvd|vd)\w*/.test(text)) return 'escribe directamente sobre un disco'
    if (c[0] === 'chmod' && c.includes('-R') && c.some(x => x === '777' || x === 'a+rwx') && c.includes('/')) {
      return 'da permisos totales a todo el sistema'
    }
    if (c[0] === 'chown' && c.includes('-R') && c.includes('/')) return 'cambia el dueño de todo el sistema'

    if (READERS.test(c[0] ?? '') && SECRET_FILE.test(text)) {
      return 'lee un archivo de secretos (.env, llave privada, credenciales)'
    }
  }

  if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(command)) return 'bomba fork (cuelga la máquina)'

  return undefined
}

/** Why reading this path must not happen, or undefined when it may. */
export const judgeSecretPath = (path: string): string | undefined =>
  SECRET_FILE.test(path) ? 'es un archivo de secretos (.env, llave privada, credenciales)' : undefined

/** Commands that throw away uncommitted work. */
export const discardsWork = (command: string): boolean =>
  parse(command).some(({ words }) => {
    const c = commandWords(words)

    return (
      c[0] === 'git' &&
      /^git\s+(reset\s+.*--hard|checkout\s+(--\s+)?\.(\s|$)|restore\s+(--\S+\s+)*\.(\s|$)|clean\s+-[a-zA-Z]*f|stash\s+(drop|clear))/.test(c.join(' '))
    )
  })

/**
 * Claves que nunca deben escribirse en un archivo del proyecto. Solo formas inconfundibles:
 * una clave pública de un sitio (por ejemplo la "anon" de Supabase) no entra aquí.
 */
const SECRETOS: readonly { nombre: string; patron: RegExp }[] = [
  { nombre: 'una llave privada', patron: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { nombre: 'una clave de Anthropic', patron: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { nombre: 'una clave de OpenAI', patron: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { nombre: 'un token de GitHub', patron: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}/ },
  { nombre: 'una clave de AWS', patron: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { nombre: 'un token de Slack', patron: /\bxox[abprs]-[A-Za-z0-9-]{20,}/ },
  { nombre: 'una clave secreta de Stripe', patron: /\b[sr]k_live_[A-Za-z0-9]{20,}/ },
  { nombre: 'una clave "service_role" de Supabase', patron: /service_role['"]?\s*[:=]\s*['"]eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\./ },
]

/** Archivos donde sí es normal tener secretos (o ejemplos): no se revisan. */
const SIN_REVISAR = /(^|[\/\\])(\.env(\.[\w.-]+)?|[\w.-]+\.(?:example|sample|template)|[\w.-]*test[\w.-]*|[\w.-]*\.md)$/i

/** Qué secreto hay en el texto que se va a escribir en `ruta`, o undefined si no hay. */
export const secretoEn = (ruta: string, texto: string): string | undefined => {
  if (SIN_REVISAR.test(ruta) && !/\.md$/i.test(ruta)) return undefined
  if (/\.md$/i.test(ruta) && !/PRIVATE KEY/.test(texto)) return undefined

  return SECRETOS.find(s => s.patron.test(texto))?.nombre
}
