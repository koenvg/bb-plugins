# BBP-55 heading navigation and safe destinations

## Result

Implementation and review fixes are complete. The user explicitly accepted headed-browser evidence and authorized finalizing BBP-55, without installation or publication. Source tasks 3.1 through 3.4 are checked. BBP-55 is accepted as done. The default headless verification remains failed, not green.

Before the PR rebase, the full production-overlay fixture passes all 17 tests with headed Chromium. The same binary in headless mode passes 14 tests and fails three native-tab checks, including a plain native anchor. No assertions are skipped. The mode difference is observed; the Chromium failure's cause is not established.

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

The complete 23-test headed suite passes 21 and fails two compact report-width assertions. They expect 390 px but observe 375 px with a native scrollbar. The assertions remain unchanged, and the issue is recorded as BBP-247 with both mode logs attached. This is separate from BBP-245's headless native-tab failures. Neither full browser mode is reported as entirely green after the rebase. Installed acceptance remains unrun.

The named `/deslop` skill is unavailable in this environment. The parent inspected the diff directly before committing. The earlier independent implementation review and finding closures remain recorded above.
