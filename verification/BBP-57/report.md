# BBP-57 validation

## Scope and approvals

Baseline is `6d7e3c4a72d2ad9758442238445aa00a41b9dadb`. The production Reader exists and now consumes the same private document module and scoped stylesheet as Tasks. Reader retains source loading, host/root authorization, capability resolution, Refresh, line intent, composer selection and bound Original. Tasks retains authenticated ID-only loading, dialog lifecycle and original Download. No source-loader or storage schema change is included.

The operator approved shared Reader presentation, Preview-only YAML hiding, bounded highlighting, common typography and frozen Bun verification. Raw remains exact and Tasks destinations remain deny-all. Installed state, preferences, live records and publication are excluded. Related BBP-55/56 worktrees were inspected read-only, not copied or changed. BBP-56 landed on main at `e6484c6` during validation; the reviewed local snapshot is rebased onto that revision, preserving its token/node/depth guards and all 33 added public highlighting cases. BBP-55 shared-interface reconciliation remains separate before assembled-feature acceptance.

## Checks

All commands use Bun 1.4.3 and Node 24.15.0. Detailed private evidence is in [the linked work thread](bbthread://thr_dfv3azhs3e), under `parent-validation/` and `implementation-20260815-230527/` in its storage.

| Check                        | Observation                                                                                                                                                                                                                              | Status                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Shared public tests          | Parent independently ran all 92 cases after rebase, including 42 moved parser/code cases, navigation and all 33 upstream highlighting regressions.                                                                                       | Passed                                           |
| Reader unit tests            | Parent independently ran all 235 remaining cases. Source/host/root, refresh, range, destinations, selection and fallback regressions remain covered.                                                                                     | Passed                                           |
| Tasks unit tests             | Parent independently ran all 1323 cases across 125 files after the lock metadata refresh.                                                                                                                                                | Passed                                           |
| Typechecks, SDK and builds   | Parent fresh setups passed all shared checks and each consumer's typecheck, local official SDK check and production build. No existing node_modules or opposite plugin source was copied.                                                | Passed                                           |
| Compiled shared ESM          | Fresh Node imports and server rendering passed against emitted `dist/index.js`; source exports remain deliberate.                                                                                                                        | Passed                                           |
| Bundle independence          | Fresh consumer bundles contain common code/CSS, no runtime package import and no second React runtime markers. Reader setup has no Tasks source; Tasks setup has no Reader source. Quota is only a Tasks development fixture.            | Passed, static artifact proof                    |
| Reader browser               | Parent ran all 69 cases after opaque-token fixture correction.                                                                                                                                                                           | Passed                                           |
| Reader smoke                 | Parent verified Preview, exact Raw, keyboard return, one read, unchanged source hash and owned-process cleanup.                                                                                                                          | Passed                                           |
| Tasks browser                | Parent ran all 22 cases after rebase: 11 original, six upstream technical-report cases, four matched parity/theme cases and newline-dense Raw.                                                                                           | Passed                                           |
| Matched production consumers | Same report, 390/960 px viewports, matched 300/640 px content widths, light/dark, equal content/Raw and computed styles. Reader local navigation and authorized relative links work; Tasks links/images remain inert.                    | Passed, fixture-only                             |
| Live theme                   | New immediate assertions reproduced desktop background lag and control-color lag. Scoped transitions now exclude theme colors. All four compact/desktop light/dark cases pass with content, IDs, one-read, draft and focus preservation. | Passed, fixture-only                             |
| Historical evidence          | BBP-53 hashes remained unchanged.                                                                                                                                                                                                        | Passed                                           |
| Lint and formatting          | Parent touched-file Oxlint and Oxfmt checks pass. The design detector returned no findings.                                                                                                                                              | Passed                                           |
| Comment pass                 | Removed 13 narrative comment lines, retained dependency accessibility constraints and functional test directives. No code, guards or suppressions changed.                                                                               | Passed                                           |
| Independent review           | One fresh deep review found two P2 defects. Both were reproduced and fixed, with owner-verified regressions and affected reruns. See [closure](review-closure.md). The original report remains unchanged.                                | Completed; findings closed by owner              |
| Hosted CI                    | Workflow now bootstraps both consumers and gates builds on shared/tests/types/SDK success. Hosted execution has not run.                                                                                                                 | Not run                                          |
| Installed acceptance         | No plugin activation, source change, native opener preference, live host/action or task record was performed.                                                                                                                            | Excluded here; remains an assembled-feature gate |

The fixtures use the actual registered Reader opener and actual Tasks attachment owner/Dialog. Existing SDK/RPC, source-read and attachment-fetch boundaries are synthetic. They do not establish installed BB routing or live host permissions. Reader's full browser suite includes custom-token cases; matched Tasks parity is limited to the stated light/dark fixtures.

## Integration with merged BBP-56

Rebased the reviewed snapshot onto `e6484c6`; parent verification is under `rebase-validation/` in thread storage. The upstream highlighter is unchanged. Its prior independent approval was retrieved from BBP-56. All upstream assertions remain: the public tests now use the model API and browser tests use the common accessible names/hooks.

The first integrated browser run found four real wide-table overflow failures. Preserved those logs/traces. Ported upstream intrinsic table sizing and host-radius tokens into the common stylesheet, then reran all 22 Tasks and 69 Reader cases plus same-report parity successfully. No timeout or assertion was weakened. Both consumers now retain these upstream safeguards and presentation improvements.

The independent-build recipe also removes its own generated shared `dist` after preserving and checking compiled ESM. Consumer installs/builds must succeed with that directory and the opposite plugin absent. This covers the concrete prerequisite failure already tracked as BBP-237 without changing its status. BBP-248 and BBP-249 remain separate cleanup follow-ups.

## Reproduce

From the repository root after the mapped dependency/browser setup:

```sh
node verification/BBP-57/clean-build.mjs NEW_CLEAN_EVIDENCE_DIRECTORY
bash verification/BBP-57/browser-parity.sh NEW_PARITY_EVIDENCE_DIRECTORY
```

Both commands refuse existing evidence directories. The clean verifier retains input/artifact hashes, logs, independent checkouts and isolated build data. The parity runner retains exact comparison JSON, traces, screenshots and historical hashes. Tasks requires port 4193 free, never reuses another listener and disables fixed-path historical captures.

The complete Reader suite uses `.pi/skills/verify-bb-plugins/scripts/browser.sh markdown-reader NEW_DIRECTORY`. Tasks' mapped private-capture config runs `preview.spec.ts` separately from parity when a focused subset is needed. [Shared verification guidance](../../.pi/skills/verify-bb-plugins/references/shared-markdown.md) describes ownership and prerequisites.

## Preserved failures and limits

Early parallel baseline tests timed out; unchanged single-worker reruns passed without timeout/assertion changes. The writer retained duplicate-React setup, old Raw-label, synthetic-token and parity-authoring failures. Corrected full Reader and Tasks runs supersede those failures without deleting their evidence. Parent retained the theme diagnostic, failing regressions and an initially incorrect transparent-control-background expectation. The final check allows transparent controls over the asserted dialog background, not a stale opaque background.

Remote image grants now use anonymous CORS with no referrer and reject the current BB origin. Remote hosts must permit CORS. Local images retain consumer-issued opaque capabilities and actual source confinement. No broader remote-image availability or live-network acceptance is claimed.

Source ESM/TSX exports preserve the existing clean-build fix. BB independently compiles shared code/CSS into each plugin; shared `dist` is a verification output, not the package's public resolution target. No runtime sibling-plugin service is introduced.

Fixed-port contention blocked one Tasks attempt. Follow-up [BBP-248](bbtask://BBP-248) records fixture-port isolation with the failed startup log. It does not block this change or authorize unrelated cleanup.

The Reader's pre-existing source-annotated Raw node count remains [BBP-249](bbtask://BBP-249). Tasks now uses the bounded single-text-node path. Existing [BBP-234](bbtask://BBP-234) covers the older general Tasks compatibility prose outside this Reader integration; its scope was inspected and reused rather than duplicated.
