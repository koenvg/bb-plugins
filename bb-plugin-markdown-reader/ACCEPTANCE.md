# BBP-27 first reader evidence

## Scope

Starting commit: `3425edb839388a72fe8ac5ac5240cc573b8372b8`.
Environment: `env_72hcdkd9km`, branch `bb/bbp-26-markdown-reader-thr_e4syayprwm`.

This delivery covers workspace loading, generic Markdown/GFM, exact read-only Raw, basic reader state, bounded content, scoped layout, and bound BB fallback. Host/storage expansion, full heading/line navigation, safe destinations/images, syntax highlighting, and the final visual matrix remain with their own tickets.

The approved HTML attachment at `/tmp/bbp-26-markdown-reader/markdown-reader.html` was inspected as a spacing/type/layout reference. Its shortened Raw and inferred report decorations were not copied.

## Current SDK contract

Scaffolded with `bb plugin new markdown-reader`. Verified the installed declarations in `node_modules/@get-bb/plugin-sdk/bundled-types/` against SDK 0.5.29 and BB 0.44.0.

- `definePluginApp` registers through `app.slots.fileOpener`, not a top-level fileOpener method.
- `PluginFileOpenerProps` carries path, source identity, optional requested line range, and the bound `Original` component. Only live files use this slot.
- `environments.get` provides explicit host, project, status, and nullable workspace root.
- `projects.get` provides project sources with explicit hosts and roots. Ambiguous candidates fail closed.
- `threads.get` provides the thread's project and environment identity.
- `files.read` accepts explicit host, absolute path, and root confinement. It returns text/encoding, size, and hash. It has no stat or maximum-byte read parameter. Oversized content can reach the server before rejection; the reader does not receive or parse it.
- No private/core imports, writes, previews for assets, or URL/file navigation calls are used. Later tickets must verify their additional contracts before adding them.

No compatibility blocker was found for the implemented methods.

## Test-first and automated checks

The initial test run failed because the new source interface did not exist and the scaffold did not yet provide the reader. Behavioral coverage then passed after implementation. The first rendered-reader run also caught the wrong registration owner, which was corrected to the declared `app.slots` contract.

Final pre-review verification under Node 24.15.0:

| Command | Result |
| --- | --- |
| `npm ci` | Pass, clean lockfile install, 0 reported vulnerabilities |
| `npm test` | Pass, 33 tests in 3 files |
| `npm run typecheck` | Pass with SDK declarations checked, no skipLibCheck |
| `bb plugin types . --check` | Pass, package and host SDK both 0.5.29 |
| `bb plugin build` | Pass, server/app JS, CSS, maps, and metadata emitted |
| `git diff --check` | Pass |
| Collection README/matrix checks | Pass, one new reader row and one CI package entry; Node 24 policy unchanged |

Coverage includes explicit remote host/root routing, project and thread-backed workspace identity, mismatches and missing/ambiguous roots, literal path rejection, UTF-8 byte limits, empty/non-text content, SDK confinement failures, actual wire validation, opener registration, immutable Raw exactness, no view-switch reads, ordinary GFM, inactive HTML/links/images, loading, refresh/error/retry, late results, unmount, keyboard controls, large plain fences, and bound Original without recursive navigation. Private helpers are not test seams.

## Browser evidence

An early 760 px representative preview was captured and inspected before the complete check set. Its 680 px prose column, heading rhythm, table treatment, and quiet toolbar follow the approved reference without copying tab chrome or report metadata.

Browser-use's default browser could not start. Its doctor and install command reported success, but open still reported that no local browser path was available. Local Playwright Chromium provided the fixture checks instead. No signed-in browser or BB installation was used.

Reproducible command, with the fixture server ready on port 4173:

```sh
uvx --with playwright python tests/browser-check.py --url http://127.0.0.1:4173 --out /tmp/bbp-27-browser
```

| Reader container | Fixture tokens | Prose width/type | Content padding | Result |
| --- | --- | --- | --- | --- |
| 760 px | Light | 680 px, 16/28 px | 52/40/80 px | Pass |
| 390 px inside 1100 px viewport | Dark | 342 px, 15/27 px | 38/24/64 px | Pass |
| 1440 px | Custom | 720 px, 16/28 px | 68/48/100 px | Pass |

All three checks confirmed reachable wrapping toolbar buttons, no panel-wide horizontal overflow, local code scrolling, exact Raw, keyboard view/fallback activation, visible focus, and retained content/view after live token changes. The narrow wide-table check confirmed local horizontal scrolling. No browser page errors occurred. The narrow and wide captures were inspected, not accepted from geometry alone.

Artifacts: `/tmp/bbp-27-early-760.png`, `/tmp/bbp-27-browser/{reader-760-light.png,reader-390-dark.png,reader-1440-custom.png,results.json}`. Durable copies and validation logs are in `/Users/koen/.bb/thread-storage/thr_g7ij8zzpca/bbp-27/`. The four PNGs and browser results are attached to BBP-27; the review and final evidence record are attached at completion.

These are illustrative fixture tokens, not installed BB light/dark themes. This is first-reader evidence, not the final six-view visual matrix, built-in theme contrast certification, full custom-theme acceptance, or live BB preference/routing validation.

## Completion review

The single fresh-context read-only reviewer approved BBP-27 with no blocking correctness or maintainability findings. Run: `29fc9ca4-4873-4e60-a9fd-e921d91d15c2`, completed 2026-10-03 at 14:56 UTC. It reviewed the complete working-tree diff against the starting commit, including all 27 new package files. No fix was required and no second reviewer was launched.

Review evidence: `/Users/koen/.bb/thread-storage/thr_g7ij8zzpca/bbp-27/completion-review.md`. The reviewer independently reran `npm test -- --no-cache` and `npm run typecheck` in the package, with 33 tests and the strict typecheck passing. Tracked and untracked whitespace checks passed. It inspected the complete lockfile, current SDK declarations, build metadata/logs, and saved browser evidence. Its initial npm command used the collection root and failed because that directory has no package.json; the corrected package command passed.

The approval covers BBP-27 only. The reviewer kept the documented live-check limits and later-ticket features separate from this ticket's completion gate. No reader behavior changed after the review. This evidence record was updated and two trailing blank lines in vendored support files were removed after the staged whitespace check found them. Final package tests, typecheck, build, and staged whitespace/scope checks passed.

## Installation and remaining checks

No plugin install, reload, theme selection, opener preference change, publication, push, or PR command ran. The plugin inventory confirms `markdown-reader` is absent. BB's actual opener arbitration, remote host transport, and live host-token inheritance remain untested without installation. Installation is excluded from this ticket; final live acceptance remains with the parent and the final verification ticket.


# BBP-28 source and refresh evidence

## Ticket baseline and scope

Ticket review baseline: `c3e4fb79d421082f2fad7d062ee03127be9896bd`, verified HEAD with a clean worktree before edits. Owner: `thr_kuizsnpfmm`, same shared environment `env_72hcdkd9km` and branch as BBP-27. Native blocker BBP-27 is done. The full epic baseline remains `3425edb839388a72fe8ac5ac5240cc573b8372b8` for the parent and BBP-32.

This ticket extends the existing reader, not its layout or parser. It adds absolute-host and thread-storage loading, explicit stale state, overlapping Refresh safety, integration tests, and source documentation. Links/images remain inert. Heading/line navigation, highlighting, and the final theme/responsive matrix remain with their own tickets. No other plugin package or core code changed. Earlier BBP-27 records above are preserved as historical evidence.

## Verified SDK routing and limits

