# Pi bridge fixture startup and cleanup

[BBP-244](bbtask://BBP-244) investigates local verification failures from BBP-226. This report covers source fixtures, not installed provider acceptance.

## Scope and result

The current macOS ARM64 checkout passes the speed suite and both full-suite worker configurations before the fix. The historical initiating timeout does not reproduce. Its sanitized logs contain no process trace that establishes a host resource limit.

Controlled startup and shutdown fixtures reproduce two cleanup defects:

- Teardown returns and removes the workspace while an owned Pi child remains alive.
- An interrupted startup can report its error after the JSON-RPC capture is restored. The waiting request then loses that response.

The fix tracks live `PiRpcChild` instances through exit. The existing test cleanup hook terminates and awaits remaining owned children before removing scratch files. The fixture harness drains its pending requests before restoring capture and environment overrides. Normal provider shutdown behavior, existing assertions, and existing deadlines are unchanged.

## Reproduction and process evidence

The baseline is `e9afeecce2d0b4675f3879bd04d2a5cd40af30fa`. Bun is 1.4.3 and Node is 24.15.0. The checkout is the worktree for `bbthread://thr_g6m6vmrsvj` in BB project `proj_gjz4e6jtmg`.

From the repository root, run:

```sh
bun install --cwd bb-plugin-pi-subagents-provider --frozen-lockfile
bun run --cwd bb-plugin-pi-subagents-provider test src/bridge/test-support.test.ts
```

The first regression uses the existing `FAKE_PI_HANG_ON_CLOSE` fixture control. It checks the recorded PID with `process.kill(pid, 0)` before and after teardown. Without the fix, the process survives teardown:

```text
AssertionError: expected [ true ] to deeply equal [ false ]
Test Files  1 failed (1)
Tests  1 failed (1)
```

The startup regression uses a test-owned Node preload that blocks before the scripted Pi fixture loads. It ignores SIGTERM and requires the existing SIGKILL escalation. Without request draining, the startup error escapes to stdout after capture restoration:

```text
{"jsonrpc":"2.0","id":1000001,"error":{"code":-32000,"message":"pi exited (code null, signal SIGKILL)"}}
Error: Test timed out in 30000ms.
```

With both fixes, the full-suite run records these process observations:

```json
{"phase":"teardown returned","pids":[36384],"alive":[false],"workspaceExists":false}
{"phase":"startup blocked","pids":[36406],"alive":[true],"workspaceExists":true}
{"phase":"startup teardown returned","pids":[36406],"alive":[false],"workspaceExists":false}
```

The startup test also asserts that its original request receives error code `-32000` and the `pi exited` message with `signal SIGKILL`. Both new tests have a 30-second deadline to cover the deliberate shutdown escalation. No prior deadline changes.

## Verification

All commands below run from the repository root. Exit codes were observed directly.

| Check                                                     | Result                                                     | Exit |
| --------------------------------------------------------- | ---------------------------------------------------------- | ---- |
| Baseline speed suite                                      | 26 passed                                                  | 0    |
| Baseline full default suite                               | 757 passed across 59 files                                 | 0    |
| Baseline full single-worker suite                         | 757 passed across 59 files                                 | 0    |
| New startup and teardown regressions                      | 2 passed                                                   | 0    |
| Speed, lifecycle, Bun RPC, and new regressions            | 40 passed across 4 files                                   | 0    |
| Full default suite after fix                              | 759 passed across 60 files                                 | 0    |
| Full single-worker suite after fix                        | 759 passed across 60 files                                 | 0    |
| Provider typecheck                                        | Passed                                                     | 0    |
| `bb plugin types bb-plugin-pi-subagents-provider --check` | SDK pin and host both 0.6.49                               | 0    |
| Provider build                                            | Server, app, and host artifacts built                      | 0    |
| Root `bun run check`                                      | Setup, browser lifecycle fixtures, lint, and format passed | 0    |
| `git diff --check`                                        | Passed                                                     | 0    |

The provider commands are:

```sh
bun run --cwd bb-plugin-pi-subagents-provider test
bun run --cwd bb-plugin-pi-subagents-provider test --maxWorkers=1
bun run --cwd bb-plugin-pi-subagents-provider typecheck
bun run --cwd bb-plugin-pi-subagents-provider build
```

The root check initially failed because sibling preview dependencies were absent. Frozen installs for Codex Quota, Compose Chat, Markdown Reader, and the shared Markdown package, followed by the shared package build, resolved those setup failures. No source, lockfile, settings, or deadline change was needed. Root lint retains unrelated existing warnings.

Raw logs are retained under the thread's `bbp-244` evidence directory. The task attachment retains the baseline, red regressions, green process trace, focused and full suites, typecheck, SDK check, build, and final root check.

## Limits and cleanup

The controlled process traces establish the cleanup races, not the initiating cause of the historical 23 speed failures or 300-second local timeout. This report makes no CPU-saturation or performance claim.

Installed provider activation, signed-in UI behavior, paid model turns, and deployment were not run. No plugin source selection, settings, production records, credentials, or secrets were accessed or changed. Test-local environment overrides are restored by the harness. Regression fixtures remove their owned workspaces and check their recorded child PIDs are gone. A post-suite process check found no remaining scripted Pi or startup-preload children.

Independent completion review approved this source-fixture change with no blocking findings. The reviewer independently passed the 40-test focused set and typecheck, checked both SHA-256 manifests, and confirmed the recorded children were gone. The review report is attached to BBP-244. The task remains open for PR review and no merge is authorized.
