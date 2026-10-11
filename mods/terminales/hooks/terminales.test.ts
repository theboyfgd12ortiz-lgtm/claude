import { expect, mock, test } from 'claude-code/testing'

import { estaViva, nombreLibre, nombreRama, pistaTerminales, podarArchivos, quienLoTiene, rutaClave, VIVA_MS } from './reglas'
import type { Terminal } from '../types'

const T = (nombre: string, ultimo: number, archivos: Record<string, number> = {}, tarea = ''): Terminal => ({ id: `id-${nombre}`, nombre, inicio: 0, ultimo, tarea, archivos })

test('nombra a las terminales T1, T2… reutilizando los huecos', () => {
  expect(nombreLibre([])).toBe('T1')
  expect(nombreLibre([{ nombre: 'T1' }, { nombre: 'T2' }])).toBe('T3')
  expect(nombreLibre([{ nombre: 'T2' }])).toBe('T1')
})

test('una terminal está viva si dio señal hace poco', () => {
  expect(estaViva({ ultimo: 100_000 }, 150_000)).toBe(true)
  expect(estaViva({ ultimo: 100_000 }, 100_000 + VIVA_MS)).toBe(false)
  expect(estaViva({ ultimo: 0 }, 1)).toBe(false)
})

test('compara rutas sin importar barras, mayúsculas ni la carpeta del proyecto', () => {
  expect(rutaClave('C:\\Users\\thebo\\app\\src\\Login.ts', 'C:\\Users\\thebo\\app')).toBe('src/login.ts')
  expect(rutaClave('/r/src/login.ts', '/r')).toBe('src/login.ts')
})

test('un archivo reservado por otra terminal viva hace poco tiene dueña; uno viejo o de una cerrada, no', () => {
  const ahora = 1_000_000
  const otras = [T('T2', ahora - 10_000, { 'src/a.ts': ahora - 60_000, 'src/viejo.ts': ahora - 20 * 60_000 }), T('T3', 0, { 'src/b.ts': ahora })]
  expect(quienLoTiene('src/a.ts', 'yo', otras, ahora)?.nombre).toBe('T2')
  expect(quienLoTiene('src/viejo.ts', 'yo', otras, ahora)).toBeUndefined()
  expect(quienLoTiene('src/b.ts', 'yo', otras, ahora)).toBeUndefined()
  expect(quienLoTiene('src/a.ts', 'id-T2', otras, ahora)).toBeUndefined()
})

