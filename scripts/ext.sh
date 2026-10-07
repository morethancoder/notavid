#!/usr/bin/env bash
# Chrome extension (extension/): build | install | dev | test | zip
set -euo pipefail
cd "$(dirname "$0")/../extension"
source ../scripts/_lib.sh

BUILD_DIR="$PWD/.output/chrome-mv3"

[ -d node_modules ] || { step "installing extension dependencies"; npm install; }

chrome_profiles_dir() {
  case "$(uname)" in
    Darwin) echo "$HOME/Library/Application Support/Google/Chrome" ;;
    *)      echo "${XDG_CONFIG_HOME:-$HOME/.config}/google-chrome" ;;
  esac
}

# True when some Chrome profile already has this folder loaded as an unpacked extension.
already_loaded() {
  local dir; dir="$(chrome_profiles_dir)"
  [ -d "$dir" ] && grep -lqsF "$BUILD_DIR" "$dir"/*/"Secure Preferences" "$dir"/*/Preferences 2>/dev/null
}

copy_to_clipboard() {
  if command -v pbcopy >/dev/null; then printf '%s' "$1" | pbcopy
  elif command -v wl-copy >/dev/null; then printf '%s' "$1" | wl-copy
  elif command -v xclip >/dev/null; then printf '%s' "$1" | xclip -selection clipboard
  else return 1
  fi
}

open_extensions_page() {
  [ "${CI:-0}" = "1" ] && return 1
  case "$(uname)" in
    Darwin) open -a "Google Chrome" "chrome://extensions" 2>/dev/null ;;
    *)
      for bin in google-chrome google-chrome-stable chromium; do
        command -v "$bin" >/dev/null && { "$bin" "chrome://extensions" >/dev/null 2>&1 & return 0; }
      done
      return 1
      ;;
  esac
}

install() {
  npm run build
  say ""
  if already_loaded; then
    ok "Notavid is already loaded in Chrome from this folder"
    say "  open chrome://extensions and click ↻ on the Notavid card to pick up this build,"
    say "  then refresh any open YouTube tabs"
    open_extensions_page || true
    return
  fi

  copy_to_clipboard "$BUILD_DIR" && ok "copied the extension folder path to your clipboard" || true
  open_extensions_page && ok "opened chrome://extensions in Chrome" \
    || warn "couldn't open Chrome — go to chrome://extensions yourself"
  say ""
  say "${BOLD}Chrome only installs unpacked extensions by hand — three clicks:${RESET}"
  say "  1. turn on ${BOLD}Developer mode${RESET} (top right)"
  say "  2. click ${BOLD}Load unpacked${RESET}"
  say "  3. pick this folder — on macOS press ⌘⇧G in the picker and paste:"
  say "     ${CYAN}$BUILD_DIR${RESET}"
  say ""
  say "Then open any YouTube video; the Notes panel appears beside it."
  say "After later rebuilds, run ${BOLD}make extinstall${RESET} again to get the reload steps."
}

case "${1:-build}" in
  build)
    npm run build
    ok "built → extension/.output/chrome-mv3 (run 'make extinstall' to load it into Chrome)"
    ;;
  install) install ;;
  dev) npm run dev ;;
  test)
    npm run build
    step "making sure Playwright's Chromium is installed"
    npx playwright install chromium
    step "running the end-to-end test on live YouTube"
    npm test
    ;;
  zip)
    npm run zip
    ok "store upload zip in extension/.output/"
    ;;
  *) err "unknown mode: $1"; exit 1 ;;
esac