`bb plugin types . --check` confirms package and host SDK 0.5.29. The installed declarations define `PluginFileOpenerSource`, `threads.get`, `environments.get`, `projects.get`, `threads.storageLocation`, and `files.read`. The extra storage adapter method takes the actual thread ID and returns `{ hostId, storageRootPath }`.

Source behavior was also checked against exact BB `desktop-v0.44.0` source, commit `0baa605b32a00619c1d7e3f32be6553ebcf8244a`, SDK 0.5.29. The initial reference clone used a newer default branch; it was moved to this matching release before final contract validation.

- `apps/app/src/components/plugin/file-opener-tabs.ts` supplies explicit `experimental_hostId` for host-only tabs, or thread/environment identity for thread-host tabs. Its source fields have no permitted host-root field.
- Absolute-host reads use that explicit host or a validated environment host. A supplied thread resolves its actual environment. Missing or inconsistent identities fail closed, including a host assertion that cannot verify a thread with no environment. Project-only host targets do not select a default workspace host.
- Absolute-host roots are the containing directory. Workspace roots stay the environment or selected project source root. Storage roots come only from `threads.storageLocation({ threadId })`. No data-directory construction, guessed thread/environment ID, or server-local host fallback occurs.
- `apps/server/src/routes/threads/data.ts` resolves storage from the named thread. The plugin passes the source thread ID unchanged to this SDK method and uses its returned host/root.
- `apps/server/src/routes/files.ts` forwards the supplied host/path/root through the daemon read command. `apps/host-daemon/src/command-handlers/file-read.ts` checks real paths against the root and reports invalid UTF-8 as base64. Tests inject these documented SDK rejection responses at the approved adapter seam. They are not live remote or daemon integration tests.
- The RPC remains one strict opener-target input and one bounded reader result. Frontend-supplied roots and arbitrary filesystem operations are rejected. All observed SDK calls are source lookup or `files.read`. No writes, asset previews, navigation, local installation, reload, preference changes, theme changes, publication, push, or PR actions ran.
- The reader accepts full UTF-8 source up to 1 MiB. It checks reported size and actual UTF-8 byte length before returning a snapshot. Base64/invalid Unicode text, non-text controls, and oversized source never reach the reader parser. Empty, Unicode, BOM, valid replacement characters, CRLF, and source spaces remain unchanged.
- The inspected SDK has no stat or maximum-byte read argument. Oversized source can transfer to the plugin server before rejection. The reader limit does not bound SDK transfer.

## State and test-first evidence

The first focused checkpoint had 28 expected failures for the missing host/storage behavior, malformed UTF-8 rejection, stale labels, and overlapping refresh requests. A second focused checkpoint had two expected failures for unverified host thread/project identities. Both checkpoints are saved in `red.log` and `identity-red.log`; the corresponding source and rendered-reader checks passed after implementation.

Preview and Raw share the loaded immutable source. View changes do not refetch or write. Refresh keeps the last useful snapshot visible with an explicit unverified label while reading. A failed read or unsupported refresh reports its failure and labels the retained snapshot stale in either view. Retry clears that label only after a successful read. Source-identity changes remount the reader. Superseded initial reads and refreshes, fallback, and unmount discard late success or error results. No polling or automatic watching was added.

The final suite has 99 tests in five files. Coverage includes each source and remote identity; missing/mismatched identities; literal paths, Windows roots/files, UNC paths, traversal/device/encoded/alternate-stream rejection; explicit confined reads and SDK symlink rejection; read-only wire transport; exact Raw; refreshed content; source/host/refresh races; unmount; missing/access/disconnection Retry; empty, size, encoding and non-text states; stale snapshots after failed refresh; and bound Original without recursive navigation.

`tests/source-reader.test.tsx` joins the real plugin source module and server RPC with the rendered registered opener through the controlled SDK adapter. Its assertions check the actual read calls and displayed source across all three source kinds. This is source/UI integration evidence, not an invented installed-BB result.

## Validation and fixture evidence

Commands ran serially where they share resources. Node is 24.15.0 and BB is 0.44.0.

| Command/check | Result |
| --- | --- |
| `npm ci` | Pass, clean lockfile install, 0 reported vulnerabilities |
| `npm test` | Pass, 99 tests in 5 files |
| `npm run typecheck` | Pass, strict SDK declaration checking |
| `bb plugin types . --check` | Pass, SDK 0.5.29 matches host |
| `bb plugin build` | Pass, app/server bundles, CSS, maps and metadata |
| `uvx --with playwright python tests/browser-refresh-check.py --url http://127.0.0.1:4173 --out <evidence-dir>` | Pass, retained stale Preview and Raw, failed Retry, bound Original, 760 px reader without horizontal overflow, no page errors |
| `uvx --with playwright python tests/browser-check.py --url http://127.0.0.1:4173 --out <evidence-dir>/layout` | Pass, prior layout regression checks at 760 light, 390 dark and 1440 custom fixture tokens |

The new 760 px stale-state capture was inspected before the final check set. A scoped 28 px gap separates state text/Retry from the retained document. A second capture confirms that separation, readable state text, reachable controls, and the unchanged prose rhythm. `tests/preview.tsx` supports `?refresh=error` for the reproducible failure fixture. The browser-use default browser again failed to find a local browser path; local Playwright Chromium ran these unsigned fixture checks. The fixture server and browser session were stopped after validation.

Evidence directory: `/Users/koen/.bb/thread-storage/thr_kuizsnpfmm/bbp-28/`. It contains baseline and validation logs, `refresh-stale-760.png`, `refresh-results.json`, and the layout regression captures/results. This is not a final six-view visual matrix, built-in contrast certification, or live BB routing/fallback/theme test.

## Completion gate

The single fresh-context read-only reviewer approved BBP-28 with no blocking correctness, safety, scope, or maintainability findings. Run: `2658cb8d-088c-4d95-8b2c-903ea2480549`, completed `2026-10-03T16:15:51.581Z`. It reviewed the complete working-tree diff from the recorded ticket baseline, including all three untracked test files. No fix or second review was needed.

Full report: `/Users/koen/.bb/thread-storage/thr_kuizsnpfmm/bbp-28/completion-review.md`. The reviewer independently passed `npm test -- --no-cache`, 99 tests in five files, strict typecheck, SDK 0.5.29 compatibility, tracked/untracked whitespace, permitted scope, lockfile/collection integration, and preservation of the earlier acceptance record. It inspected the build/install logs, source/UI integration tests, exact BB 0.44.0 routing/confinement source, browser results, and stale-state capture. It did not rerun npm ci, build, or browser checks during the read-only review.

The run status is complete with its approval report and saved result available. The runtime also reports process terminal pending. This does not prevent collection of the completed review evidence. The parent confirmed the same approval report before this final handoff. No reviewer was resumed or rerun.

Final post-review package tests, strict typecheck, current SDK compatibility, plugin build, collection scope/lock/README/CI checks, and tracked/untracked whitespace checks passed. Only this acceptance record changed after review; no reader behavior or tests changed. All BBP-28 acceptance and completion gates passed. The scoped local commit and final clean-worktree check are recorded in the external handoff and task record to avoid placing a self-referencing commit hash in this file.

Remaining limits are unchanged. No plugin installation/reload, opener preference or theme changes, publication, push, PR, or next-ticket launch occurred. Live BB and actual remote transport remain untested. Symlink rejection uses the inspected SDK contract and controlled rejection tests, not a hostile live filesystem test. The 1 MiB reader limit does not bound transfer to the server. Fixture evidence does not certify final host-theme contrast or the full visual matrix.

# BBP-29 heading and source-line navigation evidence

## Baseline and scope

