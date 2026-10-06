# Proposal

## Why

A repository without a Git remote shows `gh pr view failed: no git remotes found` and a Retry button above the composer. This is an expected absence of a PR, not an error that the user must fix.

## What Changes

- Treat the PR lookup's missing-remote result as no PR.
- Hide the composer PR banner, including its error and Retry button, after that result.
- Use the existing no-PR state in the PR tab and clear any shown snapshot for the thread.
- Keep all other lookup and refresh errors visible with their current retry behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-insight-snapshot`: Define missing Git remotes as no PR, rather than a failed reading.

## Impact

- Change the result mapping in `bb-plugin-github-insight/pr-lookup.ts`.
- Add regression coverage at the server RPC boundary and reuse the existing rendered no-PR and error tests.
- No new dependencies, result types, Git commands, settings, or changes to BB core.
