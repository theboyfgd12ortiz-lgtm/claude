#!/usr/bin/env bash
# Instala o actualiza TODO: los mods de este repo, rtk y los plugins de terceros
# (caveman, humanizer, ponytail, token-optimizer). Sirve igual en tu PC (Linux/macOS/WSL) y como "setup script"
# de un entorno en la nube. Es idempotente: correrlo de nuevo trae lo nuevo.
#
# Variables opcionales:
#   CLAUDE_MODS_REPO=dueño/repo   otro repositorio con los mods
#   RTK_VERSION=v0.49.0           versión de rtk (probada); súbela cuando quieras actualizarlo
#   SKIP_RTK=1, SKIP_CAVEMAN=1, SKIP_HUMANIZER=1, SKIP_PONYTAIL=1, SKIP_TOKEN_OPTIMIZER=1
#                                 no instalar esa parte
#   WITH_HEADROOM=1               instalar también headroom (solo tiene sentido en tu PC)
set -uo pipefail

REPO="${CLAUDE_MODS_REPO:-theboyfgd12ortiz-lgtm/claude}"
MARKET="claude-mods"
RTK_VERSION="${RTK_VERSION:-v0.49.0}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0

say() { printf '%s\n' "$*"; }
warn() { printf 'AVISO: %s\n' "$*" >&2; FAILED=1; }

if ! command -v claude >/dev/null 2>&1; then
  say "No encuentro el comando 'claude'; instala Claude Code primero." >&2
  exit 1
fi

# --- 1. Mods de este repo ---------------------------------------------------
if claude plugin marketplace list 2>/dev/null | grep -q "$MARKET"; then
  claude plugin marketplace update "$MARKET" || warn "no pude actualizar el marketplace $MARKET"
else
  claude plugin marketplace add "$REPO" || { warn "no pude añadir $REPO"; exit 1; }
fi

LIST="${HOME}/.claude/plugins/marketplaces/${MARKET}/.claude-plugin/marketplace.json"
[ -f "$LIST" ] || LIST="${HERE}/../.claude-plugin/marketplace.json" # marketplace añadido desde una carpeta
# Cada mod vive en ./mods/<nombre>, y <nombre> es también el nombre del plugin.
PLUGINS=$(grep -o '"source": *"\./mods/[^"]*"' "$LIST" | sed 's#.*\./mods/\([^"/]*\)/*"$#\1#')

install_or_update() { # $1 = plugin@marketplace
  if claude plugin list 2>/dev/null | grep -q "$1"; then
    claude plugin update "$1" || warn "no pude actualizar $1"
  else
    claude plugin install "$1" || warn "no pude instalar $1"
  fi
}

for p in $PLUGINS; do install_or_update "${p}@${MARKET}"; done

# --- 2. Plugins de terceros, desde su repositorio original ------------------
#   caveman          respuestas sin relleno (Apache-2.0, necesita Node)
#   humanizer        reescribe textos para que no suenen a IA (MIT)
#   ponytail         la solución más simple que funcione (MIT, necesita Node)
#   token-optimizer  audita y vigila el gasto de contexto (PolyForm Noncommercial, necesita Python 3)
add_marketplace() { # $1 = nombre, $2 = dueño/repo
  if claude plugin marketplace list 2>/dev/null | grep -q "$1"; then
    claude plugin marketplace update "$1" || warn "no pude actualizar el marketplace $1"
  else
    claude plugin marketplace add "$2" || { warn "no pude añadir $2"; return 1; }
  fi
}

third_party() { # $1 = variable SKIP, $2 = programa que necesita, $3 = marketplace, $4 = repo, $5 = plugin@marketplace
  [ "${!1:-0}" = "1" ] && return 0
  if [ -n "$2" ] && ! command -v "$2" >/dev/null 2>&1; then
    warn "$5 necesita '$2' y no lo encuentro; sigo sin él"
    return 0
  fi
  add_marketplace "$3" "$4" && install_or_update "$5"
}

PY=$(command -v python3 || command -v python || true)
third_party SKIP_CAVEMAN node caveman JuliusBrussee/caveman caveman@caveman
third_party SKIP_HUMANIZER "" humanizer blader/humanizer humanizer@humanizer
third_party SKIP_PONYTAIL node ponytail DietrichGebert/ponytail ponytail@ponytail
third_party SKIP_TOKEN_OPTIMIZER "${PY:-python3}" alexgreensh-token-optimizer alexgreensh/token-optimizer token-optimizer@alexgreensh-token-optimizer

