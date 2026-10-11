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

/** A stand-in for respaldo: it publishes a restore point and, on the second start, a pending preview. */
const respaldoSimulado = {
  name: 'respaldo',
  register: (on: On) => {
    on('session.start', async ($, e, next) => {
      await $.state.set({ plugin: 'respaldo', key: 'puntos' } as const, [{ id: 'p1', sha: 'abc', at: 1, pedido: 'haz la página', existentes: [] }])
      await $.state.set({ plugin: 'respaldo', key: 'vista' } as const, { id: 'p1', modificados: ['index.html'], creados: ['nuevo.css'] })

      return next(e)
    })
  },
}

test('Deshacer shows the preview and asks before touching files', { plugins: [respaldoSimulado] }, async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'x' } }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('command.list', () => ({ value: [] }) as never)
  on('session.start', () => ({ cwd: '/r' }) as never)
  await $.session.start({ cwd: '/r', surface: 'desktop', isInteractive: true, source: 'startup' } as never)

  const ui = await $.ui.mount({ plugin: 'mods-panel', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-cambios' })
  expect(await ui.find({ type: 'Text', text: /¿Volver atrás\?/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Restauro 1 archivo \(index\.html\) y quito 1 nuevo \(nuevo\.css\)/ })).toBeDefined()
  expect(await ui.find({ key: 'undo-yes' })).toBeDefined()
  expect(await ui.find({ key: 'undo-no' })).toBeDefined()
  await ui.unmount()
})

/** A stand-in for web: it publishes a finished review and the state of the services. */
const webSimulado = {
  name: 'web',
  register: (on: On) => {
    on('session.start', async ($, e, next) => {
      await $.state.set({ plugin: 'web', key: 'urls' } as const, ['https://panaderia.com/'])
      await $.state.set({ plugin: 'web', key: 'servicios' } as const, [
        { id: 'github', nombre: 'GitHub', estado: 'ok', detalle: 'Todo funciona', at: 1 },
        { id: 'netlify', nombre: 'Netlify', estado: 'grave', detalle: 'Caído', at: 1 },
      ])
      await $.state.set({ plugin: 'web', key: 'informe' } as const, {
        url: 'https://panaderia.com/',
        at: 1,
        puntos: 62,
        status: 200,
        ms: 420,
        kb: 12,
        enlaces: { revisados: 5, rotos: ['https://panaderia.com/menu (404)'] },
        isAuto: false,
        hallazgos: [
          { tono: 'bad', titulo: 'No está preparada para el celular', detalle: 'Falta la etiqueta viewport.' },
          { tono: 'ok', titulo: 'Conexión segura', detalle: 'https' },
        ],
      })

      return next(e)
    })
  },
}

test('the Web tab shows the review, the services and a way to ask Claude to fix it', { plugins: [webSimulado] }, async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'x' } }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('command.list', () => ({ value: [] }) as never)
  on('session.start', () => ({ cwd: '/r' }) as never)
  await $.session.start({ cwd: '/r', surface: 'desktop', isInteractive: true, source: 'startup' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'mods-panel', surface, ...PANE })
    await ui.press({ key: 'tab-web' })
    expect(await ui.find({ type: 'Text', text: /62\/100/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /No está preparada para el celular/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 enlaces probados|5 enlaces probados, 1 rotos/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Caído/ })).toBeDefined()
    expect(await ui.find({ key: 'web-fix' })).toBeDefined()
    expect(await ui.find({ key: 'web-go' })).toBeDefined()
    expect(await ui.find({ key: 'web-url' })).toBeDefined()
    await ui.unmount()
  }
})

/** A stand-in for equipo: two agents that worked, one lesson learned and a finished research. */
const equipoSimulado = {
  name: 'equipo',
  register: (on: On) => {
    on('session.start', async ($, e, next) => {
      await $.state.set({ plugin: 'equipo', key: 'agentes' } as const, [
        { id: 'a1', tipo: 'equipo:explorador', descripcion: 'buscar login', modelo: 'haiku', familia: 'haiku', padre: 'opus', at: 1, fin: 2, estado: 'listo', nuevo: 1000, cache: 0, escrito: 100 },
        { id: 'a2', tipo: 'equipo:obrero', descripcion: 'cambiar botón', modelo: 'sonnet', familia: 'sonnet', padre: 'opus', at: 1, fin: null, estado: 'trabajando', nuevo: 500, cache: 0, escrito: 50 },
      ])
      await $.state.set({ plugin: 'equipo', key: 'aprendizaje' } as const, {
        'equipo:explorador': { nivel: 'sonnet', recientes: [], seguidos: 0, veces: 5, unidades: 500, subidas: 1, neto: 100 },
      })
      await $.state.set({ plugin: 'equipo', key: 'investigacion' } as const, { id: 'x', pregunta: 'mejor hosting gratis', at: 1, estado: 'listo', texto: 'Netlify y Vercel.', archivo: null })

      return next(e)
    })
  },
}

