import { describe, expect, mock, test } from 'claude-code/testing'

import { discardsWork, judgeCommand, judgePowerShell, judgeSecretPath, modoNocheActivo, secretoEn, tipoDescarte } from './rules'

describe('rules', () => {
  test('blocks catastrophic commands', () => {
    for (const cmd of [
      'rm -rf /',
      'sudo true && rm -rf ~',
      'rm -fr $HOME',
      'rm --recursive --force /*',
      'git push --force origin main',
      'git push -f',
      'mkfs.ext4 /dev/sda1',
      'dd if=/dev/zero of=/dev/sda',
      'cat .env',
      'grep KEY .env.local',
      'cat ~/.ssh/id_rsa',
      'sudo rm -rf /',
      'bash -c "rm -rf ~"',
      'eval "git push --force"',
      'FOO=1 rm -rf $HOME',
    ]) {
      expect(judgeCommand(cmd)).toBeDefined()
    }
  })

  test('lets everyday commands through', () => {
    for (const cmd of [
      'rm -rf node_modules',
      'rm -rf ./dist build',
      'git push -u origin feature',
      'git push --force-with-lease origin feature',
      'cat .env.example',
      'ls -la',
      'npm test',
      'grep -rn "env" src',
      'cp .env.example .env',
      'echo "rm -rf /"',
      'git commit -m "docs: never run rm -rf / or mkfs"',
      'rtk rewrite "git push --force"',
      'grep -n "mkfs" notes.txt',
      'bash -c "ls -la"',
    ]) {
      expect(judgeCommand(cmd)).toBeUndefined()
    }
  })

  test('PowerShell: blocks catastrophic commands', () => {
    for (const cmd of [
      'Remove-Item -Recurse -Force C:\\',
      String.raw`Remove-Item -Path C:\Users\thebo -Recurse`,
      String.raw`rm -r -fo $env:USERPROFILE\*`,
      'Remove-Item -Recurse $HOME',
      String.raw`del /s /q C:\Windows`,
      'cmd /c rd /s /q C:\\',
      String.raw`powershell -Command "Remove-Item -Recurse -Force C:\Users"`,
      'Remove-Item -Recurse:$true C:\\',
      String.raw`Get-ChildItem C:\ -Recurse | Remove-Item -Force`,
      'Get-ChildItem $HOME | ForEach-Object { Remove-Item $_ -Recurse -Force }',
      String.raw`& { Remove-Item -Recurse -Force C:\Users }`,
      'Format-Volume -DriveLetter D',
      'format C:',
      'Get-Content .env',
      String.raw`gc C:\proyecto\.env.local`,
      String.raw`type C:\Users\thebo\.ssh\id_ed25519`,
      'git push --force origin main',
    ]) {
      expect(judgePowerShell(cmd)).toBeDefined()
    }
  })

  test('PowerShell: lets everyday commands through', () => {
    for (const cmd of [
      'Remove-Item -Recurse -Force node_modules',
      String.raw`Remove-Item -Recurse C:\Users\thebo\proyecto\dist`,
      String.raw`rm -r .\build`,
      String.raw`Get-ChildItem .\dist -Recurse | Remove-Item -Force`,
      'cd ~; Remove-Item -Recurse dist',
      'Get-ChildItem -Recurse | Select-String "rm"',
      'Get-Content .env.example',
      'Get-ChildItem -Recurse C:\\',
      'git push -u origin feature',
      'npm test',
      String.raw`Write-Output "Remove-Item -Recurse C:\"`,
    ]) {
      expect(judgePowerShell(cmd)).toBeUndefined()
    }
  })

  test('secret paths', () => {
    expect(judgeSecretPath('/app/.env')).toBeDefined()
    expect(judgeSecretPath('/app/.env.production')).toBeDefined()
    expect(judgeSecretPath('/home/u/.ssh/id_ed25519')).toBeDefined()
    expect(judgeSecretPath('/app/certs/server.pem')).toBeDefined()
    expect(judgeSecretPath('/app/.env.example')).toBeUndefined()
    expect(judgeSecretPath('/app/src/env.ts')).toBeUndefined()
    expect(judgeSecretPath('/app/src/keyboard.ts')).toBeUndefined()
  })

  test('work-discarding git commands', () => {
    expect(discardsWork('git reset --hard HEAD~1')).toBe(true)
    expect(discardsWork('git checkout -- .')).toBe(true)
    expect(discardsWork('git clean -fd')).toBe(true)
    expect(discardsWork('git reset HEAD file')).toBe(false)
    expect(discardsWork('git checkout main')).toBe(false)
  })
})

