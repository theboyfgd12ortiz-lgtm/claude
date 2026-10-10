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

En una sesión de Claude Code en la terminal:

```
/plugin install guardian --marketplace theboyfgd12ortiz-lgtm/claude
/plugin install output-trim --marketplace theboyfgd12ortiz-lgtm/claude
/plugin install quality-coach --marketplace theboyfgd12ortiz-lgtm/claude
/plugin install token-meter --marketplace theboyfgd12ortiz-lgtm/claude
```

Responde `y` para añadir el marketplace y elige el alcance (usuario recomendado).

Para probarlos sin instalarlos: `claude --plugin-dir mods/guardian --plugin-dir mods/output-trim ...`

## Comandos

- `/guardian off | on | status`: pausa o reactiva las protecciones en la sesión actual (por ejemplo, cuando de verdad quieres que Claude edite tu `.env`).
- `/tokens [show | hide | reset]`: muestra el total de la sesión y muestra, oculta o reinicia la barra.

## Desarrollo

Cada mod está en `mods/<nombre>/`, con `hooks/register.ts(x)` y sus tests `*.test.ts(x)`. La lógica pura (reglas y recorte) vive en archivos aparte para poder probarla directamente.

```
claude plugin validate mods/<nombre>
claude plugin test mods/<nombre>
```
