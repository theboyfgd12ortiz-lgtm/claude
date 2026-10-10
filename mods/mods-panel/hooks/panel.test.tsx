import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { chartSvg, describeTool, parseRtk, percent, personText, planAdd, planFromTodos, planUpdate, resetLabel, short, usageColor } from './model'

const PANE = {
  component: 'Pane',
  requestId: 'mods-panel',
  props: { title: 'Centro de control', isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
} as const

describe('model', () => {
  test('formats numbers', () => {
    expect(short(999)).toBe('999')
    expect(short(15_400)).toBe('15.4k')
    expect(percent(1, 4)).toBe(25)
    expect(percent(0, 0)).toBe(0)
  })

  test('reads rtk savings from its json', () => {
    const gain = '{"summary":{"total_commands":7,"total_saved":13747,"avg_savings_pct":65.66}}'
    expect(parseRtk('rtk 0.49.0\n', gain)).toEqual({ version: '0.49.0', commands: 7, saved: 13747, percent: 66 })
    expect(parseRtk('rtk 0.49.0', 'not json')).toEqual({ version: '0.49.0', commands: 0, saved: 0, percent: 0 })
  })

  test('describes tools in plain words', () => {
    expect(describeTool('Read', { file_path: '/repo/src/app.ts' }).text).toBe('Leyendo app.ts')
    expect(describeTool('Bash', { command: 'npm test' }).text).toBe('Comando: npm test')
    expect(describeTool('mcp__github__get_me', {}).text).toBe('Herramienta github · get_me')
  })

  test('keeps the plan in step with TodoWrite and Task tools', () => {
    const fromTodos = planFromTodos([
      { content: 'Leer', status: 'completed' },
      { content: 'Cambiar', status: 'in_progress' },
    ])
    expect(fromTodos.map(p => p.status)).toEqual(['completed', 'in_progress'])

    let plan = planAdd([], '1', 'Primero')
    plan = planAdd(plan, '2', 'Segundo')
    plan = planUpdate(plan, '1', { status: 'completed' })
    plan = planUpdate(plan, '2', { status: 'deleted' })
    expect(plan).toEqual([{ id: '1', text: 'Primero', status: 'completed' }])
  })

  test('limits and words', () => {
    expect(usageColor(98)).toBe('error')
    expect(usageColor(75)).toBe('warning')
    expect(usageColor(20)).toBe('success')
    expect(resetLabel(undefined)).toBe('')
    expect(resetLabel('2026-10-14T01:00:00')).toBe('mié 1:00')
    expect(personText('<system-reminder>x</system-reminder>\n hola  ')).toBe('hola')
  })

  test('draws one stacked bar per turn', () => {
    const svg = chartSvg(
      [
        { at: 0, fresh: 1000, cached: 9000, written: 300, seconds: 3, model: 'm' },
        { at: 1, fresh: 500, cached: 9500, written: 100, seconds: 2, model: 'm' },
      ],
      300,
    )
    expect(svg.startsWith('<svg')).toBe(true)
    expect((svg.match(/<rect/g) ?? []).length).toBe(6)
  })
})

test('every tab draws on the terminal and on the desktop', async ($, on) => {
  mock.clock(on)
  on('command.list', () => ({ value: [{ name: 'nivel', description: '', source: 'plugin', plugin: 'selector-modelo' }] }) as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'mods-panel', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /tokens ahorrados/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /EN ESPERA/ })).toBeDefined()

    await ui.press({ key: 'tab-ahorro' })
    expect(await ui.find({ type: 'Text', text: /ESTA SESIÓN/ })).toBeDefined()

    await ui.press({ key: 'tab-modelo' })
    expect(await ui.find({ type: 'Text', text: /NIVEL 4 DE 9/ })).toBeDefined()
    expect(await ui.find({ key: 'lvl-9' })).toBeDefined()

    await ui.press({ key: 'tab-mods' })
    expect(await ui.find({ type: 'Text', text: /Guardián/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /necesita Python 3/ })).toBeDefined()

    await ui.press({ key: 'tab-ayuda' })
    expect(await ui.find({ type: 'Text', text: /COMANDOS/ })).toBeDefined()

    await ui.press({ key: 'tab-ahora' })
    await ui.unmount()
  }
})

