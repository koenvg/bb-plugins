# Installed acceptance — 25 September 2026

Environment: BB 0.43.4, Plugin SDK 0.5.9, Pi 0.87.1. The standalone `codex-quota` plugin was installed from this package on the selected connected, enrolled host. BB's `provider-usage` plugin remained disabled throughout. No Pi model turn was sent; only the private Codex quota GET was used.

- The installed `selectHost`/`read` RPC returned `fresh`/`ok` with one normalized general window. In Arc, the dashboard showed **23% remaining** in the **7 days** window, its reported reset on 29 September 2026 at 21:09 CEST, the optional **pro** plan, and **1 reported banked reset**. The sidebar badge showed `23% left` with an accessible host, window, and observation label. Percentages are computed as `100 - used_percent`; 0% and 100% boundary math, ties, invalid input, additional limits, and unknown counts are covered by unit tests. Raw upstream values, claim IDs, tokens, and headers were not printed or stored in BB plugin state.
- Wide and 375px Arc previews showed the summary and official link. At compact width the badge was hidden by BB as expected; the dashboard remained accessible through the drawer. The native sidebar row activated with mouse and Enter, preserved the host selection, and closed the drawer. The official link was focusable and pointed to `https://chatgpt.com/codex/settings/usage`; visiting that URL in signed-in Arc redirected to Codex's analytics view. This does not establish that Arc's browser account matches Pi's host account.
- After the original observation aged past five minutes while the page stayed open, it was labeled **stale** without a failed refresh. Refresh returned a new `fresh` observation, preserving the same selected host. Fake-host and UI tests cover offline/auth failures, account/host switches during delayed requests, a 24-hour expiry, shared badge/dashboard reads, and timer cleanup. No live OAuth credential was invalidated to stage a failure.
- Disabling the plugin removed its panel; re-enabling it and reopening the route restored the view and a fresh selected-host observation. The installed plugin log was empty when inspected. The public-SDK-only scan, package tests, typecheck, SDK pin check, and build passed.

After the copy and badge revision, the plugin was rebuilt and reloaded. Arc showed **22%** in the expanded sidebar entry and **22% remaining** on the dashboard for the same selected host. The summary now has one `Updated 25 Sept, 13:40 CEST` line rather than duplicate freshness text; no plugin loading spinner is shown. The installed badge was fresh with a host, binding window, percentage, and observation in its accessible label. BB hides the accessory in compact layouts, where the dashboard still opens.

The completion review found an unrestricted feasibility probe, an unfenced old-host cache result, out-of-order host selection, a failed forced refresh presented as unavailable, and a fresh badge during loading. The production probe was removed. Selection calls now have an invocation guard and cancel in-flight host reads; the host cache checks cancellation before publishing. Failed refreshes retain a clearly stale snapshot, and the badge shows no fresh percentage while updating. Regression tests cover these paths. The final package suite passes **35 tests across 9 files**, typecheck, `bb plugin types --check`, and synthetic fresh/refresh bundled OAuth checks. No real OAuth refresh or live failure state was induced.
The Codex quota endpoint is private and may change. Missing banked-reset fields remain unknown, never zero; the plugin has no reset redemption, transcript reader, collector, or token/cost-history feature. BBP-1 remains separate.

## Distilled layout and repeat navigation

The plugin was rebuilt and installed from `/Users/koen/workspace/bb-plugins-codex-quota/bb-plugin-codex-quota`, moving the existing installation without dropping settings. In signed-in Arc, the refreshed desktop and 375px views showed **21% remaining**, the 7-day reset, **1 banked reset**, and the official link without cards. Additional limits collapse when present. The sidebar displayed **21%**. A first load without a selected host showed reserved sections rather than an error or spinner.

Before the completion-review fix, a return from another BB page held the Windows section at 316px while status moved from `Updated` to `Updating · last checked` and back. The review found that browser memory had been skipping account revalidation while an observation was fresh. It now marks the observation non-current immediately, checks the selected host again on return or focus, and lets the host cache answer without another quota GET when the account is unchanged. A changed or uncheckable identity cannot return the previous account’s percentage as fresh. The old feasibility parser and its redundant tests were removed; the production normalizer is the only window parser.

After rebuilding and reloading that fix, a signed-in Arc return showed a quiet placeholder at 500 ms, then **20% remaining** at 900 ms with the same observed time as before navigation. Once mounted, Windows stayed at 316px; no error or spinner appeared. This is one observed host and browser route, not a live account-switch or OAuth-failure trial. Host-cache and browser-store tests cover those transitions. The final suite passes **38 tests across 8 files**, typecheck, `bb plugin types --check`, and synthetic bundled OAuth fresh/refresh checks.