Ticket baseline: `c395f8ef34917940d1b4ad06eb8258c5ed566424`. HEAD and the worktree were clean before edits. Owner: `thr_34avqdjac3`, child of `thr_e4syayprwm`, in `env_72hcdkd9km` on the existing epic branch. Native blocker BBP-27 is done. The epic baseline remains `3425edb839388a72fe8ac5ac5240cc573b8372b8` for BBP-32. The task was attached to this child and remained in_progress through review and correction. Final task/commit state is recorded in the external handoff.

All changes are inside this package. The existing source/server flow, immutable snapshots, Refresh/Retry states, race suppression, Original fallback, plain fences, and inactive file/external links and images remain. Earlier acceptance records above are an unchanged byte prefix. No other ticket, plugin, collection file, core/SDK code, or host theme was changed.

## Contract and implementation

Read the ticket, current plugin-authoring/testing guidance, DESIGN.md, all OpenSpec plans, the five epic attachments, package modules/tests/docs, earlier handoffs/review, and parent orchestration record. The four Markdown attachments match their OpenSpec files byte for byte. The HTML is a spacing/type reference, not a Raw source fixture.

The installed SDK 0.5.29 declaration defines nullable `experimental_lineRange` with `startLineNumber` and `endLineNumber`. Bounds are inclusive and one-based. Each new object is a new intent, including equal values; null is untargeted. The app forwards this prop separately from the memoized source target and remount key.

- One react-markdown synchronous parse/render builds the document model. A rehype transform records heading labels, levels, source positions, GitHub-style fragments, and targets on that exact rendered tree. There is no independent heading parser. Inline formatting, code/link text, image alt text, Unicode, duplicate and suffix collisions, Setext, quoted and empty headings stay aligned with rendered content. Raw HTML and fenced text do not create outline entries.
- React useId supplies each mounted reader's namespace. Known document fragments map to local IDs. Heading activation prevents browser hash navigation and scrolls/focuses only this reader, including keyboard and middle/modifier activation. File/external links, images, missing and malformed fragments remain inert.
- ResizeObserver measures the reader panel. Above 1080 px, the outline has a 164 px aside with a 60 px gap beside the 720 px bounded prose column. Constrained readers use a closed inline disclosure. Outline hides it and reclaims document space. No headings means no empty outline/toggle. Fallback and unmount dispose the observer.
- Raw retains exact source-line slices, including CRLF, final newline/empty line, Unicode, frontmatter, and code spaces. Wrapped visual rows share one source-line target. Requests select Raw, highlight the inclusive normalized range, and reveal/focus its start after load. Repeated objects reveal again. Manual view switches remain possible. Line-only changes preserve the read and model.
- Reversed integer bounds are ordered and clamped. Malformed, fractional, non-finite, and unsafe integer bounds do not highlight; empty text has no highlight. Removing a request clears highlights without changing the manual view choice. Navigation never writes the source.

The new navigation fixture deliberately contains CRLF and trailing source/code spaces. Its package-local .gitattributes rule prevents line-ending conversion and permits only this fixture's intentional end-of-line whitespace. Other changed files use normal whitespace checks.

## Test-first and validation

Focused red/green logs cover the missing document model, outline disclosure/hide controls, source-line model, and initial/repeated Raw targeting. An early test fixture accidentally included Original in an RPC snapshot; it was corrected to a JSON-only target before the outline red checkpoint. Typecheck caught a non-iterable DOM NodeList use, invalid Testing Library exact options, and an incomplete ResizeObserver test entry. All were corrected before final verification.

Node 24.15.0 and BB 0.44.0. Pre-review package commands ran serially:

| Command/check | Result |
| --- | --- |
| `npm ci` | Pass, lockfile install, 0 reported vulnerabilities. Existing prebuild-install dependency emits a deprecation warning. |
| `npm test` | Pass, 117 tests in 7 files, including all earlier behavior checks. |
| `npm run typecheck` | Pass, strict declarations, skipLibCheck false. |
| `bb plugin types . --check` | Pass, package and host SDK 0.5.29. |
| `bb plugin build` | Pass, server/app bundles, CSS, maps and metadata. |
| Source/RPC/registered-reader navigation integration | Pass for all three sources, one actual controlled SDK read, no writes or navigation calls for repeated line props. |
| `tests/browser-navigation-check.py` | Pass at 1440 light, 760 light and 390 dark fixture widths, plus dynamic panel resize, no-heading document, independent readers and initial Raw target. |
| Existing `tests/browser-check.py` | Pass, previous 760 light / 390 dark / 1440 custom-token checks. |
| Existing `tests/browser-refresh-check.py` | Pass, retained stale Preview/Raw, Retry, bound Original and no panel overflow. |
| Collection/scope/whitespace checks | Pass, 22 package-only files; collection README/CI and source/server unchanged, lock declarations match, prior acceptance byte prefix preserved, tracked and untracked whitespace clean. |
| Plugin inventory | Markdown Reader absent; fixture browser/session and server stopped. |

Model/UI tests cover duplicate/non-ASCII/inline headings, six levels, conventional fragments and collisions, local keyboard focus, independent reader IDs, compact disclosure, hide/reclaim state, no headings, observer disposal, initial/repeated/changed requests before and after reads, clamping, malformed and empty inputs, exact Raw/wrapped lines, no line-only reload/model replacement, source switching, and the existing source/race/fallback suite.

## Browser evidence and limits

Inspected early 1440 px aside and 760 px closed disclosure captures before the full checks. Inspected all saved navigation, layout regression, and stale-state views. The approved reading spacing/type remains usable, the toolbar stays reachable, keyboard focus is visible, and a wrapped highlighted Raw line remains one real source-line target. Browser assertions confirm local-only scroll/focus, no reopening/hash change, exact CRLF Raw, repeated reveal without remount/read, clamping, no reader-wide overflow, and no page errors.

Browser-use's default managed browser could not find a local browser path. Local unsigned Playwright Chromium ran the fixture checks. The first navigation runner expected two clamped final lines; this fixture has 55 CRLF terminators and a final empty source line, so the correct count is three. The runner was corrected before its passing result. This was a test expectation error, not a reader change.

Reproduce with `npm run preview:fixture -- --port 4173 --strictPort`, then `uvx --with playwright python tests/browser-navigation-check.py --url http://127.0.0.1:4173 --out /tmp/bbp-29-browser`. The README lists prior layout/refresh commands. Saved evidence is in `/Users/koen/.bb/thread-storage/thr_34avqdjac3/bbp-29/`, including early captures, navigation/layout/refresh subdirectories, results JSON and checkpoint/final logs.

These captures use illustrative fixture tokens, not installed BB themes. No install/reload, opener preference change, host theme change, publication, push, or PR occurred. Live BB navigation/transport/Original and native theme contrast remain unverified. The final theme/responsive matrix stays with BBP-31/32. Safe file/external links/images and syntax highlighting remain with BBP-30/31. The existing SDK transfer-size limit remains unchanged.

## Completion review

The single fresh-context read-only run `23685e4a-b540-4c40-be44-ba708dd67275` completed at `2026-10-03T17:58:12.046Z`. It reviewed the complete baseline diff and all nine untracked files. Its exact verdict was REQUEST CHANGES BBP-29 with one P1 blocker, not approval. No separate structural blocker was found. The reviewer independently passed 117 tests, strict typecheck, SDK compatibility, scope and whitespace checks, and inspected saved build/browser evidence.

Collected this exact completed run and its full report after the BB-native owner-only notice. Native state is complete with output present, although process terminal remains pending. This did not block collection. The original report remains unchanged at `/Users/koen/.bb/thread-storage/thr_34avqdjac3/bbp-29/completion-review.md`, with the saved runtime result in `native-review-result.json`. The notice alone was not used as approval. No reviewer was resumed and no second pass or worker was launched.

