#!/usr/bin/env bash
# Instala o actualiza TODO: los mods de este repo, rtk (recorta la salida de los comandos)
# y caveman (respuestas cortas). Sirve igual en tu PC (Linux/macOS/WSL) y como "setup script"
# de un entorno en la nube. Es idempotente: correrlo de nuevo trae lo nuevo.
#
# Variables opcionales:
#   CLAUDE_MODS_REPO=dueño/repo   otro repositorio con los mods
#   RTK_VERSION=v0.49.0           versión de rtk (probada); súbela cuando quieras actualizarlo
#   SKIP_RTK=1 / SKIP_CAVEMAN=1   no instalar esa parte
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

# --- 2. caveman (plugin de terceros, Apache-2.0; necesita Node 22+) ---------
if [ "${SKIP_CAVEMAN:-0}" != "1" ]; then
  if ! command -v node >/dev/null 2>&1; then
    warn "caveman necesita Node.js y no lo encuentro; sigo sin caveman"
  else
    if claude plugin marketplace list 2>/dev/null | grep -q "caveman"; then
      claude plugin marketplace update caveman || warn "no pude actualizar el marketplace de caveman"
    else
      claude plugin marketplace add JuliusBrussee/caveman || warn "no pude añadir el marketplace de caveman"
    fi
    install_or_update "caveman@caveman"
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

say ""
if [ "$FAILED" -eq 0 ]; then
  say "Listo. Reinicia Claude Code o usa /reload-plugins. Escribe /mods para ver el panel."
else
  say "Terminé, pero con avisos (arriba). Lo que no falló ya quedó instalado."
fi
