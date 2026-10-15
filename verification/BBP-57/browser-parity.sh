#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd -P)
evidence=${1:?Usage: browser-parity.sh NEW_EVIDENCE_DIRECTORY}
mkdir -m 700 "$evidence"
evidence=$(cd "$evidence" && pwd -P)
cd "$root"
mkdir "$evidence/parity"
find verification/BBP-53 -type f -exec shasum -a 256 {} \; | sort > "$evidence/historical-before.txt"
finish() {
  code=$?
  trap - EXIT
  find verification/BBP-53 -type f -exec shasum -a 256 {} \; | sort > "$evidence/historical-after.txt"
  cmp "$evidence/historical-before.txt" "$evidence/historical-after.txt" || code=1
  printf '%s\n' "$code" > "$evidence/exit-code.txt"
  exit "$code"
}
trap finish EXIT
BBP57_PARITY_DIR="$evidence/parity" .pi/skills/verify-bb-plugins/scripts/browser.sh markdown-reader "$evidence/reader" shared-parity.spec.ts > "$evidence/reader.log" 2>&1
for width in 390 960; do
  for theme in light dark; do
    test -s "$evidence/parity/reader-$width-$theme.json"
  done
done
if lsof -nP -iTCP:4193 -sTCP:LISTEN > "$evidence/tasks-port-before.txt"; then
  echo 'Tasks port 4193 is occupied. Existing listeners were not reused or stopped.' >&2
  exit 2
fi
BBP53_CAPTURE_PHASE=none BBP57_PARITY_DIR="$evidence/parity" bun run --cwd bb-plugin-tasks-plus test:browser --config "$root/.pi/skills/verify-bb-plugins/references/tasks-playwright.config.ts" shared-parity.spec.ts --trace on --output "$evidence/tasks" > "$evidence/tasks.log" 2>&1
printf 'PASS production-consumer parity, live theme, keyboard/focus, source-policy difference and unchanged historical captures\n'
