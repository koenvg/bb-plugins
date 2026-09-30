# Codex Quota

This standalone BB plugin shows quota windows for the Pi `openai-codex` account on an explicitly selected enrolled host. Its sidebar and dashboard passed installed acceptance on BB 0.43.4 with BB's Provider usage plugin disabled; see [ACCEPTANCE.md](ACCEPTANCE.md). It never calls `system.usageLimits`.

## Sign-in and account scope

Sign in to OpenAI Codex through Pi **on the selected host** before checking quota. The host worker uses Pi's existing OAuth credentials; it does not initiate a model turn or copy tokens to BB's server or browser. The selected Pi account can differ from the account signed in to your browser. Open [Codex Usage](https://chatgpt.com/codex/settings/usage) to check details, expiry, and redeem resets yourself; this plugin does not redeem them.

The browser gets bounded normalized percentages and reset times, an optional known plan, and a banked-reset count only when the upstream explicitly reports a nonnegative integer. **Unknown** is not zero. The limiting general window is the lowest remaining percentage; additional/model-specific limits stay separate. These percentages are not exact token balances or costs.

## Sidebar footer

The lower sidebar shows a battery icon and remaining percentage beside Settings and Debug, without a persistent product-name label. The battery fill follows the current remaining allowance. Click it, or focus it and press Enter or Space, to open the existing dashboard. The icon and percentage stay visible on hover, keyboard focus, and in the open compact sidebar.

A fresh, idle observation shows its percentage and proportional battery fill. Loading, missing selection, and unavailable data show an unfilled outline and a placeholder; an old observation shows an outline and "Stale". A fresh 0% observation also has an empty battery, with `0%` distinguishing it from unknown allowance. The button's accessible description includes the host, binding window, and observation time.

If no quota view is mounted to maintain freshness and revalidate the account, battery icons elsewhere in BB show an unfilled outline. Opening a quota view restores the fill only after the normal revalidation completes.

BB's footer API has no live badge field. This plugin uses a scoped DOM adapter to add one to its own native button. The adapter hides the upper quota entry only while the badge and dashboard navigation work. If the footer is hidden, its markup changes, or the enhancement unmounts, normal navigation returns according to your existing visibility preferences. Runtime teardown removes the plugin's DOM changes. A future BB update may require an adapter update.

The installed BB 0.44.0 acceptance check needed a page refresh to pick up CLI plugin lifecycle changes. If reloading or enabling the plugin does not update the UI, refresh the app.

The selected host remains shared when navigating between pages. Selection is server-process memory in the existing implementation, so a plugin/backend reload requires selecting the host again; this change does not add persistence.

## Reset countdown

The summary shows time left until the limiting window resets. Each window also shows its own countdown and exact reset date. Durations use whole days and hours, hours and minutes below one day, and minutes below one hour. Under a minute, the label is "Less than a minute left". Missing reset times remain unknown.

Countdowns advance within a minute while the page is active, without extra quota requests. "Reset due" means the reported reset time has arrived, not that new allowance has been confirmed. The normal fresh dashboard omits the routine "Updated…" line; updating feedback, stale observation timestamps, and sidebar observation metadata remain available.

## Freshness and limitations

A successful snapshot is fresh for less than five minutes. Older values are labeled stale with their original observation time, even without a refresh failure, and are unavailable at 24 hours. A failed quota GET can retain an explicitly stale observation. On return or focus, the browser marks its observation non-current until the selected host checks Pi's active account; the host cache can answer that check without another quota GET. Offline hosts and changed or uncheckable identities cannot return another account's snapshot as fresh. Host worker memory is the only authoritative quota cache; reload discards it. The private Codex quota endpoint and its response fields can change without notice.

No Pi or BB transcript/session history is read. There is no collector, thread cost/token attribution, historical import, or background reset redemption. BBP-1 tracks the separate history investigation.

## Development checks

From this directory run `npm test`, `npm run typecheck`, `bb plugin types --check`, and `npm run test:bundle`. Bundle tests use temporary synthetic credentials and stubbed responses for both fresh and expiring OAuth tokens, without live network. The historical host OAuth/quota probe is recorded in [FEASIBILITY.md](FEASIBILITY.md); the production probe RPC has since been removed.
