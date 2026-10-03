# Proposal

## Why

BB drops the widget messages that Pi subagents uses for live status, so background work can be invisible and its parent session can appear idle. Koen needs progress, results, and reliable completion delivery without depending on an upstream PR or changing standalone Pi.

## What Changes

- Add `bb-plugin-pi-subagents-provider`, forked from upstream `get-bb/bb`'s `plugins/provider-pi`, with a distinct plugin ID and provider ID `pi-subagents`. Display it as "Pi with subagents" and keep the bundled Pi provider unchanged.
- Preserve the upstream provider's normal Pi behavior, including native tools, extension dialogs, skill discovery, model selection, checkpoint forks, and compaction. Make the package installable without the upstream monorepo.
- Show read-only child progress and results for foreground delegation and background runs, including workflow children. Use structured Pi tool updates and the existing subagent status and inspection protocols, not terminal output scraping.
- Translate background runs into BB's native background-task events. Keep background activity visible and prevent idle-session cleanup while work is live, without fabricating an unfinished main-agent turn or creating BB child threads.
- Require a live acceptance test in which the parent finishes its turn, the child outlives BB's idle cleanup interval, and the child result reaches the parent. Do not claim reliability from a badge or fixture test alone.
- Record the exact upstream import commit and local changes. Add a weekly, read-only upstream check through BB Automations after that baseline exists. Report relevant changes for review; never merge or push automatically.
- Add the package to the existing CI test matrix and document installation, compatibility, verification, rollback, and upstream update steps.

## Capabilities

### New Capabilities

- `pi-subagents-provider`: Independently installable fork, separate provider identity, normal Pi compatibility, and unchanged standalone/bundled Pi behavior.
- `pi-subagents-observability`: Structured, bounded, read-only child progress, transcript windows, final results, and explicit unavailable states.
- `pi-subagents-lifecycle`: Native background activity, parent-session retention, terminal reconciliation, and completion delivery.
- `pi-provider-upstream-monitor`: Recorded source provenance and weekly upstream change reports without automatic repository mutations.

### Modified Capabilities

None. The new package follows the existing `github-test-ci` and `plugin-verification` requirements. Adding a test-matrix entry does not change their contracts.

## Impact

- New package `bb-plugin-pi-subagents-provider/`, including its provider bridge, frontend, tests, lockfile, license notice, and upstream baseline record.
- Repository README and `.github/workflows/tests.yml` gain the new plugin.
- Use published BB Plugin SDK interfaces and Pi's existing RPC protocols. No BB core, bundled-provider, or `pi-subagents` source changes are planned.
- Preserve upstream MIT attribution and replace workspace-only dependencies and private UI imports with standalone equivalents.
- One weekly BB script automation belongs to this project and uses its stable server-host source, not this temporary worktree. Automation creation and live agent tests occur during implementation, not proposal generation.
