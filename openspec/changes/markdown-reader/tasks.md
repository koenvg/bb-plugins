# Tasks

## 1. Package and host contract

- [x] 1.1 Confirm the current SDK declarations for `fileOpener`, its three source kinds, `experimental_lineRange`, `Original`, file reads/previews, source-root lookup, and file/URL navigation against the SDK 0.5.29 / BB >=0.44 baseline; verify the selected symbols exist and record any compatibility blocker before implementation.
- [x] 1.2 Scaffold `bb-plugin-markdown-reader` using `bb plugin new`, add the frontend/backend entries, scoped CSS, TypeScript configuration, per-package test/typecheck/build scripts, and lockfile; verify `npm ci`, initial `npm test`, and `npm run typecheck` in that package.
- [x] 1.3 Add `react-markdown`, `remark-gfm`, and an explicit-language lightweight highlighter without raw-HTML or MDX execution dependencies; verify dependency installation and an initial `bb plugin build` succeed.

## 2. Source access and destination safety

- [x] 2.1 Add test-first coverage at the source module interface for workspace, absolute-host, and thread-storage reads, explicit remote-host identity, missing/disconnected sources, and the 1 MiB/non-text limits; verify the new cases fail for the missing behavior before implementing it.
- [x] 2.2 Implement validated source-aware read RPC and the SDK adapter with explicit host/root confinement and no write operations; verify all source-loading cases pass and a remote target never reads from the server-local host.
- [x] 2.3 Add test-first destination cases for same-document fragments, sibling and permitted-parent file links, relative images, external HTTP(S), malformed encodings/URLs, encoded traversal, unsupported schemes, and lexical root escapes. Implement typed resolution and verify lexical rejections produce no SDK read, preview allocation, image request, or navigation. Test SDK symlink-confinement rejection during reader reads and image requests, allowing the attempted SDK operation but no outside-root content. Verify local file links use BB's normal opening behavior with the correct source/host, without a metadata-only precheck or stronger plugin symlink guarantee.
- [x] 2.4 Implement confined local-image preview transport with bounded expiry, source-change cleanup, and refreshed expired URLs. Verify explicit source host/root, confinement on actual image requests, readable failures, and no cross-source reuse. Root-preview lease allocation before individual asset validation is permitted; do not claim validation before allocation.
- [x] 2.5 Document supported sources, reader-read/image-request confinement, normal BB local-file opening without an extra plugin symlink guarantee, remote-image network behavior, and document-size limits in the plugin README; verify each documented restriction matches a source/destination test.

## 3. Generic Markdown rendering and document navigation

- [x] 3.1 Add a representative GFM report fixture and renderer tests for headings, lists, read-only task lists, tables, strikethrough, quotes, links, images, inline code, fenced code, and malicious raw HTML; implement the renderer and verify content semantics are preserved without active document HTML or inferred status badges.
- [x] 3.2 Add exact fenced-text and highlighting-limit tests, then implement bounded syntax highlighting with plain-code fallback for unknown languages and fences over 20 KiB; verify long lines, whitespace, and compact JSON remain unchanged.
- [x] 3.3 Generate the outline and rendered headings from the same parse with per-reader DOM IDs and conventional-fragment mapping; verify duplicate/non-ASCII/inline-formatted heading tests and independent mounted-reader navigation pass.
- [x] 3.4 Connect lexically valid file destinations and external URLs to BB navigation and render relative/remote images with accessible alt text. Verify the frontend harness records the correct source/host targets, fragment navigation stays local, lexical rejections remain inert, and confined image-request failures leave readable alt/error content. Do not require metadata-only validation or claim stronger symlink confinement for native file links.
- [x] 3.5 Document supported Markdown, disabled active HTML, and relative-link/image behavior in the README; verify examples render or reject as documented in the GFM/security fixtures.

## 4. Reader state, Raw, and fallback

- [x] 4.1 Register the file opener for `md` and `markdown` and implement the reader's loading/ready/empty/error/unsupported states; verify BB frontend harness tests exercise registration, source changes, stale-request suppression, unmount cleanup, and no unrelated renderer registration.
- [x] 4.2 Implement Preview/Raw switching using the immutable loaded source; verify tests compare Raw with the complete loaded text, including frontmatter and code whitespace, and demonstrate no write or redundant view-switch read.
- [x] 4.3 Honor inclusive one-based line-range requests in Raw, highlight/reveal real source lines, and handle repeated range objects; verify initial, repeated, out-of-bounds, and wrapped-line cases without replacing the loaded snapshot.
- [x] 4.4 Add Refresh, Retry, and Open in BB preview actions using the bound `Original`; verify changed-file refresh, refresh failure/stale labeling, unsupported-size fallback, and non-recursive original-preview delegation.
- [x] 4.5 Document opener selection, Preview/Raw, line targets, explicit refresh, fallback, and lack of automatic file watching; verify the README workflow corresponds to tested controls rather than unimplemented behavior.

