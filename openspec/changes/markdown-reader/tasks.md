# Tasks

## 1. Package and host contract

- [ ] 1.1 Confirm the current SDK declarations for `fileOpener`, its three source kinds, `experimental_lineRange`, `Original`, file reads/previews, source-root lookup, and file/URL navigation against the SDK 0.5.29 / BB >=0.44 baseline; verify the selected symbols exist and record any compatibility blocker before implementation.
- [ ] 1.2 Scaffold `bb-plugin-markdown-reader` using `bb plugin new`, add the frontend/backend entries, scoped CSS, TypeScript configuration, per-package test/typecheck/build scripts, and lockfile; verify `npm ci`, initial `npm test`, and `npm run typecheck` in that package.
- [ ] 1.3 Add `react-markdown`, `remark-gfm`, and an explicit-language lightweight highlighter without raw-HTML or MDX execution dependencies; verify dependency installation and an initial `bb plugin build` succeed.

## 2. Source access and destination safety

- [ ] 2.1 Add test-first coverage at the source module interface for workspace, absolute-host, and thread-storage reads, explicit remote-host identity, missing/disconnected sources, and the 1 MiB/non-text limits; verify the new cases fail for the missing behavior before implementing it.
- [ ] 2.2 Implement validated source-aware read RPC and the SDK adapter with explicit host/root confinement and no write operations; verify all source-loading cases pass and a remote target never reads from the server-local host.
- [ ] 2.3 Add test-first destination cases for same-document fragments, sibling and permitted-parent file links, relative images, external HTTP(S), malformed encodings/URLs, encoded traversal, unsupported schemes, and lexical root escapes. Implement typed resolution and verify lexical rejections produce no SDK read, preview allocation, image request, or navigation. Test SDK symlink-confinement rejection during reader reads and image requests, allowing the attempted SDK operation but no outside-root content. Verify local file links use BB's normal opening behavior with the correct source/host, without a metadata-only precheck or stronger plugin symlink guarantee.
- [ ] 2.4 Implement confined local-image preview transport with bounded expiry, source-change cleanup, and refreshed expired URLs. Verify explicit source host/root, confinement on actual image requests, readable failures, and no cross-source reuse. Root-preview lease allocation before individual asset validation is permitted; do not claim validation before allocation.
- [ ] 2.5 Document supported sources, reader-read/image-request confinement, normal BB local-file opening without an extra plugin symlink guarantee, remote-image network behavior, and document-size limits in the plugin README; verify each documented restriction matches a source/destination test.

## 3. Generic Markdown rendering and document navigation

- [ ] 3.1 Add a representative GFM report fixture and renderer tests for headings, lists, read-only task lists, tables, strikethrough, quotes, links, images, inline code, fenced code, and malicious raw HTML; implement the renderer and verify content semantics are preserved without active document HTML or inferred status badges.
- [ ] 3.2 Add exact fenced-text and highlighting-limit tests, then implement bounded syntax highlighting with plain-code fallback for unknown languages and fences over 20 KiB; verify long lines, whitespace, and compact JSON remain unchanged.
- [ ] 3.3 Generate the outline and rendered headings from the same parse with per-reader DOM IDs and conventional-fragment mapping; verify duplicate/non-ASCII/inline-formatted heading tests and independent mounted-reader navigation pass.
- [ ] 3.4 Connect lexically valid file destinations and external URLs to BB navigation and render relative/remote images with accessible alt text. Verify the frontend harness records the correct source/host targets, fragment navigation stays local, lexical rejections remain inert, and confined image-request failures leave readable alt/error content. Do not require metadata-only validation or claim stronger symlink confinement for native file links.
- [ ] 3.5 Document supported Markdown, disabled active HTML, and relative-link/image behavior in the README; verify examples render or reject as documented in the GFM/security fixtures.

## 4. Reader state, Raw, and fallback

- [ ] 4.1 Register the file opener for `md` and `markdown` and implement the reader's loading/ready/empty/error/unsupported states; verify BB frontend harness tests exercise registration, source changes, stale-request suppression, unmount cleanup, and no unrelated renderer registration.
- [ ] 4.2 Implement Preview/Raw switching using the immutable loaded source; verify tests compare Raw with the complete loaded text, including frontmatter and code whitespace, and demonstrate no write or redundant view-switch read.
- [ ] 4.3 Honor inclusive one-based line-range requests in Raw, highlight/reveal real source lines, and handle repeated range objects; verify initial, repeated, out-of-bounds, and wrapped-line cases without replacing the loaded snapshot.
- [ ] 4.4 Add Refresh, Retry, and Open in BB preview actions using the bound `Original`; verify changed-file refresh, refresh failure/stale labeling, unsupported-size fallback, and non-recursive original-preview delegation.
- [ ] 4.5 Document opener selection, Preview/Raw, line targets, explicit refresh, fallback, and lack of automatic file watching; verify the README workflow corresponds to tested controls rather than unimplemented behavior.