### P1 correction and affected checks

The reviewer reproduced a crash for valid used footnotes. The Markdown pipeline generates a hidden Footnotes h2 without a source position. The collector assumed that all h1-h6 nodes had source positions, so model creation failed even for initial Raw requests.

Reproduced the blocker first with four new model/UI regression cases. The saved `footnote-red.log` shows the same undefined source-position error. The correction makes the source-heading boundary explicit in the same HAST transform. Positionless generated labels do not become source outline entries or get fake source lines. Passive footnote text remains intact. Generated IDs and their references are namespaced before source heading IDs are assigned, and inert reference spans preserve their local accessibility descriptions. Scoped CSS retains the generated label's screen-reader-only presentation. No second parser or active footnote/file/image navigation was added.

`footnote-green.log` passes 19 focused tests. These include used footnotes with/without source headings, repeated references, independent reader IDs, local accessibility references, initial targeted Raw, exact CRLF text, and absence of an invented/empty outline. The strict focused typecheck also passes.

Post-correction verification passed:

| Command/check | Result |
| --- | --- |
| `npm test -- --no-cache` | 121 tests in 7 files. |
| `npm run typecheck` | Strict declaration check passes. |
| `bb plugin types . --check` | Package/host SDK 0.5.29. |
| `bb plugin build` | BB 0.44.0 bundles, CSS, maps and metadata. |
| All three browser runners | Navigation, previous layout and Refresh/Retry/fallback regression checks pass, no page errors. New used-footnote fixtures pass initial exact Raw, source-only outline and local accessibility-reference checks. |

Post-correction captures/results live in `post-review/{navigation,layout,refresh}/`. All 11 prior view captures are byte-identical to the previously inspected views. The two new footnote captures were inspected and show passive note content, a correct source-only outline when a source heading exists, and no outline when it does not. The fixture browser and server were stopped again.

The single review's P1 finding is resolved by the implementation owner and passing regression/affected checks. The original REQUEST CHANGES verdict is preserved; no claim of a second approval is made. This meets the workflow's one-review-and-resolve gate. All BBP-29 implementation criteria and affected validation now pass. Final scope/whitespace, local commit, attachments, and clean-worktree evidence are recorded in the external handoff and task record. No other ticket was started. Live BB/theme limits above remain unchanged.

# BBP-30 links and images evidence

## Baseline and approved contract

Ticket baseline and completion-review fixed point: `939787ca567d91a0e48111a663a692528dcd3a01`. Sole implementation owner: `thr_knbpuaqpd5`, parent `thr_e4syayprwm`. Environment and branch are unchanged. BBP-28 is natively done. The four approved OpenSpec files carry the operator's revised safety contract. Earlier evidence above is preserved, including the original BBP-29 REQUEST CHANGES verdict and owner resolution.

The former metadata-only/pre-activation contract remains blocked on SDK 0.5.29. Its original report, exact SDK source ZIP, and blocked handoff remain in `/Users/koen/.bb/thread-storage/thr_knbpuaqpd5/bbp-30/` and on BBP-30. This implementation uses the approved revision, not a claimed SDK fix.

Lexical rejections have no content, preview, image-request, or navigation effect. Valid local links use public source-aware BB opening and have no extra plugin final-symlink-target guarantee. Reader reads and local-image GETs retain explicit host/root and SDK confinement. Attempted confined operations and preview allocation before asset validation are permitted. Remote images are ordinary network images, not authenticated proxies.

## Implementation and test-first evidence

The source interface resolves destinations from the validated document directory and actual source host/root. Caller roots are rejected. The browser receives typed navigation targets or opaque image transport, not a filesystem command. Parser-derived requests and footnote targets use the same document model as headings/Raw. Unsafe/unsupported destinations remain readable. Raw HTML is still skipped.

Public APIs used: `experimental_FileLink`, `UrlLink`, and `files.createPreview({ hostId, rootPath, ttlMs: 60000 })`. SDK 0.5.29 declarations and matching inspected source confirm the contract. No private/core imports, filesystem endpoints, precheck reads, or revocation API are invented. SDK confinement occurs at content request time; the preview lease itself is not evidence that an asset has been validated.

One root lease is shared by local images in a snapshot. At most 128 distinct destination requests and 32 distinct images are resolved. Expiry/error gives readable alt/error text. Refresh renews leases even with unchanged text/hash. Preview/Raw changes do not allocate leases. Refresh/failure removes stale image sources. Switching sources, Original, and unmount discard late results and clear image timers. Abandoned leases expire because the SDK has no revocation API.

Red checkpoints: 39 source-interface failures, then 8 rendered integration failures before their implementations. A later five-case red checkpoint caught malformed external URL canonicalization, encoded external traversal, and stale images during Refresh. Green coverage includes all three sources, remote identity, literal parents inside roots, zero-effect lexical rejection, Windows roots, unsupported raster formats, bad/expired SDK leases, bounded deduplication, project-only navigation limits, preview failure, keyboard/modifier callbacks, exact Raw, unchanged-hash renewal, failed reads/assets, expiry, source switching, late results, and unmount.

## Validation and browser evidence

| Check | Result |
| --- | --- |
| `npm test -- --no-cache` | 190 tests in 9 files pass. |
| `npm run typecheck` | Strict SDK declaration check passes. |
| `bb plugin types . --check` | Package and host SDK 0.5.29 pass. |
| `bb plugin build` | App/server/CSS/maps/metadata build passes. |
| `openspec validate markdown-reader --strict` | Pass. |
| Scope/whitespace | Only reader package and four approved planning files; tracked whitespace passes. |
| Lock/collection checks | Unchanged lock declarations match; README/CI reader entries retained. |
| Prior acceptance | Exact baseline text preserved as the prefix of this file. |
| Destination browser runner | 9 source/width cases pass with no page errors. |
| Earlier three browser runners | Navigation, layout, and Refresh/Retry/fallback regression checks pass. |

Dev-server readiness was verified on port 4176 before checks. Browser-use's default browser still reports no local browser path. Cached local Playwright Chromium ran instead through `uv run --offline --with playwright`. No browser or plugin installation was performed. The early representative destination capture and final wide/narrow captures were inspected. Local/remote fixture images preserve aspect ratio and fit 720 px wide and 342 px narrow columns. Alt/error text stays readable, the toolbar wraps, and footnote focus stays inside the reader.

The destination browser runner uses the real registered reader and public SDK frontend test runtime for workspace, host, and storage sources at 1440/light, 760/light, and 390/dark widths. It records source-aware opening callbacks, ordinary remote image requests without referrer, intercepted 403 asset denial with alt fallback, exact Raw, same-hash Refresh, local heading/footnote focus, and unmount. Its RPC, native opening, image content, and denial are fixtures. It is not live BB routing or real host-symlink transport proof. The source integration uses the registered server RPC and controlled SDK responses, not installed BB.

Durable evidence: `/Users/koen/.bb/thread-storage/thr_knbpuaqpd5/bbp-30/revision/`, including red/green logs, `final-*.log`, `scope.json`, `early-destinations.png`, and `browser/destination-results.json` plus nine captures. Navigation/layout/refresh regression results are under their matching subdirectories. Four jsdom native-navigation warnings come from SDK-owned modifier defaults; rendered callback assertions pass. Actual browser checks have no page errors.

## Completion review

