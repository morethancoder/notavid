#!/usr/bin/env bash
# Shared helpers for scripts/*.sh — colors, logging, tool/env checks.

BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
CYAN=$'\033[36m'; RESET=$'\033[0m'

say()  { printf '%s\n' "$*"; }
step() { printf '%s▸ %s%s\n' "$CYAN" "$*" "$RESET"; }
ok()   { printf '%s✔ %s%s\n' "$GREEN" "$*" "$RESET"; }
warn() { printf '%s! %s%s\n' "$YELLOW" "$*" "$RESET"; }
err()  { printf '%s✘ %s%s\n' "$RED" "$*" "$RESET" >&2; }

# require_cli <cmd> [hint]
require_cli() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "missing required tool: $1"
    [ $# -gt 1 ] && say "  hint: $2"
    return 1
  fi
  ok "$1 $(command -v "$1")"
}

# confirm <question> — auto-passes when CI=1
confirm() {
  [ "${CI:-0}" = "1" ] && return 0
  printf '%s%s [y/N] %s' "$BOLD" "$1" "$RESET"
  read -r reply
  [ "$reply" = "y" ] || [ "$reply" = "Y" ]
}

load_env() {
  # shellcheck disable=SC1091
  [ -f .env ] && set -a && source .env && set +a || true
}