## 5. Approved layout and accessibility

- [ ] 5.1 Recreate the approved mockup's centered reading column, section rhythm, document type hierarchy, table/code treatment, and quiet toolbar using scoped BB theme tokens; verify computed-style/geometry checks and no selectors or content scripts affect BB chat or tab chrome.
- [ ] 5.2 Use container-responsive layout for the wide outline aside, compact disclosure, outline toggle, local horizontal scrolling, and image sizing; verify tests at 390 px, 760 px split-panel width, and 1440 px wide-reader width, including heading-free documents and long tables/code.
- [ ] 5.3 Implement semantic headings/tables, named controls, keyboard activation/focus, and active-theme updates without a reader-owned theme switch; verify keyboard tests, live light/dark transitions, built-in body contrast >=4.5:1, and a custom-token fixture.
- [ ] 5.4 Add a reproducible browser fixture/runner and capture representative light/dark views at the three panel widths; inspect the valid captures against the approved thread-storage mockup and document layout, overflow, contrast, and coverage results in `ACCEPTANCE.md`, reporting browser setup or missing-reference blockers rather than substituting static checks for visual verification.

## 6. Collection integration and completion

- [ ] 6.1 Add the root README entry, plugin README installation/compatibility instructions, `PLUGIN_OVERVIEW.md`, license, and relevant skill documentation for the reader's operating constraints; verify all advertised controls exist, no retired theme is offered, and no unpublished release is presented as available.
- [ ] 6.2 Add the new package to `.github/workflows/tests.yml` without changing unrelated jobs; verify the matrix includes its directory, the committed lockfile supports `npm ci`, and its `npm test` runs under the existing Node 24 CI policy.
- [ ] 6.3 Run the complete new-package tests, typecheck, `bb plugin types . --check`, plugin build, browser checks, and affected collection verification; verify successful results are recorded and any missing browser/live checks are explicitly pending.
- [ ] 6.4 Run the single read-only completion review required by the implement workflow against the full task diff, resolve blocking findings, and rerun affected verification; verify the review result and resolutions are recorded before declaring implementation complete.
- [ ] 6.5 Obtain explicit approval before any local installation or opener-preference change; if authorized, install the built plugin and verify live workspace/host/thread-storage files, one-off Open with, theme changes, safe links/images, Raw/outline/refresh, and disable/original fallback. Record consent and results in `ACCEPTANCE.md`; without authorization, verify installation/preferences remain unchanged and report live acceptance as pending rather than claiming a pass.

## BBP-30 ticket evidence

The approved safety revision is implemented in `bb-plugin-markdown-reader/`. See its `ACCEPTANCE.md` BBP-30 section for destination, image-lifecycle, SDK, and browser evidence. Browser RPC/native-opening/content-denial checks are fixtures. Live source transport, native symlink behavior, and installed-theme acceptance remain pending under 6.5; this ticket does not authorize installation or complete BBP-31/BBP-32.


## BBP-31 ticket evidence

BBP-31 implements bounded fence highlighting (3.2) and verifies the reader's layout, container response, keyboard access and host-token presentation (5.1–5.4). See `bb-plugin-markdown-reader/ACCEPTANCE.md` for the nine-case registered-app browser matrix, inspected capture identities, built-in token provenance, contrast results, clean-install validation and the single completion-review record. Shared epic checklist items above stay open: fixture results do not complete installed/native acceptance under 6.5 or BBP-32.

Single fresh review `e78a440b-369c-4183-bb7e-9ba06678ec34` returned APPROVE BBP-31 with no findings. Its native state is complete with observed runner exit 0. The required reviewer notice failed on unsupported `--message` and was not delivered. The operator authorized finalization despite that notice-only failure; no reviewer retry or replacement is permitted or claimed. The full report, native receipt, authorization, final verification, local commit and task completion receipts are recorded in the ticket's external final handoff and acceptance evidence. This record completes only BBP-31's scope, not the shared epic checklist or installed/native acceptance.
