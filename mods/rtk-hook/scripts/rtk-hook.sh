#!/usr/bin/env bash
# Puerta de entrada del hook: deja pasar el comando tal cual (sin avisos) si falta rtk o jq,
# y si están, delega en el hook oficial de rtk (rtk-rewrite.sh, sin cambios).
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
command -v rtk >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
exec bash "$(dirname "${BASH_SOURCE[0]}")/rtk-rewrite.sh"
