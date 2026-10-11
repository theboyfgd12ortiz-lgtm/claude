<!-- traspaso 2026-10-11T18:49:47.617Z auto -->

## Objetivo
Un usuario no técnico (Windows/PowerShell, también usa la nube) quiere mods de Claude Code que bajen el costo por tarea sin perder calidad. Deben ser automáticos (no recuerda los "/"), verse en un solo panel (Centro de control, `/mods`) y actualizarse solos.

## Hecho
Repo `theboyfgd12ortiz-lgtm/claude`, rama `claude/adoring-ride-khnvyf`, todo subido.
- Mods en `mods/<nombre>/`:
  - Previos: selector-modelo, guardian, output-trim, quality-coach, token-meter, presupuesto, traspaso, mejorar-prompt, respaldo, web, memoria, rtk-hook y mods-panel.
  - Nuevos: equipo y terminales.
- Equipo hace de orquestador: agentes Haiku/Sonnet, aprendizaje con escalada, ahorro neto con precios reales, dificultad por encargo, máximo 3 agentes a la vez y 6 por tarea, pizarra por terminal, `/investigar` y `/equipo probar`.
- Terminales coordina sesiones del mismo proyecto: T1/T2, mensajes, aviso al editar el mismo archivo y `/terminal paralelo` con git worktree.
- Presupuesto con límite bajo:
  - Permite 1 skill por pedido.
  - En ahorro máximo baja a Haiku.
  - Si el límite se agota, avisa cuando se renueva.
- Selector: no cambia de modelo ni de esfuerzo con la caché caliente (menos de 5 min).
- Memoria y la guía de equipo quedan fijas durante la sesión.
- Registro en `.claude-plugin/marketplace.json` y `.claude/settings.json`.
- Instaladores: `scripts/install-mods.ps1`, `install-mods.sh` y `cloud-setup.sh`. Documentación en `README.md`.

## Decisiones
- OmniRoute se descartó: el usuario no quiere configurar nada a mano.
- No se bloquean las skills con presupuesto bajo, se limitan a una: bloquearlas bajaba la calidad.
- `plan.md` se cambió por TodoWrite: daba órdenes contradictorias.
- `general-purpose` no se abarata: suele ser una tarea difícil.
- Las pistas viajan con el mensaje y no en el prompt de sistema, para no romper la caché.
- Los precios relativos son 1:20:40 (Haiku, Sonnet, Opus), verificados con la tabla oficial.

## Pendiente
1. Que el usuario actualice y confirme que ya no carga `selector-modelo@inline`. Viene de la carpeta antigua `C:\Users\thebo\.claude\mods`; hay que renombrarla y quitar `CLAUDE_CODE_PLUGIN_DIRS`.
2. Probar en real `/equipo probar` y `/terminal` con dos terminales abiertas.
3. Del plan de Opus:
   - unir los avisos de plan del selector y de mejorar-prompt;
   - traspaso a partir del resumen de compactación;
   - aprendizaje guardado por proyecto;
   - costo real por tarea;
   - `git pull` automático en la nube.

## Datos clave
- Actualizar en PowerShell:
  - `cd C:\Users\thebo\claude-mods`
  - `git pull origin claude/adoring-ride-khnvyf`
  - `powershell -ExecutionPolicy Bypass -File scripts\install-mods.ps1`
  - Después, reiniciar Claude Code.
- Diagnóstico: `claude plugin list`.
- Validar todo:
  - `claude plugin validate .`
  - `claude plugin test mods/<nombre>`
  - `tsc` con `tsconfig.all.json` (está en el scratchpad).
- Atribución de commits: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y la línea `Claude-Session`.
- No usar la herramienta Workflow sin pedido explícito del usuario.
