#!/usr/bin/env bash
# Abre Claude Code a través de OmniRoute (modelos gratuitos), para cuando se acabó el límite de tu plan.
# Uso: bash scripts/claude-gratis.sh [modelo]     (por defecto: auto/coding)
set -euo pipefail
MODELO="${1:-auto/coding}"
if ! command -v omniroute >/dev/null 2>&1; then
  echo "No encuentro el comando 'omniroute'. Instálalo siguiendo https://github.com/diegosouzapw/OmniRoute y vuelve a intentar." >&2
  exit 1
fi
echo "Abriendo Claude Code con OmniRoute ($MODELO). Tus mods siguen activos; los modelos gratuitos tienen sus propios límites."
exec omniroute run claude --model "$MODELO"
