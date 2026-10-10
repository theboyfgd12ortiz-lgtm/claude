# claude-mods

Cuatro mods para Claude Code que se complementan con un selector automático de modelo:
protegen tu trabajo, ahorran tokens y empujan a Claude a entregar resultados verificados.

| Mod | Para qué sirve | Ahorro de tokens | Calidad / seguridad |
| --- | --- | --- | --- |
| **guardian** | Bloquea `rm -rf /` o `~`, `git push --force` (sugiere `--force-with-lease`), `mkfs`, `dd` a discos y la lectura de `.env`, llaves privadas y credenciales. Si hay cambios sin commitear, también bloquea `git reset --hard`, `git checkout -- .` y `git clean -f`. | — | ✅✅ |
| **output-trim** | Recorta las salidas de Bash de más de ~15k caracteres a inicio + final, quita colores ANSI y barras de progreso y agrupa las líneas repetidas. Guarda la salida completa en `/tmp/output-trim-<id>.log`, así Claude todavía puede buscar en ella con grep. | ✅✅✅ | ✅ |
| **quality-coach** | Añade al prompt de sistema cinco reglas cortas de trabajo: entender antes de cambiar, cambios mínimos, verificar antes de decir que terminó, gastar pocos tokens y responder en tu idioma. Avisa si se editó código sin correr tests, lint ni build, y le da a la compactación instrucciones para conservar lo importante. | ✅ | ✅✅✅ |
| **token-meter** | Muestra sobre el prompt los tokens del último turno, el % de caché, el tiempo y las herramientas usadas. `/tokens` da el total de la sesión y avisa cuando un turno es muy pesado. | ✅ (te deja ver el gasto) | — |

## Instalar

### En tu PC (local)

Linux, macOS o WSL:

```
git clone https://github.com/theboyfgd12ortiz-lgtm/claude.git
bash claude/scripts/install-mods.sh
```

Windows (PowerShell):

```
git clone https://github.com/theboyfgd12ortiz-lgtm/claude.git
powershell -ExecutionPolicy Bypass -File claude\scripts\install-mods.ps1
```

El script instala **todos** los mods del marketplace a nivel usuario, así que funcionan en cualquier proyecto. Si lo vuelves a correr, actualiza los que ya tengas.

También puedes instalar uno por uno desde la terminal de Claude Code:
`/plugin install guardian --marketplace theboyfgd12ortiz-lgtm/claude`

### En la nube (claude.ai/code)

- **Para todas tus sesiones en la nube:** en el entorno (menú del entorno, luego *Edit*, luego *Setup script*) pega:

  ```
  git clone --depth 1 https://github.com/theboyfgd12ortiz-lgtm/claude.git /tmp/claude-mods && bash /tmp/claude-mods/scripts/install-mods.sh
  ```

  Cada sesión nueva arranca con los mods instalados y al día.
- **Solo en este repo:** `.claude/settings.json` ya declara el marketplace y activa los mods, así que cualquier sesión (local o en la nube) que abra este repo los carga.

### Añadir un mod nuevo (o uno que ya tengas en local)

1. Copia su carpeta a `mods/<nombre>/`. Debe tener `.claude-plugin/plugin.json`, cuyo `name` sea igual a `<nombre>`, y `hooks/`.
2. Añádelo a `.claude-plugin/marketplace.json` con `"source": "./mods/<nombre>"`, y a `enabledPlugins` en `.claude/settings.json`.
3. Haz commit y push. Al volver a correr el script, local y nube lo reciben.

Cuando cambies un mod, **sube su `version`** en `plugin.json`. Si no, `claude plugin update` lo considera al día y no trae los cambios.

## Comandos

- `/guardian off | on | status`: pausa o reactiva las protecciones en la sesión actual (por ejemplo, cuando de verdad quieres que Claude edite tu `.env`).
- `/tokens [show | hide | reset]`: muestra el total de la sesión y muestra, oculta o reinicia la barra.

## Desarrollo

Cada mod está en `mods/<nombre>/`, con `hooks/register.ts(x)` y sus tests `*.test.ts(x)`. La lógica pura (reglas y recorte) vive en archivos aparte para poder probarla directamente.

```
claude plugin validate mods/<nombre>
claude plugin test mods/<nombre>
```
