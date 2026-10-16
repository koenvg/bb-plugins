# BBP-58 independent whole-feature review

## Verdict

**Request changes. Local feature acceptance is not yet supportable.** Two fixes are required: close the shared destination-policy bypass and make the documented Tasks browser command preserve historical evidence. Neither finding requires restoring comments or changing installed plugins.

Selected skill: `review`. This is a structurally significant, two-consumer feature with source authorization, a shared public contract, bounded reads and image loading, asynchronous dialog ownership, and independent packaging.

This is the single clean-context review of the assembled feature, not a review of only BBP-58 reporting. Baseline: `f80724cec1d7ee6698557466227b1afefde073f5`. Reviewed checkout: `89e062561b684b61ee6e6ac1a7f2584206b5cd0a`, including working-tree Reader and attachment README changes and untracked `verification/BBP-58/plan.md`. The exact supplied scoped diff command and status command were executed. Unrelated task-list/provider changes and historical binary captures were excluded from source review.

## Required fixes

### R1. P2: the alternate source policy bypasses the shared safety gate

Location: `packages/markdown-document/src/destinations.tsx:183-190`, especially line 188. Related implementation: `src/destination-policy.ts:46-65`; common validation: `src/destinations.tsx:43-101`.

The `native.kind === "bound-source"` exception lets links skip collected-request membership. That collection is where `checkedDestination` rejects encoded traversal, encoded separators, and nested encodings. The alternate `destination()` implementation does not enforce the same restrictions. A caller can therefore receive active links that the shared model explicitly rejected.

I reproduced this through the actual public `createDocumentModel` and `MarkdownDocument` interface using Bun and `react-dom/server`, without a browser or file changes. With root `/root`, host `fixture-host`, and document `/root/reports/current.md`:

| Markdown destination          | `checkedDestination` | Collected requests | Rendered result      |
| ----------------------------- | -------------------- | ------------------ | -------------------- |
| `%2e%2e/notes.md`             | false                | none               | active source link   |
| `https://example.org/a%2fb`   | false                | none               | active external link |
| `https://example.org/a%252fb` | false                | none               | active external link |

A second probe collected 128 requests but rendered 140 active source links. The existing hostile-input test at `packages/markdown-document/test/public.test.tsx:117-162` checks the delegated policy, so it misses this exception.

This is also the main structural regression. The new public contract has two source-resolution paths and two lexical validators that already disagree. Repository search found `bound-source` callers only in shared-package tests, not in either production consumer. Reader uses delegated grants; Tasks uses the attachment policy. Thus this is a public-contract defect, not a demonstrated escape from a production Reader root.

**Required:** apply one common lexical gate and the applicable request budget before every source/external dispatch. Prefer deleting the unused `bound-source` branch if it has no required consumer; otherwise remove its bypass and reuse the canonical restrictions rather than adding another exception. Add public-interface regression coverage for the examples above and beyond-budget links across all retained policies. Preserve legitimate local fragments and the two production adapters. This follows the shared spec's requirement that a different source policy must not weaken common restrictions.

### R2. P2: the new development command overwrites protected historical captures

Location: `bb-plugin-tasks-plus/README.md:44`. Mechanism: `bb-plugin-tasks-plus/tests/browser/preview.spec.ts:117-123`.

The development checklist says to run plain `bun run test:browser`. Without `BBP53_CAPTURE_PHASE=none`, the browser test defaults to `final` and writes screenshots and JSON into `verification/BBP-53/final-{width}.*`. Following the new checklist therefore replaces historical evidence. The warning and safe recipe at README line 165 do not make the earlier command safe.

**Required:** replace that command with the maintained private-evidence recipe, including `BBP53_CAPTURE_PHASE=none`, the private capture configuration, and fresh output. Do not regenerate historical captures to close this finding. No execution of the unsafe command is needed; the source path is explicit.

## Structural assessment and follow-up

The central extraction earns its place. Both real production consumers import the same package and stylesheet. Parsing, headings, exact Raw, syntax tokens, and document CSS are centralized. Tasks retains its authenticated saved-ID transport and dialog lifetime; Reader retains source selection, host/root checks, Refresh, line requests, selection, and bound Original fallback. No reviewed feature implementation crosses 1,000 lines. The new 411-line attachment owner is substantial but cohesive; its transport, request ticket, focus session, and render states are explicit rather than scattered through task editing.

The largest simplification opportunity is R1: remove the unused parallel source-policy implementation or make its validation canonical. I do not require a speculative rewrite of the working attachment state machine.

Follow-up cleanup, not an additional feature blocker:

