#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_lib.sh

# Build caches only — never touches sources, node_modules, or notes.
targets=(
  "src-tauri/target"   # rust build cache — by far the largest
  "build"              # sveltekit output
  ".svelte-kit"        # sveltekit generated files (rebuilt by 'npm run check'/dev)
  "node_modules/.vite" # vite pre-bundle cache
)

total=0
for dir in "${targets[@]}"; do
  if [ -d "$dir" ]; then
    size_kb=$(du -sk "$dir" | cut -f1)
    total=$((total + size_kb))
    step "removing $dir ($(du -sh "$dir" | cut -f1))"
    rm -rf "$dir"
  fi
done

if [ "$total" = "0" ]; then
  ok "nothing to clean"
else
  ok "freed $(awk -v kb="$total" 'BEGIN {printf "%.1f", kb/1048576}') GB"
fi
