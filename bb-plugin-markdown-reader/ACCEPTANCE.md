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