- `bb-plugin-tasks-plus/README.md:8` still advertises BB 0.45 / SDK 0.6.15, although the manifest requires BB >=0.46 / SDK >=0.6.37 and the new build instructions pin BB 0.46.0. This predates the scoped feature diff, but should be corrected during the operating-document audit.
- Reader's delegated remote-image grants retain anonymous-CORS `<img>` loading; Tasks uses the bounded streamed loader. The package documentation distinguishes these behaviors. I did not reinterpret the Tasks-specific 4 MiB/16 MiB limits as an undocumented Reader guarantee. Unifying remote-image ownership later would reduce policy-dependent presentation behavior, but is not required here.

## Requirements and safeguards checked

- Read both instruction files, the selected review skill, code-review workflow, full supplied specs/design/tasks, the current comment-removal contract, and the new verification plan.
- Inspected the complete shared implementation, public types, model/heading generation, source lines, Raw, outline, highlighter, destination validation, image lifecycle, and scoped CSS. Reviewed public, navigation, image, highlighting, and parity coverage.
- Inspected Tasks registered preview/download routes, actual-size and descriptor-bounded reads, strict UTF-8/BOM handling, binary controls, ID-only query validation, bounded errors, response validation, owner invalidation, retry, deletion, focus fallback, keyboard isolation, Dialog forwarding, cards, and full-detail integration.
- Inspected Reader production registration, shared rendering adapter, source resolution, root/host checks, local-image capabilities, stale/refresh behavior, line and selection hooks, and Original binding. Shared code does not acquire source authority from document text.
- Inspected manifests, source exports, consumer dependencies, CI setup, fixture server/configuration, and independent-build verifier. Source ESM/TSX exports are deliberate and documented, rather than falsely presented as emitted-dist exports.
- Assessed migrated files as task-owned attachments under the approved BBP-54 replacement scope. Migration/API tests preserve saved IDs, bytes, metadata and downloads. Full-app tests cover title/description edits and editor identity. Missing removed comment cards, composer and drafts are not defects. Historical spec checkboxes must not be marked as literal comment-UI delivery.
- Visually inspected current-run compact/light and desktop/dark attachment captures, plus compact/light and desktop/dark production Reader parity captures. Controls, filename wrapping, heading hierarchy and bounded reading regions are readable in these samples. This is sampled fixture evidence, not a full installed visual audit.

## Validation evidence and limits

I did not start a browser, install dependencies, run builds, modify Git state, activate plugins, change preferences, create live records, or delegate. Existing owner-controlled evidence was inspected, and the hashes below were independently recomputed.

| Check                                 | Observed result                                                                                                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared tests/build/typecheck          | Passed: 110 tests; build and typecheck exit 0.                                                                                                                                                                                                                         |
| Reader tests/typecheck                | Passed: 235 tests; typecheck exit 0.                                                                                                                                                                                                                                   |
| Tasks complete default-worker run     | Failed: 1,322 passed, 2 failed, out of 1,324. Both failures are in `views/embed/embed.test.tsx`, delayed default-lookup editor retention at line 617. Do not report this run as passed.                                                                                |
| Isolated embed diagnostic             | Passed: all 29 tests with `--maxWorkers=1`. This narrows the failure but does not prove that the complete suite passes in that mode. The later full serial rerun was not evaluated for this report.                                                                    |
| Tasks typecheck; affected lint/format | Exit 0. Lint retains warnings, including existing control-regex and unrelated unused-variable warnings.                                                                                                                                                                |
| Reader owned browser suite            | Passed: 69 expected, zero skipped/unexpected/flaky, exit 0. Checkout evidence matches the frozen SHA.                                                                                                                                                                  |
| Tasks owned browser suite             | Initial run blocked by occupied port 4193. Separate serialized retry passed all 28 checks, zero skipped/unexpected/flaky.                                                                                                                                              |
| Matched-consumer parity               | Initial attempt exited 2 due to occupied port. Separate retry passed, exit 0. Do not erase the original blocked attempt.                                                                                                                                               |
| Historical capture preservation       | Before/retry-after hash manifests are identical. Retry ledger records no listener on port 4193 after teardown.                                                                                                                                                         |
| Clean independent builds              | All 19 recorded checks exit 0. Both consumers build with the opposite plugin source and shared dist absent. I independently recomputed all six app/CSS/server artifact hashes and matched their manifests. All 152 selected relevant input hashes match this checkout. |
| Pinned SDK checks                     | Both passed in the independent builds using package-local BB 0.46.0 / SDK 0.6.37.                                                                                                                                                                                      |
| Current-host SDK checks               | Both failed with the explicit pin 0.6.37 / host 0.6.49 diagnostic. This is the separately tracked BBP-252 compatibility gate, not a pinned-build pass and not permission to upgrade dependencies.                                                                      |
| Hosted CI                             | Stored current-checkout evidence shows both Reader and Tasks test/browser jobs successful. Compose Chat browser job failed. Do not call the whole workflow green. No fresh network lookup was made.                                                                    |
| Installed/native acceptance           | Not run. No activation or live records were authorized. Fixture and independent-bundle results do not prove installed authentication, actual source-host confinement, native opener preferences, or live task downloads.                                               |

