# Tasks

## 1. Consistent local test entry point

- [x] 1.1 Confirm Task Board lacks a test script, then add `"test": "vitest run"` to `bb-task-board/package.json`. Verify `npm ci && npm test` from that directory under Node 24.15 or newer within Node 24 runs the existing suite once, and confirm dependency versions, lockfile resolution, and test discovery are unchanged.
- [x] 1.2 Add local test instructions to the root `README.md`, including the Node minimum, plugin-local `npm ci && npm test`, and the SQLite CLI requirement for Tasks Plus. Verify the Task Board command as written and cross-check the other commands against each package's scripts.

## 2. GitHub Actions test workflow

- [x] 2.1 Add `.github/workflows/tests.yml` with pull-request and `main` push triggers, all seven plugin directories in an explicit Ubuntu matrix, and separate named results. Configure the bounded Node 24 version, plugin-specific npm download caching, plugin-local `npm ci` and `npm test`, disabled matrix fail-fast, a 20-minute timeout, and cancellation limited to superseded runs for the same workflow and pull request or branch. Verify the matrix matches the seven existing manifests and run `actionlint` successfully.
- [x] 2.2 Add a Tasks Plus-only prerequisite step that installs the SQLite CLI and checks `sqlite3 --version` before tests. Verify workflow syntax with `actionlint` and run the Tasks Plus import regression test with SQLite present, confirming it passes rather than skips.
- [x] 2.3 Set `contents: read`, disable checkout credential persistence, and pin supported official actions to verified release commit SHAs. Verify the workflow uses `pull_request`, contains no secrets or BB installation, and does not suppress install or test failures with `continue-on-error`, `--if-present`, or install fallbacks.
- [x] 2.4 Document triggers, all-plugin coverage, per-plugin results, future matrix maintenance, and the exclusion of typecheck, build, and BB-dependent bundle checks in `README.md`. Verify every documented behavior matches the workflow and that the local commands still match the package scripts.

## 3. Complete-change verification

- [x] 3.1 Run clean `npm ci` installs followed by `npm test` for all seven plugins under the configured Node 24 range, serializing local suites where needed. Record suite results and confirm the Tasks Plus import test executes. Re-run `actionlint` and `git diff --check` against the final diff. Report unrelated failures or unavailable Linux verification instead of hiding them or claiming success.
- [x] 3.2 Complete the required single fresh-context read-only implementation review against the recorded pre-implementation commit, including untracked files. Resolve blocking findings within scope and rerun affected checks; verify the review result and remaining validation limits are recorded in the handoff.
- [ ] 3.3 After an authorized push or pull request, verify GitHub schedules all seven named checks and inspect the Tasks Plus log for the executed import test. Confirm dependency or test failures remain failed checks while other matrix jobs can finish. Record the run reference and results; leave hosted verification pending if publication has not been authorized or a hosted run is unavailable.