## Footer placement — 30 September 2026

Environment: BB 0.44.0 and Plugin SDK 0.5.29, in Arc. Installed this worktree's `bb-plugin-codex-quota` package under the existing `codex-quota` ID; Provider usage stayed disabled. No BB core/SDK files, OAuth storage, schedules, or persisted sidebar preferences changed.

- At desktop and 375px with the drawer open, the native footer showed the existing icon plus the live percentage (75% initially, 73% in the captured mobile view), without a persistent product name. There was one badge and no visible duplicate upper navigation entry.
- Mouse activation on the percentage opened the existing quota dashboard at both widths. Enter and Space also opened it from the compose page, and the compact drawer dismissed. Ordinary navigation preserved the selected host. The first live pointer check caught React portal event ancestry bypassing the native button; `pointer-events: none` on the presentational badge fixed it, with a failing-then-passing regression test.
- A temporary 224px desktop sidebar remained usable with `100%`, `Stale`, and `—`, including simultaneous hover and focus. The widest button was about 73px; neighboring controls did not overlap. The 100%/stale/placeholder width checks used temporary display-only substitutions, not an account observation. All substitutions were restored. Compact 100% layout was checked at 375px too.
- Temporarily hiding the installed footer item restored the upper entry. Restoring the item produced exactly one badge and suppressed the upper entry again. This tested live DOM visibility, not a change to the user's persisted footer preferences.
- CLI reload/disable/enable did **not** update the already-open Arc tab's plugin registry during the observation window: even BB's native footer registration stayed mounted. A page reload was needed to load the rebuilt bundle. No-page-reload disable cleanup is therefore **not established by this live check**. SDK-harness tests exercise content-script disposal, overlay unmount, deferred activation cancellation, and remount without leaked owned nodes or description references.
- Backend reload/disable resets the pre-existing in-memory host selection. The same host was reselected after those operations; this change does not introduce host-selection persistence.

Cropped installed screenshots (excluding thread content):

- [Desktop footer](../docs/codex-quota-footer/footer-desktop.png)
- [375px open-drawer footer](../docs/codex-quota-footer/footer-mobile.png)
- [224px sidebar, synthetic 100%, hovered and focused](../docs/codex-quota-footer/footer-narrow-100.png)

Validation: **76 tests across 11 files**, `npm run typecheck`, `bb plugin types --check`, `bb plugin build`, public-SDK-only scan, and synthetic bundled OAuth fresh-token/refresh tests passed. Footer integration tests cover first load without a dashboard, 0%/72%/100%, accessible descriptions, shared pending reads, focus revalidation, freshness aging and expiry without polling, timer cleanup, and old-host result rejection. No live OAuth failure or account switch was induced.

### Completion-review fix

The single fresh-context review found one blocking P2 issue: BB's Radix tooltip overwrote the quota button's `aria-describedby` attribute during hover or focus. The adapter now observes changes to that shared attribute, appends its token only when missing, and preserves the host's current tokens. Disposal still removes only the plugin's reference.

A real Radix trigger regression failed before the fix and passed afterward. It checks open/close transitions, accessible quota details, current host-reference preservation, idempotent reconciliation, and disposal while the tooltip is open. The test uses an already-declared development dependency; no package or lockfile changes were needed.

Post-fix validation passed **77 tests across 12 files**, typecheck, SDK pin/public-import checks, build, and both synthetic bundled OAuth checks. The rebuilt installed plugin was refreshed in Arc. During one native tooltip open/close cycle, Chrome's accessibility tree retained the quota details in both states; the open button referenced both descriptions, and the closed button referenced only the quota description. A second automation cycle did not reopen the tooltip before timeout, so repeated live cycles are not claimed. The regression test covers repeated transitions.

The review's code finding is resolved. No second review was run for the original footer work. The user approved closing the change with the live no-page-refresh disable/re-enable verification gap documented, without BB core or SDK changes. Task 3.2 is accepted with that limitation; no additional live lifecycle verification is claimed.

## Battery icon follow-up

The user requested a battery logo that changes with remaining allowance. The plugin now registers `codex-quota-battery` through the public `experimental_icons` API and references it from branding, the footer action, and the fallback navigation entry. The icon only subscribes to the existing quota store; it adds no requests, intervals, DOM replacement, or dependencies. Its fill and the text badge share one fresh/idle allowance rule.

