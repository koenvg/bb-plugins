#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# The caller provisions and records the dedicated Chrome daemon and fixture tab.
: "${BU_NAME:?Set the recorded dedicated daemon name}"
: "${COMPOSE_CHAT_BROWSER_TARGET:?Set the recorded task-created fixture target}"
if [[ "$BU_NAME" == default ]]; then
  printf '%s\n' 'Refusing the shared default daemon' >&2
  exit 1
fi
if [[ -n "${BU_CDP_URL:-}" && -n "${BU_CDP_WS:-}" ]] ||
   [[ -z "${BU_CDP_URL:-}" && -z "${BU_CDP_WS:-}" ]]; then
  printf '%s\n' 'Set exactly one approved Chrome endpoint: BU_CDP_URL or BU_CDP_WS' >&2
  exit 1
fi
export BH_REQUIRE_EXISTING_DAEMON=1 BH_TAB_MARKER=0
script=$(python3 - "$root/tests/browser-matrix.py" <<'PY'
import os,pathlib,sys
path=str(pathlib.Path(sys.argv[1]).resolve())
source=pathlib.Path(path).read_text()
names=list(filter(None,os.environ.get('COMPOSE_CHAT_BROWSER_CASES','').split(',')))
evidence_dir=os.environ.get('COMPOSE_CHAT_BROWSER_EVIDENCE_DIR','')
if evidence_dir:
    evidence_dir=str(pathlib.Path(evidence_dir).resolve())
skip_screenshots=os.environ.get('COMPOSE_CHAT_BROWSER_SKIP_SCREENSHOTS')=='1'
print(f"__file__ = {path!r}\ncase_names = {names!r}\nevidence_dir = {evidence_dir!r}\nskip_screenshots = {skip_screenshots!r}\n" + source)
PY
)
if ! output=$(browser-use <<< "$script"); then
  printf '%s\n' "$output" >&2
  exit 1
fi
printf '%s\n' "$output"
# Require completion even if a wrapper returns zero without running the matrix.
if ! grep -qxF 'COMPOSE_CHAT_BROWSER_MATRIX_PASSED' <<< "$output"; then
  printf '%s\n' 'Browser matrix did not complete successfully' >&2
  exit 1
fi