The single fresh read-only reviewer completed run `c43a158f-a3fe-4a81-af5d-7f43b99f053c` against the entire fixed-point working tree, including all eight new files and four approved planning files. Its original verdict is REQUEST CHANGES. The complete bound report, exact native result with state complete/exit 0, and full native output are preserved as `completion-review.md`, `native-review-result.json`, and `native-review-output.md` in the revision evidence directory. Runtime success means the review ran, not that the code was approved. The BB wake alone was not used as approval.

The owner accepted and resolved both findings. R1 P1 showed encoded separators hiding external traversal; local and external paths now share a rejecting encoded-path policy before activation. R2 P2 showed one URL over 4096 characters rejecting the whole batch; the parser and RPC now share the same bound, and only the oversized destination stays inert. Nine reproduced regression failures were recorded before fixes. All-source rendered regressions now show no unsafe href/src or navigation, no rejection preview allocation, and working valid siblings/images beside oversized text. A tenth test checks the exact wire-length boundary. Raw remains exact.

Post-fix verification passes with 190 tests in nine files, strict typecheck, SDK compatibility, build, OpenSpec, whitespace, and all four browser runners. Post-review browser checks initially found the earlier fixture server stopped after the review wait. Those setup failures are retained as `post-review-*-browser-unready.log`; the server was restarted, readiness was verified, and all checks then passed. The owned fixture server/browser were stopped. The final captures retain the same layout and image sizing.

`review-resolution.md` records the owner disposition and post-fix evidence. Both blocking findings are resolved by the owner with passing affected checks. The original REQUEST CHANGES report is unchanged. No second reviewer ran, and no later reviewer approval is claimed. The one-review-and-resolve completion gate is met. Scoped commit, task attachments, and clean-worktree receipts are recorded in the external handoff.

## Limits and excluded actions

Native local-file opening has no extra plugin final-symlink-target confinement. Cross-file heading fragments and environment-free project-only native navigation remain inert. Remote sites can observe ordinary image requests and may receive their own browser cookies. There is no image-byte transfer bound. The 1 MiB document cap still does not bound SDK transfer to the server. Installed source transport, opener preference selection, native routing/modifier behavior, and built-in/custom-theme acceptance remain pending with the parent and BBP-32.

No core/SDK edits, plugin installation/reload, preference/theme changes, push, publication, PR, or BBP-31 work occurred. BBP-26 remains in progress.


# BBP-31 code presentation and responsive reading evidence

## Scope and implementation

Fixed point: `64791cb705e54161c1d33ef4529cb2a051051cac`. Sole writer: `thr_yzdy7ncie2`; parent: `thr_e4syayprwm`. Branch: `bb/bbp-26-markdown-reader-thr_e4syayprwm`. Only the reader package and directly required OpenSpec records change. All earlier BBP-29/BBP-30 records, including their original REQUEST CHANGES findings and owner resolutions, remain unchanged.

The existing Markdown HAST receives bounded highlighting through Refractor core and explicit grammar imports for markup, CSS, JavaScript, TypeScript, JSON, Bash and Python. Aliases are html/xml, js, ts, sh/shell and py; labels are case-insensitive. The rendered code's UTF-8 byte length, including its rendered trailing newline, is checked before tokenization. Up to and including 20 KiB is eligible. Missing, unknown, oversized or failing languages stay plain. Only passive text/span tokens with identical complete text are accepted. No HTML-string rendering, language guessing, second Markdown parse, JSON formatting or JSON parsing is introduced.

Scoped styles use host text, muted-text and monospace tokens. Comments, keywords and strings also use italic, weight and underline treatment. Existing centered prose, container-responsive outline, local table/code scrolling, controls and image sizing remain intact. No reader-owned theme switch or global selector is added. Preview highlighting leaves immutable Raw source unchanged.

Test-first evidence includes the initial compact-JSON failure and the inherited `constructor` label regression. The latter is fixed by an own-property alias lookup. Tests cover explicit languages/aliases, exact whitespace/newlines/JSON, markup safety, long lines, inclusive/multibyte byte limits, unclosed EOF fences, plain inline/indented code, tokenizer failures/unsafe or changed output, complete CRLF Raw and registered-app keyboard switching.

## Verification and visual evidence

Durable evidence root: `/Users/koen/.bb/thread-storage/thr_yzdy7ncie2/bbp-31/`.

| Check | Result and evidence |
| --- | --- |
| `npm ci` | 269 packages, zero vulnerabilities; `clean-install.log`. |
| `npm test -- --no-cache` | 221 tests in 10 files pass; `eof-full-tests.log`. |
| `npm run typecheck` | Pass; `eof-typecheck.log`. |
| `bb plugin types . --check` | SDK 0.5.29 compatibility passes; `sdk.log`. |
| `bb plugin build` | Pass; `build.log`. |
| OpenSpec strict validation | Direct CLI absent (127); offline npx cache unavailable. `npx --yes @fission-ai/openspec validate markdown-reader --strict` passes; all three attempts are saved. |
| Earlier browser runners | Original layout, refresh, navigation and nine destination cases pass after clean install; matching `*-browser.log` and `existing-*` results. |
| Presentation browser | Nine cases pass after clean install; `presentation-clean-install/results.json`. No page, console or request failures. |
| Visual inspection | All 16 final top/code captures match the 16 inspected `presentation-verified/` captures byte-for-byte; `final-capture-identity.json`. |
| Bundle impact | App JS gzip 58,858 → 71,901 bytes (+13,043); CSS gzip 4,073 → 4,165; server unchanged. `baseline-bundle.json` and `final-bundle.json`. |
| Collection and lock | Existing root README/CI package entries remain unchanged. Dependency declarations match the lock; `scope-and-lock.json`. |

The public registered-app frontend harness uses controlled RPC/image responses. Cases cover 390/760/1440 px in Default light/dark, a 760 px custom-token fixture, a 390 px reader inside a 1440 px viewport, and a heading-free document. Long titles/paths, heading levels 1–6, footnotes, long code and wide tables remain usable. Prose measures 342/680/720 px at the three widths. The runner checks local overflow and keyboard scrolling, reachable/named controls, visible focus, semantic headings/tables, local heading/footnote navigation, exact Raw, image aspect ratio and adjacent host-style sentinel isolation.

Default built-in relevant tokens were copied from read-only `bb theme show default --json` and served core CSS. Full CSS SHA-256: `4679becb97e823c6fe046f59935b42b28abc08e1bd73286a4c884f4b8a895c36`. `core-token-provenance.json` records the source. No actual host theme changed. Body contrast is 12.6347:1 light, 10.1441:1 dark and 11.6576:1 custom. Minimum highlighted-token contrast is 7.0419:1, 8.3123:1 and 5.7688:1. Live fixture token/width changes preserve the document DOM, view, source and reader state without another read. The custom-token fixture is not a shipped theme.

Browser-use's default browser failed twice with `No local browser path found after: uvx playwright install chromium`; close/retry and both errors are retained. The existing cached default headless Playwright Chromium completed the checks through `uv run --offline --with playwright python`. No browser installation or signed-in browser was used. Early runner setup failures (footnote heading count, fixture wrapper height, return selector and unscoped sentinel heading count) are retained beside their corrected passing runs. Representative captures were inspected before the full matrix and compared with the approved mockup.

## Completion status and limits

The single completion review and the operator-approved finalization record follow below. The full report and native result establish review approval; the failed notice does not.

These are reproducible fixture checks, not installed BB certification. Native source routing, modifiers, opener preferences, host symlinks and installed-theme acceptance remain pending under BBP-32. Existing source/destination/image bounds and SDK limits from BBP-30 are unchanged. No installation, BB/core/SDK repair, configuration or theme change, BB restart, provider fallback, publication, push or PR occurred. BBP-26 remains in progress.

## Single completion review and authorized finalization

