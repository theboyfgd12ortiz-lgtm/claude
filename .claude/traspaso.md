<!-- traspaso 2026-10-10T19:25:41.644Z auto -->

## Objetivo
El usuario es una persona no técnica que trabaja en Windows (PowerShell, app de escritorio) y también en la nube. Quiere mods de Claude Code que bajen el costo por tarea y den resultados excelentes. Todo debe ser automático (no recuerda los comandos "/"), visible en un solo panel (`/mods`, Centro de control), actualizarse solo y mejorarse a sí mismo. La prioridad es el orquestador `equipo`.

## Hecho
- Repo `theboyfgd12ortiz-lgtm/claude`, rama `claude/adoring-ride-khnvyf`, todo subido.
- Mods en `mods/`: selector-modelo, rtk-hook, guardian, output-trim, quality-coach, token-meter, presupuesto, traspaso, mejorar-prompt, respaldo, web, memoria, equipo, mods-panel. Están registrados en `.claude-plugin/marketplace.json` y `.claude/settings.json`.
- `mods/equipo/`:
  - Agentes explorador, investigador, obrero y revisor; el hook `agent.spawn` les pone un modelo más barato que el del director.
  - Aprende por tipo de agente: 2 fallos de 4 suben un escalón hasta Opus; 8 aciertos seguidos lo bajan. Un fallo es una respuesta sin el formato pedido o un problema que encuentra el revisor.
  - Calcula el ahorro neto y deja la lección "no sale a cuenta" cuando no ahorra.
  - Límites: 3 agentes a la vez y 6 por tarea. Ajusta el modelo con `dificultad: baja|media|alta`.
  - Pizarra en `.claude/equipo/pizarra.md` y seguimiento de `.claude/equipo/plan.md`. Pistas por mensaje según el contexto (50 % y 70 %) y si la tarea es grande.
  - Comandos `/investigar` (`ver`, `guardar`) y `/equipo` (`on`, `off`, `olvidar`, `probar`), con un reintento si el clasificador del modo automático no da veredicto.
- `mods/mods-panel`: pestaña Equipo con ahorro, plan, agentes, lo aprendido, investigación y botón Probar.
- Ya se quitó la sección de reparto de `selector-modelo`.
- Las pruebas de los 13 mods pasan, `tsc` está limpio y `claude plugin validate .` pasa.

## Decisiones
- Las pistas viajan con el mensaje (`prompt.submit`) y no en el prompt de sistema, para no romper la caché.
- `general-purpose` no se abarata, para no perder calidad.
- Se descartaron imágenes y datos en `web`, a pedido del usuario.
- No se usa el Workflow tool sin que el usuario lo pida explícitamente.
- Sin `version` en `plugin.json`, para que la actualización automática siga el commit.

## Pendiente
1. Recibir el plan de Opus (8 a 12 cambios priorizados: fallos, qué eliminar o fusionar, qué integrar) e implementar los marcados "hacer ya".
2. Que el usuario pruebe `/equipo probar` en su PC y en la nube (no se ha probado en una sesión real).
3. Revisar si `WebSearch` pide permiso dentro de los agentes.
4. Tras cada cambio: `tsc`, pruebas de todos los mods, `validate`, commit y push.

## Datos clave
- Compilar: `npx -p typescript tsc -p /tmp/claude-0/-home-user-claude/7d3655b8-4bbf-511b-a610-71bb74ffca08/scratchpad/tsconfig.all.json`
- Probar: `claude plugin test mods/<nombre>` · Validar: `claude plugin validate .`
- Tipos de la API: `/root/.claude/dev-mods/*/web/.claude-plugin/types/claude-code/index.d.ts`
- Actualizar en Windows: `cd C:\Users\thebo\claude-mods`, luego `git pull origin claude/adoring-ride-khnvyf` y `powershell -ExecutionPolicy Bypass -File scripts\install-mods.ps1`
- Nube: `scripts/cloud-setup.sh` (variable `CLAUDE_CODE_PLUGIN_DIRS`).
- Commits con las líneas Co-Authored-By y Claude-Session.
