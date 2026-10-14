# Limpieza de claude-mods

## Hecho (2026-10-14)
- 16 mods propios -> 6 (selector-modelo, equipo, guardian, memoria, web, mods-panel) + rtk-hook solo para la nube.
- Fusiones: presupuesto + mejorar-prompt + quality-coach -> selector-modelo; piloto -> equipo (opt-in); respaldo -> guardian; traspaso -> memoria.
- Borrados: output-trim, token-meter, terminales; ponytail fuera de los instaladores.
- Un solo bloque de reglas (directo, anti-slop, Context7, sequential-thinking) y una sola nota por pedido.
- Arreglado: el piloto metía <system-reminder> en el objetivo.
- MCP sequential-thinking añadido a nivel usuario (conecta). Context7 ya estaba.
- OpenCode: delegar-opencode.ps1 trabaja en copia sin claves; /opencode con reglas; CLAUDE.md global ajustado.
- Pruebas: 105 pass, 0 fail; validate OK en los 7.

## Pendiente (necesita OK de ortiz)
1. Commit + push, para que llegue a su Claude Code.
2. En ~/.claude/settings.json: quitar los plugins borrados, apagar ponytail y rtk-hook, borrar CLAUDE_CODE_PLUGIN_DIRS (apunta a una carpeta que no existe).
3. Instalar el CLI de OpenCode: npm i -g opencode-ai.

## Problemas conocidos
- El piloto sigue el plan con TodoWrite; en la app de escritorio no existe esa herramienta.
- guardian no revisa comandos de PowerShell.
