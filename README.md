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
| **presupuesto** | Vigila tu límite semanal y de 5 horas, sin que hagas nada. Desde el 80 % limita el modelo (máximo Sonnet) y me pide respuestas más económicas; desde el 95 %, ahorro máximo. Cuando el límite se renueva, todo vuelve a la normalidad. | ✅✅✅ | — |
| **traspaso** | **Guarda solo** el progreso cuando la conversación se llena (45 % del contexto), en `.claude/traspaso.md`. Te avisa y, en una charla limpia, el panel ofrece **Retomar**. Con `/guardar` y `/retomar` también se puede a mano. | ✅✅✅ | ✅ |
| **mejorar-prompt** | **Automático:** si escribes algo corto y vago ("haz una página para mi panadería"), yo pregunto lo que falta (máximo 3 preguntas) antes de construir. Tu texto no cambia y no cuesta ninguna llamada extra. El botón **Mejorar mi borrador** del panel reescribe lo que tengas en el cuadro. | ✅ | ✅✅ |
| **respaldo** | **Antes de cada pedido** guarda un punto de restauración con git (no toca tus ramas, commits ni archivos). En el panel, pestaña Cambios, un botón **Volver aquí** deshace todo lo que hice desde ese punto, con confirmación. Lo que escribiste tú antes no se pierde. Probado con git real. | ✅ | ✅✅✅ |
| **memoria** | **Claude recuerda tu proyecto.** Después de un trabajo de verdad (varias ediciones) apunta solo, en `.claude/memoria.md`, lo que sirve a futuro: cómo probarlo y publicarlo, tecnologías, decisiones, datos del cliente. Al empezar una charla nueva lo lee, así no repites explicaciones ni gastas tokens volviendo a explorar. Nunca guarda claves. `/memoria` muestra lo que sabe y `/memoria borrar` lo olvida. | ✅✅ | ✅✅ |
| **web** | Usa internet por ti. **Revisa una página** (la de tu cliente, la que acabas de publicar): nota de 0 a 100, y en palabras simples qué falta (¿se ve bien en el celular?, ¿tiene título y descripción para Google?, ¿imágenes sin descripción?, ¿enlaces rotos?, ¿tarda mucho?). **Al publicar con Netlify, Vercel o Firebase la revisa sola** y te avisa. Muestra si **GitHub, Netlify, Supabase, Claude y Cloudflare** están caídos, para saber si el problema es tuyo. Todo en la pestaña **Web**; el botón "Pedirle a Claude que lo arregle" le pasa la lista de problemas. | — | ✅✅ |
| **piloto** | **Le dices qué quieres lograr y se hace solo.** Escribes un objetivo (`/piloto <objetivo>` o la caja de la pestaña **Equipo**; también arranca solo con tus pedidos grandes) y Claude hace el plan, reparte lo pesado con el equipo de agentes baratos, avanza paso a paso sin que lo empujes, pasa al revisor y te deja un resumen. Cada vez que Claude termina un turno y quedan pasos, el piloto le manda seguir con el siguiente. **Frenos:** tope de 8 continuaciones seguidas, se detiene si lo interrumpes, si se atasca en el mismo paso o si queda poco límite de uso (no gasta lo que queda), y `/piloto parar` lo frena. `/piloto auto off` lo deja solo manual. Sigue el avance con el plan de `TodoWrite`: si Claude no marca los pasos, no hay seguimiento. Cada paso es un turno normal (gasta lo que gasta); la ventaja es que lo pesado va a Haiku y Sonnet. | — | ✅✅ |
| **terminales** | **Varias terminales de Claude Code en el mismo proyecto, trabajando en equipo.** Cada una se llama T1, T2… y ve qué hace cada otra (lo último que le pediste). Si dos van a editar el mismo archivo, la segunda recibe un aviso antes (una vez) para no pisarse. Se mandan mensajes: Claude tiene la herramienta `enviar` y tú puedes usar `/terminal enviar T2 <texto>`. `/terminal paralelo <nombre>` crea una copia del proyecto en su propia rama (git worktree) para que la otra terminal trabaje sin mezclarse con esta; se junta después con `git merge`. Cada terminal tiene su propia pizarra del equipo y todas comparten el mismo presupuesto, porque el límite es de tu cuenta. Todo en la pestaña **Terminales**. Funciona por archivos en `.claude/terminales/` del proyecto, así que vale para terminales abiertas en la misma carpeta de tu PC. | — | ✅ |
| **equipo** | **Un director con un equipo barato.** Claude planifica y reparte lo pesado (buscar y leer código, investigar en internet, revisar) entre agentes que corren con Haiku o Sonnet en vez del modelo caro, así gastas menos y el director conserva su contexto limpio. **Aprende solo:** un agente cuenta como fallo si no entrega el formato pedido (rutas, fuentes, veredicto) o si el revisor encuentra problemas en su trabajo; si falla 2 de 4 veces sube de escalón (Haiku → Sonnet → Opus) y, tras 8 aciertos seguidos, baja para probar lo barato. Si un tipo de agente no sale a cuenta (el ahorro neto, ya descontado lo que cuesta encargar y leer, no es positivo en 5 trabajos), le dice a Claude que lo haga él mismo. **Se adapta a tareas grandes:** si el pedido es largo o tiene varias partes, Claude recibe con ese mensaje una pista corta (plan con `TodoWrite`, hasta 6 agentes, 3 a la vez, encargos que se bastan solos, revisor al final); si el contexto pasa del 50 % / 70 % o de 80k / 150k tokens (la ventana puede ser de 1M), se le pide delegar la lectura al explorador y sugerir `/compact`. Los resultados de cada agente quedan en `.claude/equipo/pizarra.md` (con tope de tamaño) y al compactar se conserva dónde están, así no se pierde nada. La pizarra empieza de cero en cada sesión. **Prioriza y se limita:** en cada encargo Claude escribe `dificultad: baja|media|alta` y el modelo se ajusta (baja = el más barato, alta = un escalón más fuerte, nunca más caro que el director ni pisando lo aprendido); como máximo 3 agentes a la vez y 6 por tarea, y el sistema rechaza el resto con un mensaje claro; el plan lo lleva `TodoWrite` (el panel ya lo muestra en **Ahora**). Con el presupuesto apretado no reparte. `/investigar <pregunta>` busca en internet con un agente barato y devuelve un resumen con fuentes (`ver`, `guardar`); `/equipo` muestra el estado (`on`, `off`, `olvidar`, `probar` lanza una autoprueba que comprueba en tu sesión que el agente barato corre). Todo en la pestaña **Equipo**; el ahorro es una estimación con precios relativos, no tu factura. | — | ✅✅ |
| **guardian** | Bloquea `rm -rf /` o `~`, `git push --force`, formatear discos y leer `.env`, llaves privadas o credenciales. **Tampoco deja escribir claves reales** (Anthropic, OpenAI, GitHub, AWS, Stripe, llaves privadas…) dentro del código: pide usar un archivo `.env`. `/guardian off` lo pausa. | — | ✅✅ |
| **token-meter** | Barra con tokens, % de caché, tiempo y herramientas del último turno; `/tokens` da el total. | ✅ (te deja ver el gasto) | — |
| **mods-panel** | El **Centro de control** (`/mods`): tus límites de uso arriba; el aviso "hay un trabajo guardado" con su botón Retomar; qué estoy haciendo en vivo y el plan con avances; los archivos cambiados con su antes y después; el ahorro con gráfico; el modelo con botones 1-9; todos los mods con su botón y una revisión de la instalación. Te avisa con una notificación cuando termina una tarea larga. | — | ✅ |

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

