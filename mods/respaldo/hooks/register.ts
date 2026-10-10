import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { cambiosDesde, crearPunto, podar, restaurar, type Run } from './git'

const puntos = atom({ plugin: 'respaldo', key: 'puntos' } as const, [])
const isAuto = atom({ plugin: 'respaldo', key: 'isAuto' } as const, true)
const vista = atom({ plugin: 'respaldo', key: 'vista' } as const, null)
const mensaje = atom({ plugin: 'respaldo', key: 'mensaje' } as const, null)

// Las confirmaciones y los commits ocultos necesitan una identidad; no se toca la de la persona.
const ENTORNO = {
  GIT_AUTHOR_NAME: 'claude-mods',
  GIT_AUTHOR_EMAIL: 'claude-mods@localhost',
  GIT_COMMITTER_NAME: 'claude-mods',
  GIT_COMMITTER_EMAIL: 'claude-mods@localhost',
}

const correr = ($: EngineInterface): Run => async argv => {
  try {
    const r = await $.process.run(argv, { env: ENTORNO, timeoutMs: 20_000 })

    return { code: r.exitCode, out: r.exitCode === 0 ? r.stdout : `${r.stdout}${r.stderr}` }
  } catch {
    return { code: 127, out: '' }
  }
}

/** El pedido tal como lo escribió la persona (lo guarda prompt.submit antes de que otros le añadan contexto). */
let pedidoActual = ''

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'respaldo',
      description: 'Puntos de restauración: /respaldo (estado) · on · off · volver (al último punto)',
      argumentHint: 'on | off | volver',
    })
    if ((await $.store.get('isAuto').catch(() => undefined)) === false) await update($, isAuto, () => false)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const quien = (e.origin as { kind?: string } | undefined)?.kind
    if (quien === undefined || ['composer', 'bridge', 'sdk', 'slack-ping', 'unclassified'].includes(quien)) {
      pedidoActual = e.text.replace(/<(system-reminder|local-command-caveat|local-command-stdout|local-command-stderr|command-name|command-message|command-args)>[\s\S]*?<\/\1>/g, '')
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // Antes de que Claude empiece a trabajar, se anota cómo está el proyecto.
  on('turn.start', async ($, e, next) => {
    if (await read($, isAuto)) {
      try {
        const lista = await read($, puntos)
        const nuevo = await crearPunto(correr($), e.turnId.replace(/[^\w-]/g, '').slice(0, 24) || String(lista.length), await $.clock.now(), pedidoActual)
        const ultimo = lista.at(-1)
        // Si nada cambió desde el último punto, ese ya sirve.
        if (nuevo !== null && !(ultimo && ultimo.sha === nuevo.sha && ultimo.existentes.length === nuevo.existentes.length)) {
          const podados = await podar(correr($), [...lista, nuevo])
          await update($, puntos, () => podados)
        }
      } catch {
        // Un respaldo que falla nunca frena el pedido.
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'respaldo' }, async ($, e) => {
    const [accion = '', id = ''] = e.args.trim().split(/\s+/)
    const lista = await read($, puntos)

    if (accion === 'on' || accion === 'off') {
      await update($, isAuto, () => accion === 'on')
      await $.store.set('isAuto', accion === 'on').catch(() => undefined)

      return { text: `Respaldo automático ${accion === 'on' ? 'activado' : 'apagado'}.` }
    }

    // "preparar" calcula qué pasaría y lo deja a la vista del panel; no cambia ningún archivo.
    if (accion === 'preparar' || accion === 'volver') {
      const punto = id === '' ? lista.at(-1) : lista.find(p => p.id === id)
      if (punto === undefined) return { text: 'No hay un punto de restauración todavía (hace falta un proyecto con git y haber hecho un pedido).' }
      const c = await cambiosDesde(correr($), punto)
      await update($, vista, () => ({ id: punto.id, ...c }))

      return { text: `Volver a "${punto.pedido}" tocaría ${c.modificados.length} archivos y quitaría ${c.creados.length} nuevos. Confírmalo en el panel.` }
    }

    if (accion === 'aplicar') {
      const punto = lista.find(p => p.id === id)
      if (punto === undefined) return { text: 'Ese punto ya no existe.' }
      const r = await restaurar(correr($), punto)
      await update($, vista, () => null)
      if (r.error !== undefined) {
        await update($, mensaje, () => `No se pudo volver: ${r.error}`)

        return { text: `No se pudo volver: ${r.error}` }
      }
      const texto = `Listo: volví al estado anterior a "${punto.pedido}" (${r.modificados} archivos restaurados, ${r.creados} quitados).`
      await update($, mensaje, () => texto)
      $.ui.toast(texto)

      return { text: texto }
    }

    if (accion === 'cancelar') {
      await update($, vista, () => null)

      return { text: 'Cancelado: no se cambió nada.' }
    }

    return {
      text: `Respaldo ${(await read($, isAuto)) ? 'activo' : 'apagado'} · ${lista.length} puntos${lista.at(-1) ? ` · el último: "${lista.at(-1)?.pedido}"` : ''}`,
    }
  })
}
