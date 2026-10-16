# BBP-55 heading navigation and safe destinations

## Result

Implementation and review fixes are complete. The user explicitly accepted headed-browser evidence and authorized finalizing BBP-55, without installation or publication. Source tasks 3.1 through 3.4 are checked. BBP-55 is accepted as done. Default headless verification failed at that stage. The current full-Chromium headless suite passes all 23 tests after the [PR #277 CI fix](#ci-fix-for-pr-277).

Before the PR rebase, the full production-overlay fixture passed all 17 tests with headed Chromium. The default headless launch passed 14 tests and failed three native-tab checks, including a plain native anchor. No assertions were skipped. The earlier claim that both modes used the same binary was incorrect. Pinned Playwright selects the headless shell by default and full Chromium for headed mode. The CI-fix section records the corrected selection and new evidence.

Original implementation baseline is `6d7e3c4a72d2ad9758442238445aa00a41b9dadb`. Scope is `task-markdown-preview` tasks 3.1 through 3.4. BBP-53 was verified done before implementation. No production Markdown Reader files, dependency manifests, lockfiles, installed sources, enabled states, or live test records were changed. This section records the implementation stage before the user requested a PR.

## Delivered behavior

- One ReactMarkdown/GFM tree supplies semantic headings, collision-safe Unicode fragments, reader-local IDs, scoped footnotes, and an optional outline disclosure. Concurrent readers and underlying task headings remain isolated.
- An explicit policy union separates deny, rootless attachments, and bound source activation. Common validation runs before dispatch and URL rewriting. The trusted source adapter retains authorization and operation-time filesystem confinement.
- Ordinary external HTTP(S) activation calls BB's public URL-opening API. Failure stays in the document with readable feedback. Modified and middle activation retain native anchor behavior. Local fragments stay in the reader.
- Explicit remote-image permission uses CORS fetch with omitted credentials, no referrer, and rejected redirects. Same-origin BB resources are blocked before requests. Streamed byte, concurrency, and attempt limits bound loading. Owned blobs are released on replacement, Raw, and unmount. Blocked and broken images retain alt text.
- Raw source, saved-ID loading, original downloads, draft state, focus restoration, and shortcut isolation remain covered by existing regressions.

Model the Domain shaped the heading model and permission union. Separate Before Serializing Shared State kept design artifacts isolated and implementation single-writer. Prove It Works required direct parent test runs, real-network controls, and inspected desktop/compact screenshots rather than worker claims alone.

## Parent-verified checks

[Parent evidence directory](/Users/koen/.bb/thread-storage/thr_58h44xjezj/BBP-55-parent-checks-20261015).

| Check                                                   | Result                                                    | Evidence                                                   |
| ------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Shared public tests                                     | 15 passed                                                 | `shared-tests-proof.log`                                   |
| Complete Tasks tests                                    | 1324 passed in 125 files                                  | `tasks-tests.log`                                          |
| Shared and pinned Tasks typechecks                      | Passed                                                    | `shared-types.log`, `tasks-types.log`                      |
| Scoped Oxc lint                                         | Passed with four pre-existing warnings in unchanged files | `lint.log`                                                 |
| Scoped formatting and diff whitespace                   | Passed                                                    | `format-check.log`, final checks                           |
| Shared package build                                    | Passed                                                    | `shared-build.log`                                         |
| Public SDK check                                        | Passed, SDK 0.6.37                                        | `sdk.log`                                                  |
| Isolated pinned plugin build                            | Passed with disposable BB_DATA_DIR                        | `build.log`                                                |
| Full headed browser suite                               | 17 passed                                                 | `browser-accepted-headed.log`, `browser-accepted-headed/`  |
| Full default headless browser suite                     | Failed, 14 passed and 3 native-tab failures               | `browser-final-headless.log`, `browser-final-headless/`    |
| Historical BBP-53 captures and four manifests/lockfiles | Unchanged                                                 | `historical-verification.log`, `manifest-verification.log` |
| Mechanical UI detector                                  | No findings                                               | `design-detector.json`                                     |
| Owned port 4193 cleanup                                 | No listener remains                                       | Final checks                                               |

The headed suite checks desktop and 390 px overlays, keyboard disclosure, local scroll/focus, BB URL dispatch/refusal, real native new-tab completion, credential/referrer omission, CORS and redirect rejection, broken-image fallback, image aspect ratio, blob cleanup, downloads, and task-state preservation. Network assertions use complete headers and a positive request that sends the fixture cookie. Native destinations use a real cross-origin page on the owned listener, not intercepted external HTML.

Parent inspected the desktop and compact screenshots in `browser-native-http/`. Later runs preserve the same product layout. Context-menu non-interception is checked through rendered public events and real hrefs. Native operating-system menu automation is not claimed.

## Independent review and closure

The one fresh completion reviewer selected the strict `review` skill for the new public contract and resource lifecycle. [Original review, retained unchanged](/Users/koen/.bb/pi-subagents-bridge-sessions/subagent-artifacts/20a2bddb-b63b-49b8-8d6b-ac00d689a7e4_delegate_output.md).

| Finding                                                     | Fix and closure                                                                                                                                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equivalent policy objects reset image ownership and budgets | Resource ownership now depends on text and effective image permission. A public rerender regression retains 32 images/attempts across 33 equivalent inline policies without refetch or revocation. Parent shared tests pass. |
| Cookie assertion used an API that omits security headers    | Browser tests await `allHeaders()` and prove that a control request can send the cookie. Both widths pass these assertions.                                                                                                  |
| Native-tab test raced the initial blank page                | Tests await the expected URL and loaded body. Both product activations and the plain-anchor control pass headed. The remaining headless failure is recorded, not relabeled as a pass.                                        |

The reviewer found no new comment/suppression bypass or structural blocker. The parent inspected each fix and reran affected checks. No second review is claimed. Earlier worker evidence and the handoff remain historical; their description of all three original browser failures as page-event timeouts was incorrect. The original diagnostic sometimes reached `about:blank`. Parent evidence supersedes that interpretation.

[Writer handoff and earlier evidence](/Users/koen/.bb/thread-storage/thr_58h44xjezj/BBP-55-implementation-20261015-215953/handoff.md).

## Limits and decision

The user accepted headed Chromium as the native-tab verification gate and authorized finalization of task 3.3 and BBP-55. That approval does not authorize installation, live test records, publication, or production Reader adoption. All four delivery 3 tasks are complete. Headless failures remain recorded separately as BBP-245, with both browser logs attached.

Installed BB URL preferences, authenticated live attachments, and blob-image CSP were not exercised because installed changes and live records lack approval. Hosted CI and clean-checkout CI execution were not run. They are not reported passes. Decoded-pixel memory is not bounded by streamed-byte limits. Remote images intentionally require CORS and reject redirects.

Cleanup search verified the single linked BBP tracker and exhausted relevant active-status searches. Existing BBP-237 covers the shared Markdown compiled-export/build prerequisite boundary. It is reused, not duplicated. Four pre-existing Oxc warnings are outside this change and do not justify separate style tickets. After explicit acceptance of headed evidence, the headless investigation was recorded as BBP-245, dependent on BBP-55. BBP-55 does not depend on that follow-up.

## PR verification after rebase

The user then requested a PR. Three ordered commits separate the shared package, Tasks integration, and acceptance documentation. The branch was rebased onto main at `e6484c622bda3e7d01b67207e4a6f1a1d3dc5244`, which includes BBP-56. Conflict resolution preserves its bounded highlighting plugin and report fixtures alongside the heading/destination plugin and navigation fixtures. No safety or geometry assertions were weakened.

[PR preparation evidence](/Users/koen/.bb/thread-storage/thr_58h44xjezj/BBP-55-pr-checks) records successful frozen setup, shared build, 48 shared tests, 1324 Tasks tests, both typechecks, lint, formatting, public SDK checks, and isolated plugin build. All 17 BBP-55 navigation/lifecycle checks pass headed. All six BBP-56 report checks pass headless.

The complete 23-test headed suite passes 21 and fails two compact report-width assertions. They expect 390 px but observe 375 px with a native scrollbar. The assertions remain unchanged, and the issue is recorded as BBP-247 with both mode logs attached. This is separate from BBP-245's headless native-tab failures. Neither full browser mode was entirely green in that verification. The later channel fix passes the full suite headless, without changing the separate headed BBP-247 limit. Installed acceptance remains unrun.

The named `/deslop` skill is unavailable in this environment. The parent inspected the diff directly before committing. The earlier independent implementation review and finding closures remain recorded above.

## CI fix for PR #277

Linux CI run `38807687427`, job `116672683511`, failed with 20 passes and three native-tab page-event timeouts. The retained [CI failure log](/Users/koen/.bb/thread-storage/thr_58h44xjezj/BBP-55-ci-fix/failure.log) preserves that result. BBP-245 already tracks this issue.

Playwright 1.64.0's `playwright-core/lib/coreBundle.js` selects `chromium-headless-shell` for headless launches without a channel. Headed launches select `chromium`. Both pinned builds report Chromium 156.0.8078.4, revision 1248, but they are different executables. The earlier same-binary and macOS-only explanations are superseded. The parent's [full-Chromium headless probe](/Users/koen/.bb/thread-storage/thr_58h44xjezj/BBP-55-ci-fix/full-chromium-headless.log) passed all 23 tests using an executable override.

The fix adds only `use.channel = "chromium"` to the existing typed Playwright config. The pinned runtime's type documentation identifies this channel as the full Chromium headless opt-in. Headless remains the default, and the optional custom executable override is unchanged. CI already installs full Chromium with `playwright install --with-deps chromium`. No workflow, dependency, product source, test assertion, timeout, retry, or task-plan checkbox changes are needed. The exact headless-shell internals behind the native-tab failure are not established.

### Current local verification

The sole-writer run used base HEAD `c015f7474035c6987cd54c4b8b8e0ddbc120dd27` with the channel edit. Bun 1.4.3, Node v24.15.0, SQLite, the built Markdown package, and existing Quota dependencies were present. No installation was performed. [Commands and exit codes](/Users/koen/.bb/thread-storage/thr_58h44xjezj/BBP-55-ci-fix/channel-headless/commands.log) and the [verification script](/Users/koen/.bb/thread-storage/thr_58h44xjezj/BBP-55-ci-fix/verify-channel.sh) retain the exact invocations. From the repository root, the browser command was:

```sh
env -u PLAYWRIGHT_CHROMIUM_EXECUTABLE BBP53_CAPTURE_PHASE=none DEBUG=pw:browser bun run --cwd bb-plugin-tasks-plus test:browser --config "$PWD/.pi/skills/verify-bb-plugins/references/tasks-playwright.config.ts" --trace on --output /Users/koen/.bb/thread-storage/thr_58h44xjezj/BBP-55-ci-fix/channel-headless/tasks-browser
```

The existing private config preserves the package's assertions, browser settings, and strict listener. No headed flag or executable override was used. The [browser log](/Users/koen/.bb/thread-storage/thr_58h44xjezj/BBP-55-ci-fix/channel-headless/browser.log) shows the `chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` executable with `--headless`. It records 23 passed and exit 0. [Fresh screenshots, traces, and attachments](/Users/koen/.bb/thread-storage/thr_58h44xjezj/BBP-55-ci-fix/channel-headless/tasks-browser) remain private.

All three previously failing native-tab checks pass, including the plain-anchor diagnostic and production modifier/middle activation with destination URL and loaded-body assertions. The unchanged suite also passes complete network-header checks with a positive cookie control, CORS/redirect rejection, image geometry/blob cleanup, keyboard/focus/scroll/draft preservation, downloads, and all six report layout/theme checks.

| Check                                            | Result                                                                                  | Evidence in `channel-headless/`                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Full headless browser suite                      | 23 passed, exit 0                                                                       | `browser.log`, `tasks-browser/`                                           |
| Pinned Tasks TypeScript 7.0.2 typecheck          | Passed, exit 0                                                                          | `pinned-type-version.log`, `typecheck.log`                                |
| Scoped Oxc lint and format                       | Passed, exit 0                                                                          | `lint.log`, `format.log`                                                  |
| Diff whitespace                                  | Passed, exit 0                                                                          | `whitespace.log`                                                          |
| Historical verification files except this report | SHA-256 unchanged, comparison exit 0                                                    | `historical-before.log`, `historical-after.log`, `historical-compare.log` |
| Tracked manifests and Bun lockfiles              | SHA-256 unchanged, comparison exit 0                                                    | `manifests-before.log`, `manifests-after.log`, `manifests-compare.log`    |
| Owned listener and browser cleanup               | Port 4193 absent before/after. Browser exited 0 and temporary profile cleanup completed | `initial-port.log`, `final-port.log`, `browser.log`                       |

Post-document checks are retained in `final-format.log`, `map-format-compare.log`, `final-whitespace.log`, and `final-scope.log` in the same evidence directory. The first post-document format check failed only on the new report table's spacing. That failure remains in `format-after-docs.log`. The table was normalized before the final passing check.

The historical capture hashes include all BBP-53 files. `BBP53_CAPTURE_PHASE=none` prevented fixed-path capture writes. This run created only owned fixture browser contexts, tabs, a temporary profile, and a strict-port Vite listener. It left no listener, installed-source changes, or live records.

The fresh independent CI-fix review approved the four-file scope with no findings. The parent then ran the default package command headless, without an executable override or alternate config: all 23 tests passed. [Parent verification log](/Users/koen/.bb/thread-storage/thr_58h44xjezj/BBP-55-ci-fix/parent-default-browser.log). No assertions or browser-test files changed.

This is a local macOS fixture pass, not a new hosted Linux CI pass or installed BB acceptance. The parent owns the independent review and CI rerun after publication. BBP-247's separate headed native-scrollbar width failures remain recorded above. The original approval history and all historical failed results remain unchanged.