The pure rendering probe for R1 exited 0 and printed the rejected-but-active cases above. This command was diagnostic, not a test-suite pass.

**Acceptance decision:** fix R1 and R2, close the complete Tasks-suite validation row with recorded evidence, and have the owner verify the exact fixes and affected checks. Keep current-host compatibility and installed acceptance separate. No other high-confidence feature blocker was found within this review's limits. This report is frozen on return; later fixes/results belong in the owner's closure record.

## Evidence identities

Paths below are relative to `/Users/koen/.bb/thread-storage/thr_225xuzb9vz/bbp58`. SHA-256 values were recomputed during this review. Logs that were still being produced were not treated as completed passes.

```text
510a6a708444e8e3f08eaf12bd426320084a6c4ed1fb56e82207eedc2ef3777d  run-local.sh
5a9caea41405673f15d150d49913241dbe28eeb884d3ea0f278cbe6b0da7edc7  run-browser.sh
e3ac20c1ee2e4f4c9b603593f20af670db2a2f3ccbf7238a4ef2e46ad644fc56  run-tasks-parity.sh
36eec9b671b8206382d3fedd77fd741d4d3832e285b49082315b963b93ddf996  hosted-ci.json
27182e1179546798e52b24e2a1623788a7e72bfee4df095c7ccecc6ce1d32592  local-exits.txt
e912cd74417c38bd9bf039d5fcfc2ed6f65b58b5f63ded10471c2db9fda528f8  shared-build.log
167227a969dcfc9fb8c51dd758a884e9fd47a717f62918efa735d606738f9f8b  shared-test.log
8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92  shared-types.log
fe6d8d84fb9d6839cf7effb97135db31a5cc4d02b612153fe070173e3356e893  reader-test.log
daab981844fa7f33281e2a184953a4fa46c535d8815393a7ce98c5879da37258  reader-types.log
77980c710b87616e0d6a4a35153dc9886c806c2f31096351bd974594544a3a39  tasks-test.log
22a2948e164a6525a4b871a33e99c34e8c2d5e5f40927939e2441759f19611e9  tasks-types.log
de3e691b9341c3c25bf9a0f9628d92c5e898bebc16993196790bf02b9b8d3fcc  affected-lint.log
4f885cbd421026e950aba2d9e290575be38acd9de2477e6db6011f7f354333d3  affected-format.log
700cc013113b109faec500d5a1382edb4ee6400c56947714077d3704632c9ef4  reader-host-sdk.log
700cc013113b109faec500d5a1382edb4ee6400c56947714077d3704632c9ef4  tasks-host-sdk.log
51ed9cebe2b6163774ac2b00968fcd7e0edbaaff73a2e2c30686ec06d70e5443  tasks-embed-diagnostic.log
dfa184fe15844038d9e47b4485ef4d27fa554e045ad47a163e151e9ddc6b4bc4  reader-browser/checkout.txt
9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa  reader-browser/exit-code.txt
e83b2c08a68e053c0a44786fbb0519547fd3ecc147d9dce5ef332ee5329b656c  reader-browser/command.log
cbc78e7b51fd38e79b9b8ef7619bd91d8eb6cd77d52d0fe3b0f57c2e57a505e5  reader-browser/results.json
726090f59eb808945cd4b1c5fb9a7f0dfc5fe31074c508ff87f02ff4a8880d97  browser-exits.txt
4de01b51760f875af2dd920a5d32b3760bf3e0430a9eb690a907e87febb72740  retry-exits.txt
9cdd9cc11227a04105816945c349ce9f2778cbe96cfc5d5578d47e06a257718a  tasks-browser-retry.log
4dd0cb399be7f8d088a5e18bfd07f4ad6d991987e33076660b3d75f84a52f682  tasks-retry-results.json
d9a14ba7b0a4a3d7a47dc983f14c849ed0222557ec26844b307096078517cb72  parity-run.log
2a3f40c66732f07f2bab611be651b88f24eba9fd3579d8a4e1dc231eedcc8495  parity-retry-run.log
9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa  parity-retry/exit-code.txt
c52d600be59473bc1fc7026505bd21b67e7c7090298a5df8f1883aa25265480f  clean-build.log
97d19cd88363dc6c999f096184aa26ac09e85a0075389d5adead3dac5fa9cb1b  clean-build/checks.json
d2683e74d3a2c63ca7d58b74c385c38b6656911c0ba72e381c69221f5891b46a  clean-build/inputs.json
4d8f6eff4159a800fbfb4b7b6c227cf2f547252b01c28e70449c5d162e6cc991  clean-build/bb-plugin-markdown-reader-artifacts.json
030a9eb53360b14fe6322f819d2974d3d072abe2bf15d844f6c8a299de84061e  clean-build/bb-plugin-tasks-plus-artifacts.json
989fb67cec386338319b4bfeb96650c84267f14d2c810cfb6e5ffc4d9f26ed82  historical-before.txt
989fb67cec386338319b4bfeb96650c84267f14d2c810cfb6e5ffc4d9f26ed82  historical-retry-after.txt
18684b4ac9ba0280688811e4612333d57d59eefac4b65c277c4081a49a85d944  tasks-browser-retry/reading-report-reading-report-390px-light-document-auto/overlay-top.png
0a81f79ddcaa9d5cd37c5ca4565775c8d529a7a32a7d618e0e8026733092a469  tasks-browser-retry/reading-report-reading-report-1280px-dark-document-auto/overlay-top.png
350c9b5bf2fd2c752d0258391abc03d5b005c21a5aee5e3f8897d45f3018dad8  parity-retry/reader/tests/shared-parity-shared-parity-reader-390-light/reader-parity.png
11c99d0e3e1b2629ad08307cc38bf9d80853dfd57f4e03d199b92ec20d48e5c2  parity-retry/reader/tests/shared-parity-shared-parity-reader-960-dark/reader-parity.png
```

