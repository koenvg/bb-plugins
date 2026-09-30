# Proposal

## Why

The repository has tests in all seven plugin directories but no GitHub Actions workflow. Contributors currently have to run the suites themselves, so pull requests and changes to `main` have no automated test results.

## What Changes

- Add a GitHub Actions workflow that tests every plugin on pull requests and pushes to `main`.
- Run each plugin in a separate Ubuntu matrix job using Node 24.15 or newer within the Node 24 release line, its committed npm lockfile, and its existing test runner.
- Add a `test` script to Task Board so all seven plugins support `npm test`.
- Provide the SQLite CLI for Tasks Plus so its import test executes rather than skipping for a missing prerequisite.
- Cache npm downloads per plugin lockfile, report failures per plugin, and let other plugin jobs finish when one fails.
- Document CI coverage and the matching local test commands in the root README.

This change covers test execution only. It does not add typecheck, lint, build, release, coverage-upload, or BB-dependent bundle-test jobs. It does not change branch protection or repair unrelated test failures.

## Capabilities

### New Capabilities

- `github-test-ci`: Automatic, isolated test runs for all repository plugins on GitHub pull requests and pushes to `main`, with reproducible dependency installation and visible failures.

### Modified Capabilities

None.

## Impact

- Add `.github/workflows/tests.yml`.
- Add the missing test command in `bb-task-board/package.json` without changing dependency versions or test discovery.
- Update `README.md` with the workflow scope and local reproduction instructions.
- Use GitHub-hosted Ubuntu runners, a supported Node 24 runtime, public npm dependencies, and the SQLite CLI. The workflow requires no BB installation, account credentials, or repository secrets.
- Leave the existing plugin test configurations and Codex Quota's separate `test:bundle` command unchanged.