El instalador deja activada la actualización automática de todos los marketplaces. Es lo mismo que `/plugin` → **Marketplaces** → **Enable auto-update**, pero ya hecho. Desde ahí:

- **Cuándo llegan los cambios:** después de tu primer mensaje en una sesión, Claude Code busca versiones nuevas (tarda hasta 10 minutos) y las aplica en la sesión siguiente, o al instante con `/reload-plugins`.
- **Los mods de este repo** no llevan número de versión a propósito: cada commit cuenta como versión nueva.
- **Si quieres forzar una actualización**, vuelve a correr el instalador. No duplica nada.
- **rtk (el programa) no se actualiza solo.** El script instala la versión probada, `v0.49.0`. Para subirla, corre el script con `RTK_VERSION=vX.Y.Z`.

## En la nube (claude.ai/code)

Una sesión en la nube arranca en una máquina limpia: **no** instala los plugins de tu PC ni los que el repo declara en `.claude/settings.json` (lo dice la documentación oficial). Por eso hace falta un script de inicio en el entorno.

**1. Pega el script de inicio.** En claude.ai/code abre el menú del entorno (arriba, donde dice *Default*), pulsa **Edit**, busca **Setup script**, pega esta línea y guarda:

```
git clone --depth 1 https://github.com/theboyfgd12ortiz-lgtm/claude.git /tmp/cm && bash /tmp/cm/scripts/cloud-setup.sh 2>&1 | tee /tmp/claude-mods-setup.log
```