## 5. Approved layout and accessibility

- [x] 5.1 Recreate the approved mockup's centered reading column, section rhythm, document type hierarchy, table/code treatment, and quiet toolbar using scoped BB theme tokens; verify computed-style/geometry checks and no selectors or content scripts affect BB chat or tab chrome.
- [x] 5.2 Use container-responsive layout for the wide outline aside, compact disclosure, outline toggle, local horizontal scrolling, and image sizing; verify tests at 390 px, 760 px split-panel width, and 1440 px wide-reader width, including heading-free documents and long tables/code.
- [x] 5.3 Implement semantic headings/tables, named controls, keyboard activation/focus, and active-theme updates without a reader-owned theme switch; verify keyboard tests, live light/dark transitions, built-in body contrast >=4.5:1, and a custom-token fixture.
- [x] 5.4 Add a reproducible browser fixture/runner and capture representative light/dark views at the three panel widths; inspect the valid captures against the approved thread-storage mockup and document layout, overflow, contrast, and coverage results in the task's acceptance record, reporting browser setup or missing-reference blockers rather than substituting static checks for visual verification.

## 6. Collection integration and completion

- [x] 6.1 Add the root README entry, plugin README installation/compatibility instructions, `PLUGIN_OVERVIEW.md`, license, and relevant skill documentation for the reader's operating constraints; verify all advertised controls exist, no retired theme is offered, and no unpublished release is presented as available.
- [x] 6.2 Add the new package to `.github/workflows/tests.yml` without changing unrelated jobs; verify the matrix includes its directory, the committed lockfile supports `npm ci`, and its `npm test` runs under the existing Node 24 CI policy.
- [x] 6.3 Run the complete new-package tests, typecheck, `bb plugin types . --check`, plugin build, browser checks, and affected collection verification; verify successful results are recorded and any missing browser/live checks are explicitly pending.
- [x] 6.4 Run the single read-only completion review required by the implement workflow against the full task diff, resolve blocking findings, and rerun affected verification; verify the review result and resolutions are recorded before declaring implementation complete.
- [x] 6.5 Obtain explicit approval before any local installation or opener-preference change. Record the approved local installation, source/transport results, rollback or preserved prestate, and browser acceptance for themes, links/images, Raw/outline/refresh and bound fallback in the task's acceptance record. Under Koen's revised acceptance decision, browser evidence is sufficient; record remaining native desktop checks as waived, not passed.

## BBP-30 ticket evidence

The approved safety revision is implemented in `bb-plugin-markdown-reader/`. The BBP-30 destination, image-lifecycle, SDK, and browser evidence remains in Git history. Browser RPC/native-opening/content-denial checks are fixtures. Live source transport, native symlink behavior, and installed-theme acceptance remain pending under 6.5; this ticket does not authorize installation or complete BBP-31/BBP-32.


## BBP-31 ticket evidence

BBP-31 implements bounded fence highlighting (3.2) and verifies the reader's layout, container response, keyboard access and host-token presentation (5.1–5.4). The historical acceptance record in Git history contains the nine-case registered-app browser matrix, inspected capture identities, built-in token provenance, contrast results, clean-install validation and the single completion-review record. Shared epic checklist items above stay open: fixture results do not complete installed/native acceptance under 6.5 or BBP-32.

Single fresh review `e78a440b-369c-4183-bb7e-9ba06678ec34` returned APPROVE BBP-31 with no findings. Its native state is complete with observed runner exit 0. The required reviewer notice failed on unsupported `--message` and was not delivered. The operator authorized finalization despite that notice-only failure; no reviewer retry or replacement is permitted or claimed. The full report, native receipt, authorization, final verification, local commit and task completion receipts are recorded in the ticket's external final handoff and acceptance evidence. This record completes only BBP-31's scope, not the shared epic checklist or installed/native acceptance.

## BBP-32 assembled evidence

The checklist now cites completed child evidence and the new assembled checks in the historical acceptance record. Items 1.1–1.3 and 3.1 cite the BBP-27 SDK/package/test-first record. Items 2.1–2.2 and 4.1–4.5 cite BBP-28 source/RPC/state evidence and BBP-29 line targeting. Items 2.3–2.5 and 3.4–3.5 cite BBP-30's approved destination revision, original review verdict and separate fixes. Item 3.3 cites BBP-29's parse/navigation record and footnote correction. Items 3.2 and 5.1–5.4 cite BBP-31's bounded highlighting and inspected matrix, plus BBP-32's new early/final visual inspection and passing browser runners. No earlier historical verdict changes.

