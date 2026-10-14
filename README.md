# claude-mods

Seis mods para Claude Code que hacen lo que antes hacían dieciséis. Con **`/mods`** abres el panel, que lo explica todo en español y muestra el estado en vivo.

## Qué incluye

| Mod | Qué hace |
| --- | --- |
| **selector-modelo** (el director) | Elige modelo y esfuerzo por pedido (9 niveles, Haiku → Sonnet → Opus) y compacta cuando la charla se llena. Cuida tu límite de uso: desde el 80 % baja el tope y pide respuestas económicas; al renovarse, vuelve a lo normal. Trae **un solo bloque de reglas**: verdad antes que agrado (no te da la razón si no la tienes), sin relleno (anti-slop), plan antes de trabajos de varias partes, cambio mínimo, verificar antes de decir "listo", Context7 para librerías y sequential-thinking para problemas difíciles. **Prompt maestro automático:** con cada pedido manda a Claude una sola nota según lo que tu mensaje necesita: si es vago, que diga qué entendió y pregunte lo esencial (máx. 3); si es grande, que muestre el plan primero. `/mejorar` reescribe tu borrador. Avisa si se cambió código sin probarlo. `/nivel`, `/presupuesto`. |
| **equipo** (el orquestador) | Agentes baratos con su especialidad: explorador e investigador (Haiku), obrero, arreglador y revisor (Sonnet). Ajusta el modelo según `dificultad: baja/media/alta`, máximo 3 a la vez y 6 por tarea. **Piloto** opcional: `/piloto <objetivo>` planea, reparte, avanza solo (tope de 8 pasos), pasa el revisor y te deja un resumen. Ya no arranca solo: lo activas tú (`/piloto auto on` si lo quieres automático). |
| **guardian** | Bloquea `rm -rf` de la raíz o tu carpeta, `git push --force`, formatear discos, leer `.env` o llaves, y escribir claves reales dentro del código. Antes de cada pedido guarda un punto de restauración con git; en el panel, **Volver aquí** deshace lo que hizo Claude. `/guardian off` lo pausa. |
| **memoria** (segundo cerebro) | El cerebro de verdad es la memoria propia de Claude, puesta en **una sola carpeta para todos los proyectos** (`~/.claude/cerebro`, con `"autoMemoryDirectory": "~/.claude/cerebro"` en `~/.claude/settings.json`): quién eres, tus clientes, tus correcciones, lo que funciona. Antes estaba partida en una carpeta por proyecto y un chat sin carpeta no veía nada. Este mod guarda el progreso en `.claude/traspaso.md` cuando la charla se llena y en una charla limpia ofrece **Retomar** (`/guardar`, `/retomar`). Las notas por proyecto (`.claude/memoria.md`) quedan apagadas porque repetían a la memoria de Claude: `/memoria on` las enciende. Junto con graphify (mapa del código) forman tu segundo cerebro. |
| **web** | Revisa una página (celular, título y descripción para Google, imágenes, enlaces rotos, velocidad) y la revisa sola cuando publicas en Netlify, Vercel o Firebase. `/sitio`. |
| **mods-panel** | El Centro de control (`/mods`): límites de uso, qué hace Claude ahora y su plan, archivos cambiados, ahorro, modelo, equipo y web. |

**rtk-hook** sigue en el repo solo para la nube (allí no existe el hook nativo de rtk). En tu PC rtk ya corre con su hook nativo (`rtk hook claude` en `~/.claude/settings.json`); no actives los dos.

### De terceros (se bajan de su repositorio)

- **caveman**: respuestas cortas, menos tokens de salida. "stop caveman" lo apaga para trabajos de cliente donde importa el texto.
- **humanizer**: solo cuando lo pides; quita lo que suena a IA de un texto.
- **token-optimizer**: barra de estado y auditoría del contexto. Licencia no comercial (gratis para negocios de menos de 5 personas y menos de US$20.000 al mes).
- **MCP**: Context7 (documentación al día) y sequential-thinking (razonar por pasos), a nivel usuario.
- **claude-security** (oficial de Anthropic): escaneo de seguridad profundo de un proyecto, solo cuando lo pides con `/claude-security`. Para cada cambio, las reglas del director piden la skill `security-review` (viene con Claude Code) si tocaste inicio de sesión, pagos, datos de clientes, claves o Supabase, o vas a publicar.
- **Simplificador**: la skill `simplify` (viene con Claude Code). Las reglas del director la piden tras un cambio grande de código.

No se instaló la skill de Cloudflare: sus 18 skills son para construir y publicar en Cloudflare (Workers, R2, etc.) y ninguna revisa seguridad de un sitio. Tus páginas van en Netlify; solo gastaría contexto.

Se quitó **ponytail**: repetía la regla de "cambio mínimo" que ya trae el director.

## OpenCode como ayudante gratis

`/opencode <tarea>` manda trabajo de relleno (borradores, variantes, traducciones, resúmenes, una segunda opinión) a los modelos gratis de OpenCode. Corre en una **copia** del proyecto sin `.env` ni claves, y Claude revisa lo que devuelve antes de usar nada. Nunca para claves, datos de clientes, Supabase, despliegues ni decisiones de diseño: algunos modelos gratis guardan o usan lo que reciben. Necesita el CLI: `npm i -g opencode-ai` (la app de escritorio no sirve para esto).

## Qué se quitó y por qué

| Quitado | Por qué |
| --- | --- |
| output-trim | Triple trabajo: rtk y el propio Claude Code ya recortan salidas largas. Además guardaba en `/tmp`, que en Windows no existe. |
| token-meter | Venía apagado y repetía números del panel y de la barra de estado. |
| terminales | Ensuciaba cada proyecto con `.claude/terminales/`. Para trabajar en paralelo, Claude Code ya tiene worktrees y sesiones separadas. |
| presupuesto, mejorar-prompt, quality-coach | Dentro del director. Antes llegaban hasta tres avisos de "haz un plan" distintos por mensaje. |
| piloto, respaldo, traspaso | Dentro de equipo, guardian y memoria. |
| aprendizaje, pizarra e /investigar del equipo | Mucho código para estimar ahorros y escribir archivos que nadie leía. |

## Instalar

**Windows:** `git clone https://github.com/theboyfgd12ortiz-lgtm/claude.git` y luego `powershell -ExecutionPolicy Bypass -File claude\scripts\install-mods.ps1`.
**Linux, macOS o WSL:** `bash claude/scripts/install-mods.sh`.
**Nube (claude.ai/code):** en el *Setup script* del entorno: `git clone --depth 1 https://github.com/theboyfgd12ortiz-lgtm/claude.git /tmp/cm && bash /tmp/cm/scripts/cloud-setup.sh 2>&1 | tee /tmp/claude-mods-setup.log`.

Después reinicia Claude Code y escribe `/mods`.

## Límites que conviene saber

- Las reglas empujan a Claude a ser directo y a llevarte la contraria cuando no tienes razón, pero son instrucciones, no una garantía.
- El piloto sigue el plan con `TodoWrite`; donde no existe (la app de escritorio) lo lee de la lista con casillas `- [ ]` / `- [x]` que Claude escribe en su respuesta.
- El guardián revisa comandos de Bash y de PowerShell (también `cmd /c` y `powershell -Command`). Es un seguro contra accidentes, no contra alguien con mala intención.

## Desarrollo

```
claude plugin validate mods/<nombre>
claude plugin test mods/<nombre>
node --experimental-strip-types --no-warnings mods/guardian/prueba-git.mts
```
