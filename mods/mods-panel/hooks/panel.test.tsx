import { expect, test } from 'claude-code/testing'

import { percent, short } from './register'

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