test('a turn shows up as activity, plan and cost', async ($, on) => {
  mock.clock(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('tool.call', { tool: 'Read' }, () => ({ result: { type: 'text', file: { filePath: '/r/app.ts', content: 'x', numLines: 1, startLine: 1, totalLines: 1 } } }) as never)
  on('tool.call', { tool: 'TodoWrite' }, () => ({ result: { oldTodos: [], newTodos: [] } }) as never)
  on('turn.complete', () => ({ text: 'ok' }))
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)

  // The person's words come from prompt.submit; turn.start's text carries context others added.
  await $.prompt.submit({ text: '<system-reminder>aviso</system-reminder>arregla el login', wait: false, origin: { kind: 'composer' } } as never)
  await $.turn.start({ text: 'If the request needs no existing project...', turnId: 't1' } as never)
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Encontrar el error', status: 'completed', activeForm: 'Encontrando' },
      { content: 'Corregirlo', status: 'in_progress', activeForm: 'Corrigiendo' },
    ],
  } as never)
  await $.tool.call({ tool: 'Read', file_path: '/r/app.ts' } as never)
  await $.turn.complete({
    reason: 'answer',
    answer: 'listo',
    durationMs: 4000,
    isAborted: false,
    turnId: 't1',
    usage: { input_tokens: 200, output_tokens: 50, cache_read_input_tokens: 800, cache_creation_input_tokens: 0, model: 'm' },
  } as never)

  const ui = await $.ui.mount({ plugin: 'mods-panel', surface: 'desktop', ...PANE })
  expect(await ui.find({ type: 'Text', text: /Pediste: arregla el login/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /If the request/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Leyendo app.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /PLAN {2}1\/2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Respuesta lista .* 1.0k leídos \(80% caché\)/ })).toBeDefined()
  await ui.unmount()
})

test('/mods answers with a text summary where no pane can be drawn', async ($, on) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no surface' } }) as never)
  on('command.list', () => ({ value: [{ name: 'guardian', description: '', source: 'plugin', plugin: 'guardian' }] }) as never)
  const out = await $.command.run({ command: 'mods', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)
  expect(out.text).toMatch(/Centro de control/)
  expect(out.text).toMatch(/Guardián: protegiendo/)
  expect(out.text).toMatch(/Plugins activos: guardian/)
})

test('the install check reports what is missing', async ($, on) => {
  mock.clock(on)
  const done = { stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
  on('process.run', (_$, e) => {
    const cmd = e.argv.join(' ')
    const has = /^(node|bash|python3) --version$/.test(cmd)

    return { value: has ? { ...done, exitCode: 0, stdout: `${e.argv[0]} 1.0\n` } : { ...done, exitCode: 127, stdout: '' } }
  })
  on('command.list', () => ({ value: [] }) as never)
  const ui = await $.ui.mount({ plugin: 'mods-panel', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-mods' })
  await ui.press({ key: 'health' })
  expect(await ui.find({ type: 'Text', text: /✕ rtk/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /✓ Node.js/ })).toBeDefined()
  await ui.unmount()
})

test('the Cambios tab lists each edit and shows its diff', async ($, on) => {
  mock.clock(on)
  on('tool.call', { tool: 'Edit' }, () => ({ result: { filePath: '/r/index.html' } }) as never)
  on('command.list', () => ({ value: [] }) as never)
  await $.tool.call({ tool: 'Edit', file_path: '/r/index.html', old_string: '<h1>Hola</h1>', new_string: '<h1>Panadería Sol</h1>' } as never)

  const ui = await $.ui.mount({ plugin: 'mods-panel', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-cambios' })
  expect(await ui.find({ type: 'Text', text: /1 ediciones · 1 archivos/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /index.html/ })).toBeDefined()
  await ui.press({ key: 'chg-btn-0' })
  expect(await ui.find({ type: 'Code' })).toBeDefined()
  await ui.unmount()
})

/** A stand-in for traspaso: it publishes a saved note under its own name, as the real mod does. */
const traspasoSimulado = {
  name: 'traspaso',
  register: (on: On) => {
    on('session.start', async ($, e, next) => {
      await $.state.set({ plugin: 'traspaso', key: 'nota' } as const, {
        at: Date.now() - 3_600_000,
        donde: '.claude/traspaso.md',
        resumen: 'Landing de la panadería',
        isAuto: false,
      })

      return next(e)
    })
  },
}

test('offers to resume a saved note in a fresh chat', { plugins: [traspasoSimulado] }, async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'x' } }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.start', () => ({ cwd: '/r' }) as never)
  on('command.list', () => ({ value: [] }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 5 }, rateLimits: [] } }) as never)
  await $.session.start({ cwd: '/r', surface: 'desktop', isInteractive: true, source: 'startup' } as never)

  const ui = await $.ui.mount({ plugin: 'mods-panel', surface: 'desktop', ...PANE })
  expect(await ui.find({ type: 'Text', text: /Hay un trabajo guardado/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Landing de la panadería/ })).toBeDefined()
  expect(await ui.find({ key: 'note-resume' })).toBeDefined()
  await ui.unmount()
})
