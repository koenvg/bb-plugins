#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd -P)
root=$(cd "$here/../../../.." && pwd -P)
plugin=${1:?Usage: browser.sh compose-chat|codex-quota|markdown-reader|pi-subagents-provider NEW_EVIDENCE_DIRECTORY [PLAYWRIGHT_FILTERS]}
evidence=${2:?Usage: browser.sh PLUGIN NEW_EVIDENCE_DIRECTORY [PLAYWRIGHT_FILTERS]}
shift 2
case "$plugin" in
  compose-chat|codex-quota|markdown-reader|pi-subagents-provider) ;;
  *) echo "No owned ephemeral-port browser recipe for $plugin. Read its feature map." >&2; exit 2 ;;
esac
mkdir -m 700 "$evidence"
evidence=$(cd "$evidence" && pwd -P)
cd "$root/bb-plugin-$plugin"
{
  git rev-parse HEAD
  git status --short --untracked-files=all
  bun --version
  node --version
  printf 'Plugin: %s\n' "$plugin"
} > "$evidence/checkout.txt"
export COMPOSE_CHAT_PREVIEW_PORT=0
export CODEX_QUOTA_PREVIEW_PORT=0
export MARKDOWN_READER_PREVIEW_PORT=0
export PI_SUBAGENTS_PREVIEW_PORT=0
export PLAYWRIGHT_HTML_OUTPUT_DIR="$evidence/html"
export PLAYWRIGHT_JSON_OUTPUT_FILE="$evidence/results.json"
export PLAYWRIGHT_HTML_OPEN=never
# The repository runner owns launch, readiness handoff, browser contexts, and teardown.
# Keep its actual exit code even when test output is filtered for chat.
set +e
bun --no-install run test:browser "$@" --trace on --reporter=list,html,json --output "$evidence/tests" > "$evidence/command.log" 2>&1
code=$?
set -e
if [ "$code" -eq 0 ] && { [ ! -s "$evidence/results.json" ] || [ ! -s "$evidence/html/index.html" ]; }; then
  echo "The suite exited successfully but its required reports are missing." >&2
  code=1
fi
printf '%s\n' "$code" > "$evidence/exit-code.txt"
tail -40 "$evidence/command.log"
printf 'Fixture-only browser exit=%s; evidence=%s\n' "$code" "$evidence"
exit "$code"
