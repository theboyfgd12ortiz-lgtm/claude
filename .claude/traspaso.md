<!-- traspaso 2026-10-11T19:11:59.527Z auto -->

## Objetivo
Mods de Claude Code para un usuario no técnico (Windows/PowerShell y nube): trabajo automático (sin recordar comandos), todo visible en un panel único ("Centro de control"), mínimo costo por tarea y calidad máxima como prioridad. Repo `theboyfgd12ortiz-lgtm/claude`, rama `claude/adoring-ride-khnvyf`.

## Hecho
- `mods/equipo/`: agentes Haiku/Sonnet, aprendizaje con escalada, ahorro neto, límites de agentes, dificultad por encargo, pizarra por terminal, `/investigar`, `/equipo probar`.
- `mods/piloto/`: un objetivo y se planea, reparte, ejecuta y revisa solo. Revisión obligatoria (`TODO BIEN`, 2 rondas de corrección), tope de 8 continuaciones y frenos.
- `mods/terminales/`: terminales T1/T2 que se ven y se mandan mensajes, aviso si tocan el mismo archivo, `/terminal paralelo` con git worktree.
- `mods/selector-modelo/`: no cambia de modelo con la caché caliente; nivel Opus para el director en una misión.
- `mods/presupuesto/`: Haiku en ahorro máximo, 1 skill por pedido con poco límite, aviso cuando se renueva el límite.
- `mods/memoria`, `mods/quality-coach`: prompt de sistema fijo; HTML y CSS no cuentan como código.
- `mods/mods-panel/`: pestañas Equipo (con Piloto) y Terminales.
- `.claude-plugin/marketplace.json`, `.claude/settings.json` y `README.md` al día.

## Decisiones
- Precios reales 1:20:40 y caché, verificados en la skill claude-api.
- Pistas por mensaje, no en el prompt de sistema, para no romper la caché.
- Plan único con `TodoWrite`: se quitó `plan.md`, que contradecía.
- OmniRoute descartado: requería demasiada configuración del usuario.
- No bloquear skills, solo limitarlas: bloquearlas bajaba la calidad.
- No usar la herramienta Workflow sin que el usuario la pida explícitamente.

## Pendiente
1. Comprobar en el PC real: `/equipo probar`, el piloto con un pedido real y el panel.
2. Confirmar que se quitó el selector antiguo `selector-modelo@inline` (`C:\Users\thebo\.claude\mods`).
3. Ideas de Opus aún sin hacer: un solo enrutador de avisos, `traspaso` desde el resumen de compactación, aprendizaje por proyecto, costo real por tarea, verificación sin tokens, `git pull` automático en la nube.

## Datos clave
- Actualizar en el PC:
  `cd C:\Users\thebo\claude-mods` → `git pull origin claude/adoring-ride-khnvyf` → `powershell -ExecutionPolicy Bypass -File scripts\install-mods.ps1`, y reiniciar Claude Code.
- Diagnóstico: `claude plugin list`.
- Validar: `claude plugin validate .` y `claude plugin test mods/<nombre>`.
- Tipos: `npx -p typescript tsc -p <scratchpad>/tsconfig.all.json`.
- Nube (setup script): `git clone --depth 1 https://github.com/theboyfgd12ortiz-lgtm/claude.git /tmp/cm && bash /tmp/cm/scripts/cloud-setup.sh`.
- Reglas de la API de mods:
  - Las funciones que reciben `$` deben declararse a nivel del archivo.
  - Las claves de `$.state` y los nombres de `$.env` van como literales.
  - Los hooks de prueba se registran antes del primer `$`.
- Commits con las líneas `Co-Authored-By` y `Claude-Session`.
