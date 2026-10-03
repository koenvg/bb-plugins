# BBP-24 validation evidence

## Baseline and scope

- Baseline and initial HEAD: `6c6bd792926de897215898e01b1e09c14ddba252`. Initial worktree was clean.
- Branch: `bb/bbp-24-independent-account-activity-thr_psa84ntb6v`.
- Environment: `env_yi8qnqqr6r`, thread `thr_psa84ntb6v`.
- Workspace: `/Users/koen/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_psa84ntb6v-1/bb-plugins`.
- Parent integration branch: `bb/bbp-16-codex-usage-history-thr_2k7buag9sh`.
- Only BBP-24 is implemented. No history storage, collector, discovery, transcript import, local reporting, or pricing logic was added. BBP-1 was not changed.

## Checks and final fix verification

All checks use this isolated checkout. No live credentials or upstream response logs were read.

| Check | Result |
| --- | --- |
| Required test seams recorded before tests | `ACTIVITY.md` |
| Test-first normalization checkpoint | Failed for missing activity module, then passed after implementation |
| Focused normalization/fetch/cache tests | Passed, 34 tests at the first checkpoint |
| Full affected package, `npm test` | Passed, 20 files and 169 tests after the review test fix |
| `npm run typecheck` | Passed, new activity source/tests included |
| `bb plugin types <absolute-package> --check` | Passed, SDK pin and host both 0.5.29 |
| `npm run test:bundle` | Passed, self-contained host artifact with temporary synthetic Pi auth and all network stubbed |
| `npx --yes @fission-ai/openspec validate codex-usage-history --strict` | Passed |
| `bb plugin build <absolute-package>` | Passed after prerequisite checks |
| Isolated React/compiled CSS browser preview | Passed desktop and 375px, no page-wide overflow |
| Real Chromium keyboard check | Enter opens disclosure, arrow key scrolls named table, Space closes disclosure, official link remains focusable |
| Period navigation and close | No new activity request on period change or while closed |
| MIT source package/license | Checked and preserved in `LICENSE.activity`; no runtime source-checkout dependency |
| Lockfile | Unchanged |

The synthetic host bundle verifies actual private Pi runtime reads with temporary auth: successful normalization, cache hit, five-minute stale failure at original observation time, quota failure isolation, an account change during the endpoint read, and disposal. In-process SDK tests cover selected-host routing, invalid/foreign/offline input, host switches, strict bounded wire schemas, and content-free failures. Clock/adapter fixtures cover 24-hour expiry without a request, request coalescing, auth races, uncheckable identities, pending disposal, safe integer overflow, missing values, malformed/oversize bodies, and raw-data exclusion.

The early browser fixture initially lacked BB's generated CSS scope attribute. That fixture was corrected and both screenshots were inspected with scoped CSS before the full UI matrix. Browser-use could not locate the installed default executable; Playwright's default Chromium ran with a new isolated context and no user profile. A native select keyboard sequence was platform-sensitive; the final period-navigation assertion uses Playwright's native select driver. Disclosure, table scroll, and link focus use real keyboard actions.

## Limits and approval blockers

These checks do not establish live installed account activity. No installed plugin source or enabled state was changed. No live collector was installed. No account/host setting was changed, no existing session was restarted, no billed turn was started, and no real transcript body was scanned. Live selected-host profile availability, cross-host daemon operation, and installed BB layout/reload acceptance need the parent's approved BBP-25 workflow. No unavailable check is counted as passed.

The public browser RPC has no signal option in SDK 0.5.29. Client close/host changes cancel local waiting and discard late results; an already-sent wire read can finish within the server/host 12-second bound. Host/server selection change and lifecycle disposal abort owned requests. Quota's polling owner and footer/countdown behavior are unchanged.

## Integration guidance

Cherry-pick this slice; do not copy sibling work into this worktree. Common-file changes are additive:

- `host.ts`: optional injected activity reader, independent reader/cache, handler and dispose hook. Compose any sibling dispose hook rather than replacing it.
- `server.ts`: activity RPC declaration and focused handler registration use the existing host selection/generation and active request set. Dispose aborts that set.
- `contract.ts`: one activity method referencing a separate strict activity schema.
- `app.tsx`: one activity RPC and disclosure child under `QuotaDashboard`.
- `quota-view.tsx`: optional `children` slot below the existing quota content. Parent reporting UI can move the disclosure to the approved bottom position without moving the quota owner.
- `package.json`: append one synthetic activity bundle check. Dependencies and lockfile are unchanged.
- `tsconfig.json` and SDK scanner: additive activity/preview includes and public `react-dom/client` allowance.
- `README.md`: account-only documentation. Preserve sibling history docs and the existing quota/footer/countdown text.

A separate existing typecheck-coverage issue is recorded as BBP-93. It is not implemented in this slice. No worker was dispatched for it.

## Completion review

The one fresh-context, read-only reviewer approved this slice for merge with no blocking findings. The reviewer read all 31 task files, including 22 untracked files, against the recorded baseline. They independently verified the initial 167-test suite and typecheck. They inspected the other check scripts but did not repeat SDK, bundle, build, OpenSpec, or browser checks.

The optional finding was that two routing test names overstated pending-disposal coverage. The names now match their assertions. Two direct SDK host/server tests hold synthetic reads, dispose before releasing them, assert aborted owned signals and prompt unavailable results, then reject late numeric output. The focused eight-test routing suite and full 169-test suite pass. Typecheck, SDK check, and bundle checks pass after this test-only fix. No production code changed after review. No second review ran.

BBP-24's bounded implementation, tests, docs, and review criteria are met. Installed/live acceptance remains blocked by approval and is not included in that claim. See the parent's BBP-25 acceptance workflow and the attached review/handoff for the exact limits.