test('denies a destructive Bash call and runs a safe one', async ($, on) => {
  mock.clock(on)
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: 'ran', stderr: '', interrupted: false },
  }))

  const bad = await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })
  expect(bad.deny).toMatch(/guardian: blocked/)

  const good = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(good.deny).toBeUndefined()
  expect(good.text ?? (good.result as { stdout: string }).stdout).toMatch(/ran/)
})

test('denies a destructive PowerShell call', async ($, on) => {
  mock.clock(on)
  on('tool.call', { tool: 'PowerShell' } as never, (() => ({ result: { stdout: 'ran', stderr: '', interrupted: false } })) as never)

  const bad = await $.tool.call({ tool: 'PowerShell', command: 'Remove-Item -Recurse -Force C:\\' } as never)
  expect(bad.deny).toMatch(/guardian: blocked/)
  const good = await $.tool.call({ tool: 'PowerShell', command: 'Get-ChildItem' } as never)
  expect(good.deny).toBeUndefined()
})

test('denies reading a .env file even without a clock', async ($, on) => {
  on('tool.call', { tool: 'Read' }, () => ({ result: 'unused' as never }))
  const res = await $.tool.call({ tool: 'Read', file_path: '/repo/.env' })
  expect(res.deny).toMatch(/secretos/)
})

describe('claves en archivos', () => {
  test('detecta claves inconfundibles', () => {
    const f = (a: string, b: string) => a + b
    expect(secretoEn('app.js', `const k = "${f('sk-ant-', 'api03-abcdefghijklmnopqrstuvwxyz0123')}"`)).toBe('una clave de Anthropic')
    expect(secretoEn('app.js', `token: "${f('ghp_', 'abcdefghijklmnopqrstuvwxyz0123456789')}"`)).toBe('un token de GitHub')
    expect(secretoEn('k.js', `${f('AKIA', 'ABCDEFGHIJKLMNOP')}`)).toBe('una clave de AWS')
    expect(secretoEn('deploy.sh', '-----BEGIN ' + 'PRIVATE KEY-----\nabc')).toBe('una llave privada')
    expect(secretoEn('x.js', `${f('sk_live_', 'abcdefghijklmnopqrstuvwx')}`)).toBe('una clave secreta de Stripe')
  })

  test('deja pasar lo normal', () => {
    expect(secretoEn('app.js', 'const url = "https://x.supabase.co"; const anon = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.firma"')).toBeUndefined()
    expect(secretoEn('.env', 'KEY=' + 'sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz0123')).toBeUndefined()
    expect(secretoEn('.env.example', 'KEY=' + 'AKIA' + 'ABCDEFGHIJKLMNOP')).toBeUndefined()
    expect(secretoEn('notas.md', 'usa una clave que empiece con sk-ant-')).toBeUndefined()
    expect(secretoEn('app.js', 'const sk = 1; // sk-')).toBeUndefined()
  })
})

test('rechaza escribir una clave en un archivo', async ($, on) => {
  mock.clock(on)
  on('tool.call', { tool: 'Write' }, () => ({ result: { type: 'create', filePath: 'x' } }) as never)
  const clave = 'ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789'
  const mala = await $.tool.call({ tool: 'Write', file_path: '/r/app.js', content: `const t = "${clave}"` } as never)
  expect(mala.deny).toMatch(/no escribo un token de GitHub/)
  const buena = await $.tool.call({ tool: 'Write', file_path: '/r/app.js', content: 'const t = process.env.TOKEN' } as never)
  expect(buena.deny).toBeUndefined()
})

