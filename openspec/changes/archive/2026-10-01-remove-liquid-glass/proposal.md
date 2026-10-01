# Proposal

## Why

Liquid Glass is no longer wanted in this plugin collection or Koen's local BB installation. Remove its theme package and maintenance obligations without changing other plugins, thread data, or the currently selected non-glass appearance.

## What Changes

- **BREAKING**: Delete `bb-plugin-liquid-glass/`, including its theme, backend stub, tests, dependencies, documentation, and evidence assets. The collection will no longer provide `plugin:liquid-glass:pearl`.
- Remove Liquid Glass from the root README and GitHub Actions test matrix. Make current CI documentation describe the plugins actually present rather than the stale seven-plugin inventory.
- Retire Liquid Glass's appearance requirements and record the removal contract in its existing capability. Preserve archived changes and historical verification records.
- Check the local BB installation and remove the installed `liquid-glass` plugin if present. Preserve a selected non-glass theme; if Liquid Glass is selected, switch to BB's built-in `default` before uninstalling. Treat an already absent plugin as success.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `liquid-glass-theme`: Replace the offered theme's requirements with retirement requirements covering repository absence and safe, repeatable removal from the local BB installation.
- `github-test-ci`: Remove Liquid Glass from required test coverage and align coverage with the remaining plugin directories in the checkout.

## Impact

- Repository files: `bb-plugin-liquid-glass/`, `README.md`, and `.github/workflows/tests.yml`.
- OpenSpec: delta specs for `liquid-glass-theme` and `github-test-ci`; durable specs are synchronized through the normal archive workflow, not deleted during planning.
- Local BB: plugin registration and theme selection only if needed. Read-only discovery currently reports no installed Liquid Glass plugin and the active theme `plugin:ayu:ayu-light`, so local removal is expected to be a verified no-op. Recheck during apply.
- No BB core changes, replacement theme development, other-plugin changes, remote-install cleanup, or marketplace changes. Existing Git history and archived evidence remain intact.