Fresh async `delegate` run `e78a440b-369c-4183-bb7e-9ba06678ec34` used the global `review` skill and reviewed the entire ticket diff against `64791cb705e54161c1d33ef4529cb2a051051cac`, including all seven untracked files. Its verdict is APPROVE BBP-31 with no findings. Native lifecycle state is `complete`; process terminal is `observed`; runner exit is 0 with no signal. The owner and parent collected the full bound report and exact native result. Durable files are `completion-review.md`, `native-review-result.json`, `native-review-terminal.json`, `native-review-output.md` and `native-review-events.jsonl` in the evidence root above.

The reviewer independently passed strict typecheck, SDK compatibility, production-transformer probes, scope/lock/whitespace checks and all 16 capture hash comparisons. It inspected the approved mockup, all 16 captures and saved complete validation results. It did not rerun installation, full tests, builds or browser captures. There were no findings to resolve and no second review.

The reviewer's final owner-only notice failed. The implementation owner supplied `bb thread tell thr_yzdy7ncie2 --message ...`; this CLI rejected the flag with `error: unknown option '--message'` and exited 1. The notice was not delivered. No further reviewer tools, resume, replacement, retry or alternate route ran. Review approval comes from the collected report/result, not a notice or the runner's exit code alone. The original failure and paused partial handoff remain unchanged.

The parent `thr_e4syayprwm` then relayed the operator's "go for it" authorization to finish evidence, final checks, a scoped local commit and BBP-31 completion despite the notice-only failure. `finalization-authorization.md` records that permission and its exclusions. It does not turn the failed notice into a success or permit further implementation, another review, installation, repair, settings changes, restart, publication, push/PR or BBP-32 work.

Before these evidence-only edits, HEAD, branch, the complete paused diff and all seven archived untracked file contents matched. There were 13 unstaged tracked changes and no staged files. Only upstream relationship counts changed from behind 12 to behind 14; HEAD and working files were identical. BBP-31 was unblocked with `thr_yzdy7ncie2` as its sole attached owner. Ticket baseline stays `64791cb705e54161c1d33ef4529cb2a051051cac`; epic baseline stays `3425edb839388a72fe8ac5ac5240cc573b8372b8`.

Finalization changes only this acceptance record and the ticket evidence in OpenSpec tasks. Applicable final checks cover strict OpenSpec validation, scoped files, dependency/lock agreement, unchanged collection integration, preserved historical acceptance, evidence-only continuation, capture identity and tracked/untracked whitespace. Commands, exact results, commit, clean-worktree and task receipts are in the external `final-handoff.md` and matching final evidence files. Full tests, clean install, typecheck, SDK check, build and browser runners are not rerun because no executable, dependency, test, CSS or runtime-configuration bytes changed after the reviewed passing state. Their earlier results and limits remain as recorded above.

The owned fixture listener was verified in this worktree and stopped; port 4173 has no remaining listener. Browser runners closed their browsers. Installed/native acceptance remains pending under BBP-32. BBP-26 remains in progress.

# BBP-32 assembled acceptance

## Scope and evidence types

Owner `thr_dpkwwej5k4` verified clean entry HEAD `961313c81d165e856d2fb387a1d5e1e529f6012f` on `bb/bbp-26-markdown-reader-thr_e4syayprwm`. The completion-review fixed point is the full epic baseline `3425edb839388a72fe8ac5ac5240cc573b8372b8`. This ticket changes reader documentation and the directly required OpenSpec checklist. No executable, test, dependency, CSS, or collection bytes change. All previous acceptance text remains an exact historical prefix, including BBP-29/30 REQUEST CHANGES verdicts and their separate owner fixes.

Durable evidence is under `/Users/koen/.bb/thread-storage/thr_dpkwwej5k4/bbp-32/`. The external `final-handoff.md` records final gate status, the sole review and native lifecycle evidence, attached artifacts, and any remaining work. Test seams are not interchangeable:

- Source and rendered-reader tests use controlled adapters and the public frontend harness.
- Browser fixtures exercise the real registered reader with synthetic RPC/image responses and native-opening callbacks.
- Installed RPC and asset checks exercise the actual local host through the public SDK.
- Owned desktop checks exercise the installed plugin in the real BB UI.
- Current-theme measurements certify only the measured current theme. Fixture token changes do not certify other installed themes.

## Package and fixture checks

Entry and final package checks pass. Final commands are `npm ci`, `npm test -- --no-cache`, `npm run typecheck`, `bb plugin types . --check`, and `bb plugin build`, serialized in the reader package. The suite has 221 passing tests in 10 files. Clean installation reports zero audit vulnerabilities. The command runtime is Node 24.15.0 and npm 11.12.1, matching the collection's Node 24 policy. See `entry-*.log` and `final-{ci,tests,typecheck,sdk,build}.log`.

All five committed browser runners pass: original controls/rendering, refresh failure, navigation, destinations, and presentation. Runs use the existing cached default Playwright Chromium through `uv run --offline --with playwright python`. The owned Vite fixture returned HTTP 200 before browser execution. See `fixture-readiness.txt`, `early-presentation.log`, `final-{original,refresh,navigation,destinations,presentation}.log`, and their matching capture/result directories.

Together these checks cover all three source identities, explicit host/root routing, source races and late-result suppression, empty/error/size/text limits, immutable Raw with CRLF/frontmatter/code spaces, repeated inclusive line requests, GFM and inactive HTML, duplicate/deep/heading-free outlines, reader-local fragments/footnotes, safe/inert destinations, image refresh/expiry/cleanup, and bound Original. Highlighting tests retain the 20 KiB UTF-8 guard before tokenization, explicit grammar/alias policy, unchanged compact JSON/whitespace, and readable plain fallback. These automated results are not proof of native modifiers or an unavailable remote host.

## Final visual inspection

The early 760-light top/code captures and all 16 final top/code captures were inspected against the approved HTML spacing/type reference. The centered prose, section rhythm, quiet toolbar, bounded code/table regions, and wide outline agree with that reference. At 390 px, the toolbar wraps and the outline uses a disclosure. A 390 px reader inside a 1440 px viewport retains this compact layout without changing adjacent fixture styles. Code remains exact and scrolls locally rather than widening the reader. Long headings remain readable. No report badges or source metadata are invented.

| Controlled fixture | Reader/prose width | Body contrast | Minimum highlighted-token contrast |
| --- | --- | --- | --- |
| Default light, 390/760/1440 px | 390/342, 760/680, 1440/720 px | 12.63:1 | 7.04:1 |
| Default dark, 390/760/1440 px | 390/342, 760/680, 1440/720 px | 10.14:1 | 8.31:1 |
| Custom tokens, 760 px | 760/680 px | 11.66:1 | 5.77:1 |

All measured body contrasts exceed 4.5:1. The nine-case runner also checks keyboard activation/focus, local horizontal scrolling, image proportions, exact Raw, and view/outline/model state across token and width changes. Token provenance and fixture limits remain in `tests/fixtures/theme-tokens.md`. `final-presentation/results.json` contains capture SHA-256 values, geometry, contrast samples, and bounded browser diagnostics. The early and final 760-light top captures are byte-identical. These images are fixture evidence, not installed light/dark certification.

## Approved local installation and actual host transport

The parent's `BBP-32-install-approval.md` records the operator's permission to install only the local reader leaf for testing, then restore its pre-test state. The prestate confirmed no reader installation. Opener preferences and relevant settings were recorded without secrets. The built package was installed with `bb plugin install path:<approved-reader-package> --yes --json`. Receipt ID `markdown-reader`, version 0.1.0, and source/root matched the approved worktree leaf. No collection or marketplace package was installed. See `plugin-prestate.json`, `desktop-opener-prestate.json`, `desktop-files-prestate.json`, and `install.json`.

