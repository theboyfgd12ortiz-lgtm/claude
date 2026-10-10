<!-- traspaso 2026-10-10T15:26:54.480Z auto -->

## Objetivo
Mods de Claude Code para un usuario hispanohablante (Windows, app de escritorio, cerca del límite semanal) que ahorren tokens, protejan el trabajo y den mejores resultados. Deben funcionar solos, en local y en la nube, con un panel único y fácil de entender.

## Hecho
- Repo `theboyfgd12ortiz-lgtm/claude`, rama `claude/adoring-ride-khnvyf` (es la rama por defecto); es también el marketplace `claude-mods`.
- Mods en `mods/`: `selector-modelo` (del usuario), `guardian`, `output-trim`, `quality-coach`, `token-meter`, `rtk-hook`, `presupuesto`, `traspaso`, `mejorar-prompt` y `mods-panel` (Centro de control con pestañas Ahora, Cambios, Ahorro, Modelo, Mods y Ayuda).
- Instaladores: `scripts/install-mods.ps1` y `install-mods.sh` para local, `scripts/cloud-setup.sh` para la nube.
- Plugins de terceros que se instalan desde su origen: caveman, ponytail, humanizer y token-optimizer.
- `.claude-plugin/marketplace.json`, `.claude/settings.json` y `README.md` al día. Todos los tests pasan.

## Decisiones
- Plugins de terceros desde su repo original, sin copiarlos: así reciben actualizaciones.
- Headroom queda opcional (`WITH_HEADROOM=1`) y solo local: es un proxy que rompe la sesión en la nube.
- Nube: `cloud-setup.sh` vía `CLAUDE_CODE_PLUGIN_DIRS`, porque la nube ignora los plugins del repo y el marketplace de claude.ai falló.
- Mods sin `version`: cada commit cuenta como versión y el auto-update se activa desde el instalador.
- La barra de Token Optimizer y la de token-meter van apagadas: todo se ve en un solo panel.
- Presupuesto ya no ejecuta `/nivel`: el selector lee `presupuesto.estado.topeMax`.
- Lo automático va antes que los comandos `/`, porque el usuario los olvida.

## Pendiente
1. Responder si agrego la línea "Modelo real de la última respuesta" al panel. La etiqueta "Opus 5.5" de la app es solo visual y no se puede cambiar.
2. Confirmar con capturas que en Windows funcionan rtk y presupuesto, y que el banner Retomar aparece.
3. Revisar que la ventana aparte "Selector de modelo" ya no aparezca.

## Datos clave
- Actualizar en local:
  - `cd $HOME\claude-mods`
  - `git pull`
  - `powershell -ExecutionPolicy Bypass -File scripts\install-mods.ps1`
  - Después, reiniciar la app.
- Setup script del entorno en la nube: `git clone --depth 1 https://github.com/theboyfgd12ortiz-lgtm/claude.git /tmp/cm && bash /tmp/cm/scripts/cloud-setup.sh 2>&1 | tee /tmp/claude-mods-setup.log`
- En la nube los mods actúan, pero los paneles no se dibujan. `/mods` responde allí con un resumen en texto.
- Probar los mods: `claude plugin validate mods/<x>` y `claude plugin test mods/<x>`.
- Desarrollo en vivo: copiar `mods/.` a `/root/.claude/dev-mods/<sesión>/`.
- Variables de entorno: `TOKEN_OPTIMIZER_BASH_COMPRESS=0`, `TOKEN_OPTIMIZER_STATUS_BAR=0`; rtk `v0.49.0`.
