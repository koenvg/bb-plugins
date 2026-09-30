# Verification

## Change and baseline

- Change: `add-github-test-ci`.
- Pre-implementation commit: `06e4b8b4c210684bea3e7a31b76b595c39560731`.
- Implementation changes: `.github/workflows/tests.yml`, `bb-task-board/package.json`, and `README.md`.
- No dependency versions, lockfiles, existing tests, or test configurations changed.

## Test-first checkpoint

Before adding the Task Board script, `npm test` in `bb-task-board` exited with status 1 and `Missing script: "test"`. After adding the script, a clean install and the same command passed all 42 tests.

## Clean Linux validation

All suites ran with `CI=true` in disposable `node:24.21.0-bookworm` containers on Linux aarch64, using Node 24.21.0 and npm 11.19.0. Each container copied the plugin from a read-only checkout into a clean writable directory, ran `npm ci`, then ran `npm test`. Tests ran serially across plugins. No host `node_modules`, BB installation, account credentials, or npm download cache was provided.

| Plugin | Test files | Tests passed |
| --- | ---: | ---: |
| Code Cleanup | 5 | 10 |
| Codex Quota | 9 | 61 |
| GitHub Insight | 17 | 227 |
| Liquid Glass | 1 | 4 |
| Threads with PRs | 6 | 36 |
| Tasks Plus | 45 | 464 |
| Task Board | 3 | 42 |
| Total | 86 | 844 |

Tasks Plus installed `sqlite3` through `apt-get` and checked `sqlite3 --version` before testing. Its import regression test passed both in a focused run and in the complete 464-test suite. The extra focused test is not counted twice in the total above.

Local logs are in `/tmp/bb-github-ci-znUM7P/`; the table above records the results beyond those temporary logs' lifetime.

## Static and workflow checks

- `actionlint .github/workflows/tests.yml` passed with actionlint 1.7.12.
- `git diff --check` passed.
- `openspec validate add-github-test-ci --strict` passed.
- Matrix inspection confirmed exactly the seven plugin directories, each with a lockfile and a test script.
- Manifest comparison confirmed the Task Board change only adds its test script.
- Official GitHub release refs verified checkout v7.0.1 at `3d3c42e5aac5ba805825da76410c181273ba90b1` and setup-node v7.0.0 at `820762786026740c76f36085b0efc47a31fe5020`. Their pinned action manifests support the configured inputs.
- Inspection confirmed read-only permissions, disabled checkout credential persistence, no repository secrets, no privileged pull-request trigger, disabled matrix fail-fast, and unsuppressed install and test failures.

## Completion review

The single fresh-context read-only review approved the change with no blocking or non-blocking findings. It covered the complete working-tree change, including the untracked workflow and OpenSpec artifacts, against the baseline above. The reviewer independently checked the seven-plugin matrix and Task Board manifest, reran actionlint, strict OpenSpec validation, and `git diff --check`, and inspected the Linux test logs. The reviewer did not edit repository files or rerun the test suites.

Review run: `0579aee4-61ce-4116-be5a-a75fe07fc82b`. The full report is saved at `/tmp/bb-github-ci-znUM7P/review.md`. No implementation fixes or second review pass were needed.

## Remaining limits and follow-up

- No push or pull request was authorized. GitHub event dispatch, hosted cache behavior, and the actual Ubuntu runner checks remain unverified. Task 3.3 remains open.
- Local Linux validation used Debian on aarch64, not GitHub's Ubuntu x64 runners. The first hosted run must confirm all seven results and the executed Tasks Plus import test.
- Existing dependency audit warnings appeared during clean installs: Code Cleanup reported 2 moderate vulnerabilities, Codex Quota reported 1 high vulnerability, and Tasks Plus reported 33 moderate and 1 high vulnerability. They did not fail installation or tests. Dependency remediation is outside this CI change; no audit fixes or dependency upgrades were applied.
