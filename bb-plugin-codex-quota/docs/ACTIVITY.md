# Account activity implementation

BBP-24 starts at `6c6bd792926de897215898e01b1e09c14ddba252` with a clean worktree on `bb/bbp-24-independent-account-activity-thr_psa84ntb6v`. SDK baseline check confirms public SDK 0.5.29 matches the installed host.

## Test seams agreed before tests

- `normalizeActivity(payload, observedAtMs)` accepts unknown upstream input. It returns only bounded numeric summaries and dated token buckets, or null. Missing or invalid fields are null, never fabricated zero.
- `fetchNormalizedActivity(token, signal, fetchImpl, now)` uses one fixed profile endpoint, a 64 KiB streamed response limit, no redirects, and fixed diagnostics. Clock and fetch are injectable. No raw body, headers, claim, email, or credential is returned.
- `ActivityCache.read(identity, load, recheck, force, signal)` owns one host-private independent cache. `peek`, `invalidate`, and `dispose` support clock, account-race, expiry, cancellation, and lifecycle checks. Coalescing cannot bypass a caller's identity recheck or cancellation. Upstream attempts are at least 30 seconds apart.
- `createQuotaHostEntry` gains optional `activityRead` beside the existing injected auth/read/clock. The same private Pi runtime resolves authentication, but caches and endpoint failures stay separate.
- `ActivityRequestState` accepts selected host/generation, an activity-only RPC function, clock, and cancellation. It rejects late results, recalculates expiry without network, and clears unconfirmed values on close/host change.
- `AccountActivity` is an independent disclosure with injected activity RPC and selected host/generation. Closing or hiding it stops requests and scheduling. It never calls quota or history.
- Integration transition seam: `AccountActivity` also accepts the existing selection owner's `selectionPending` and `selectionRevision`. Pending selection unmounts its request body and hides old values. A settled revision remounts the body even if host/generation are unchanged. Public app-slot regressions in `src/selection/selection-integration.test.tsx` hold selection, readiness, activity and quota RPCs independently. They verify both panels clear, no request starts during selection, old results cannot publish, and each panel resumes while quota is still pending.
- A queued activity reader checks its active request sequence and aborted signal immediately before dispatch. Closing details or starting selection before that microtask runs must suppress the call, not only hide its output. Same-turn app-slot and close/reopen request-state regressions cover this boundary.

## Layout decision

Keep host selection, quota refresh, windows, and the official usage link unchanged above a collapsed native `details` control titled "Account details and activity". On expansion, show an account-wide scope explanation, observation time, fixed status, summary values, and daily/weekly/cumulative token tables. Summary labels wrap in a two-column grid at desktop and one column at narrow widths. Tables scroll only inside named, keyboard-focusable regions. Use native disclosure keyboard behavior and normal buttons. Do not show an email or account identifier.

Weekly totals use Monday UTC bucket dates and cumulative totals cover only returned daily buckets, not lifetime activity. Missing dates are not filled. Invalid/duplicate dates make derived values unknown. Limit daily input/output to 366 entries. All sums must stay safe integers. Turn duration may be fractional; tokens and streaks must be nonnegative safe integers.

## Verification scope

Use synthetic credentials, stubbed network, temporary files, and isolated previews only. No real transcript-body scans, installed source switches, plugin enable/reload, collector installation, host/account changes, session restarts, or billed turns are permitted. Desktop/375px previews do not establish live installed acceptance. Record approval-blocked checks in the final evidence report.

## Synthetic preview

The desktop and 375px preview uses the existing React components and generated scoped Tailwind CSS. It shows the maximum safe token count, missing streaks, and derived overflow. The maintained Playwright suite checks stacked/wrapped controls, quota/link access, keyboard table scrolling, stopped reads and page overflow in fresh Chromium contexts.

To repeat without installing or reloading the plugin:

```sh
npm ci
npx playwright install chromium
npm run test:browser -- activity.spec.ts
```

Playwright owns the server and browser lifetime. Screenshots, decoded PNG hashes and layout JSON go to `test-results/`, with attachments in `playwright-report/`. See [browser verification](BROWSER-TESTING.md). The fixture blocks external browser requests. It is not an installed BB slot, real sign-in, or live endpoint check.

The OpenForge Codex Usage package declares MIT. Endpoint/field mapping and UTC weekly grouping are adapted from its `codexUsageAdapter.ts` and `normalization.ts`. Preserve the license in `LICENSE.activity`; do not import or modify that checkout.
