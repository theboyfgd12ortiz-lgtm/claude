<!-- traspaso 2026-10-10T16:16:51.632Z auto -->

## Objetivo
El usuario quiere una colección de mods para Claude Code que mejoren el trabajo, ahorren tokens y funcionen solos, sin tener que recordar comandos `/`. Todo debe verse en un panel único, el Centro de control (`/mods`), y funcionar en su PC Windows y en la nube con actualización automática. Ahora pide dos cosas: un orquestador que reparta el trabajo entre Haiku, Sonnet y Opus, y que `web` también sirva para investigar y buscar imágenes y datos.

## Hecho
- Repo `theboyfgd12ortiz-lgtm/claude`, con todo subido en la rama `claude/adoring-ride-khnvyf` (commit 27ee29e).
- Mods en `mods/`: `selector-modelo`, `rtk-hook`, `guardian`, `output-trim`, `quality-coach`, `token-meter`, `presupuesto`, `traspaso`, `mejorar-prompt`, `respaldo`, `web`, `memoria` y `mods-panel`.
- Nuevo `mods/equipo/`:
  - `hooks/reglas.ts`: agentes explorador, investigador, obrero y revisor, modelo por tipo, `modeloParaAgente`, costo y ahorro estimados, `GUIA` y `slug`.
  - `hooks/register.ts`: hook `agent.spawn`, registro del gasto en `turn.complete`, guía en `prompt.compose`, y los comandos `/equipo on|off` y `/investigar <pregunta>|guardar`.
  - `types/index.d.ts` y `hooks/equipo.test.ts` (6 pruebas, todas pasan).
- `equipo` está registrado en `.claude-plugin/marketplace.json` y `.claude/settings.json`.
- Instaladores: `scripts/install-mods.sh`, `scripts/install-mods.ps1` y `scripts/cloud-setup.sh`.

## Decisiones
- Solo se baja el modelo cuando el agente no trae uno, no es una bifurcación (fork) y el director es más caro. Así se respeta lo que se pidió a propósito.
- El ahorro se muestra como estimación en "unidades Haiku" con proporciones de precio 1/3/5, porque no hay factura real.
- La Batch API queda descartada: tarda hasta 24 h y no encaja con trabajo interactivo. La caché de prompts ya la usa Claude Code.
- Workflows quedan descartados: solo se usan si el usuario lo pide de forma explícita.
- Las bandas bajo el prompt quedan apagadas para que toda la información viva en el panel.

## Pendiente
1. Quitar la sección `selector-modelo:reparto` del selector y añadir `equipo` a sus dependencias.
2. En `web`, añadir `/imagenes` con Openverse (licencia y crédito) y `/dato` con Wikipedia (atender el error 429), con parsers puros y pruebas.
3. En el panel:
   - Pestaña Equipo: agentes, modelos, tokens, ahorro y un campo para pedir un plan.
   - Sección Buscar en Web: investigar, imágenes y datos.
   - Una fila para `equipo` en Mods, actualizar Ayuda y añadir `equipo` a las dependencias.
4. Actualizar el README, pasar tsc, validate y test a todos los mods, hacer commit y push.
5. Explicarle al usuario qué falta probar en real: `$.agent.spawn` y los permisos de WebSearch.

## Datos clave
- Probar un mod: `claude plugin test mods/<nombre>`.
- Validar: `claude plugin validate .`.
- Tipos: `npx -p typescript tsc -p <scratchpad>/tsconfig.all.json`.
- Script de entorno en la nube: `git clone --depth 1 https://github.com/theboyfgd12ortiz-lgtm/claude.git /tmp/cm && bash /tmp/cm/scripts/cloud-setup.sh`.
- En las pruebas hay que simular `clock.now` y `turn.complete`; este último debe devolver `{ text }`.
- `$.prompt.fill` recibe `{ text }`.
- Openverse funciona sin clave. DuckDuckGo está bloqueado.
- El usuario habla español, usa Windows con PowerShell y la app de escritorio, y se le olvidan los comandos `/`.
