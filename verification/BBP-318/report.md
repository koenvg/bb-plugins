# BBP-318 Markdown preview shutdown investigation

## Result

The pre-BBP-239 shutdown order can cancel Vite dependency optimization while HTML-triggered warmup requests still await dependency processing. Vite then waits for those requests during close, but their processing promises do not settle. The existing optimizer drain in main prevents this reproduced stall. This PR adds regression coverage and diagnosis, not another server fix.

Task BBP-318 has no blockers. Source thread is bbthread://thr_ivawmipkdd. The reviewed starting commit is `e9afeecce2d0b4675f3879bd04d2a5cd40af30fa`.

## Runtime evidence

Both new cases run the real `bb-plugin-markdown-reader/tests/preview-server.ts`, consume `GET /`, and stop an exact owned PID with SIGTERM or SIGINT. A test-only preload holds the real esbuild optimizer writer until an actual optimized-dependency load awaits its processing promise. The parent then signals shutdown. It releases the writer when either the current drain reads processing or the historical path calls optimizer close. The failing path therefore does not depend on a permanently held test gate.

The historical experiment temporarily restored the server file to blob `91c9af33c71e32d9eb4ad9d528fcb8e925b36fe7`, byte-identical to the parent of the starting commit. The server file was then restored to blob `8fc76a8e8902532d2dc71215c9ea47ca23d20890`. Its final diff is empty.

Historical order, verbatim trace from `red-final.log`:

```text
HTML shutdown trace (SIGTERM): scan-settled, optimized-load-pending, writer-held, signal, optimizer-close, writer-released, writer-settled, optimizer-closed; exit [null,"SIGKILL"]
HTML shutdown trace (SIGINT): scan-settled, optimized-load-pending, writer-held, signal, optimizer-close, writer-released, writer-settled, optimizer-closed; exit [null,"SIGKILL"]
 0 pass
 2 fail
Ran 2 tests across 1 file. [30.04s]
```

The existing 15-second owned-PID watchdog killed each stalled child. It is a failure bound, not a successful teardown. Only owned temporary directories were removed after the children exited.

Current source, verbatim trace from `green-final.log`:

```text
HTML shutdown trace (SIGTERM): scan-settled, optimized-load-pending, writer-held, signal, shutdown-processing-read, writer-released, writer-settled, optimizer-close, optimizer-closed; exit [0,null]
HTML shutdown trace (SIGINT): scan-settled, optimized-load-pending, writer-held, signal, shutdown-processing-read, writer-released, writer-settled, optimizer-close, optimizer-closed; exit [0,null]
 2 pass
 0 fail
Ran 2 tests across 1 file. [793.00ms]
```

The preload wraps real esbuild and Vite operations. It does not supply fake build output, cleanup success, processing completion or exit status. The writer gate uses stdin, not a scheduling delay. The load observer reports the actual read of a nonempty processing promise inside Vite's optimized-dependency load hook.

## Cause

Observed with Bun 1.4.3, Node v24.15.0 and locked Vite 7.3.6:

1. Vite's HTML handling starts background warmup for the preview module and its dependencies. Consuming the HTML response does not await this work.
2. `vite:optimized-deps` loads wait on each discovered dependency's `info.processing` promise.
3. Vite's environment close cancels its crawl-end finder and closes the optimizer. Optimizer close cancels the build but does not itself resolve discovered processing promises.
4. The canceled crawl can no longer take the normal path through `onCrawlEnd` and `runOptimizer` that settles processing. Environment close still waits for pending transform requests. This is the reproduced wait cycle.
5. The BBP-239 drain waits for the scan and discovered processing before Vite close, while crawl completion remains active. The real optimizer work completes, the loads settle, and normal close can finish.

The corresponding Vite 7.3.6 implementation is in `node_modules/vite/dist/node/chunks/config.js`, in `optimizedDepsPlugin`, `createDepsOptimizer`, `onCrawlEnd`, `DevEnvironment.close` and `setupOnCrawlEnd`. No dependency files were changed.

