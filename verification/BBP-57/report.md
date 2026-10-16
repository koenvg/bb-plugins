# BBP-57 validation

## Scope and approvals

The production Reader and Tasks use the same immutable document model, parser and scoped stylesheet. Reader retains source loading, host/root authorization, capability resolution, Refresh, source ranges, composer selection and bound Original. Tasks retains authenticated ID-only loading, dialog lifecycle and original Download. No source-loader or storage schema changes are included.

The operator approved common Reader presentation, Preview-only YAML hiding, bounded highlighting, common typography and frozen Bun verification. Raw remains exact. After PR 279 opened, the operator also approved reconciliation with merged BBP-55, preserving Tasks navigation, external links and remote images. That approval replaces the earlier deny-all constraint for Tasks. Relative filesystem links remain inert without a binding.

Installation, activation, persistent preferences, live test records and PR merge remain excluded. No other task worktree was changed. Original implementation baseline: `6d7e3c4a72d2ad9758442238445aa00a41b9dadb`. Integration target: `74d871e988d7731de1cd8a18e8be1285584bd51c`, including merged BBP-55 and BBP-56.

## Current checks

Parent verification used Bun 1.4.3 and Node 24.15.0. Evidence remains in the linked BBP-57 work thread under `main55-integration/`. Older evidence remains under `parent-validation/` and `implementation-20260815-230527/`.

| Check                       | Observation                                                                                                                                                                         | Status                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Shared public tests         | 110 cases, including moved Reader cases, all upstream highlighting/navigation/image cases, exact Raw, lazy indexing, Unicode whitespace and disabled-outline permissions            | Passed                        |
| Reader unit tests           | 235 cases, including source confinement, refresh, selection, destinations and fallback                                                                                              | Passed                        |
| Tasks unit tests            | 1,324 cases across 125 files                                                                                                                                                        | Passed                        |
| Reader browser              | All 69 cases, including source ranges, selection and custom tokens                                                                                                                  | Passed, fixture-only          |
| Tasks browser               | All 28 cases, including native modifiers, navigation, images, technical reports, theme changes and dense Raw                                                                        | Passed, fixture-only          |
| Matched consumers           | Same report at 390/960 px, matched 300/640 px content widths, light/dark, equal content and computed styles; relative links remain consumer-specific                                | Passed, fixture-only          |
| Fresh independent builds    | Shared tests/types/compiled ESM and consumer types/SDK/builds pass with the opposite plugin absent; consumer builds also have shared dist absent                                    | Passed, pinned tooling        |
| Bundle ownership            | Shared code/CSS bundled, no runtime shared-package import or second React runtime markers                                                                                           | Passed, static artifact proof |
| Root checks                 | Root tests, lint and formatting pass; existing unrelated lint warnings remain                                                                                                       | Passed                        |
| OpenSpec                    | Strict validation passes; tasks 5.1-5.5 complete, overall 19/33 with 14 other-scope tasks remaining                                                                                 | Passed for delivery 5         |
| Historical evidence         | BBP-53 capture hashes remain unchanged                                                                                                                                              | Passed                        |
| Independent review          | One fresh whole-change review found two P2 defects. Owner reproduced and fixed both. Original report and 28 frozen artifacts remain unchanged                                       | Findings closed by owner      |
| Hosted CI                   | All 18 jobs passed for runtime commit `e889e14`: [workflow evidence](https://github.com/koenvg/bb-plugins/actions/runs/38864856474). See PR checks for later documentation commits. | Passed for reconciled code    |
| Current-host SDK            | Both consumers pin 0.6.37; read-only checks against the running host report 0.6.49                                                                                                  | Mismatch, recorded as BBP-252 |
| Installed/native acceptance | No plugin source switch, activation, preference change or live host/action test performed                                                                                           | Not run                       |

The fixtures use the actual Reader opener and actual Tasks attachment owner/Dialog. SDK/RPC, source reads and attachment fetches use synthetic external boundaries. Fixture results do not establish installed routing or live host permissions. Arbitrary host-theme contrast is not certified.

## Reconciliation with main

The common model retains BBP-55's normalized headings, collision suffixes, document-local footnotes and native external intent. Legacy Reader fragments remain aliases. Canonical and generated footnote fragments do not capture each other. Both consumers use the same outline links and stylesheet. Tasks supplies a body-owned navigation callback, preserving the common presenter's no-ancestor-scroll default.

The native attachment and explicit bound-source policies coexist with Reader's verified delegated grants. Attachments never infer a root, host or related file. Bound-source callbacks remain consumer-authorized. Remote raster images retain BBP-55's credential omission, CORS, redirect rejection, MIME checks, four-request concurrency, 32-request limit, 4 MiB image limit, 16 MiB retained-document limit and blob cleanup. The upstream loader and highlighting guards are unchanged. The redundant upstream rendering pass was removed after its metadata behavior moved into the model.

The initial integration exposed a heading/footnote collision, request-budget error-label differences and outdated role/selectors. The collision and labels were fixed. Tests now select common outline links and Raw labels; focus, confinement, text, cleanup and geometry assertions remain. A new red/green regression preserves link titles. Another red/green regression prevents outline links when local navigation is disabled.

The 1 MiB newline-only Raw case twice exceeded its original 5-second limit under load. Blank ASCII Markdown now skips the parser. Source-line arrays are lazy, and default Raw reads the exact source string directly. New coverage rejects eager indexing and retains non-ASCII paragraph whitespace. All 110 cases pass without timeout changes. Reader's inherited annotated DOM cost remains BBP-249, not claimed fixed.

## Tooling and platform limits

The first fresh SDK check reached the live host through inherited BB environment variables and correctly reported SDK drift. The independent-build helper now removes ambient `BB_*` values before setting its private build-data directory. Both isolated builds pass against the declared BB 0.46.0 and SDK 0.6.37. This is not current-host SDK acceptance. No SDK upgrade was performed.

BBP-252 records the two current-host SDK mismatches with attached diagnostics. BBP-251 covers a different consumer. BBP-248 tracks fixed fixture ports. BBP-237 tracks the older missing-dist prerequisite failure, now covered by explicit missing-dist build checks. None of these follow-ups was made a blocker of BBP-57.

Retained failed evidence includes `shared-red.log`, `markdown-document-units-final.log`, `reader-browser/`, `link-title-red.log`, `outline-permission-red.log` and `clean-final/`. One full Tasks invocation exceeded the outer 420-second command limit without completing; the unchanged verbose rerun passed all 1,324 cases. No test timeout was raised. Final evidence is in `shared-final.log`, `reader-units-final.log`, `tasks-all-verbose.log`, `reader-browser-final/`, `tasks-browser-final/`, `parity-with-placeholders/` and `clean-current/`.

The earlier theme-transition failures, four wide-table failures during BBP-56 integration, and original review findings remain documented in prior commits and retained thread evidence. See [owner closure](review-closure.md). No second whole-change review was launched; reconciliation evidence is owner verification, not a new independent approval.

## Reproduce

From the repository root, with the documented frozen dependencies installed:

```sh
node verification/BBP-57/clean-build.mjs NEW_PRIVATE_EVIDENCE_DIRECTORY
bash verification/BBP-57/browser-parity.sh NEW_PRIVATE_EVIDENCE_DIRECTORY
```

The helpers refuse existing evidence directories, use owned fixtures/build data and do not install or activate plugins. Read [the shared verification recipe](../../.pi/skills/verify-bb-plugins/references/shared-markdown.md) for full suites and source-policy limits. Assembled-feature and installed acceptance remain separate gates.
