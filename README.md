# claude-mods

Mods para Claude Code que eligen el modelo justo, recortan lo que gasta tokens, protegen tu trabajo y empujan a Claude a entregar cosas verificadas. Con **`/mods`** abres un panel que explica todo en español y muestra el estado de cada uno en vivo.

## Qué incluye

| Mod | Qué hace | Ahorra tokens | Mejora o protege |
| --- | --- | :-: | :-: |
| **selector-modelo** | Clasifica cada pedido y elige modelo y esfuerzo en 9 niveles: 1-2 Haiku, 3-5 Sonnet, 6-9 Opus. Si la tarea se complica sube sola; compacta la conversación cuando está muy llena. `/nivel` lo muestra o lo fija. | ✅✅✅ | ✅ |
| **rtk-hook** | Cuando Claude corre `git`, `ls`, `grep`, tests…, el comando pasa por [rtk](https://github.com/rtk-ai/rtk), que devuelve solo lo importante. En pruebas reales redujo entre 35 % y 75 % esas salidas. | ✅✅✅ | — |
| **caveman** (de [JuliusBrussee](https://github.com/JuliusBrussee/caveman)) | Claude responde sin relleno y con el código exacto. `/caveman` lo controla; "stop caveman" lo apaga. | ✅✅ | — |
| **ponytail** (de [DietrichGebert](https://github.com/DietrichGebert/ponytail)) | Claude busca la solución más simple que funcione: sin código, dependencias ni abstracciones de más. | ✅✅ | ✅ |
| **token-optimizer** (de [alexgreensh](https://github.com/alexgreensh/token-optimizer)) | Audita qué llena el contexto, evita releer archivos sin cambios y mejora la compactación. `/token-optimizer` da el informe. | ✅✅ | ✅ |
| **humanizer** (de [blader](https://github.com/blader/humanizer)) | Solo actúa cuando se lo pides ("humaniza este texto"): quita lo que suena a IA sin cambiar lo que dice. Útil para textos de clientes. | — | ✅✅ |
| **output-trim** | Red de seguridad: si una salida de Bash sigue siendo enorme, la corta a inicio + final y guarda el texto completo en `/tmp`. | ✅✅ | ✅ |
| **quality-coach** | Cinco reglas de trabajo en el prompt de sistema, aviso si se editó código sin probarlo, y mejores resúmenes al compactar. | ✅ | ✅✅✅ |
| **guardian** | Bloquea `rm -rf /` o `~`, `git push --force`, formatear discos y leer `.env`, llaves privadas o credenciales. `/guardian off` lo pausa. | — | ✅✅ |
| **token-meter** | Barra con tokens, % de caché, tiempo y herramientas del último turno; `/tokens` da el total. | ✅ (te deja ver el gasto) | — |
| **mods-panel** | El panel `/mods`, con botones para pausar el guardián o cambiar el nivel del modelo. | — | — |

`rtk`, `caveman`, `ponytail`, `token-optimizer` y `humanizer` son proyectos de terceros. No están copiados aquí: el instalador los baja de su repositorio original, así recibes sus arreglos. De rtk solo viaja, tal cual, el script del hook (`mods/rtk-hook/`, con su licencia).

**Headroom** ([chopratejas/headroom](https://github.com/chopratejas/headroom)) es opcional y solo para tu PC (ver abajo).

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

Necesitas **Node.js** (para caveman y ponytail) y **Python 3** (para token-optimizer). Si falta alguno, el script lo dice con un `AVISO` y sigue con lo demás. Para saltarte una parte: `SKIP_RTK=1`, `SKIP_CAVEMAN=1`, `SKIP_PONYTAIL=1`, `SKIP_TOKEN_OPTIMIZER=1` o `SKIP_HUMANIZER=1` (en PowerShell: `$env:SKIP_PONYTAIL = '1'` antes de correrlo).

### Headroom (opcional, solo en tu PC)

Headroom es un proxy: pasa **todo** el tráfico de Claude Code por tu máquina para comprimirlo antes de enviarlo. Por eso no se instala solo:

- **En la nube no se usa.** Ahí la conexión de Claude la maneja la plataforma, y desviarla rompería la sesión.
- **Hace lo mismo que rtk, token-optimizer y output-trim.** Ponerlo encima ahorra poco más y suma una pieza que puede fallar.
- **Solo funciona mientras su proceso esté abierto:** hay que abrir Claude con `headroom wrap claude`.

Si aun así quieres probarlo: corre el instalador con `WITH_HEADROOM=1` (PowerShell: `$env:WITH_HEADROOM = '1'`), luego abre Claude con `headroom wrap claude`. Para quitarlo: `headroom unwrap claude`.

## Que se actualice solo

- **Los mods de este repo:** no llevan número de versión a propósito, así que Claude Code los considera nuevos con cada commit. Solo falta activar la actualización automática: en Claude Code escribe `/plugin`, entra en **Marketplaces** y, en cada uno (`claude-mods`, `caveman`, `ponytail`, `humanizer`, `alexgreensh-token-optimizer`), pulsa **Enable auto-update**. Desde ahí, al abrir sesión se traen los cambios.
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

- **Los plugins de terceros suman unos 5.000 tokens fijos al empezar cada sesión** (medido): caveman ~3.100, ponytail ~1.500, token-optimizer ~400 y humanizer ~150. Casi todo queda en la caché después del primer mensaje, así que en sesiones largas sale a cuenta; en una charla de dos preguntas puede salir a pérdida. Para apagar uno: `claude plugin disable <nombre>@<marketplace>` (por ejemplo `caveman@caveman`).
- **Caveman y ponytail le dan órdenes de estilo a Claude** (respuestas cortas; soluciones mínimas). Para un trabajo donde importa mucho el acabado, como una página para un cliente, puedes apagarlos un rato: "stop caveman" y `/ponytail off`.
- **token-optimizer tiene licencia no comercial** (PolyForm Noncommercial). Es gratis para uso personal y para negocios de menos de 5 personas que facturen menos de US$20.000 al mes. Si creces más allá de eso, revisa su licencia.
- **rtk y token-optimizer podrían pelear por el mismo comando de Bash**, así que el instalador apaga el recorte de Bash de token-optimizer (`TOKEN_OPTIMIZER_BASH_COMPRESS=0`) y deja ese trabajo a rtk.
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
