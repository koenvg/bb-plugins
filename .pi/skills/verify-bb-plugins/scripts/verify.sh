#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd -P)
root=$(cd "$here/../../../.." && pwd -P)
evidence=${1:?Usage: verify.sh NEW_EVIDENCE_DIRECTORY}
# Refuse reuse so a second run cannot overwrite the first run's proof.
mkdir -m 700 "$evidence"
evidence=$(cd "$evidence" && pwd -P)
scratch=$(mktemp -d "${TMPDIR:-/tmp}/verify-markdown-reader.XXXXXX")
pid=''
origin=''
cleanup() {
  code=$?
  trap - EXIT INT TERM
  if [ -n "$pid" ]; then
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 100); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.05
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
      code=1
    fi
    wait "$pid" 2>/dev/null || true
  fi
  rm -rf "$scratch"
  printf 'Owned preview stopped; scratch removed; evidence retained: %s\n' "$evidence" > "$evidence/cleanup.txt"
  test -s "$evidence/server.log" || code=1
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$root/bb-plugin-markdown-reader"
{
  git rev-parse HEAD
  git status --short --untracked-files=all
  bun --version
  node --version
} > "$evidence/checkout.txt"
BB_FIXTURE_RUN_DIR="$scratch" MARKDOWN_READER_PREVIEW_PORT=0 bun tests/preview-server.ts > "$evidence/server.log" 2>&1 &
pid=$!
printf '%s\n' "$pid" > "$evidence/preview.pid"
for _ in $(seq 1 300); do
  kill -0 "$pid" 2>/dev/null || { cat "$evidence/server.log" >&2; exit 1; }
  origin=$(sed -n 's/^BB_FIXTURE_READY .*"origin":"\([^"]*\)".*$/\1/p' "$evidence/server.log" | head -1)
  [ -z "$origin" ] || break
  sleep 0.1
 done
[ -n "$origin" ] || { echo 'Preview readiness timed out' >&2; exit 1; }
printf '%s\n' "$origin" > "$evidence/origin.txt"
"$here/doctor.sh" "$pid" "$origin" > "$evidence/doctor.txt" 2>&1
node "$here/prove.mjs" "$origin" "$evidence" > "$evidence/drive.log" 2>&1
cat "$evidence/drive.log"
