# BBP-260 Markdown preview HMR diagnosis

## Result

The lifecycle test mixed file creation with an existing-module update. Create the owned module before either preview starts. Keep the five-second HMR deadline and both update-path assertions. Check the initial and updated HTTP module bodies as well.

This changes test setup only. No preview server, plugin runtime, dependency version, setting, or installed plugin changes.

## Reproduction and cause

Baseline commit `c904a7344ea639ef2a2dcb80ab0431006affa2f5`. macOS arm64, Bun 1.4.3, Node 24.15.0, frozen Markdown Reader dependencies, Vite 7.3.6. The initial attempt had no Vite installed and failed at startup. After the frozen Reader install, this command reproduced the reported timeout, exit 1:

```sh
bun test scripts/browser-preview-servers.test.mjs --test-name-pattern 'markdown-reader real ephemeral'
```

[The failing test log](repro-focused.log) records `Missing HMR update on owned listener` and one failure. The shared Markdown package's dependencies were not yet installed, matching the original report's Reader-and-Compose-only setup.

A temporary Bun preload observed Vite's real watcher, transform, `hotUpdate`, and outbound HMR events. A separate driver used the test's HTTP, WebSocket, and write sequence. It did not supply messages or replace the watcher, transform, or HMR implementation. [The creation trace](confirmed-create.ndjson) shows:

1. The module fetch completed and the owned WebSocket received `connected`.
2. The edit finished before Vite discovered the directory and file.
3. Vite processed a `create` event, not an `update` event.
4. The client update set contained the self-accepting owned module and two unresolved shared Markdown modules, `model.tsx` and `code.ts`.
5. Vite sent `full-reload`. The WebSocket received that message. No `update` arrived before the existing deadline.

Vite's `handleHMRUpdate` adds `_hasResolveFailedErrorModules` to the update set for `type === "create"`. Those unrelated modules lead to a full reload. This is not a lost WebSocket connection or a slow five-second update.

## Controlled comparisons

- Consuming the HTTP response body did not prevent the timeout.
- A diagnostic-only 500 ms delay allowed discovery to finish, then produced a real `change` and `update`. No delay ships.
- Installing the shared Markdown dependencies made the unchanged test pass. Its late file event was still `create`, so that pass did not prove an existing-file update.
- Creating the module before startup produced a real `change` and an update set containing only the owned module, even with the shared dependencies absent. [The preexisting-module trace](confirmed-preexisting.ndjson) records both outbound and received `update` messages.
- The corrected test also passed with the original missing-shared-dependency condition, exit 0. [The focused log](fixed-original-deps.log) includes the unchanged listener and cleanup checks and the new before/after content checks. The run temporarily held only this worktree's newly installed shared `node_modules` directory and restored it with an EXIT trap.

The original historical runs were not instrumented. The controlled reproduction establishes this mechanism, not every possible cause of an HMR timeout.

## Verification

| Check                                                  | Result                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Corrected focused test with complete dependencies      | 1 passed, exit 0                                                            |
| Corrected focused test with shared dependencies absent | 1 passed, exit 0                                                            |
| `bun run test:browser-lifecycle`                       | 29 passed, exit 0                                                           |
| `bun run check`                                        | 8 setup tests and 29 lifecycle tests passed, lint and format passed, exit 0 |
| `bun run --cwd bb-plugin-markdown-reader test`         | 239 tests across 11 files passed, exit 0                                    |
| `bun run --cwd bb-plugin-markdown-reader typecheck`    | Exit 0                                                                      |
| Shared Markdown frozen install and build               | Exit 0                                                                      |

[The root-check log](root-check.log) retains the complete successful root run and existing non-fatal lint warnings. An earlier root check found formatting in the edited test. The final run follows that correction, not a blind retry.

The existing lifecycle suite still checks independent ephemeral listeners, strict port refusal, peer survival, listener shutdown, owned cache removal, historical-file preservation, and unchanged dist contents. Its temporary module directories were absent after the runs. Shared dependencies were restored. No timeout was increased and no assertion was removed.

Full browser UI suites, installed activation, and live BB acceptance were not run. This change concerns the root fixture lifecycle, not reader UI behavior. No deployment, merge, settings change, credential access, or production-data operation was part of verification.

## Work constraints

Fix Root Causes led to tracing Vite's event type and update set rather than increasing the timeout. Prove It Works led to real listener/WebSocket checks and HTTP content assertions. Model the Domain kept the existing preview records and local fixture ownership instead of adding a test framework.

The existing failing integration test is the regression checkpoint. No additional failing-test commit is needed. Independent completion review uses the recorded baseline and the complete working-tree change. Cursor-only `deslop` and Comment Sicko tools are unavailable. No settings were changed to enable them. No separate actionable cleanup finding was identified.

Source task BBP-260. Work thread `bbthread://thr_qczfdtmcek`.
