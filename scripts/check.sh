#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_lib.sh

step "svelte-check (frontend)"
npm run check

step "cargo check (backend)"
(cd src-tauri && cargo check)

ok "all checks passed"