Items 6.1–6.3 cite existing root README/CI/license integration, corrected reader README/overview, unchanged package/lock/collection records, and BBP-32's Node 24.15.0 clean install, 221 tests, typecheck, SDK check, build, and browser evidence. The reader registers no agent skill; its relevant operating constraints are documented in README/overview. Final strict OpenSpec, scope/lock/collection, capture and whitespace receipts are in the BBP-32 handoff. Missing native checks are explicitly pending, as required by 6.3.

The sole fresh full-epic review `a68e18da-e136-4144-8da7-04ac1e5b538f` is collected. Its original verdict is APPROVE CODE; HOLD ACCEPTANCE AND MERGE. No code blockers were found. Native state is complete with observed runner exit 0; the last owner-only notice succeeded. The full runtime-bound report and exact lifecycle/terminal evidence are under `/Users/koen/.bb/thread-storage/thr_dpkwwej5k4/bbp-32/`. Item 6.4 remains open because acceptance finding A1 is unresolved; no second review or waiver is claimed. Item 6.5 remains open. Local leaf installation was approved, all three local-host transport sources and selected installed UI behavior passed, and the reader was disabled/removed with unrelated plugin state preserved. Native modifiers, native URL opening, and the outside-workspace absolute-host UI route remain unverified. Only the measured current installed theme and local host are certified; fixtures do not prove other installed themes or remote transport. BBP-32 and BBP-26 stay in progress while required acceptance is open.


## BBP-32 A1 continuation

Separate `a1-resolution/` evidence preserves the sole review, native records, held bundle, and original APPROVE CODE; HOLD ACCEPTANCE AND MERGE verdict. The installed registered-opener UI displayed the outside-workspace host file with an explicit matching host/source and exact 394-character Raw/hash through the public revision-checked thread-tab route. Actual trusted ordinary HTTP and Mac Meta file/URL clicks were exercised, but no destination page or URL GET was observed in the owned hidden automation profile. Their outcomes are not acceptance passes; no cause or code defect is established. The exact reader installation was disabled/removed, owned tabs/sessions/listener were cleaned up, and pre-existing plugin source/enabled state was preserved without removing an unrelated concurrent addition. Durable manual fixture assets and an actual-BB-window check are available in `MANUAL-CHECK.md`. Items 6.4/6.5 remain open. No new reviewer, waiver, production-code change, completion commit, or done status is claimed.

## BBP-32 user UI correction

Koen authorized scoped list-marker and header corrections after the original review. The public rendered Reader tests first failed for missing filename/group/fallback placement; the registered fixture under the host list reset first failed with native markers absent. Reader-owned CSS now restores decimal/disc/nested markers without changing ordered starts, footnotes or mixed-task semantics. The header separates filename/path identity, Preview/Raw and secondary Outline/Refresh; Original remains same-source and appears only in failed/unsupported status beside Retry. Exact Raw, source/destination safety, dependencies, lockfiles and root integration are unchanged.

Separate `user-ui-correction/` evidence records red/green checks, 226 passing tests, typecheck/SDK/build, all six browser runners, bounded visual inspection, final detector and the targeted same-source reader reload. The reader was already present/enabled at entry and remains so; the earlier removal records are historical. The original review and native records are unchanged and do not certify the new UI code. Its binding APPROVE CODE; HOLD ACCEPTANCE AND MERGE verdict remains in force. Native URL/modifier opening and items 6.4/6.5 remain open; this is a held, unstaged handoff with no new reviewer or completion commit.


## Browser acceptance decision and checklist closure (2026-10-04)

Koen explicitly accepted browser verification, waived the remaining native desktop acceptance checks, and approved the displayed UI. This supersedes the native-only gate in the historical notes above. Items 6.4 and 6.5 are complete under that revised requirement, and the checklist has no open items.

The single full-epic review remains recorded with its original APPROVE CODE; HOLD ACCEPTANCE AND MERGE verdict. Its native acceptance finding A1 is resolved by operator waiver, not by a native pass or another review. Later user-requested UI changes retain separate owner/parent verification. Final evidence includes 226 passing tests, all six browser fixture runners, typecheck/SDK/build/OpenSpec checks, inspected responsive captures, and the approved local reader's preserved source/enabled state. PR #84's nine CI jobs also passed.

Native ordinary HTTP(S), Command-click URL/file destination effects and the remaining conventional host/Original check were not proved and are skipped by operator decision. Other installed themes and remote hosts remain untested coverage limits. Historical review and acceptance records remain in Git history.