describe('modo noche y salida segura', () => {
  test('tipoDescarte separa lo que un respaldo recupera', () => {
    expect(tipoDescarte('git reset --hard HEAD~1')).toBe('recuperable')
    expect(tipoDescarte('git checkout -- .')).toBe('recuperable')
    expect(tipoDescarte('git clean -fd')).toBe('irrecuperable')
    expect(tipoDescarte('git stash drop')).toBe('irrecuperable')
    expect(tipoDescarte('git reset --hard && git clean -fd')).toBe('irrecuperable')
    expect(tipoDescarte('git status')).toBeUndefined()
  })

  test('modoNocheActivo tolera archivo ausente o roto', () => {
    expect(modoNocheActivo('{"activo":true,"desde":"2026-10-16T01:00:00Z"}')).toBe(true)
    expect(modoNocheActivo('{"activo":false}')).toBe(false)
    expect(modoNocheActivo('{roto')).toBe(false)
    expect(modoNocheActivo('')).toBe(false)
    expect(modoNocheActivo(null)).toBe(false)
    expect(modoNocheActivo('null')).toBe(false)
  })
})

const FIN = { isStdoutTruncated: false, isStderrTruncated: false }

/** Prepara un git de mentira con cambios sin commitear, y el modo noche encendido o no. */
const prepararGit = (on: (...a: never[]) => unknown, noche: boolean, gitOk = true) => {
  const o = on as unknown as (e: string, h: (...a: never[]) => unknown) => void
  const llamadas: string[] = []
  o('env.get', (() => ({ value: 'C:/Users/x' })) as never)
  o('fs.read', (() => {
    if (!noche) throw new Error('no existe')

    return { value: '{"activo":true,"desde":"2026-10-16T01:00:00Z"}' }
  }) as never)
  o('ui.toast', (() => ({ value: undefined })) as never)
  o('process.run', ((_$: unknown, e: { argv: string[] }) => {
    const c = e.argv.join(' ')
    llamadas.push(c)
    const salida = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', ...FIN } })
    if (c.startsWith('git status')) return salida(' M index.html\n')
    if (c.startsWith('git rev-parse --is-inside-work-tree')) return salida(gitOk ? 'true\n' : '', gitOk ? 0 : 128)
    if (c.startsWith('git stash create')) return salida('abc123\n')
    if (c.startsWith('git update-ref')) return salida('')

    return salida('')
  }) as never)

  return llamadas
}

test('antes de un reset --hard guarda un respaldo y lo deja pasar', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }))
  const llamadas = prepararGit(on as never, false)

  const r = await $.tool.call({ tool: 'Bash', command: 'git reset --hard HEAD~1' })
  expect(r.deny).toBeUndefined()
  expect(llamadas.some(c => c.startsWith('git update-ref refs/claude-mods/respaldo/pre-'))).toBe(true)
  expect(JSON.stringify(r.context)).toMatch(/guardé un respaldo/)
})

test('si el respaldo falla, el reset --hard sigue bloqueado', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }))
  prepararGit(on as never, false, false)

  const r = await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })
  expect(r.deny).toMatch(/blocked: borraría cambios/)
  expect(r.deny).toMatch(/confirm with the user/)
})

test('git clean sigue bloqueado y de noche no manda a preguntar', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }))
  prepararGit(on as never, true)

  const r = await $.tool.call({ tool: 'Bash', command: 'git clean -fd' })
  expect(r.deny).toMatch(/Modo noche: no esperes al usuario/)
  expect(r.deny).not.toMatch(/confirm with the user/)

  const peligro = await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })
  expect(peligro.deny).toMatch(/Modo noche/)
})

test('el modo noche caduca y los respaldos no valen si el comando cambia de carpeta', () => {
  const desde = new Date(2026, 9, 16, 23, 0, 0)
  const txt = JSON.stringify({ activo: true, desde: desde.toISOString() })
  expect(modoNocheActivo(txt, desde.getTime() + 3_600_000)).toBe(true)
  expect(modoNocheActivo(txt, desde.getTime() + 9 * 3_600_000)).toBe(false)
  expect(modoNocheActivo('{"activo":true}', desde.getTime())).toBe(false)
  expect(tipoDescarte('git reset --hard')).toBe('recuperable')
  expect(tipoDescarte('cd ../otro && git reset --hard')).toBe('irrecuperable')
  expect(tipoDescarte('git -C ../otro reset --hard')).toBe('irrecuperable')
  expect(tipoDescarte('git --work-tree=/x reset --hard')).toBe('irrecuperable')
})