`live-transport.mjs` and `live-transport-results.json` record installed RPC calls for workspace, absolute-host, and actual-thread-storage files. All return exact text/hash on `host_dt6w76k4w8` with the correct confined root. Thread storage uses the actual owner thread's storage location. For each source, a safe raster asset GET returns HTTP 200 with the exact PNG. An owned outside-root symlink image request returns HTTP 400 without the PNG; a confined document read rejects without delivering the benign outside marker. Lexical unsafe destinations remain rejected. Confined attempts and root leases before host-side rejection are allowed by the approved contract. No stronger native file-link symlink guarantee or transfer/image-size cap is claimed.

This is actual local-host transport. Only this host was connected. Controlled remote-identity tests pass, but no remote-host live result is claimed.

## Installed BB UI and rollback

An owned desktop automation session exercised real workspace and actual-thread-storage previews in BB. It verified exact Raw, two repeated line-10 requests with focus/highlight and one resource read, local duplicate-fragment focus, ordinary sibling-file opening, explicit Refresh after an owned change, stale content after a missing-file refresh, Retry recovery, and bound Original. The later settled one-off Open with result confirms Markdown Reader opens the sibling with opener preferences unchanged. Earlier inconclusive menu/selector observations are preserved, not treated as passes. See `live-ui-{raw,line-1,line-2,sibling-click,refresh,refresh-failure,retry,original,storage-source,one-off-complete}.json`.

The current installed-theme measurement reports a 466 px reader and 418 px prose column, 15 px system-font body text, and 14.55:1 body contrast. Unsafe links are inert, active document HTML is absent, the safe image loads, and denied-image text remains readable. The duplicate fragment focuses locally without a URL hash change. `live-ui-current-theme.json` and the inspected `live-current-theme.jpg` record this measurement. It does not certify other installed themes.

Before rollback, the source was rechecked. Only `markdown-reader` was disabled and removed. Settled native fallback was verified while disabled. The final plugin list confirms the reader is absent and other plugin source/enabled states are unchanged. The worktree source remains. Only the three owned fixture preview tabs were removed with revision-checked updates. The owned desktop session was closed; owned workspace/storage/tmp fixtures were deleted; the owned Vite listener was stopped. See `pre-rollback-source.json`, `disable.json`, `live-ui-disabled-settled.json`, `remove.json`, `plugin-restored.json`, `tabs-before-cleanup.json`, `tabs-cleanup.json`, `desktop-close.json`, `owned-fixture-cleanup.txt`, and `fixture-stop.txt`.

No persistent opener/global theme change, unrelated plugin mutation, BB/provider/SDK repair or restart, publication, push, or PR occurred.

## Preserved failures and remaining gates

Browser-use doctor/open could not find a local browser path. Its owned session was closed. The cached default Playwright run then passed without installing or repairing a browser. Desktop script syntax, stale refs, and timing failures remain in the evidence directory alongside successful fresh-snapshot/readiness recovery. No failed observation is relabeled as a pass.

Native `bb thread open` rejected the outside-workspace absolute-host fixture with `Absolute path must be inside the target thread workspace or BB_THREAD_STORAGE.` Direct installed host RPC succeeds, but that is not an absolute-host native UI pass. No private opening route or permission bypass was used.

Required installed/native checks remain open: native modifier behavior, actual native URL opening, and the outside-workspace absolute-host UI route. Modifier/URL checks were not exercised and need a further owned native test run. The host UI case needs a supported public opening route or operator-supplied owned preview. Other installed themes and remote hosts are untested limits, not certified results. The sole full-epic review is recorded below. Code approval does not close these native acceptance gaps. BBP-32 stays in progress, no completion commit is permitted while its acceptance gate is open, and BBP-26 stays in progress.

## Sole full-epic review and acceptance hold

Fresh read-only async delegate `a68e18da-e136-4144-8da7-04ac1e5b538f` reviewed all 60 changed files against `3425edb839388a72fe8ac5ac5240cc573b8372b8`, including all five prior reader commits and the four current documentation edits. It used the global review skill and inherited `openai-codex/gpt-6.1-sol`. No second reviewer, resume, retry, model change, or BBP-31 waiver was used.

The runtime-bound full report is `/Users/koen/.bb/thread-storage/thr_dpkwwej5k4/bbp-32/completion-review.md`. Its original verdict is **APPROVE CODE; HOLD ACCEPTANCE AND MERGE**. No blocking code/maintainability findings or required structural fixes were found. Acceptance finding A1 remains unresolved: native modifiers, native URL opening, and outside-workspace absolute-host UI opening must still be verified. The owner accepts this finding and leaves completion, commit, and merge on hold. No waiver is claimed.

The reviewer independently reran all 221 tests, strict typecheck, and SDK compatibility. It verified full-epic whitespace, package/lock agreement, exact historical prefix, all 16 capture hashes, early/final identity, restored plugin receipts, and unchanged review-boundary hashes. It inspected the approved HTML, final captures, current-theme capture, and saved clean-install/build/OpenSpec/browser/live receipts. Four expected jsdom navigation warnings do not prove native modifier behavior.

Native state is complete. The runner terminal is observed with exit 0; the review step also records exit 0. The last reviewer tool sent the owner-only notice with documented positional `bb thread tell` text. Its receipt confirms `ok: true` and `delivery: sent`. Review approval comes from the full saved report and runtime result, not the notice alone. Exact status, events, process-terminal, output, runner logs, and reviewer session are preserved under `review-native/` in the evidence directory. Final affected documentation/OpenSpec, scope/lock/collection/history/capture, and whitespace checks are recorded in the handoff. Full package/browser checks need no additional rerun for these evidence-only notes. OpenSpec 6.4 remains open for unresolved A1; 6.5 remains open for native acceptance.


## BBP-32 A1 continuation — acceptance still open (2026-10-04)

This continuation uses separate evidence under `/Users/koen/.bb/thread-storage/thr_dpkwwej5k4/bbp-32/a1-resolution/`. The original full report, native review records, held evidence bundle, and verdict above are unchanged. No second review or waiver was used. No executable package code changed.

The approved local reader leaf was temporarily installed again after typecheck, SDK compatibility, and build passed. The public revision-checked `bb thread tabs show/set` route accepted an outside-workspace `host-file-preview` with explicit `host_dt6w76k4w8`. A registered `file-opener:markdown-reader` panel used a matching host owner and `PluginFileOpenerSource` descriptor. The installed BB UI displayed the absolute path and owned heading. Its actual `read_document` and `resolve_destinations` requests carried `kind: host`, the owner thread, and `experimental_hostId: host_dt6w76k4w8`; no workspace/storage source was substituted. Raw matched all 394 characters and SHA-256 `4265540d4655aaa2a8e22a868c170529007dc882250f3c88df24f9aa6446f406`. See `reader-host-tab-descriptor.json`, `reader-host-open-receipt.json`, `host-reader-verified.json`, and `host-raw-verified.json`. This proves registered-opener host-source rendering, not merely a direct RPC or accepted descriptor. The conventional built-in host preview showed a pending body; it is not marked as a completed Original check. The earlier `bb thread open` restriction remains in the historical record.

Actual mouse/keyboard input exercised ordinary HTTP URL activation and Mac Meta-clicks on the HTTP URL and host sibling link. DOM observations recorded `isTrusted: true`, correct modifier bits, the absolute source path, and each native href. Neither URL action produced an observed destination page or fixture GET. Neither modifier action produced an observed new page or source-reader change. The desktop's public native-browser list showed only the two owned hidden automation-profile tabs. These are failed/inconclusive destination checks, not acceptance passes. The cause is not established. See `native-actions-synced-result.json`, `native-modifier-result.json`, `native-browser-after-meta-valid.json`, and `url-server-hits.json`. Temporary screenshot paths are not claimed as durable new visual evidence.

