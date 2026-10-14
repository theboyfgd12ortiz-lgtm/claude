// Prueba con git de verdad (el motor de pruebas de los mods no puede correr programas).
// Uso:  node --experimental-strip-types --no-warnings prueba-git.mts
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { crearPunto, cambiosDesde, restaurar, podar } from './hooks/git.ts'

const cwd = mkdtempSync(tmpdir() + '/guardian-')
const env = { ...process.env, GIT_AUTHOR_NAME: 'x', GIT_AUTHOR_EMAIL: 'x@x', GIT_COMMITTER_NAME: 'x', GIT_COMMITTER_EMAIL: 'x@x' }
const run = async (argv: string[]) => {
  try { return { code: 0, out: execFileSync(argv[0]!, argv.slice(1), { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } }
  catch (e: any) { return { code: e.status ?? 1, out: String(e.stdout ?? '') + String(e.stderr ?? '') } }
}
const f = (n: string) => cwd + '/' + n
let ok = 0
const check = (cond: boolean, msg: string) => { if (!cond) { console.log('FAIL', msg); process.exitCode = 1 } else { ok++; console.log('ok  ', msg) } }

// 0. fuera de un repo: no hace nada
check((await crearPunto(run, 'a', 1, 'x')) === null, 'sin git no crea punto')
await run(['git', 'init', '-q', '-b', 'main']); 
check((await crearPunto(run, 'a', 1, 'x')) === null, 'repo sin commits no crea punto')

writeFileSync(f('index.html'), '<h1>Hola</h1>\n'); writeFileSync(f('app.js'), 'let a = 1\n'); writeFileSync(f('.gitignore'), 'secreto.txt\n')
await run(['git', 'add', '-A']); await run(['git', 'commit', '-q', '-m', 'base'])
writeFileSync(f('notas.txt'), 'mis notas\n')              // archivo nuevo de la persona, sin seguimiento
writeFileSync(f('app.js'), 'let a = 2 // sin guardar\n')   // cambio sin commit de la persona
const branchAntes = (await run(['git', 'rev-parse', 'HEAD'])).out.trim()
const estadoAntes = (await run(['git', 'status', '--porcelain'])).out

// 1. punto con cambios sin guardar
const p1 = await crearPunto(run, 'p1', 100, '  haz   la página\nde inicio ')
check(p1 !== null && p1.pedido === 'haz la página de inicio', 'crea el punto y limpia el pedido')
check((await run(['git', 'rev-parse', 'HEAD'])).out.trim() === branchAntes, 'no mueve HEAD ni la rama')
check((await run(['git', 'status', '--porcelain'])).out === estadoAntes, 'no cambia el estado de los archivos ni del índice')
check(p1!.existentes.includes('notas.txt'), 'anota los archivos nuevos que ya existían')
check((await run(['git', 'rev-parse', '--verify', 'refs/claude-mods/respaldo/p1'])).code === 0, 'guarda el commit oculto en su referencia')

// 2. Claude "trabaja": edita, borra, crea
writeFileSync(f('index.html'), '<h1>Panadería</h1>\n'); unlinkSync(f('app.js')); writeFileSync(f('nuevo.css'), 'body{}\n'); mkdirSync(f('img')); writeFileSync(f('img/a.txt'), 'x'); writeFileSync(f('secreto.txt'), 'ignorado')
const c = await cambiosDesde(run, p1!)
check(c.modificados.sort().join() === 'app.js,index.html', 've lo modificado y lo borrado: ' + c.modificados.join(','))
check(c.creados.sort().join() === 'img/a.txt,nuevo.css', 've solo lo creado después: ' + c.creados.join(','))

// 3. volver
const r = await restaurar(run, p1!)
check(!r.error && r.modificados === 2 && r.creados === 2, 'restaura 2 y quita 2: ' + JSON.stringify(r))
check(readFileSync(f('index.html'), 'utf8') === '<h1>Hola</h1>\n', 'index.html vuelve como estaba')
check(readFileSync(f('app.js'), 'utf8') === 'let a = 2 // sin guardar\n', 'app.js vuelve CON el cambio sin guardar de la persona')
check(!existsSync(f('nuevo.css')) && !existsSync(f('img/a.txt')), 'los archivos creados por Claude desaparecen')
check(existsSync(f('notas.txt')) && readFileSync(f('notas.txt'), 'utf8') === 'mis notas\n', 'las notas de la persona siguen ahí')
check(existsSync(f('secreto.txt')), 'un archivo ignorado por git no se toca')
check((await run(['git', 'rev-parse', 'HEAD'])).out.trim() === branchAntes, 'HEAD sigue igual tras volver')

// 4. poda
let lista = [p1!]
for (let i = 2; i <= 11; i++) { const p = await crearPunto(run, 'p' + i, i, 'x'); lista.push(p!) }
lista = await podar(run, lista)
check(lista.length === 8, 'queda un máximo de 8 puntos')
check((await run(['git', 'rev-parse', '--verify', 'refs/claude-mods/respaldo/p1'])).code !== 0, 'los puntos viejos se borran de git')
console.log(ok + ' comprobaciones ok')
