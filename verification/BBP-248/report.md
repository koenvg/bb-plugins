# BBP-248 fixture isolation and shutdown evidence

## Result

Tasks browser runs use independently owned ephemeral origins and private caches. Concurrent checkout runs passed with distinct origins and source markers. Exact-origin, image security, native-tab, strict bind refusal, and peer-preserving teardown checks remain enabled.

The previously unexplained peer shutdown hang is now reproduced and fixed. No browser tabs, installed BB plugins, settings, credentials, secrets, or production records were used by these fixture checks.

## Port collision

The original configuration failed before tests started when an owned HTTP sentinel occupied 4193:

```text
Error: http://127.0.0.1:4193/tests/preview.html is already used
collision repro exit=1
```

After migration, the same five Tasks parity tests passed while that sentinel still responded. The maintained cross-consumer parity wrapper also passed under the same collision condition after its obsolete fixed-port guard was removed. Historical captures were unchanged.

The package command uses the existing process-group owner. Raw Playwright without its validated origin handoff fails instead of borrowing another listener.

## Shutdown diagnosis

Earlier failures left the direct peer preview alive after the canceled runner had already exited. Successful retries did not explain them.

An isolated copy of the real preview reproduced the failure with phase logging. It completed optimizer drainage, Vite closure, HTTP closure, and cache removal, but the process stayed alive. Native sampling showed a remaining FSEvents run loop, not a stalled optimizer await.

Watcher instrumentation then captured this order:

```text
watcher closing
watcher closed true []
late watcher.add(packages/markdown-document/tsconfig.json)
  ensureWatchedFile
  transformWithEsbuild
  transform
  pluginContainer.close
  environment.close
native FSEvents watch starts again
```

Vite closes its watcher and environments concurrently. A TypeScript transform still loading an external tsconfig can register that file after watcher closure. That reopens the native watch and prevents natural process exit. This is newly verified evidence; it does not identify the listener that caused the historical BBP-57 port collision.

Tasks now drains its Vite environments before calling Vite's aggregate close. Pending transforms finish while the watcher is still open. The existing optimizer writer-drain and final HTTP/cache cleanup remain intact. The shared runner's bounded, owned-process-group cleanup is unchanged. No forced process exit or increased teardown timeout was used as the fix.

## Deterministic regression

`scripts/fixtures/tasks-transform-preload.mjs` pauses only the read of a freshly owned external tsconfig. The file bytes, TypeScript transform, HTTP request, Vite environments, and watcher are real. The test waits for initial dependency optimization, requests an owned loader that imports the external module, signals shutdown while the read is held, then releases it when environment closure starts.

Before the fix, the test recorded a late watcher addition and required its failure watchdog to stop the owned process. After the fix, it passed with this order:

```text
optimizer-ready
tsconfig-held
environment-close-started
tsconfig-released
environment-close-finished
watcher-close-started
watcher-close-finished
```

The test asserts natural exit, no late watcher addition, environment-before-watcher completion, removed cache, and a stopped listener. Separate tests retain strict bind refusal, failure/cancellation peer preservation, and scan/crawl writer-drain coverage. Active-run cancellation uses an explicitly held Playwright configuration rather than racing self-terminating `--list`.

## Verification

Local runs used Node 24.15.0 and Bun 1.4.3 with frozen package installs and the local Markdown build.

| Check                                                      | Result                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| Exact paused-transform regression before fix               | Failed with late watcher addition and owned watchdog cleanup         |
| Exact paused-transform regression after fix                | Passed                                                               |
| Original cancellation timing, uninstrumented fixed preview | 200 passed, zero failures                                            |
| Complete lifecycle suites, three repetitions               | 81 passed, zero failures                                             |
| Tasks browser suite, headless Chromium                     | 32 passed                                                            |
| Tasks unit suite                                           | 129 files, 1,452 tests passed                                        |
| Pinned Tasks typecheck                                     | Passed                                                               |
| Two simultaneous detached checkout browser runs            | Passed, distinct origins and checkout markers                        |
| Maintained Reader/Tasks parity while 4193 is occupied      | Passed, sentinel unchanged                                           |
| Historical BBP-53 evidence hashes                          | All 71 unchanged                                                     |
| Scoped lint, formatting, Git whitespace                    | Passed; lint retains four pre-existing warnings outside changed code |

CI runs the Tasks ownership and shutdown regressions before its headless browser suite. Its fixture runs disable historical capture writes. CI results and the run URL belong in the PR, not as an assumed pass in this report.

## Scope and remaining limits

These are fixture and package checks, not installed BB acceptance. No deployment, plugin activation, source replacement, migration, live task mutation, or browser-session automation was performed for verification. The original historical port occupant remains unknown.

The native diagnosis was made on macOS. The regression asserts watcher ordering without relying on macOS FSEvents, so Linux CI also checks the lifecycle contract. No broader claim about Vite or every plugin's shutdown behavior is made. The analogous Reader implementation was not changed in this Tasks-only fix.

The original independent review requested changes for the parity wrapper and shutdown hang. The wrapper now passes with an occupied port, and the hang has a failing-then-passing real-transform regression. Its initial failure reports remain retained with the linked BBP-248 work thread rather than being rewritten as passes.
