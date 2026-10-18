# BBP-45 verification

## Scope and result

`Tasks: Set due date` now opens the shown task's existing due-date picker in both layouts. Today, Tomorrow, Next week, native custom-date selection, and explicit removal retain their existing save behavior. Opening or Escape without a choice saves nothing.

The command uses the existing guarded task session and palette-close handoff. No bridge, backend, dependency, default binding, or new Save policy was added. Later linked-project, dispatch, and navigation deliveries remain unavailable.

Local implementation checks pass. Installed-BB acceptance and personal-binding checks remain blocked, not passed, by the user's no-deployment and no-settings restrictions. The OpenSpec delivery checkboxes remain open until acceptance evidence is complete.

## Identity and evidence

- Baseline `c904a7344ea639ef2a2dcb80ab0431006affa2f5` on `main`.
- Package `bb-plugin-tasks-plus`, plugin ID `tasks-plus`.
- Source requirements are [delivery 2](../../openspec/changes/task-detail-commands/tasks.md#2-set-due-dates-through-a-task-command), its design, and command specification.
- Checks ran with Bun 1.4.3, Node 24.15.0, pinned TypeScript 7.0.2, and the package's official BB CLI 0.46.1 with SDK 0.6.49.
- Full logs and traces remain in the [work thread](bbthread://thr_qm3embsv5b), under `/Users/koen/.bb/thread-storage/thr_qm3embsv5b/bbp45-evidence`.
- Final full browser run used this checkout's owned origin `http://127.0.0.1:50296`, full Chromium, SDK test runtime, fixture RPCs, and a simulated host palette. Fixture task writes stayed in memory.

## Checks

| Check                                                           | Observed result                                                       | Status       | Evidence file                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| Baseline due-date command reproduction                          | Both layout tests failed because the command opened no picker, exit 1 | Expected red | `red-due-date.log`                                                                    |
| Full Tasks Plus tests                                           | 1,487 tests in 130 files, exit 0                                      | Passed       | `package-tests-final.log`                                                             |
| Focused rendered commands, rail, and keyboard tests             | 51 tests in 3 files, exit 0                                           | Passed       | `focused-final.log`                                                                   |
| Pinned typecheck, package lint, package format                  | Each exited 0, lint retains warnings in unchanged files               | Passed       | `package-typecheck-final.log`, `package-lint-final.log`, `package-format-final-2.log` |
| Root checks                                                     | Setup tests, browser lifecycle tests, lint, and format exited 0       | Passed       | `root-check-final.log`                                                                |
| SDK pin check and isolated plugin build                         | Both exited 0 using disposable `BB_DATA_DIR` directories              | Passed       | `sdk-types.log`, `plugin-build.log`, `build-hashes.sha256`                            |
| Shared Markdown prerequisite                                    | Build, 132 tests, and typecheck exited 0                              | Passed       | `markdown-build.log`, `markdown-tests.log`, `markdown-typecheck.log`                  |
| Full Tasks Plus browser suite                                   | 36 tests, exit 0, traces and screenshots retained                     | Passed       | `browser-final-2.log`, `browser-final-2/`                                             |
| OpenSpec strict validation                                      | Valid, exit 0                                                         | Passed       | `openspec.log`                                                                        |
| Mechanical design detector                                      | No findings, exit 0                                                   | Passed       | `design-detector.json`                                                                |
| Historical BBP-53 captures                                      | Before and after SHA256 lists match                                   | Passed       | `historical-captures-before.sha256`, `historical-captures-final.sha256`               |
| Installed BB palette, hidden-panel timing, and personal binding | No activation or Settings change permitted                            | Blocked      | User restrictions                                                                     |

The independent implementation review is recorded separately in [review.md](review.md).

Rendered coverage checks all date presets, custom selection, ignored empty input, removal, mouse selection, Escape, and one visible picker. It also checks fresh targeting, persisted fixture rereads, unavailable routes and hidden panels, and stale activation cancellation before either handoff frame after route change or unmount.

The browser tests drive real keyboard actions at 1200 and 650 pixels. They verify exact task-update arrays, native date input focus, preset selection, custom-date ArrowUp selection, removal through Tab traversal, Escape return, and a second task's fresh target. They do not call private setters to supply successful UI state.

## Development failures retained

The first broader lifecycle run lacked Compose Chat and Markdown Reader fixture dependencies. Frozen installation of the same dependencies required by CI resolved setup, and the complete root check passed. No source or lockfile change was needed.

An initial full browser attempt passed 35 tests and failed the wide removal test because one Tab did not leave the native date input. An earlier focused attempt also assumed the wrong date segment order. Tests now pin en-GB locale and traverse the actual keyboard segments. Production date behavior was unchanged. The failed logs and traces remain in `browser-focused.log`, `browser-results/`, `browser-final.log`, and `browser-final/`. Final success is the separate `browser-final-2` run.

## Reproduce

Follow the package's [Development checks](../../bb-plugin-tasks-plus/README.md#development-checks) for frozen setup. From the repository root:

```sh
bun run --cwd bb-plugin-tasks-plus test --maxWorkers=2
bun run --cwd bb-plugin-tasks-plus typecheck
bun run --cwd bb-plugin-tasks-plus lint
bun run --cwd bb-plugin-tasks-plus format:check
bun run check
BB_DATA_DIR="$(mktemp -d)" bb-plugin-tasks-plus/node_modules/.bin/bb plugin types bb-plugin-tasks-plus --check
BB_DATA_DIR="$(mktemp -d)" bb-plugin-tasks-plus/node_modules/.bin/bb plugin build bb-plugin-tasks-plus
EVIDENCE="$(mktemp -d)"
BBP53_CAPTURE_PHASE=none bun run --cwd bb-plugin-tasks-plus test:browser \
  --config "$PWD/.pi/skills/verify-bb-plugins/references/tasks-playwright.config.ts" \
  --trace on --output "$EVIDENCE/browser"
openspec validate task-detail-commands --strict
```

The root lifecycle checks also require frozen installs in Compose Chat and Markdown Reader, as listed in `.github/workflows/tests.yml`.

## State ledger and limits

| Resource                                         | Actions and final state                                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Installed BB source, enabled state, and settings | Not changed. No plugin install, enable, reload, or deployment.                                                                    |
| Production task records and personal bindings    | No mutations. No temporary binding or live verification records were created.                                                     |
| Browser fixture tasks                            | In-memory disposable records only, discarded with owned browser contexts.                                                         |
| Owned preview listeners and caches               | Ports 65116, 49194, 50089, and 50296 had no listeners after their runs. Recorded temporary fixture/cache directories were absent. |
| Evidence and isolated build data                 | Retained locally. Screenshots below contain synthetic fixture data only.                                                          |

The source hashes recorded at build time still match the final production files. Fixture pass, built artifact, and installed acceptance are separate results. The simulated palette does not establish installed host timing. Reload coverage is rendered unmount/remount, not a live plugin reload.

No merge, deployment, settings change, credential or secret access, or production-data mutation was performed. The Cursor-only deslop and Comment Sicko integrations were unavailable. The fresh Pi implementation review remains separate from those unavailable integrations. No separate actionable cleanup finding was identified in the changed code.

## Fixture screenshots

[Wide picker](wide-due-date.png) and [narrow picker](narrow-due-date.png) show initial keyboard focus before any date choice.
