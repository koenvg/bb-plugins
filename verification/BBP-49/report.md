# BBP-49 navigation commands

Previous task, Next task and Back now use the existing navigation callbacks. Local checks pass. Installed BB acceptance remains blocked by source-switch approval. This is not a completed acceptance report.

## Scope

Baseline `a52511a7d7466c11a4d60a5618beb62316cf2de1` includes merged PR #376. The task's blockers were re-read as BBP-48 canceled and BBP-359 done.

The current OpenSpec contract has nine detail commands. Write a comment was removed. This delivery adds no command IDs, defaults, dependencies, queries, backend behavior or data migration.

`TaskPager` shares nullable Previous and Next callbacks between buttons, bracket shortcuts and commands. `TasksTopbar` registers the shell's existing Back callback below the command provider. The shell still owns remembered routes. The existing registry still owns loaded-task readiness, shown-panel checks and deferred-activation cancellation.

The independent design comparison chose topbar registration over an extra shell registration component. Both preserved behavior. The chosen shape needs no new interface. Its test plan also checks that Back retains the original project list or board after paging.

## Local evidence

Commands ran in the task worktree with Bun 1.4.4 and Node 26.12.1. Raw logs are in the linked work thread's private storage at `BBP-49/`. The thread is [thr_4jy996ryat](bbthread://thr_4jy996ryat).

| Check                                                                              | Result                                                                                                                                 | Evidence                                                                                                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Baseline root and Tasks checks                                                     | Passed before implementation                                                                                                           | `baseline-checks/summary.json`                                                                              |
| Test-first navigation checkpoint                                                   | Expected unavailable-command failures before source edits, then 20 navigation cases passed                                             | `navigation-red-89037243.log`, `navigation-selected-list-red-89037243.log`, `navigation-final-89037243.log` |
| Focused command, shell, detail, list, board, rail, dispatch and editor regressions | 192 tests passed in nine files                                                                                                         | `focused-regressions-89037243.log`                                                                          |
| `npm test` in `bb-plugin-tasks-plus`                                               | 1,748 tests passed in 146 files                                                                                                        | `package-final-test.log`                                                                                    |
| `npm run typecheck`                                                                | Passed with the package's pinned TypeScript 7 compiler                                                                                 | `package-final-typecheck.log`                                                                               |
| `npm run lint`                                                                     | Passed, with four warnings in unchanged files                                                                                          | `package-final-lint.log`                                                                                    |
| Root `bun --no-install run check:review`                                           | Setup, workspace, browser-lifecycle, review-runner, lint and format checks passed                                                      | `root-final/summary.json`                                                                                   |
| Local CLI `bb plugin types . --check`                                              | Passed. SDK pin and build CLI both use 0.6.79                                                                                          | `sdk-types-check.log`                                                                                       |
| Local CLI `bb plugin build`                                                        | Passed with the pinned BB 0.47.1 CLI and a private `BB_DATA_DIR`                                                                       | `plugin-build.log`                                                                                          |
| Bundle registrations                                                               | All nine stable detail command IDs found in `dist/app.js`; registration tests also assert no defaults and preserve six global commands | Generated bundle and command tests                                                                          |
| Impeccable detector                                                                | No findings on the changed production file                                                                                             | `impeccable-detect.json`                                                                                    |
| Comment review                                                                     | Passed. No added or changed comments or suppressions                                                                                   | Fresh read-only comment review                                                                              |
| Independent implementation review                                                  | Code approved for the PR. No blocking code defects. Full task acceptance remains unverified and blocked by host checks                 | Fresh read-only routine review                                                                              |

The SDK-rendered tests observe literal navigation destinations and RPC effects. They cover status-grouped top-level pager order, project and cross-project scope, no additional sibling query, absent and initially unknown destinations, boundary no-ops without replay, retained-data refresh parity, hidden narrow pager controls, fresh task targeting after route rerender, remembered Back routes and the direct-link All fallback. Shared targeting tests include navigation on ineligible routes, missing tasks, hidden and ambiguous sessions. Deferred navigation is rejected after route, task, visibility, readiness or mount changes. Navigation fixtures observe no task updates, project updates or delegation.

The first red run included one incorrect browse-control wait. It was corrected and rerun red before production changes. Green-stage failures also exposed fixture assertions about SDK navigation payloads, contenteditable text and inherited geometry mocks. Those assertions were corrected without additional production fixes. The logs retain those failures.

## Generated artifact identity

Build metadata records plugin `tasks-plus` version 0.1.2, BB 0.47.1 and SDK 0.6.79. The generated frontend SHA256 is `9b06c7061c57bbfd4f3322132bc04f156e0a906e027e5ad7f757d1955c6f11bf`. Generated bundles are ignored build evidence, not committed source. The build changed no tracked manifest, lockfile or backend file.

## Installed acceptance and state ledger

Read-only Doctor observations found Tasks Plus running from `/Users/koen/workspace/bb-plugins/bb-plugin-tasks-plus`. Its reported frontend hash was `bcca09bb423a5b75`, not proof of this worktree's build. The observed source and state are recorded in `installed-baseline.json`.

| Resource or required check                                   | State                                              |
| ------------------------------------------------------------ | -------------------------------------------------- |
| Installed Tasks source                                       | Unchanged. No source switch or reload attempted    |
| Early running-BB preview                                     | Blocked until exact-source activation is approved  |
| All nine commands through the real palette, wide and narrow  | Not run. Exact-source activation requires approval |
| Real palette-close focus, Escape and retained-panel behavior | Not run. SDK fixtures are not installed-host proof |
| Disposable property and linked-project mutations             | Not run. No disposable live records created        |
| Safe explicit dispatch                                       | Not run. No worker or agent started                |
| Temporary modifier binding and its removal                   | Not run. No keyboard setting changed               |
| Owned live records, browser tabs or servers needing cleanup  | None created                                       |

Tasks 6.6 and 6.7 remain open. Installed checks require approval to switch Tasks temporarily to this worktree, a defined restoration and disposable-record plan, and any worker-start approval. Keep the current installation intact until those prerequisites are met. Opening a PR does not establish installed acceptance or authorize a merge.
