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
