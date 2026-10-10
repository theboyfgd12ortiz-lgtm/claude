import { expect, test } from 'claude-code/testing'

import { parseRtk, percent, short } from './register'

test('formats numbers', () => {
  expect(short(999)).toBe('999')
  expect(short(15_400)).toBe('15.4k')
  expect(percent(1, 4)).toBe(25)
  expect(percent(0, 0)).toBe(0)
})

test('explains every mod, even before they publish anything', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'mods-panel',
      surface,
      component: 'Pane',
      requestId: 'mods-panel',
      props: { title: 'Mis mods', isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
    })
    for (const name of [/Guardián/, /Recorte de salidas/, /Control de calidad/, /Medidor de tokens/, /Selector de modelos/]) {
      expect(await ui.find({ type: 'Text', text: name })).toBeDefined()
    }
    await ui.unmount()
  }
})

test('shows the model selector as active when its /nivel command exists', async ($, on) => {
  on('command.list', () => ({ value: [{ name: 'nivel', description: '', source: 'plugin' }] }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    plugin: 'mods-panel',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'mods-panel',
    props: { title: 'Mis mods', isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
  })
  expect(await ui.find({ type: 'Text', text: /Ahora: nivel 4 de 9/ })).toBeDefined()
  expect(await ui.find({ key: 'sel-auto' })).toBeDefined()
  await ui.unmount()
})

test('reads rtk savings from its json', () => {
  const gain = '{"summary":{"total_commands":7,"total_saved":13747,"avg_savings_pct":65.66}}'
  expect(parseRtk('rtk 0.49.0\n', gain)).toEqual({ version: '0.49.0', commands: 7, saved: 13747, percent: 66 })
})

test('survives rtk output it does not understand', () => {
  expect(parseRtk('rtk 0.49.0', 'not json')).toEqual({ version: '0.49.0', commands: 0, saved: 0, percent: 0 })
})
