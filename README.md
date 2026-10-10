# claude-mods

Mods para Claude Code que eligen el modelo justo, recortan lo que gasta tokens, protegen tu trabajo y empujan a Claude a entregar cosas verificadas. Con **`/mods`** abres un panel que explica todo en español y muestra el estado de cada uno en vivo.

## Qué incluye

| Mod | Qué hace | Ahorra tokens | Mejora o protege |
| --- | --- | :-: | :-: |
| **selector-modelo** | Clasifica cada pedido y elige modelo y esfuerzo en 9 niveles: 1-2 Haiku, 3-5 Sonnet, 6-9 Opus. Si la tarea se complica sube sola; compacta la conversación cuando está muy llena. `/nivel` lo muestra o lo fija. | ✅✅✅ | ✅ |
| **rtk-hook** | Cuando Claude corre `git`, `ls`, `grep`, tests…, el comando pasa por [rtk](https://github.com/rtk-ai/rtk), que devuelve solo lo importante. En pruebas reales redujo entre 35 % y 75 % esas salidas. | ✅✅✅ | — |
| **caveman** (de [JuliusBrussee](https://github.com/JuliusBrussee/caveman)) | Claude responde sin relleno y con el código exacto. `/caveman` lo controla; "stop caveman" lo apaga. | ✅✅ | — |
| **output-trim** | Red de seguridad: si una salida de Bash sigue siendo enorme, la corta a inicio + final y guarda el texto completo en `/tmp`. | ✅✅ | ✅ |
| **quality-coach** | Cinco reglas de trabajo en el prompt de sistema, aviso si se editó código sin probarlo, y mejores resúmenes al compactar. | ✅ | ✅✅✅ |
| **guardian** | Bloquea `rm -rf /` o `~`, `git push --force`, formatear discos y leer `.env`, llaves privadas o credenciales. `/guardian off` lo pausa. | — | ✅✅ |
| **token-meter** | Barra con tokens, % de caché, tiempo y herramientas del último turno; `/tokens` da el total. | ✅ (te deja ver el gasto) | — |
| **mods-panel** | El panel `/mods`, con botones para pausar el guardián o cambiar el nivel del modelo. | — | — |

`rtk` y `caveman` son proyectos de terceros (Apache-2.0). No están copiados aquí: el instalador los baja de su fuente original. Del primero solo viaja, tal cual, el script del hook (`mods/rtk-hook/`, con su licencia).

## Instalar (una vez)

**Windows (PowerShell):**

```
git clone https://github.com/theboyfgd12ortiz-lgtm/claude.git
powershell -ExecutionPolicy Bypass -File claude\scripts\install-mods.ps1
```

**Linux, macOS o WSL:**

```
git clone https://github.com/theboyfgd12ortiz-lgtm/claude.git
bash claude/scripts/install-mods.sh
```

El script instala todo a nivel usuario (sirve en cualquier proyecto): los mods, caveman, y el programa rtk (con `jq`, que rtk-hook necesita). Después reinicia Claude Code y escribe `/mods`. En Windows, Claude Code ejecuta los hooks con Git Bash, así que necesitas tenerlo instalado.

Si algo no se puede instalar, el script lo dice con un `AVISO` y sigue con lo demás. Con `SKIP_RTK=1` o `SKIP_CAVEMAN=1` se salta esa parte.

## Que se actualice solo

- **Los mods de este repo:** no llevan número de versión a propósito, así que Claude Code los considera nuevos con cada commit. Solo falta activar la actualización automática: en Claude Code escribe `/plugin`, entra en **Marketplaces**, elige `claude-mods` y pulsa **Enable auto-update**. Haz lo mismo con `caveman`. Desde ahí, al abrir sesión se traen los cambios.
- **A mano, cuando quieras:** vuelve a correr el script de instalación (no duplica nada), o `claude plugin marketplace update claude-mods`.
- **rtk** (el programa) no se actualiza solo: el script instala la versión probada (`v0.49.0`). Para subirla, corre el script con `RTK_VERSION=vX.Y.Z`, o cambia el valor por defecto en `scripts/install-mods.sh`.

## En la nube (claude.ai/code)

En el entorno (menú del entorno → *Edit* → *Setup script*) pega:

```
git clone --depth 1 https://github.com/theboyfgd12ortiz-lgtm/claude.git /tmp/claude-mods && bash /tmp/claude-mods/scripts/install-mods.sh
```

Además, `.claude/settings.json` de este repo activa los mods en cualquier sesión que lo abra.

## Comandos

- `/mods`: el panel "Mis mods".
- `/nivel [auto | 1-9 | tope N]`: el selector de modelo.
- `/guardian [off | on]`: pausa o reactiva las protecciones.
- `/tokens [show | hide | reset]`: totales de la sesión.
- `/caveman`: modo de respuestas cortas.

## Lo que conviene saber

- **Caveman suma unos 2.000 tokens fijos por sesión** (sus skills y agentes quedan listados). Se paga solo en sesiones largas o con muchas respuestas; en una charla de dos preguntas puede salir a pérdida. Si no lo quieres: `claude plugin disable caveman@caveman`.
- **Caveman está escrito en inglés.** No lo hemos probado a fondo respondiendo en español; si notas respuestas raras, dilo y se ajusta.
- **El guardián no es una caja fuerte.** Revisa comandos de Bash y lecturas de archivos con reglas; un comando muy rebuscado puede esquivarlo. Es un seguro contra accidentes, no contra alguien con mala intención.

## Añadir un mod nuevo

1. Copia su carpeta a `mods/<nombre>/`. Debe tener `.claude-plugin/plugin.json`, cuyo `name` sea igual a `<nombre>`, y `hooks/`.
2. Añádelo a `.claude-plugin/marketplace.json` con `"source": "./mods/<nombre>"` y a `enabledPlugins` en `.claude/settings.json`.
3. Haz commit y push. El instalador y la actualización automática lo recogen.

## Desarrollo

Cada mod tiene sus tests (`*.test.ts(x)`), con la lógica pura en archivos aparte para probarla directamente:

```
claude plugin validate mods/<nombre>
claude plugin test mods/<nombre>
```