Independently matched built artifacts, under `clean-build/<consumer>/<consumer>/dist/`:

```text
a0d72617681cdf287b9a6339e081f91b44101d3efaa69b463d1699d5f4523ee2  bb-plugin-markdown-reader/app.js
56682b219c77029fd9b274e734ea96d2444413a050cf24d6e17ab8c68fbd5e9c  bb-plugin-markdown-reader/app.css
a90805d0dd2116a2a3b518560db2be5a805b5a251a619289cc7507979cd4cf6b  bb-plugin-markdown-reader/server.js
3a0e753c6ab4d9b2ae8d22f574d57af7ec1c08ea2180b41b8d803ee483006f7e  bb-plugin-tasks-plus/app.js
5845c8ede2e69f8b11d246f5f21c40bddadb2efac63584fd8b3e767e78efd652  bb-plugin-tasks-plus/app.css
003a877999f291b3523283e3551424759b405100fe3aa2a7e29e297e64495bb4  bb-plugin-tasks-plus/server.js
```

```acceptance-report
{
  "criteriaSatisfied": [
    { "id": "criterion-1", "status": "satisfied", "evidence": "Completed one read-only whole-feature review, reproduced R1, identified R2, and separated required fixes, validation failures, and residual risks." }
  ],
  "changedFiles": ["/Users/koen/.bb/thread-storage/thr_225xuzb9vz/bbp58/independent-review.md"],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    { "command": "Supplied scoped git diff and git status commands", "result": "passed", "summary": "Reviewed the requested baseline and current working-tree scope." },
    { "command": "Bun public-interface SSR destination probes", "result": "passed", "summary": "Reproduced rejected-but-active bound-source links and 140 active links from 128 collected requests." },
    { "command": "Read-only SHA-256 and clean-build input/artifact comparisons", "result": "passed", "summary": "Matched 152 relevant inputs and all six built consumer artifacts; hashed external verdict evidence." },
    { "command": "Fresh reviewer browser, install, build, and installed acceptance runs", "result": "not-run", "summary": "Not authorized or needed; inspected owner evidence without starting another browser." }
  ],
  "validationOutput": ["Owner browser evidence: Reader 69 passed; Tasks retry 28 passed; parity retry passed.", "Owner default-worker Tasks run: 1322 passed, 2 failed; isolated embed diagnostic passed 29.", "Pinned independent builds and SDK checks passed; current-host SDK checks failed on 0.6.37 versus 0.6.49 drift."],
  "residualRisks": ["R1 exported-policy safety inconsistency remains unresolved.", "R2 documented browser command can overwrite historical captures.", "Complete Tasks-suite closure and current-host compatibility remain separate gates.", "Installed/native behavior was not verified."],
  "noStagedFiles": true,
  "diffSummary": "No repository source changes. Wrote only this requested review artifact.",
  "reviewFindings": ["required P2 R1: packages/markdown-document/src/destinations.tsx:188 bypasses shared destination restrictions.", "required P2 R2: bb-plugin-tasks-plus/README.md:44 invokes historical-capture overwrite behavior."],
  "manualNotes": "Request changes. Report is frozen on return. The owner must inspect fixes and rerun affected checks; this review does not authorize activation or live data changes."
}
```
