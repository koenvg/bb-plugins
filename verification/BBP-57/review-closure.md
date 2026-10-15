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
