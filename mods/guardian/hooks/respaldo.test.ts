import { expect, mock, test } from 'claude-code/testing'

const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
const FIN = { isStdoutTruncated: false, isStderrTruncated: false }

/** Un git de mentira: responde lo mínimo para que el mod arme un punto y calcule los cambios. */
const gitFalso = (on: (...a: never[]) => unknown, cambios: { modificados: string; nuevos: string }) => {
  const llamadas: string[] = []
  ;(on as unknown as (e: string, h: (...a: never[]) => unknown) => void)('process.run', ((_$: unknown, e: { argv: string[] }) => {
    const c = e.argv.join(' ')
    llamadas.push(c)
    const salida = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', ...FIN } })
    if (c.startsWith('git rev-parse --is-inside-work-tree')) return salida('true\n')
    if (c.startsWith('git stash create')) return salida('abc123\n')
    if (c.startsWith('git update-ref')) return salida('')
    if (c.startsWith('git ls-files')) return salida(cambios.nuevos)
    if (c.startsWith('git diff --name-only')) return salida(cambios.modificados)

    return salida('')
  }) as never)

  return llamadas
}

test('antes de cada pedido guarda un punto y lo ofrece para volver', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('turn.start', ((_$: unknown, e: { turnId: string }) => ({ turnId: e.turnId })) as never)
  on('ui.toast', (() => ({ value: undefined })) as never)
  const llamadas = gitFalso(on as never, { modificados: 'index.html\n', nuevos: '' })

  await $.turn.start({ text: 'haz la página', turnId: 'turno1' } as never)
  expect(llamadas.some(c => c.startsWith('git update-ref refs/claude-mods/respaldo/turno1 abc123'))).toBe(true)

  const estado = await $.command.run({ command: 'respaldo', args: '', ...CMD } as never)
  expect(estado.text).toMatch(/activo · 1 puntos/)

  const vista = await $.command.run({ command: 'respaldo', args: 'preparar', ...CMD } as never)
  expect(vista.text).toMatch(/tocaría 1 archivos y quitaría 0 nuevos/)

  const hecho = await $.command.run({ command: 'respaldo', args: 'aplicar turno1', ...CMD } as never)
  expect(hecho.text).toMatch(/1 archivos restaurados/)
  expect(llamadas.some(c => c.startsWith('git restore --source=abc123 --worktree -- index.html'))).toBe(true)
})

test('fuera de un proyecto con git no hace nada y apagado tampoco', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('turn.start', ((_$: unknown, e: { turnId: string }) => ({ turnId: e.turnId })) as never)
  on('process.run', (() => ({ value: { exitCode: 128, stdout: '', stderr: 'not a git repository', ...FIN } })) as never)

  await $.turn.start({ text: 'hola', turnId: 't1' } as never)
  expect((await $.command.run({ command: 'respaldo', args: '', ...CMD } as never)).text).toMatch(/0 puntos/)
  expect((await $.command.run({ command: 'respaldo', args: 'preparar', ...CMD } as never)).text).toMatch(/No hay un punto/)
  expect((await $.command.run({ command: 'respaldo', args: 'off', ...CMD } as never)).text).toMatch(/apagado/)
})
