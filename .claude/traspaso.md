<!-- traspaso 2026-10-10T16:50:44.592Z auto -->

## Objetivo
El usuario, no técnico, usa Windows con PowerShell y la app de escritorio. Quiere "mods" de Claude Code que bajen el costo por tarea, den resultados excelentes y funcionen solos, sin recordar comandos. Todo debe verse en un panel, el Centro de control (`/mods`), funcionar en local y en la nube, y actualizarse solo. Repo `theboyfgd12ortiz-lgtm/claude`, rama `claude/adoring-ride-khnvyf`.

## Hecho
- 14 mods en `mods/`:
  - selector-modelo, guardian, output-trim, quality-coach, token-meter, presupuesto, traspaso
  - mejorar-prompt, respaldo, web, memoria, rtk-hook, mods-panel
  - **equipo**, el nuevo
- `mods/equipo/hooks/`:
  - `reglas.ts`: los 4 agentes (explorador, investigador, obrero, revisor), el modelo de cada tipo, el ahorro neto y la GUIA.
  - `aprende.ts`: aprendizaje por tipo, contrato de respuesta y lecciones.
  - `contexto.ts`: pizarra, detección de tarea grande, pistas y aviso al compactar.
  - `register.ts`: hooks y comandos `/equipo` (on, off, olvidar, probar) y `/investigar` (ver, guardar).
- `mods/mods-panel/hooks/register.tsx` y `model.ts`: pestaña **Equipo** con ahorro neto, agentes, lo aprendido, investigación y botón "Probar que funciona".
- Se quitó la sección "reparto" de `selector-modelo`, que ahora depende de equipo.
- Equipo está registrado en `.claude-plugin/marketplace.json`, `.claude/settings.json` y `README.md`.
- Todo subido. Pasan las pruebas de los 13 mods con pruebas, `tsc` y la validación.

## Decisiones
- No se añadió búsqueda de imágenes ni datos a `web`: el usuario lo descartó.
- Las pistas viajan con el mensaje (`prompt.submit`), no en el prompt de sistema, para no romper la caché.
- Un tipo sube Haiku → Sonnet → Opus tras 2 fallos en sus últimos 4 trabajos. Baja un escalón tras 8 aciertos seguidos.
- `general-purpose` no se abarata, porque suele lanzarse para tareas difíciles.
- Con el presupuesto apretado no se pone la GUIA ni las pistas.
- Si el clasificador del modo automático rechaza un agente lanzado por un comando, se reintenta una vez. Si vuelve a fallar, la petición queda escrita en el cuadro.
- No usar la herramienta Workflow sin que el usuario lo pida.

## Pendiente
1. El usuario debe reinstalar y correr `/equipo probar` en local y en la nube.
2. Verificar en sesión real que se aplica el modelo barato, el porcentaje de contexto y si `WebSearch` pide permiso en segundo plano.
3. Detectar retrabajo del director: hoy solo se mide el formato de la respuesta y el veredicto del revisor.
4. Opcional: añadir la pizarra y el plan a la pestaña Equipo.

## Datos clave
- Pruebas: `claude plugin test mods/<nombre>` y `claude plugin validate .`.
- Tipos: `npx -p typescript tsc -p <scratchpad>/tsconfig.all.json`.
- Script de la nube: `git clone --depth 1 https://github.com/theboyfgd12ortiz-lgtm/claude.git /tmp/cm && bash /tmp/cm/scripts/cloud-setup.sh`.
- Instaladores: `scripts/install-mods.ps1` (Windows) y `scripts/install-mods.sh`.
- Archivos que se generan en el proyecto: `.claude/equipo/pizarra.md`, `.claude/equipo/plan.md` y `.claude/investigaciones/<slug>.md`.
- Los commits terminan con `Co-Authored-By` y `Claude-Session`.
