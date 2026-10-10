import { describe, expect, mock, test } from 'claude-code/testing'

import { chartSvg, describeTool, parseRtk, percent, planAdd, planFromTodos, planUpdate, short } from './model'

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

  await $.turn.start({ text: 'arregla el login', turnId: 't1' } as never)
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
  expect(await ui.find({ type: 'Text', text: /Leyendo app.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /PLAN {2}1\/2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Respuesta lista .* 1.0k leídos \(80% caché\)/ })).toBeDefined()
  await ui.unmount()
})
