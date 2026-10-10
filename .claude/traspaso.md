<!-- traspaso 2026-10-10T19:11:13.251Z auto -->

## Objetivo
El usuario, no técnico, trabaja en Windows con PowerShell y en la nube. Quiere mods de Claude Code que trabajen solos (sin comandos "/"), ahorren tokens, den resultados excelentes y se vean en un solo panel ("Centro de control"). Ahora la prioridad es que el orquestador `equipo` sea muy bueno y se mejore solo.

## Hecho
- Repo `theboyfgd12ortiz-lgtm/claude`, rama `claude/adoring-ride-khnvyf`, ya subida.
- 14 mods en `mods/<nombre>`, registrados en `.claude-plugin/marketplace.json` y `.claude/settings.json`.
- `mods/equipo`:
  - Agentes explorador, investigador, obrero y revisor (`hooks/reglas.ts`).
  - El hook `agent.spawn` pone el modelo barato y respeta la `dificultad:` del encargo.
  - Límites: 3 agentes a la vez y 6 por tarea.
  - Aprendizaje en `hooks/aprende.ts`: evalúa cada respuesta por su formato y por lo que dice el revisor; si falla sube Haiku→Sonnet→Opus y tras 8 aciertos baja.
  - Ahorro neto, ya descontado lo que cuesta delegar.
  - Pizarra, pistas por mensaje y lectura de `plan.md` en `hooks/contexto.ts`.
  - Comandos `/equipo [on|off|olvidar|probar]` y `/investigar <pregunta>|ver|guardar`.
- `mods/mods-panel`: pestaña Equipo con ahorro, agentes, plan en curso, lo aprendido e investigación.
- `mods/selector-modelo`: se quitó la sección "reparto" y ahora depende de `equipo`.

## Decisiones
- Las pistas de contexto y de plan viajan con el mensaje (`prompt.submit`), no en el prompt de sistema, para no romper la caché.
- `general-purpose` no se abarata, para no perder calidad en tareas difíciles.
- Descartado ampliar `web` con imágenes y datos, porque el usuario lo pidió.
- El Workflow tool no se usa sin que el usuario lo pida.
- Si el clasificador del modo automático rechaza un agente lanzado por comando, se reintenta una vez; si vuelve a fallar, se deja la petición escrita para que Claude la lance.

## Pendiente
1. Que el usuario corra `/equipo probar` en local y en la nube; revisar lo que salga.
2. Comprobar en sesión real los permisos de `WebSearch` en segundo plano y el porcentaje de contexto que lee el hook.
3. Ajustar los límites 3/6 según lo que diga el usuario.
4. Opcional: revisión crítica con Opus de `equipo` v3.

## Datos clave
- Compilar: `npx -p typescript tsc -p <scratchpad>/tsconfig.all.json`. Ese archivo vive en el scratchpad, que es temporal: en una sesión nueva hay que recrearlo.
- Probar: `claude plugin test mods/<mod>`. Validar: `claude plugin validate .`
- Windows: `cd C:\Users\thebo\claude-mods`, luego `git pull origin claude/adoring-ride-khnvyf`, luego `powershell -ExecutionPolicy Bypass -File scripts\install-mods.ps1`.
- Script de configuración de la nube: `git clone --depth 1 https://github.com/theboyfgd12ortiz-lgtm/claude.git /tmp/cm && bash /tmp/cm/scripts/cloud-setup.sh`
- Archivos que crea `equipo` en cada proyecto: `.claude/equipo/plan.md`, `.claude/equipo/pizarra.md`, `.claude/investigaciones/`.
- `.claude/traspaso.md` cambia solo y hay que hacerle commit.
- Los mensajes de commit terminan con las líneas Co-Authored-By y Claude-Session.