test('the Equipo tab shows agents, estimated savings, what it learned and the research', { plugins: [equipoSimulado] }, async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'x' } }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('command.list', () => ({ value: [] }) as never)
  on('session.start', () => ({ cwd: '/r' }) as never)
  await $.session.start({ cwd: '/r', surface: 'desktop', isInteractive: true, source: 'startup' } as never)

  const ui = await $.ui.mount({ plugin: 'mods-panel', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-equipo' })
  expect(await ui.find({ type: 'Text', text: /% menos/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /buscar login/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /ahora con sonnet/ })).toBeDefined()
  expect(await ui.find({ key: 'eq-test' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Netlify y Vercel/ })).toBeDefined()
  expect(await ui.find({ key: 'eq-save' })).toBeDefined()
  expect(await ui.find({ key: 'eq-ask' })).toBeDefined()
  await ui.unmount()
})

/** A stand-in for terminales: this terminal is T2 and T1 is working next to it. */
const terminalesSimulado = {
  name: 'terminales',
  register: (on: On) => {
    on('session.start', async ($, e, next) => {
      await $.state.set({ plugin: 'terminales', key: 'estado' } as const, {
        yo: { id: 'b', nombre: 'T2', inicio: 1, ultimo: 2, tarea: 'cambiar los colores del encabezado', archivos: {} },
        otras: [{ id: 'a', nombre: 'T1', inicio: 1, ultimo: 2, tarea: 'arreglar el login', archivos: { 'src/login.ts': 2 } }],
        recibidos: 0,
      })

      return next(e)
    })
  },
}

test('the Terminales tab shows this terminal, the others and a way to open one in parallel', { plugins: [terminalesSimulado] }, async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'x' } }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('command.list', () => ({ value: [] }) as never)
  on('session.start', () => ({ cwd: '/r' }) as never)
  await $.session.start({ cwd: '/r', surface: 'desktop', isInteractive: true, source: 'startup' } as never)

  const ui = await $.ui.mount({ plugin: 'mods-panel', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-terminales' })
  expect(await ui.find({ type: 'Text', text: /cambiar los colores del encabezado/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /arreglar el login/ })).toBeDefined()
  expect(await ui.find({ key: 'term-par' })).toBeDefined()
  expect(await ui.find({ key: 'term-msg' })).toBeDefined()
  await ui.unmount()
})

/** A stand-in for piloto: a mission in progress, 2 of 5 steps done. */
const pilotoSimulado = {
  name: 'piloto',
  register: (on: On) => {
    on('session.start', async ($, e, next) => {
      await $.state.set({ plugin: 'piloto', key: 'mision' } as const, { activa: true, objetivo: 'una tienda', hechos: 2, total: 5, siguiente: 'probar en móvil', continuaciones: 2, max: 8, fin: '', revision: 'sin revisar' })

      return next(e)
    })
  },
}

test('the Equipo tab shows the Piloto: a box to say what you want, the progress and a way to stop it', { plugins: [pilotoSimulado, equipoSimulado] }, async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'x' } }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('command.list', () => ({ value: [] }) as never)
  on('session.start', () => ({ cwd: '/r' }) as never)
  await $.session.start({ cwd: '/r', surface: 'desktop', isInteractive: true, source: 'startup' } as never)

  const ui = await $.ui.mount({ plugin: 'mods-panel', surface: 'desktop', ...PANE })
  await ui.press({ key: 'tab-equipo' })
  expect(await ui.find({ key: 'pil-ask' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Sigue: probar en móvil/ })).toBeDefined()
  expect(await ui.find({ key: 'pil-stop' })).toBeDefined()
  expect(await ui.find({ key: 'pil-auto' })).toBeDefined()
  await ui.unmount()
})
