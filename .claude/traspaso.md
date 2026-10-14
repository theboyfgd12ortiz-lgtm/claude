<!-- traspaso 2026-10-14T06:33:23.316Z auto -->

## Objetivo
Ortiz no programa y quiere menos mods de Claude Code, pero más útiles. Pidió una auditoría sin piedad: quitar lo inútil y sumar anti-slop, un orquestador mejor, sequential-thinking, Context7, seguridad, segundo cerebro, prompt maestro automático, respuestas directas que no le den la razón y siempre un plan. También quería OpenCode como ayudante barato.

## Hecho
- Repo `C:\Users\thebo\claude-mods`: se pasó de 16 mods a 6 más `rtk-hook`, que queda solo para la nube.
  - `mods/selector-modelo` absorbió presupuesto, mejorar-prompt y quality-coach. Archivos nuevos `hooks/reglas.ts`, `hooks/presupuesto.ts`, `hooks/calidad.ts`; trae un solo bloque de reglas y una sola nota por pedido (`notaDelPedido`).
  - `mods/equipo` absorbió piloto (`hooks/mision.ts`; el piloto es opt-in con `pilotoAuto=false`). Se arregló el `<system-reminder>` que se colaba en el objetivo. Se quitaron aprendizaje, pizarra e /investigar.
  - `mods/guardian` absorbió respaldo (`hooks/git.ts`, `prueba-git.mts`).
  - `mods/memoria` absorbió traspaso (`hooks/traspaso.ts`).
  - `mods/mods-panel` quedó adaptado (8 pestañas).
  - Borrados: output-trim, token-meter, terminales.
- Actualizados: `.claude-plugin/marketplace.json`, `.claude/settings.json`, `README.md`, `.gitignore`, `progreso.md`, y ponytail fuera de `scripts/*`.
- Pruebas: 105 pasan y 0 fallan; los 7 mods validan.
- MCP sequential-thinking añadido a nivel usuario, y conecta.
- Archivos de OpenCode reescritos: `C:\Users\thebo\.claude\delegar-opencode.ps1` (trabaja en una copia sin claves y lista los cambios), `C:\Users\thebo\.claude\commands\opencode.md` (reglas estrictas) y la sección de OpenCode en `C:\Users\thebo\.claude\CLAUDE.md`. Respaldo del script viejo: `delegar-opencode.ps1.bak`.

## Decisiones
- OpenCode solo para relleno verificable: los modelos gratis pueden guardar los datos, no puede ser un subagente real y Haiku ya es barato.
- Skill de seguridad de Cloudflare descartada: no hay una de seguridad general, solo Turnstile, y ortiz publica en Netlify.
- ponytail quitado: repetía la regla de cambio mínimo.
- rtk-hook se conserva: los instaladores de la nube y Linux lo usan. En la PC basta el hook nativo.
- El piloto ya no arranca solo, porque gastaba el límite.

## Pendiente
1. Con el OK de ortiz: commit y push a la rama `claude/adoring-ride-khnvyf`.
2. En `~/.claude/settings.json`:
   - Quitar los plugins borrados y deshabilitar ponytail y `rtk-hook`.
   - Borrar `CLAUDE_CODE_PLUGIN_DIRS`, que apunta a una carpeta que no existe.
   - Después: actualizar el marketplace y reiniciar.
3. Con permiso: `npm i -g opencode-ai`, luego `opencode run --help` para confirmar los flags (`--dir`, `-m`).
4. Hacer que guardian revise también los comandos de PowerShell.
5. El piloto depende de TodoWrite, que no existe en la app de escritorio.

## Datos clave
- Probar un mod: `claude plugin test mods/<x>`; validar: `claude plugin validate mods/<x>`.
- Repo GitHub: `theboyfgd12ortiz-lgtm/claude`, rama `claude/adoring-ride-khnvyf`.
- Hook nativo de rtk: `rtk hook claude`, en el PreToolUse de los settings de usuario.
- MCP en Windows: `claude mcp add --scope user <n> -- cmd /c npx -y <pkg>`. Correrlo desde PowerShell, porque Git Bash convierte `/c` en `C:/`.
- El tope del equipo es de 6 agentes por tarea.
