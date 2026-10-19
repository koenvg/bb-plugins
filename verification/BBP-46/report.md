# BBP-46 verification

## Result

`Tasks: Change linked BB project` opens the visible linked-project picker for the loaded task's tracker project. The compact inline control and wide rail share the loaded tracker and one BB-project query. The picker identifies the tracker and states that the link applies to all its tasks.

Opening or dismissing the picker saves nothing. Save and explicit Unlink call the existing `updateProject` operation. Failed saves retain the selection and existing error reporting. This change does not move tasks or threads, dispatch agents, add a default binding, or implement later command deliveries.

Local package, browser and build checks pass. The [independent review](review.md) found no actionable code issues and verified the affected checks. Installed-BB palette timing and personal-binding acceptance are blocked by the user's no-deployment and no-settings restrictions. The delivery 3 checkboxes remain open. CI results belong to the PR's current head, not this local-check report.

## Source and identity

- Task BBP-46, delivery 3.1 through 3.4 in [the source checklist](../../openspec/changes/task-detail-commands/tasks.md#3-change-the-linked-bb-project-through-a-task-command), [design](../../openspec/changes/task-detail-commands/design.md), and [specification](../../openspec/changes/task-detail-commands/specs/task-detail-commands/spec.md).
- Read BBP-45 and parent BBP-43. BBP-45 is done. Baseline is `048d753a557bea6842ab2f0b1a94d551d5f6ee22`.
- Bun 1.4.3, Node 24.15.0, pinned TypeScript 7.0.2, official package-local BB CLI 0.46.1, SDK 0.6.49.
- Full logs, traces and screenshots are retained in [the work thread](bbthread://thr_2aziw332sx), under `/Users/koen/.bb/thread-storage/thr_2aziw332sx/bbp46-evidence`.
- Browser fixtures use the production Tasks shell, SDK test runtime, in-memory RPC records and a simulated host palette. They do not establish installed BB acceptance.

## Checks

| Check                                         | Result                                                               | Evidence                                              |
| --------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| Red checkpoint                                | Both layout tests failed because the command was unavailable, exit 1 | `red-linked-project.log`                              |
| Shared Markdown prerequisites                 | Frozen setup, build, tests and typecheck passed                      | `setup.log`                                           |
| Full Tasks tests                              | 1,500 tests in 130 files, exit 0                                     | `tests-final.log`                                     |
| Focused command, rail and keyboard tests      | 64 tests in 3 files, exit 0                                          | `focused.log`                                         |
| Pinned package typecheck                      | Exit 0                                                               | `typecheck.log`                                       |
| Package lint                                  | Exit 0, warnings only in unchanged files                             | `lint.log`                                            |
| Package formatting                            | Exit 0                                                               | `format.log`                                          |
| SDK declaration pin and isolated plugin build | Both exit 0                                                          | `sdk-types.log`, `build.log`, `build-hashes.sha256`   |
| Full Tasks browser suite                      | 38 tests, exit 0, owned loopback origin `http://127.0.0.1:60559`     | `browser-full.log`, `browser-full/`                   |
| Root setup, lifecycle, lint and formatting    | Exit 0                                                               | `root-check-final.log`                                |
| OpenSpec strict validation                    | Exit 0                                                               | `openspec.log`                                        |
| Mechanical UI detector                        | Exit 0                                                               | `design-detector.json`                                |
| Historical BBP-53 captures                    | Before and after hashes match                                        | `historical-before.sha256`, `historical-after.sha256` |
| Installed palette and personal binding        | Blocked. No deployment or Settings changes permitted                 | User restrictions                                     |

Rendered tests cover unloaded, missing and failed tracker projects, readiness after loading with no queued intent, changed task and tracker targeting, opening and Escape, initial selection and reinitialization after cancel, retained failed saves, save and unlink, persisted fixture rereads, one shared BB-project query, and zero task updates or delegation. Existing lifecycle cases now include the linked-project command, canceling either pending palette frame on task changes, unmount, or hidden panels.

Real Chromium tests at 1200 and 650 pixels invoke the SDK registration through a simulated keyboard palette. They assert focus in the only visible picker, the shared-scope text, unsaved selection cancellation, explicit Save and Unlink through Tab and Enter, visible-trigger focus return, fresh tracker rereads from another task, and no task update or delegation.

## Development failures retained

The first typecheck rejected three unsupported Testing Library `exact` options in new tests. Removing those options preserved the literal accessible-name assertions, and the pinned typecheck passed.

Two early browser runs exposed test timing assumptions around Radix Select focus handoff. The tests now wait for the visible option focus before arrow navigation and for return to the combobox before Tab. No production behavior or assertion was weakened. Failed logs and traces remain in `browser-preview.log`, `browser-preview/`, `browser-preview-2.log`, and `browser-preview-2/`. The corrected early preview passed both layouts in `browser-preview-3.log` before the final full suite.

## Reproduce

Follow [Development checks](../../bb-plugin-tasks-plus/README.md#development-checks) for frozen setup. From the repository root:

```sh
bun run --cwd bb-plugin-tasks-plus test --maxWorkers=2
bun run --cwd bb-plugin-tasks-plus typecheck
bun run --cwd bb-plugin-tasks-plus lint
bun run --cwd bb-plugin-tasks-plus format:check
BB_DATA_DIR="$(mktemp -d)" bb-plugin-tasks-plus/node_modules/.bin/bb plugin types bb-plugin-tasks-plus --check
BB_DATA_DIR="$(mktemp -d)" bb-plugin-tasks-plus/node_modules/.bin/bb plugin build bb-plugin-tasks-plus
EVIDENCE="$(mktemp -d)"
BBP53_CAPTURE_PHASE=none bun run --cwd bb-plugin-tasks-plus test:browser \
  --config "$PWD/.pi/skills/verify-bb-plugins/references/tasks-playwright.config.ts" \
  --trace on --output "$EVIDENCE/browser"
openspec validate task-detail-commands --strict
```

## State and limits

- No merge, deployment, plugin install, enable, reload, migration, or production-record mutation.
- No `.pi/settings.json` change, personal binding, or live verification record.
- Owned browser records exist only in memory. Owned preview listeners and temporary caches are removed by the runner. Evidence is retained.
- Build tool downloads use a disposable `BB_DATA_DIR`, not desktop user data. Source and build hashes are retained.
- No backend, dependency, command bridge or dispatch change. Cursor-only deslop and Comment Sicko integrations were unavailable. Pi's independent implementation review is separate.
- No separate substantial actionable cleanup defect was identified in the edited or adjacent code.

## Screenshots

[Wide picker](wide-linked-project.png) and [narrow picker](narrow-linked-project.png) show keyboard focus and shared scope before any choice.
