#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_lib.sh

step "checking required tools"
fail=0
require_cli node  "install from https://nodejs.org or 'brew install node'" || fail=1
require_cli npm   "ships with node" || fail=1
require_cli rustc "install via https://rustup.rs" || fail=1
require_cli cargo "install via https://rustup.rs" || fail=1
if [ "$(uname)" = "Darwin" ]; then
  xcode-select -p >/dev/null 2>&1 && ok "xcode command line tools" || {
    err "xcode command line tools missing"; say "  hint: xcode-select --install"; fail=1
  }
fi

# Only needed for 'make extinstall' — warn, don't fail.
if [ "$(uname)" = "Darwin" ]; then
  [ -d "/Applications/Google Chrome.app" ] && ok "google chrome (for the extension)" \
    || warn "google chrome not found — needed only for 'make extinstall'"
fi

if [ "$fail" = "1" ]; then
  err "some tools are missing — fix the hints above and re-run 'make doctor'"
  exit 1
fi
ok "all tools present"
