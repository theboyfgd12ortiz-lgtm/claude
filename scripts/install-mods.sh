#!/usr/bin/env bash
# Instala o actualiza TODOS los mods del marketplace claude-mods (scope: user).
# Sirve igual en tu PC (Linux/macOS/WSL) y como "setup script" de un entorno en la nube.
# Es idempotente: correrlo de nuevo trae las versiones nuevas.
set -euo pipefail

REPO="${CLAUDE_MODS_REPO:-theboyfgd12ortiz-lgtm/claude}"
MARKET="claude-mods"

if ! command -v claude >/dev/null 2>&1; then
  echo "claude-mods: no encuentro el comando 'claude'; instala Claude Code primero." >&2
  exit 1
fi

if claude plugin marketplace list 2>/dev/null | grep -q "$MARKET"; then
  claude plugin marketplace update "$MARKET"
else
  claude plugin marketplace add "$REPO"
fi

LIST="${HOME}/.claude/plugins/marketplaces/${MARKET}/.claude-plugin/marketplace.json"
# Cada mod vive en ./mods/<nombre>, y <nombre> es también el nombre del plugin.
PLUGINS=$(grep -o '"source": *"\./mods/[^"]*"' "$LIST" | sed 's#.*\./mods/\([^"/]*\)/*"$#\1#')

for p in $PLUGINS; do
  if claude plugin list 2>/dev/null | grep -q "${p}@${MARKET}"; then
    claude plugin update "${p}@${MARKET}" || true
  else
    claude plugin install "${p}@${MARKET}"
  fi
done

echo "claude-mods: listo ($(echo $PLUGINS | wc -w) mods). Reinicia Claude Code o usa /reload-plugins."