The archived task log alone does not prove the exact scheduling of its original stall. The new runtime experiment establishes this mechanism, not that every historical or future shutdown timeout has the same cause. Early probes with missing shared Markdown dependencies are setup diagnostics and are not counted as valid runtime acceptance. Complete frozen setup preceded all reported regression and acceptance runs.

## Regression contract

- Both graceful signals run the deterministic pending-warmup schedule.
- A second, uninstrumented preview shares the temporary parent. After the first exits, it must remain alive and serve HTML. It then stops immediately after its own consumed HTML response.
- Every successful owner must exit `[0, null]`, lose its exact PID and listener, and remove only its cache. The historical file must retain literal content `keep`, and the dist listing must remain unchanged.
- Existing HTML, transform, HMR, strict-port, startup cancellation, writer-order, process-group and cleanup checks are unchanged. No deadlines were extended.

## Verification

All current-source commands below exited 0 unless explicitly marked as the historical failure.

| Check                       | Command or evidence                                                                                                               | Result                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen setup                | `bun install --cwd PACKAGE --frozen-lockfile` for Markdown Reader, shared Markdown, Compose Chat and Codex Quota                  | Passed. Lockfiles unchanged.                                                                                                                                |
| Historical negative control | `bun test scripts/browser-preview-servers.test.mjs --test-name-pattern 'immediate HTML shutdown'` with the historical server blob | Expected failure. Both cases stalled after actual writer release and settlement.                                                                            |
| Current focused checks      | Same test command with the starting server blob                                                                                   | 2 passed. Ten additional consecutive runs also passed both cases.                                                                                           |
| Full lifecycle              | `bun run test:browser-lifecycle`                                                                                                  | 22 passed, including the existing HTML, transform and HMR path.                                                                                             |
| Root checks                 | `bun run check`                                                                                                                   | 8 setup and 22 lifecycle cases passed. Root lint and formatting passed. Existing lint warnings remain in untouched files.                                   |
| Markdown package            | `bun run --cwd bb-plugin-markdown-reader test`                                                                                    | 235 tests across 11 files passed.                                                                                                                           |
| Markdown types              | `bun run --cwd bb-plugin-markdown-reader typecheck`                                                                               | Passed.                                                                                                                                                     |
| Browser fixture             | `.pi/skills/verify-bb-plugins/scripts/browser.sh markdown-reader EVIDENCE/browser` after pinned Chromium setup                    | 71 passed with traces and HTML/JSON reports. Actual readiness origin was `http://127.0.0.1:56383`.                                                          |
| Formatting and patch        | Touched-file lint, format check and `git diff --check`                                                                            | Passed.                                                                                                                                                     |
| Browser cleanup             | Read-only listener and filesystem checks after runner exit                                                                        | No listener at port 56383. Owned run parent was absent.                                                                                                     |
| Installed BB acceptance     | Not run                                                                                                                           | No installed plugin, production records, credentials, secrets or settings were accessed or changed. Fixture acceptance does not claim installed acceptance. |

Raw evidence is retained in the task attachments and the linked work thread. The bundle includes the repro scripts, source hashes, negative and positive controls, repeated runs, lifecycle/package/typecheck logs and browser reports.

## Scope and safeguards

The only code additions are test coverage and a test-only preload. There are no changes to application behavior, dependency versions, CI settings or installed plugin selection. No production data, credentials or secrets were accessed. No merge or deployment is part of this work.

The only process signals target children created by this run. An unrelated pre-existing preview process was observed and left untouched. Temporary cache parents were removed only after owned children exited. Verification evidence is retained separately from disposable caches.

No additional actionable cleanup finding was observed. Cursor-only deslop, control and Comment Sicko commands are unavailable in this Pi run. Direct owned-process checks, repository lint/format and the required fresh independent review cover this delivery without claiming those unavailable workflows ran.

## Principles applied

Fix Root Causes required the real wait cycle and a negative control. Laziness Protocol avoided another server workaround because the existing drain passes the reproduction. Model the Domain retained explicit preview owners, ordered events and one writer gate. Prove It Works required literal filesystem contents, actual HTTP responses, strict exit status and direct PID/listener checks.
