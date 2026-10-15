#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../../.." && pwd -P)
pid=${1:?Usage: doctor.sh PREVIEW_PID ORIGIN}
origin=${2:?Usage: doctor.sh PREVIEW_PID ORIGIN}
port=$(node -e 'const u = new URL(process.argv[1]); if (u.origin !== process.argv[1] || u.hostname !== "127.0.0.1" || u.protocol !== "http:" || !u.port) process.exit(1); console.log(u.port)' "$origin")
kill -0 "$pid"
ps -p "$pid" -o command= | grep -F 'tests/preview-server.ts' >/dev/null
lsof -a -p "$pid" -d cwd -Fn | grep -Fx "n$root/bb-plugin-markdown-reader" >/dev/null
lsof -nP -a -p "$pid" -iTCP:"$port" -sTCP:LISTEN
curl --fail --silent --max-time 5 "$origin/" | grep -F '<title>Markdown Reader fixture</title>' >/dev/null
printf 'Doctor passed: checkout=%s pid=%s origin=%s\n' "$root" "$pid" "$origin"