# token-optimizer trae su propio recorte de comandos de Bash; rtk ya hace eso (y lo medimos),
# así que se apaga el de token-optimizer para que no peleen por el mismo comando.
# Su barra de abajo también se apaga: lo mismo se ve en el Centro de control, en un solo lugar.
if [ -n "$PY" ]; then
  "$PY" - "$HOME/.claude/settings.json" "${SKIP_RTK:-0}" <<'PYEOF' || warn "no pude ajustar ~/.claude/settings.json"
import json, os, sys
path, skip_rtk = sys.argv[1], sys.argv[2] == "1"
data = json.load(open(path)) if os.path.exists(path) else {}
env = data.setdefault("env", {})
if not skip_rtk:
    env["TOKEN_OPTIMIZER_BASH_COMPRESS"] = "0"
env["TOKEN_OPTIMIZER_STATUS_BAR"] = "0"
os.makedirs(os.path.dirname(path), exist_ok=True)
json.dump(data, open(path, "w"), indent=2)
PYEOF
fi

# --- Actualización automática ----------------------------------------------
# Lo mismo que /plugin → Marketplaces → Enable auto-update, para cada marketplace instalado:
# Claude Code trae los cambios solo (después del primer mensaje; se aplican en la sesión siguiente).
KNOWN="$HOME/.claude/plugins/known_marketplaces.json"
if [ -f "$KNOWN" ]; then
  if [ -n "$PY" ]; then
    "$PY" - "$KNOWN" <<'PYEOF' || warn "no pude activar la actualización automática"
import json, sys
path = sys.argv[1]
data = json.load(open(path))
for name in ("claude-mods", "caveman", "humanizer", "ponytail", "alexgreensh-token-optimizer"):
    if name in data:
        data[name]["autoUpdate"] = True
json.dump(data, open(path, "w"), indent=2)
PYEOF
  elif command -v node >/dev/null 2>&1; then
    node -e '
      const fs = require("fs"), p = process.argv[1], d = JSON.parse(fs.readFileSync(p, "utf8"));
      for (const n of ["claude-mods", "caveman", "humanizer", "ponytail", "alexgreensh-token-optimizer"]) if (d[n]) d[n].autoUpdate = true;
      fs.writeFileSync(p, JSON.stringify(d, null, 2));
    ' "$KNOWN" || warn "no pude activar la actualización automática"
  fi
fi

# --- 3. rtk (programa de terceros, Apache-2.0): lo usa el mod rtk-hook -------
if [ "${SKIP_RTK:-0}" != "1" ]; then
  export PATH="$HOME/.local/bin:$PATH"
  if ! command -v jq >/dev/null 2>&1; then
    warn "rtk-hook necesita jq (apt install jq / brew install jq); sin jq no recorta nada"
  fi
  if command -v rtk >/dev/null 2>&1 && [ "$(rtk --version 2>/dev/null | awk '{print "v"$2}')" = "$RTK_VERSION" ]; then
    say "rtk ${RTK_VERSION} ya está instalado."
  else
    # El instalador oficial de rtk (copia sin cambios dentro del mod) baja la versión
    # fijada y verifica su suma SHA-256 antes de instalarla en ~/.local/bin.
    INSTALLER="${HERE}/../mods/rtk-hook/scripts/install-rtk.sh"
    [ -f "$INSTALLER" ] || INSTALLER="${HOME}/.claude/plugins/marketplaces/${MARKET}/mods/rtk-hook/scripts/install-rtk.sh"
    RTK_VERSION="$RTK_VERSION" sh "$INSTALLER" || warn "no pude instalar rtk (Windows: winget install rtk-ai.rtk)"
  fi
fi

# --- 4. Headroom (opcional, solo en tu PC): WITH_HEADROOM=1 ------------------
# Es un proxy que pasa TODO el tráfico de Claude Code por tu máquina para comprimirlo.
# No se activa solo: aquí solo se instala el programa; tú decides cuándo usarlo.
if [ "${WITH_HEADROOM:-0}" = "1" ]; then
  if command -v uv >/dev/null 2>&1; then
    uv tool install --python 3.13 "headroom-ai[all]" || warn "no pude instalar headroom"
  elif [ -n "$PY" ]; then
    "$PY" -m pip install --user "headroom-ai[all]" || warn "no pude instalar headroom"
  else
    warn "headroom necesita Python 3.10+ o uv"
  fi
  say "Headroom instalado. Para usarlo abre Claude así: headroom wrap claude   (y headroom unwrap claude para quitarlo)."
fi

say ""
if [ "$FAILED" -eq 0 ]; then
  say "Listo. Reinicia Claude Code o usa /reload-plugins. Escribe /mods para ver el panel."
else
  say "Terminé, pero con avisos (arriba). Lo que no falló ya quedó instalado."
fi