The first owned session expired and was replaced through the same public desktop backend/host/instance, without changing profiles to a personal browser, repairing services, or changing permissions. Snapshot truncation, the ambiguous one-argument `thread open` attempt, public CLI option failures, and initial readiness failures remain recorded. Only the owned failed file tab and two owned host-preview/opener tabs were removed with a fresh revision. Both owned automation sessions were closed and the owned fixture server was stopped. The reader's exact source was checked before disable/removal. Original plugin source/enabled entries stayed unchanged. An unrelated `pi-subagents-provider` installation appeared during the check and was left intact; whole-list equality is not falsely claimed. Saved manual fixture assets are retained; the active temporary fixture is removed after capture. See the restoration/cleanup receipts.

`MANUAL-CHECK.md`, `manual-start-fixture.mjs`, and `manual-open-host.mjs` provide the supported actual-BB-window check with a fresh owned outside-workspace host file and benign URL. Native modifier destination behavior and actual native URL opening remain unverified. A1 and OpenSpec 6.4/6.5 stay open; BBP-32 remains attached/in progress, BBP-26 remains in progress, and completion/commit/merge stay on hold. No persistent opener/theme change, production repair, publication, push, or PR was made.

## BBP-32 user UI correction — held (2026-10-04)

Koen authorized only list-marker and header corrections. Separate evidence is under `/Users/koen/.bb/thread-storage/thr_dpkwwej5k4/bbp-32/user-ui-correction/`. The original full-epic report, native review records, evidence bundle and all acceptance history above are preserved. No new reviewer was launched. The original APPROVE CODE; HOLD ACCEPTANCE AND MERGE verdict remains binding; it does not claim review coverage for these later UI changes.

### Test-first reproduction and correction

The public registered Reader seam was agreed in the request. Before production edits, `red-reader.log` records seven failing filename, grouping and failure-fallback placement checks with 18 existing tests passing. `red-reset/results.json`, log and capture record the actual registered Reader under `ol,ul,menu { list-style:none; padding:0; margin:0; }`: ordinary/nested lists, start-7/start-12 ordered lists and generated footnotes computed no markers. Mixed task-list parents also lost indentation. Diagnosis followed reproduction: prose lacked explicit marker types, and the task-parent rule removed markers from ordinary mixed siblings.

Scoped prose rules now restore native decimal/disc/nested markers. Native ordered `start` and generated footnotes are untouched; only actual task items suppress their marker. Their checkboxes remain disabled. The header now shows the actual filename and quiet directory, with complete path in its accessible name and title. Compact Preview/Raw and secondary Outline/Refresh use a desktop row and reader-width-based narrow two-row layout. Normal ready/empty/loading headers have no Original action. Failed/unsupported status retains the same SDK-bound Original beside Retry. Read effects, source/destination/image safety, Raw, SDK/core/provider code, dependencies, lockfiles and root integration are unchanged.

### Checks and bounded visual inspection

- `checks.json` and logs: 226 tests across 10 files, typecheck, SDK check and build passed. Source-to-reader tests retain Original delegation for unsupported data across all three source kinds, exact empty Raw without a ready Original action, Retry, stale states and transport confinement. Observer disposal and replacement-source fallback still pass through failed states.
- All six browser runners passed. New UI cases cover light/dark at 390/760/1440 px, long path, a 390 px reader in a wide viewport, and 200% CSS zoom. The nine-case presentation matrix and original/refresh/navigation/destination runners also passed. Initial collection failures were a test selector that assumed direct-child checkboxes and the old five-button expectation; their failures and corrections are retained. No production UI change followed them.
- One grouped visual inspection covered all eight new list/header captures plus five representative report/code/custom captures. Markers, ordered 7/8 and ordinary mixed ordered 13, nested indentation, footnote 1, disabled tasks without extra bullets, filename hierarchy, separate control groups and bounded zoom/narrow layout were visible. No clear UI defect remained; no speculative polish or confirmation round was used. Geometry, capture hashes, exact Raw/focus and contrast measurements are saved. Default light/dark body contrast remains 12.63:1/10.14:1 and minimum token contrast 7.04:1/8.31:1; custom is 11.66:1/5.77:1. These are controlled fixture results, not fresh installed-theme certification.
- Impeccable context ran once, with layout playbook and craft-floor applied. Separate before/final layout detector receipts and final affected/whitespace/OpenSpec checks are retained. A detector pass is not visual or native-I/O proof.

### Installation state and remaining hold

The reader was already present/enabled at this continuation's entry, supplied by the parent. The exact approved leaf source was checked immediately before the only targeted `bb plugin reload markdown-reader`. Its bundle changed from `948abd84e0b7ac97` to `6261ff27fa9c27a4`, remains running and SDK 0.5.29 compatible. Reader presence/source/enabled state is preserved. All plugin source/enabled entries match across the immediately guarded reload. An unrelated concurrent `tasks-plus` source change before that guard was observed and left unchanged; whole-list equality with entry is not claimed. The earlier absent-reader rollback is historical, not this run's restore target. No persistent opener/theme preference was changed; no BB/native browser tabs or production services were opened, repaired or restarted. The owned Vite listener and fixture browsers were stopped after use.

This is a held, unstaged UI-correction handoff, not completion or native acceptance. Actual native HTTP(S) and modifier destination checks remain unverified under A1. OpenSpec 6.4/6.5 remain unchecked. BBP-32 stays attached/in progress and BBP-26 stays in progress. No completion commit, merge, publication, push or PR occurred.


## Browser acceptance decision and checklist closure (2026-10-04)

Koen explicitly instructed: "Skip native acveptance. The browser is more then enough. Can you save that somewhere for next time". He then accepted the displayed result. Browser-based acceptance is sufficient for this work. This supersedes the native-only hold in the historical records above.

OpenSpec tasks 6.4 and 6.5 are complete under the revised requirement. The single full-epic review and its original APPROVE CODE; HOLD ACCEPTANCE AND MERGE verdict remain unchanged. A1's native requirement is waived by the operator, not passed through a new observation or reviewer approval. The later list/header fixes retain their separate owner and parent verification; the original review does not gain coverage of later edits.

Accepted evidence comprises 226 tests across 10 files, all six browser fixture runners, typecheck/SDK/build/strict OpenSpec checks, the inspected responsive light/dark/custom fixtures, and the approved local installation/transport and source-preserving reload records. The parent independently reran the 226-test suite, verified all 24 later capture hashes and both tracked/new source identities, and inspected compact/split/wide UI captures. PR #84's nine CI jobs passed at commit f068b2acf0ef8649ec47294ec807689713341cc9.

Remaining native ordinary HTTP(S), Command-click URL/file destination effects and the conventional host/Original check are skipped by operator decision. Browser evidence does not prove those native behaviors. Other installed themes and remote hosts remain untested limits. The reader remains installed/enabled from the exact approved leaf; the earlier absent-reader rollbacks are historical. No native permissions, runtime services, source code or prior review evidence changed for this decision.

The default for future BB plugin UI work is saved in `/Users/koen/.pi/agent/AGENTS.md`: browser checks are sufficient unless native checks are explicitly requested. The decision is also attached to BBP-26 and BBP-32 from `BBP-32-browser-acceptance-decision.md` in the parent thread. Checklist closure does not itself merge PR #84, publish the plugin, or change task status.
