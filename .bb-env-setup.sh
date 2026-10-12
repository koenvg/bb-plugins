#!/usr/bin/env bash
set -euo pipefail

# BB runs this hook from the new worktree's repository root.
required_version="$(< .bun-version)"
if ! command -v bun >/dev/null 2>&1; then
  echo "Setup requires Bun $required_version. Install it and retry." >&2
  exit 1
fi

if ! version="$(bun --version)"; then
  echo "Bun could not run. Repair Bun and retry setup." >&2
  exit 1
fi
if [ "$version" != "$required_version" ]; then
  echo "Setup requires Bun $required_version; found $version. Install the pinned version and retry." >&2
  exit 1
fi

# Include development tools even when the host sets NODE_ENV=production.
unset NODE_ENV
echo "Installing locked root development tools. Plugin dependencies are not included."
exec bun install --frozen-lockfile