- In the installed Arc session, the live footer showed `71%` and a matching battery fill. Desktop and 375px measurements showed a 16px icon and an approximately 69px button, unchanged from the previous footer's sizing. The compact screenshot below captures that live value.
- Clicking the battery itself and pressing Enter from the compose page both opened the quota dashboard, dismissed the compact drawer, and preserved the selected host. The native button remained named "Codex quota"; its accessibility-tree description retained host and observation details. Both description references resolved while the tooltip was open, and the SVG remained decorative.
- Presentation tests cover proportional fill at 0%, 5%, 25%, 50%, 72%, and 100%, plus clearing the fill for pending, loading, stale, expired, offline, and missing-selection states. The SVG specimen below was rendered from the actual component with fixture values, not live account observations. Width checks found no neighboring-control overlap at the maximum text width.
- SDK integration tests confirm that branding/footer/navigation use the registered icon, rendering the icon alone starts no intervals or SDK quota calls, the fill follows shared reads and freshness changes, and delayed old-host results cannot change it.

Validation passed **85 tests across 12 files**, `npm run typecheck`, `bb plugin types --check`, the public-SDK scan, build, and both synthetic bundled OAuth checks. The prior user-approved live reload/disable verification limitation still applies.

- [Live compact battery footer](../docs/codex-quota-footer/battery-mobile.png)
- [Rendered component specimen: 0%, 15%, 50%, 100%, unavailable](../docs/codex-quota-footer/battery-levels.svg)

### Battery review fix

The battery's single completion review found that app-wide icons could retain a fresh-looking fill after every quota view unmounted and its clock stopped. The store now distinguishes active quota owners from passive subscribers. Removing the last owner immediately makes all icons neutral, and a late read cannot restore fill without an active owner. Returning views still perform the existing account revalidation.

Three regression cases failed before the fix and pass afterward. They cover owner reference counting and idempotent release, retained and newly mounted icons beyond freshness and expiry, continued fill while one owner remains, revalidation on return, and pending reads that finish after teardown. Icons add no requests, intervals, or focus listeners.

Post-review validation passed **88 tests across 12 files**, typecheck, SDK pin/public-import checks, build, and both synthetic bundled OAuth checks. The rebuilt plugin was reloaded and the Arc page refreshed. After reselecting the same host, its installed footer showed matching `69%` text and battery fill. Ownerless-icon transitions are established by lifecycle tests, not a new live disable/re-enable claim. The review finding is resolved, with no second review pass.

## Context-menu fix and stable source recovery, 1 October 2026

The installed temporary worktree disappeared during the first verification attempt. Its last committed plugin version was recovered from `e9c1e4aa36e6454483bce959f86e669f0792965f` into `/Users/koen/workspace/bb-codex-quota-fix`. The existing `codex-quota` local-path installation was moved to that stable checkout without removing the plugin or its stored configuration. The same host was reselected after backend reload, which resets the pre-existing in-memory selection.

The footer adapter no longer treats `aria-hidden` as visual removal. Modal context menus isolate the background from screen readers without removing its controls; that isolation had detached the footer badge and restored the duplicate upper quota entry. The adapter still falls back when the footer is hidden, inert, disabled, visually hidden, removed, or ambiguous. It does not change the host's accessibility attributes.

- The existing DOM-adapter regression failed before the fix and passed afterward. Background isolation and its removal keep the same badge target attached and the upper entry suppressed, while preserving `aria-hidden`.
- All **89 tests across 12 files**, `npm run typecheck`, `bb plugin types --check`, the public-SDK scan, build, and synthetic bundled OAuth fresh-token/refresh checks passed.
- In signed-in Arc at 1280px, the installed dashboard and footer showed matching `65%` allowance and battery fill. A native sidebar right-click menu opened while the upper quota entry remained `display: none` and exactly one footer badge stayed attached. This menu did not itself isolate the sidebar; adding its original bug-triggering `aria-hidden` state temporarily while the menu was open preserved suppression and the attachment. The original accessibility state was restored and the menu dismissed. The current thread-list replacement did not open a menu on thread right-click, so that exact gesture is covered by the background-isolation regression rather than claimed as a live reproduction.

The footer indicator, dashboard, and genuine footer-unavailable navigation fallback remain unchanged. No sidebar preferences, OAuth storage, BB core, SDK contracts, or dependencies were changed.

The single fresh-context completion review approved the fix with no blocking findings. It independently reran all 89 tests, typecheck, and diff whitespace checks. No revisions or second review pass were needed. The exact live thread-right-click coverage limit above remains.
