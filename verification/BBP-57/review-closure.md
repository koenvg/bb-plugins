# BBP-57 review closure

The single fresh independent whole-change review requested changes for two reproduced P2 findings. Its original report is retained unchanged in the linked work thread. This file records owner closure, not a second independent approval.

## 1. Bound default Raw nodes

The original common Raw path added one span per source line to Tasks. The owner reproduced the finding with 30,000 newline bytes before editing production code. The regression failed on the annotated DOM count.

Default Raw now renders exact source as one text node. Explicit `annotateSourceLines` or a valid range request enables source-line targets. Reader opts in to preserve its existing range, focus and selection provenance. Tasks does not. Public tests cover 30,000 newline bytes and the full 1 MiB cap, asserting exact text, one text node and no line annotations. Both plain and annotated paths retain BOM, mixed terminators and the final empty source line. The original annotated-line assertion remains covered.

A production Tasks browser case opens a newline-dense saved attachment and verifies exact Raw, one text node, no annotations, one read and focus return. Reader's full browser suite retains range and selection assertions. Reader's pre-existing annotated-line cost is separately recorded as [BBP-249](bbtask://BBP-249), not claimed fixed here.

## 2. Keep invalid remote grants inert

The owner reproduced `TypeError: Invalid URL` for a remote grant containing `relative.png` through the public presenter. The guard now requires both the requested and granted URLs to be HTTP(S), in addition to common lexical validation, before constructing absolute URLs. This adds rejection and does not weaken capability or source restrictions.

Five public cases cover relative, root-relative, malformed-encoding, malformed-HTTP and executable-scheme grants. Each retains readable alt text without an image or exception. Existing grant-kind, same-origin, credential/referrer and source-capability tests remain intact.

## Verification

- The combined red run failed on exactly the dense Raw case and relative remote grant.
- Shared public suite passes 59 cases after both fixes.
- Reader unit suite passes 235 cases.
- Full Reader browser suite passes 69 cases after the explicit annotation opt-in.
- Tasks browser suite passes 16 cases, including the new dense attachment case and four matched report/live-theme cases.
- Final type, lint, fresh-build and affected Tasks checks are recorded in [the validation report](report.md).

Retained logs are `parent-validation/review-findings-red.log`, `review-findings-green.log`, `reader-after-findings.log`, and the browser after-findings directories in thread `thr_dfv3azhs3e`. Original review artifact hashes and exact copies were retained before rebuild under `review-original-artifacts/`. No reviewer report was rewritten and no additional review pass was launched.

## Post-rebase verification

After integration with merged BBP-56, all 92 shared, 235 Reader and 1,323 Tasks unit cases pass. All 69 Reader and 22 Tasks browser cases pass, including the upstream technical-report cases. Shared highlighting guards are byte-for-byte unchanged from `e6484c6`. Parent reran matched production-consumer styles/theme checks, types, root checks and fresh isolated SDK/build checks. See `rebase-validation/` in thread storage. Hosted CI and installed acceptance were not run. This remains owner verification of the two fixes, not a new independent verdict.

## BBP-55 reconciliation

The operator approved preservation of merged Tasks navigation, links and remote images. The current shared suite passes 110 cases; Reader passes 235 unit and 69 browser cases; Tasks passes 1,324 unit and 28 browser cases. Fresh isolated type, SDK, compiled ESM and consumer builds pass against pinned tooling, with the opposite source and shared dist absent.

Raw's existing 1 MiB regression exposed eager parsing/indexing cost under load. Default Raw now reads the exact string; line indexing is lazy and blank ASCII input skips parsing. No timeout changed. New coverage retains Unicode paragraph whitespace and proves default Raw does not access the line index. Annotated Reader DOM remains BBP-249.

The preserved upstream remote loader and highlighting guards are unchanged. New red/green cases retain link titles and prevent outline navigation under denied local permissions. Owner also fixed the literal-heading/footnote collision without relaxing upstream assertions. This is owner verification of reconciliation, not another whole-change independent verdict.

Current-host SDK checks report 0.6.49 versus the consumers' 0.6.37 pins. BBP-252 records that separate migration prerequisite. The clean verifier now isolates ambient BB environment variables and checks the declared BB 0.46.0 toolchain; it does not certify current-host acceptance. No migration or activation occurred.
