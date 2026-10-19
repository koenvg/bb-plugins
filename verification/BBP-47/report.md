# BBP-47 verification

## Result and scope

**Tasks: Dispatch task...** opens only the visible dispatch preset menu. Opening or canceling starts no agent. Explicit selection uses the existing task, preset, blocked-work confirmation and delegation error handling. Both layouts report their own control readiness. Loading, failed or missing presets, confirmation and delegation disable the command without queuing work. The mouse primary button retains its last-preset behavior.

Source requirements are delivery 4.1 through 4.4 in [the checklist](../../openspec/changes/task-detail-commands/tasks.md), [design](../../openspec/changes/task-detail-commands/design.md) and [specification](../../openspec/changes/task-detail-commands/specs/task-detail-commands/spec.md). BBP-46 is done. Baseline is `bf56f787e839d68e610b3917aaf651040e91e552`.

Local package, browser and build checks pass. Installed-BB acceptance remains blocked by the no-deployment restriction. The installed source is a different checkout. Delivery 4 checkboxes remain open. CI evidence belongs to the PR's current head, not this local report. The [independent review](review.md) approves code and fixture scope with no actionable findings.

## Source and evidence identity

- Work thread [BBP-47](bbthread://thr_r9wjv6p6vp). Private logs, traces and original recordings are under `/Users/koen/.bb/thread-storage/thr_r9wjv6p6vp/bbp47-evidence`.
- Bun 1.4.3, Node 24.15.0, pinned TypeScript 7.0.2, package-local official BB CLI 0.46.1 and SDK 0.6.49.
- Browser fixtures use the production Tasks shell, SDK test provider, in-memory records and a simulated host palette. They do not establish installed-BB acceptance.
- Full-suite origin was `http://127.0.0.1:64688`. The runner owned its ephemeral listener and private cache. Early preview used port 63028.
- The private browser config extends the repository's private-capture config and adds video recording. Its SHA256 is `57df5a592c742d27b54345ee977ae4ca4722374e3a2d829f9495e5f8bdbd85e3`.

## Checks

| Check                                                       | Result                                                            | Evidence                                                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Frozen root and package setup                               | Passed, exit 0                                                    | `root-setup.log`, `markdown-setup.log`, `quota-setup.log`, `tasks-setup.log`, `compose-setup.log`, `reader-setup.log` |
| Shared Markdown build, tests and typecheck                  | Passed, exit 0                                                    | `markdown-build.log`, `markdown-tests.log`, `markdown-typecheck.log`                                                  |
| Red checkpoint                                              | Both initial rendered cases failed on unavailable command, exit 1 | `red-dispatch.log`                                                                                                    |
| Focused rendered command, keyboard and rail tests           | 87 tests in five files, exit 0                                    | `focused-tests.log`                                                                                                   |
| Full Tasks tests                                            | 1,519 tests in 132 files, exit 0                                  | `tests-full.log`                                                                                                      |
| Pinned package typecheck                                    | Exit 0                                                            | `typecheck-parent.log`, `typecheck-final.log`                                                                         |
| Package lint and formatting                                 | Exit 0                                                            | `lint-parent.log`, `format-final.log`                                                                                 |
| SDK declaration check and isolated plugin build             | Both exit 0; bundle contains task-dispatch                        | `sdk-types.log`, `build.log`, `build-hashes.sha256`                                                                   |
| Early keyboard browser preview                              | Two dispatch cases, both layouts, exit 0                          | `early-browser.log`, `early-browser/`                                                                                 |
| Full Tasks Chromium browser suite                           | 43 tests, exit 0, screenshots, video and traces                   | `browser-full.log`, `browser-full/`                                                                                   |
| Root setup and browser lifecycle tests, lint and formatting | Exit 0                                                            | `root-final-formatted.log`                                                                                            |
| Strict OpenSpec validation                                  | Exit 0                                                            | `openspec.log`                                                                                                        |
| Mechanical UI detector                                      | Exit 0, no findings                                               | `design-detector.json`                                                                                                |
| Historical BBP-53 captures                                  | Before and after hashes match                                     | `historical-before.sha256`, `historical-after.sha256`                                                                 |
| Installed palette and personal binding                      | Blocked; no deployment or temporary binding                       | User restriction and different installed source                                                                       |

Rendered regressions cover explicit selection, open and Escape without delegation, last-preset separation, both layouts, loading and failed refresh with retained data, busy visible control versus idle hidden duplicate, layout changes without a React render, readiness at invocation and deferred activation, no queued intent, fresh task targeting, stale frame cancellation on switch or unmount, blocked confirmation cancellation, delegation failure, explicit retry and `d`.

The Chromium cases use keyboard actions through the simulated palette at 1200 and 650 pixels. They assert focus in the visible menu, Escape return, no delegation until Enter selects a preset, the current task payload, busy command absence and no replay after completion. Existing property command cases pass unchanged.

## Testing layers and manual acceptance

- Unit tests. Done. The full package suite passes, including existing pure-domain and backend checks.
- Component tests. Done. SDK-rendered dispatch, keyboard, rail and command tests pass.
- Integration tests. Done. Command registrations drive production detail controls across the SDK/RPC seam; external delegation is substituted.
- End-to-end tests. Not done for installed BB. All 43 local browser fixture tests pass, but the host palette and installed worker path remain unverified.
- Manual verification steps. Not done in installed BB. Screenshots were inspected. Host steps remain to open the palette and a temporary personal binding in both layouts, cancel without a worker, deliberately select a preset on disposable work, check exactly one linked worker, and remove the binding. Deployment is required before those steps.

## Development failures retained

The red test failed before implementation. An expanded test run exposed a missing await in a test helper, and typecheck rejected unsupported test-only `exact` options. Both were corrected before passing checks. Source formatting checks initially failed in three files and passed after formatting. The first parent root check passed tests and lint but rejected this report's draft table formatting. Failed logs are retained. No production safeguard or test assertion was removed to obtain a pass.

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
bun run check
openspec validate task-detail-commands --strict
```

## State and limits

- No merge, deployment, installation, enable, reload, migration or production worker dispatch.
- No `.pi/settings.json` change or temporary personal binding.
- The installed source remains `/Users/koen/workspace/bb-plugins/bb-plugin-tasks-plus`. Local builds use a disposable `BB_DATA_DIR`, not desktop user data.
- Browser records exist only in memory. Both owned listeners are absent, and the full-suite private cache was removed. Evidence is retained.
- Cursor-only deslop, Comment Sicko and multi-model arena defaults are unavailable. Pi's independent review is a separate gate.
- No separate substantial actionable cleanup defect was established. The pre-existing confirmation resolver lacks unmount cleanup, but no retained-resource defect was demonstrated, so no speculative follow-up was filed.
- Impeccable reported a stale `.impeccable/design.json` sidecar. It is outside this change and was not regenerated.

## Screenshots and recordings

[Wide picker](wide-dispatch.png) and [narrow picker](narrow-dispatch.png) show keyboard focus before any choice. [Wide video](dispatch-wide.mp4) and [narrow video](dispatch-narrow.mp4) record the real fixture interactions. The wide video plays at half speed for readability. [Animated preview](dispatch-wide.gif) is derived from that recording.
