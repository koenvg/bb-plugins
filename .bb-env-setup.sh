#!/usr/bin/env bash
set -euo pipefail

# BB runs this hook from the new worktree's repository root.
if ! command -v node >/dev/null 2>&1; then
  echo "Setup requires Node >=24.15.0 <25. Install a supported Node version and retry." >&2
  exit 1
fi

node <<'NODE'
const version = process.versions.node;
const [major, minor] = version.split(".").map(Number);
// Keep this requirement aligned with package.json's engines.node.
if (major !== 24 || minor < 15 || version.includes("-")) {
  console.error(`Setup requires Node >=24.15.0 <25; found ${version}. Use a supported Node version and retry.`);
  process.exit(1);
}
NODE

if ! command -v npm >/dev/null 2>&1; then
  echo "Setup requires npm. Install npm for the supported Node version and retry." >&2
  exit 1
fi

if ! npm --version >/dev/null; then
  echo "npm could not run. Repair npm and retry setup." >&2
  exit 1
fi

echo "Installing locked root development tools. Plugin dependencies are not included."
exec npm ci --include=dev --prefer-offline --no-audit --no-fund
