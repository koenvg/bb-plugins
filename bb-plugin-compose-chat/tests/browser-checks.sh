#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
session=${COMPOSE_CHAT_BROWSER_SESSION:-compose-chat-preview}
expression=$(python3 - "$root/tests/browser-matrix.py" <<'PY'
import os,pathlib,sys
path=str(pathlib.Path(sys.argv[1]).resolve())
source=pathlib.Path(path).read_text()
names=list(filter(None,os.environ.get('COMPOSE_CHAT_BROWSER_CASES','').split(',')))
evidence_dir=os.environ.get('COMPOSE_CHAT_BROWSER_EVIDENCE_DIR','')
skip_screenshots=os.environ.get('COMPOSE_CHAT_BROWSER_SKIP_SCREENSHOTS')=='1'
print(f"exec(compile({source!r}, {path!r}, 'exec'), {{'browser': browser, '__file__': {path!r}, 'case_names': {names!r}, 'evidence_dir': {evidence_dir!r}, 'skip_screenshots': {skip_screenshots!r}}})")
PY
)
if ! output=$(browser-use --session "$session" python "$expression"); then
  printf '%s\n' "$output" >&2
  exit 1
fi
printf '%s\n' "$output"
# browser-use can return exit zero for Python exceptions. Require completion.
if ! grep -qxF 'COMPOSE_CHAT_BROWSER_MATRIX_PASSED' <<< "$output"; then
  printf '%s\n' 'Browser matrix did not complete successfully' >&2
  exit 1
fi
