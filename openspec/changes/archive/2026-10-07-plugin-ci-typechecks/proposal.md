# Proposal

## Why

The current CI workflow tests nine plugins but runs none of their existing typecheck commands. Passing Vitest tests does not prove that TypeScript source and tests satisfy the package's compiler checks.

## What Changes

- Run each plugin's existing `npm run typecheck` command alongside `npm test` in its current matrix job. Keep one combined GitHub result per plugin and preserve existing job names.
- After dependency installation and required setup succeed, run tests first and typecheck second. A test failure must not skip typecheck. Either command failure must fail the combined result.
- Fail the affected plugin result for a missing typecheck script, missing compiler, failed locked install, or failed prerequisite. Do not suppress errors or install a replacement checker.
- Preserve unprivileged pull-request execution, locked package installs, optional npm download caching, existing test discovery, plugin-specific prerequisites, and independent matrix results.
- Update the root README with matching local commands, the combined-result behavior, and the boundary between CI wiring and compiler coverage.

This change does not repair source type errors, expand compiler coverage, change compiler versions or settings, add lint or build commands, or change branch protection. BBP-104 owns Tasks lint and its CI use. BBP-93 and BBP-123 own Quota and GitHub Insight typecheck coverage repairs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `github-test-ci`: Add existing package-local typechecks to each plugin's test job, with one truthful combined result and independent execution of both commands after successful setup.

## Impact

- `.github/workflows/tests.yml`: Extend the existing matrix job and its step conditions. No second workflow or checker is needed.
- `README.md`: Describe local test/typecheck commands, setup requirements, and CI outcomes.
- Keep package manifests, lockfiles, tests, compiler configuration, SDK pins, and runtime source unchanged within this scope.
- Validate the landed plugin inventory and all required setup during implementation. The planning baseline is `5abe246de7aab4d2819853f5956a3131b7351ef5`; later merged plugin or lint work must be preserved.
- Before completion, establish clean cache-free command results and check failure propagation. Any newly exposed source or prerequisite problem needs a separately approved repair, not a weakened CI check.