test('poda las reservas viejas y deja un tope', () => {
  const ahora = 1_000_000
  expect(Object.keys(podarArchivos({ a: ahora, b: ahora - 11 * 60_000 }, ahora))).toEqual(['a'])
  expect(Object.keys(podarArchivos(Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}`, ahora - i])), ahora, 5))).toHaveLength(5)
})

test('la pista nombra a las otras terminales vivas y es corta; sin otras no dice nada', () => {
  const ahora = 1_000_000
  expect(pistaTerminales('T1', [], ahora)).toBeUndefined()
  expect(pistaTerminales('T1', [T('T2', 0)], ahora)).toBeUndefined()
  const p = pistaTerminales('T1', [T('T2', ahora, {}, 'arreglar el login de la tienda')], ahora)
  expect(p).toMatch(/Tú eres T1.*T2 \(arreglar el login de la tienda\).*mcp__terminales__enviar/)
})

test('el nombre de la rama sale limpio', () => {
  expect(nombreRama('Arreglar Navegación móvil!')).toBe('arreglar-navegacion-movil')
  expect(nombreRama('???')).toBe('paralelo')
})

type On = Parameters<NonNullable<Parameters<typeof test>[2]>>[1]

/** Un disco en memoria y el reloj, para dos terminales que comparten una carpeta. */
const montar = (on: On) => {
  const clock = mock.clock(on)
  const disco = new Map<string, string>()
  // El motor resuelve las rutas contra la carpeta del proyecto: aquí se comparan desde .claude/terminales.
  const rel = (p: string): string => (p.includes('.claude/terminales') ? p.slice(p.indexOf('.claude/terminales')) : p.includes('.git/info/') ? p.slice(p.indexOf('.git/info/')) : p)
  on('fs.write', (_$, e) => {
    disco.set(rel((e as { path: string }).path), (e as { text: string }).text)

    return { value: undefined } as never
  })
  on('fs.read', (_$, e) => {
    const t = disco.get(rel((e as { path: string }).path))
    if (t === undefined) throw new Error('no existe')

    return { value: t } as never
  })
  on('fs.list', (_$, e) => {
    const dir = `${rel((e as { path: string }).path)}/`
    const nombres = [...disco.keys()].filter(k => k.startsWith(dir) && !k.slice(dir.length).includes('/')).map(k => ({ name: k.slice(dir.length), kind: 'file', size: 1, mtimeMs: 0, isLink: false }))

    return { value: nombres } as never
  })
  on('command.register', () => ({ value: { command: 'x' } }) as never)
  on('tool.register', () => ({ value: { tool: 'mcp__terminales__enviar' } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: '/r' }) as never)
  on('tool.call', { tool: 'Edit' }, () => ({ result: { filePath: 'x' } }) as never)

  return { clock, disco }
}

test('con otra terminal viva: se llama T2, ve su tarea, recibe su aviso si toca el mismo archivo (una vez) y le puede escribir', async ($, on) => {
  const { clock, disco } = montar(on)
  let contexto: readonly string[] = []
  on('prompt.submit', (_$, e) => {
    contexto = e.context ?? []

    return { text: e.text, context: e.context } as never
  })
  await clock.advance(1_000_000)
  const ahora = 1_000_000
  disco.set('.claude/terminales/id-t1.json', JSON.stringify(T('T1', ahora - 5_000, { 'src/a.ts': ahora - 30_000 }, 'arreglar el login')))
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true, source: 'startup' } as never)

  const mio = [...disco.entries()].find(([k]) => k.startsWith('.claude/terminales/') && !k.includes('id-t1') && k.endsWith('.json'))
  expect(JSON.parse(mio?.[1] ?? '{}').nombre).toBe('T2')

  await $.prompt.submit({ text: 'quiero cambiar los colores del encabezado de la página principal', wait: false, origin: { kind: 'composer' } } as never)
  expect(contexto.join(' ')).toMatch(/Tú eres T2.*T1 \(arreglar el login\)/)

  const primero = await $.tool.call({ tool: 'Edit', file_path: '/r/src/a.ts', old_string: 'a', new_string: 'b' } as never)
  expect(primero.deny).toMatch(/T1 está editando/)
  const segundo = await $.tool.call({ tool: 'Edit', file_path: '/r/src/a.ts', old_string: 'a', new_string: 'b' } as never)
  expect(segundo.deny).toBeUndefined()
  expect((await $.tool.call({ tool: 'Edit', file_path: '/r/src/otro.ts', old_string: 'a', new_string: 'b' } as never)).deny).toBeUndefined()

  const enviado = await $.tool.call({ tool: 'mcp__terminales__enviar', a: 'T1', texto: 'Ya cambié el encabezado, no lo toques' } as never)
  expect(String((enviado as { result?: unknown }).result ?? (enviado as { text?: string }).text)).toMatch(/Mensaje enviado a T1/)
  const bandeja = [...disco.keys()].find(k => k.startsWith('.claude/terminales/bandeja/id-T1/'))
  expect(bandeja).toBeDefined()
})

test('un mensaje que llega a la bandeja se le entrega a Claude en el siguiente pedido', async ($, on) => {
  const { clock, disco } = montar(on)
  let contexto: readonly string[] = []
  on('prompt.submit', (_$, e) => {
    contexto = e.context ?? []

    return { text: e.text, context: e.context } as never
  })
  await clock.advance(1_000_000)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true, source: 'startup' } as never)
  const id = [...disco.keys()].find(k => k.startsWith('.claude/terminales/') && k.endsWith('.json'))?.replace('.claude/terminales/', '').replace('.json', '') ?? ''
  disco.set(`.claude/terminales/bandeja/${id}/00000001500000-id-t9.json`, JSON.stringify({ de: 'T9', texto: 'terminé la API, ya puedes usarla', at: 1_500_000 }))
  await clock.advance(10)
  await $.prompt.submit({ text: 'sigue con lo tuyo por favor', wait: false, origin: { kind: 'composer' } } as never)
  expect(contexto.join(' ')).toMatch(/Mensajes de otras terminales: T9: «terminé la API/)
})

test('deja los archivos de las terminales fuera de git, una sola vez', async ($, on) => {
  const { clock, disco } = montar(on)
  disco.set('.git/info/exclude', '# exclusiones\n*.log\n')
  await clock.advance(1_000_000)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true, source: 'startup' } as never)
  const texto = disco.get('.git/info/exclude') ?? ''
  expect(texto).toMatch(/\*\.log\n\.claude\/terminales\/\n\.claude\/equipo\/\n$/)
})
