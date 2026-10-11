<!-- traspaso 2026-10-11T14:21:47.053Z auto -->

## Objetivo
El usuario, no técnico, en Windows/PowerShell y en la nube, quiere mods de Claude Code que bajen el costo por tarea con resultado excelente. Deben funcionar solos, sin recordar comandos "/", verse en un panel único (`/mods`) y actualizarse solos. Prioridad actual: el orquestador `equipo` y OmniRoute para cuando quede poco límite.

## Hecho
- Repo `theboyfgd12ortiz-lgtm/claude`, rama `claude/adoring-ride-khnvyf`, todo subido.
- Mods en `mods/<nombre>/`: selector-modelo, guardian, output-trim, quality-coach, token-meter, presupuesto, traspaso, mejorar-prompt, respaldo, web, memoria, mods-panel, rtk-hook y **equipo**. Registro en `.claude-plugin/marketplace.json`.
- `mods/equipo/hooks/`:
  - `reglas.ts`: precios 1:20:40, dificultad y modelo por agente.
  - `aprende.ts`: escalada y lecciones.
  - `contexto.ts`: pistas y pizarra.
  - `gratis.ts`: OmniRoute.
  - `register.ts`.
- Límites de `equipo`: 3 agentes simultáneos y 6 por tarea.
- Selector estable con la caché caliente: `decidir(..., fria)` en `mods/selector-modelo/hooks/register.tsx`.
- Prompt de sistema fijo (guía de `equipo` y notas de memoria). Presupuesto convertido en pista por mensaje.
- Presupuesto bajo rechaza abrir skills: `mods/presupuesto/hooks/register.ts`.
- Pestaña Equipo del panel con sección OmniRoute.
- `scripts/claude-gratis.ps1` y `.sh`. README actualizado.

## Decisiones
- Quitado `plan.md`: contradecía a TodoWrite.
- Pistas en `prompt.submit` y no en el prompt de sistema: no romper la caché.
- No cambiar modelo ni effort con la caché caliente, salvo subir 2 o más niveles: reescribir la caché sale caro.
- OmniRoute solo como ayudante de texto: un subagente con herramientas no se puede enviar allí.
- No se llama a la herramienta Workflow sin que el usuario lo pida expresamente.

## Pendiente
1. Confirmar que el usuario quitó `C:\Users\thebo\.claude\mods\selector-modelo`, cargado como `selector-modelo@inline`. Choca con el selector nuevo; probable causa de que no salga el panel.
2. Que pruebe `/mods`, `/equipo probar` y `/gratis estado` en su PC.
3. Plan de Opus aún pendiente:
   - unir los avisos de plan del selector y de mejorar-prompt;
   - traspaso desde el resumen de la compactación;
   - aprendizaje por proyecto;
   - costo real por tarea;
   - `git pull` automático en la nube.

## Datos clave
- Actualizar en PC:
  - `cd C:\Users\thebo\claude-mods`
  - `git pull origin claude/adoring-ride-khnvyf`
  - `powershell -ExecutionPolicy Bypass -File scripts\install-mods.ps1`
- Probar: `claude plugin test mods/<n>` y `claude plugin validate .`
- Compilar: `tsc -p <scratchpad>/tsconfig.all.json`
- OmniRoute:
  - En `http://localhost:20128/v1`, modelos `auto`, `auto/coding`, `auto/fast` y `auto/cheap`.
  - Variables `OMNIROUTE_API_KEY`, `OMNIROUTE_URL` y `OMNIROUTE_MODEL`.
  - Repo: https://github.com/diegosouzapw/OmniRoute
- Precios por millón de tokens:
  - Haiku 5.5: $0.10 entrada / $0.50 salida.
  - Sonnet 5.5: $2 / $10.
  - Opus 5.5: $4 / $20.
  - Lectura de caché en Sonnet y Opus: $0.20.
- Pie de los commits:
  - `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  - `Claude-Session: https://claude.ai/code/session_01TUw8KWvsoCN118q3FbTBKK`