Baja los mods y los plugins de terceros a `/opt/claude-mods`, instala rtk y le dice a Claude Code que los cargue desde ahí (`CLAUDE_CODE_PLUGIN_DIRS`). No usa marketplaces. Tarda unos 10 segundos.

**2. Abre una sesión nueva.** Las sesiones que ya estaban abiertas no cambian. La nube guarda el resultado unos 7 días y lo rehace si cambias el script.

**3. Comprueba que funcionó.** En la sesión nueva escribe `/mods`. Si no aparece nada, pídeme: "lee /tmp/claude-mods-setup.log y dime qué falló". Ese archivo lista cada mod con `loaded` si cargó, y las líneas `AVISO` dicen qué no se pudo bajar.

Para actualizar, abre una sesión nueva después de cambiar el script o espera a que la nube rehaga su copia. Con el comando `git pull` dentro de `/opt/claude-mods/claude` también se actualiza.

**Lo que se ve en la nube.** La documentación oficial dice que los mods *funcionan* en una sesión en la nube (guardián, selector de modelo, recortes) pero que el panel solo se dibuja en la terminal y en la app de escritorio, no en el navegador de claude.ai/code. Si abres la sesión en el navegador, los mods trabajan aunque no veas el Centro de control.

*Alternativa:* también puedes añadir `theboyfgd12ortiz-lgtm/claude` en claude.ai → **Customize → Plugins → Add → Add marketplace**. Si te da "No se pudo añadir el mercado", no insistas: usa el script de arriba.

## Comandos

- `/mods [ahora | ahorro | modelo | mods | ayuda]`: el Centro de control, en la pestaña que digas.
- `/nivel [auto | 1-9 | tope N]`: el selector de modelo.
- `/equipo`, `/investigar`: el equipo de agentes y la investigación en internet.
- `/guardian [off | on]`: pausa o reactiva las protecciones.
- `/tokens [show | hide | reset]`: totales de la sesión.
- `/caveman`: modo de respuestas cortas.
- Estos tres **no hace falta llamarlos**: trabajan solos y todo está en el panel (`/mods`). Si quieres, existen como comandos: `/presupuesto [on | off]`, `/guardar` y `/retomar`, `/mejorar [pedido | on | off]`.

## Con el límite casi agotado

Cuando el presupuesto pasa de modo normal a ahorro, `presupuesto` pide a Claude hacer **primero lo que pediste, directo**, y **limita las skills a una por pedido** (cada skill carga miles de tokens): la que ayuda a la calidad se usa, las de "por si acaso" no. Los mods deciden antes de que Claude responda; no gastan tokens. En ahorro máximo (95 % del límite) el modelo baja a Haiku (unas 20 veces más barato que Sonnet), y los agentes también. **Si el límite se agota**, te dice cuánto falta para que se renueve y te avisa con una notificación cuando ya puedes seguir; tu trabajo queda guardado por `traspaso` y sigues con `/retomar`.

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

El mod `respaldo` además tiene una prueba con git de verdad que el motor de pruebas no puede correr: `node --experimental-strip-types --no-warnings mods/respaldo/prueba-git.mts`.
