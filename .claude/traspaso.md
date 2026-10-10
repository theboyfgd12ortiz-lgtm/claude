<!-- traspaso 2026-10-10T20:20:16.330Z auto -->

## Objetivo
El usuario no es técnico y trabaja en Windows (PowerShell) y en la nube. Quiere "mods" para Claude Code que bajen el costo por tarea y den resultados excelentes. Todo debe ser automático (sin recordar comandos "/"), visible en un solo panel (Centro de control) y actualizarse solo. La prioridad es el orquestador `equipo`, que debe mejorarse a sí mismo.

## Hecho
- Repo `theboyfgd12ortiz-lgtm/claude`, rama `claude/adoring-ride-khnvyf`, todo subido.
- Mods en `mods/`: selector-modelo, presupuesto, guardian, output-trim, quality-coach, token-meter, traspaso, mejorar-prompt, respaldo, web, memoria, equipo, mods-panel y rtk-hook.
- `mods/equipo/hooks/` tiene `reglas.ts`, `aprende.ts`, `contexto.ts` y `register.ts`, con sus pruebas:
  - Agentes explorador e investigador (Haiku), obrero y revisor (Sonnet).
  - Aprendizaje con escalada y vuelta atrás, contrato de respuesta por tipo y ahorro neto con precios reales 1:20:40.
  - Dificultad por encargo, límites de 3 agentes a la vez y 6 por tarea, tope de presupuesto y modelo real del director (nivel del selector).
  - Pizarra por sesión en `.claude/equipo/pizarra.md`, pistas por mensaje según tarea grande, contexto en tokens o presupuesto, y guía fija por sesión.
  - Comandos `/investigar` (`ver`, `guardar`) y `/equipo` (`probar`, `olvidar`, `on`, `off`).
- Selector estable con la caché caliente (`decidir` con `fria`).
- `memoria` fija las notas por sesión y `presupuesto` manda su aviso por mensaje.
- El panel tiene la pestaña Equipo.
- Instaladores en `scripts/install-mods.ps1`, `scripts/install-mods.sh` y `scripts/cloud-setup.sh`.

## Decisiones
- Nada que cambie a mitad de charla va en el prompt de sistema, porque romper la caché cuesta mucho más que los tokens fijos.
- Se quitó `plan.md`: el plan lo lleva `TodoWrite`, para no contradecirse.
- `general-purpose` no se baja de modelo, para no perder calidad.
- `web` no se amplió (sin búsqueda de imágenes ni datos), a pedido del usuario.
- La herramienta Workflow no se usa sin que el usuario la pida.

## Pendiente
1. Un solo enrutador que reemplace los avisos del selector y de mejorar-prompt.
2. Que traspaso guarde desde el resumen de la compactación.
3. Guardar lo aprendido por proyecto.
4. Revisar `escalar` y la compactación a 120k del selector.
5. Medir el costo real por tarea.
6. Verificación sin tokens.
7. Que la nube haga `git pull` al iniciar.
8. El usuario debe probar `/equipo probar` en local y en la nube.

## Datos clave
- PowerShell: `cd C:\Users\thebo\claude-mods`, luego `git pull origin claude/adoring-ride-khnvyf`, luego `powershell -ExecutionPolicy Bypass -File scripts\install-mods.ps1`.
- Script de la nube: `git clone --depth 1 https://github.com/theboyfgd12ortiz-lgtm/claude.git /tmp/cm && bash /tmp/cm/scripts/cloud-setup.sh`.
- Pruebas: `claude plugin test mods/<mod>` y `claude plugin validate .`.
- Precios por millón de entrada: Haiku 5.5 $0.10, Sonnet 5.5 $2, Opus 5.5 $4. La lectura de caché de Sonnet y Opus cuesta $0.20.
- Si el modo automático rechaza un agente lanzado desde un comando, el mod reintenta una vez.
