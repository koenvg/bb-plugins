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
if [ ! -f bun.lock ]; then
  echo "Setup requires bun.lock. Restore the committed root lockfile and retry." >&2
  exit 1
fi

echo "Installing locked workspace development dependencies"
bun install --frozen-lockfile
echo "Building shared Markdown for plugin consumers"
(cd packages/markdown-document && bun run build)

echo "Local dependency setup complete. BB plugins were not installed or reloaded."
echo "Browser tests and Tasks Plus checks also need browser binaries and the SQLite CLI."
