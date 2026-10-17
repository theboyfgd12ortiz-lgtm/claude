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

- Subido (7856efe). Instalación de ortiz limpia: 9 mods viejos desinstalados, ponytail y rtk-hook apagados, CLAUDE_CODE_PLUGIN_DIRS quitado.

## Hecho (2026-10-14, segunda vuelta)
- Panel: el "no instalado" de equipo era una carrera al arrancar (lista de comandos leída antes de que equipo registrara los suyos). Ahora vuelve a mirar si falta un mod propio.
- Segundo cerebro: memoria de Claude unificada en ~/.claude/cerebro (autoMemoryDirectory en ~/.claude/settings.json). 49 notas repartidas en 7 carpetas -> 40 fusionadas. Originales intactos. Respaldo: settings.json.bak-cerebro.
- memoria: notas por proyecto apagadas por defecto (repetían la memoria de Claude; en 4 días solo escribieron 1 archivo). Traspaso sigue igual.
- guardian revisa PowerShell y cmd. piloto lee el plan de una lista "- [ ]" cuando no hay TodoWrite.
- Seguridad: claude-security (oficial) instalado; reglas piden security-review y simplify. Cloudflare descartado (no trae seguridad).
- Pruebas: 109 pass, 0 fail; validate OK en los 6; prueba-git 16 ok.

## Hecho (2026-10-15/16)
- /guardar: si el resumen aparte falla (error de API), deja el pedido en el cuadro de mensaje para que Claude escriba la nota.
- equipo: agente mecanico (Haiku) para trabajo ya decidido; vigilante avisa al director tras 5 lecturas, ~15k tokens leídos o 6 ediciones por turno. Contador de tamaño con respaldo si falta el texto del resultado (probado).
- Medición de 14 días (544 transcripciones): ~92% del gasto es Opus en el chat principal; las llamadas con más de 300k de contexto son ~64% del total. Subagentes ~8%. Lo que más ahorra: chats más cortos, no más delegación.
- Chats cortos: CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000 en ~/.claude/settings.json (compacta solo cerca de 200k); memoria guarda la nota de traspaso antes de cada compactación.

## Pendiente
- ortiz: reiniciar Claude Code y comprobar /mods y que Claude recuerde sus proyectos en un chat sin carpeta.
- OpenCode: cerrado por pedido de ortiz.

## Problemas conocidos
- No pude probar el cerebro global con `claude -p` (la terminal no tiene sesión iniciada); se confirmó que la opción existe en el programa.
