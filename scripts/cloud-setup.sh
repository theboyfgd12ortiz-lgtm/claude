#!/usr/bin/env bash
# Script de inicio para un entorno de claude.ai/code (la nube). No necesita marketplaces:
# baja los mods y los plugins de terceros a una carpeta y le dice a Claude Code que los cargue
# desde ahí (CLAUDE_CODE_PLUGIN_DIRS), igual que --plugin-dir. También instala rtk.
#
# Pégalo en el Setup script del entorno así (el "tee" deja un registro que puedes leer luego):
#   git clone --depth 1 https://github.com/theboyfgd12ortiz-lgtm/claude.git /tmp/cm && bash /tmp/cm/scripts/cloud-setup.sh 2>&1 | tee /tmp/claude-mods-setup.log
#
# Variables opcionales: CLAUDE_MODS_REPO_URL, CLAUDE_MODS_DIR (carpeta destino), RTK_VERSION,
# SKIP_RTK=1, SKIP_CAVEMAN=1, SKIP_HUMANIZER=1, SKIP_PONYTAIL=1, SKIP_TOKEN_OPTIMIZER=1
set -u

REPO_URL="${CLAUDE_MODS_REPO_URL:-https://github.com/theboyfgd12ortiz-lgtm/claude.git}"
RTK_VERSION="${RTK_VERSION:-v0.49.0}"
DEST="${CLAUDE_MODS_DIR:-/opt/claude-mods}"
FAILED=0

say() { printf '%s\n' "$*"; }
warn() { printf 'AVISO: %s\n' "$*" >&2; FAILED=1; }

mkdir -p "$DEST" 2>/dev/null || { DEST="$HOME/claude-mods"; mkdir -p "$DEST"; }
say "== claude-mods (nube) en $DEST =="

# Baja un repositorio (o lo actualiza si ya está). $1 = carpeta, $2 = url
fetch() {
  if [ -d "$DEST/$1/.git" ]; then
    git -C "$DEST/$1" pull --ff-only -q 2>/dev/null || warn "no pude actualizar $1"
  else
    rm -rf "${DEST:?}/$1"
    git clone --depth 1 -q "$2" "$DEST/$1" || { warn "no pude bajar $1 ($2)"; return 1; }
  fi
}

PLUGIN_DIRS=""
add_dir() { [ -f "$1/.claude-plugin/plugin.json" ] && PLUGIN_DIRS="${PLUGIN_DIRS:+$PLUGIN_DIRS:}$1"; }

# --- 1. Los mods de este repo ---
fetch claude "$REPO_URL" && for d in "$DEST"/claude/mods/*/; do add_dir "${d%/}"; done

# --- 2. Plugins de terceros, desde su repositorio original ---
[ "${SKIP_CAVEMAN:-0}" = "1" ] || { fetch caveman https://github.com/JuliusBrussee/caveman.git && add_dir "$DEST/caveman"; }
[ "${SKIP_PONYTAIL:-0}" = "1" ] || { fetch ponytail https://github.com/DietrichGebert/ponytail.git && add_dir "$DEST/ponytail"; }
[ "${SKIP_HUMANIZER:-0}" = "1" ] || { fetch humanizer https://github.com/blader/humanizer.git && add_dir "$DEST/humanizer"; }
[ "${SKIP_TOKEN_OPTIMIZER:-0}" = "1" ] || { fetch token-optimizer https://github.com/alexgreensh/token-optimizer.git && add_dir "$DEST/token-optimizer"; }

# --- 3. rtk (recorta la salida de los comandos) y jq (lo necesita el hook de rtk) ---
if [ "${SKIP_RTK:-0}" != "1" ]; then
  command -v jq >/dev/null 2>&1 || { apt-get install -y -q jq >/dev/null 2>&1 || warn "no pude instalar jq"; }
  export PATH="$HOME/.local/bin:$PATH"
  if command -v rtk >/dev/null 2>&1; then
    say "rtk ya está instalado: $(rtk --version 2>/dev/null)"
  else
    RTK_VERSION="$RTK_VERSION" sh "$DEST/claude/mods/rtk-hook/scripts/install-rtk.sh" 2>&1 | tail -3 || warn "no pude instalar rtk"
  fi
fi

# --- 4. Decirle a Claude Code dónde están los plugins ---
# CLAUDE_CODE_PLUGIN_DIRS se lee del bloque "env" de ~/.claude/settings.json (como --plugin-dir).
# token-optimizer recorta comandos de Bash igual que rtk: se apaga el suyo para que no choquen.
PY=$(command -v python3 || command -v python || true)
SETTINGS="$HOME/.claude/settings.json"
mkdir -p "$HOME/.claude"
if [ -n "$PY" ]; then
  "$PY" - "$SETTINGS" "$PLUGIN_DIRS" <<'PYEOF' || warn "no pude escribir $SETTINGS"
import json, os, sys
path, dirs = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(path):
    try:
        data = json.load(open(path))
    except Exception:
        data = {}
env = data.setdefault("env", {})
env["CLAUDE_CODE_PLUGIN_DIRS"] = dirs
env["TOKEN_OPTIMIZER_BASH_COMPRESS"] = "0"
json.dump(data, open(path, "w"), indent=2)
PYEOF
else
  warn "no encuentro Python para escribir $SETTINGS"
fi

# --- 5. Comprobación ---
say ""
say "== Comprobación =="
export CLAUDE_CODE_PLUGIN_DIRS="$PLUGIN_DIRS"
CLAUDE_BIN=$(command -v claude || ls /opt/node22/bin/claude /usr/local/bin/claude 2>/dev/null | head -1 || true)
if [ -n "$CLAUDE_BIN" ]; then
  "$CLAUDE_BIN" plugin list 2>&1 | grep -E "^\s+> |Status" | paste - - | sed 's/  */ /g' || true
else
  say "(no encontré el comando claude para comprobar; los plugins se cargarán al abrir la sesión)"
fi
say ""
say "CLAUDE_CODE_PLUGIN_DIRS=$PLUGIN_DIRS"
if [ "$FAILED" -eq 0 ]; then say "Listo."; else say "Terminé con avisos (arriba). Lo que no falló quedó instalado."; fi
exit 0
