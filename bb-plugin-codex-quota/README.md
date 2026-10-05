# Codex Quota

This standalone BB plugin shows quota windows for the Pi `openai-codex` account on an explicitly selected enrolled host. Its sidebar and dashboard passed installed acceptance on BB 0.43.4 with BB's Provider usage plugin disabled. It never calls `system.usageLimits`.

## Sign-in and account scope

Sign in to OpenAI Codex through Pi **on the selected host** before checking quota. The host worker uses Pi's existing OAuth credentials; it does not initiate a model turn or copy tokens to BB's server or browser. The selected Pi account can differ from the account signed in to your browser. Open [Codex Usage](https://chatgpt.com/codex/settings/usage) to check details, expiry, and redeem resets yourself; this plugin does not redeem them.

The browser gets bounded normalized percentages and reset times, an optional known plan, and a banked-reset count only when the upstream explicitly reports a nonnegative integer. **Unknown** is not zero. The limiting general window is the lowest remaining percentage; additional/model-specific limits stay separate. These percentages are not exact token balances or costs.

## Sidebar footer

The lower sidebar shows a battery icon and remaining percentage beside Settings and Debug, without a persistent product-name label. The battery fill follows the current remaining allowance. Click it, or focus it and press Enter or Space, to open the existing dashboard. The icon and percentage stay visible on hover, keyboard focus, and in the open compact sidebar.

A still-fresh observation keeps its percentage and proportional battery fill during an update. Initial loading without an observation, missing selection, and unavailable data show an unfilled outline and a placeholder. At five minutes the text becomes "Stale" and the battery becomes an outline, even if an update is still pending. A fresh 0% observation also has an empty battery, with `0%` distinguishing it from unknown allowance. The accessible description includes the host, binding window, observation time, and updating state.

One app-window owner maintains freshness independently of the dashboard, accessory, and footer. Those views and battery icons only subscribe. Disposing the app owner stops its clock and refresh timer and makes passive battery icons neutral. A new owner starts with unconfirmed data until selection and quota checks complete.

BB's footer API has no live badge field. This plugin uses a scoped DOM adapter to add one to its own native button. The adapter hides the upper quota entry only while the badge and dashboard navigation work. If the footer is hidden, its markup changes, or the enhancement unmounts, normal navigation returns according to your existing visibility preferences. Runtime teardown removes the plugin's DOM changes. A future BB update may require an adapter update.

The installed BB 0.44.0 acceptance check needed a page refresh to pick up CLI plugin lifecycle changes. If reloading or enabling the plugin does not update the UI, refresh the app.

The selected host remains shared when navigating between pages. Selection is server-process memory in the existing implementation, so a plugin/backend reload requires selecting the host again; this change does not add persistence.

## Reset countdown

The summary shows time left until the limiting window resets. Each window also shows its own countdown and exact reset date. Durations use whole days and hours, hours and minutes below one day, and minutes below one hour. Under a minute, the label is "Less than a minute left". Missing reset times remain unknown.

Countdowns advance within a minute while the app window is open. Clock ticks do not issue quota requests. "Reset due" means the reported reset time has arrived, not that new allowance has been confirmed. The normal fresh dashboard omits the routine "Updated…" line; updating feedback, stale observation timestamps, and sidebar observation metadata remain available.

## Background refresh

Refresh runs only while a BB app window is open, including when the dashboard is closed or its accessory is unmounted in compact layout. You must explicitly select an enrolled host. With no selection, the window checks for a selection once a minute without requesting quota.

The owner first makes a normal cache-aware read. After completion, it schedules a forced refresh in 60 seconds. Rejected requests and stale or unavailable responses retry after 60, 120, 240, then 300 seconds, capped at 300 seconds. A fresh result resets the cadence. Manual refresh can retry before the browser deadline and shares any in-flight read; the host still coalesces clients and limits upstream attempts to one per 30 seconds.

Browsers can suspend or throttle background windows, so this is not an exact one-minute delivery guarantee. Resume performs at most one overdue read rather than replaying missed intervals. Each window owns and disposes its timers and listeners; closing one does not stop another. There are no server or host polling jobs that continue after all app windows close.

## Freshness and limitations

A successful snapshot is fresh for less than five minutes. Pending updates do not change its observation time or extend that validity. For example, an observed 42% remains visible while updating at one minute; at five minutes the badge reads "Stale" and the dashboard labels its retained 42% as stale, including during an update. At 24 hours neither view shows the discarded percentage. A failed quota read may retain an explicitly stale observation with its original timestamp. These are observed percentages, not real-time balances.

Focus and visibility resume synchronize the server's selected host and recalculate age. An unchanged selection keeps a valid observation; a changed selection clears it immediately. A quota read occurs only when due, so repeated focus cannot bypass failure backoff. The host checks Pi's active account on quota reads; offline, changed, or uncheckable identities cannot return another account's snapshot as fresh. Host worker memory remains the authoritative quota cache, and reload discards it. The private Codex endpoint and its response fields can change without notice.

No Pi or BB transcript/session history is read. There is no collector, thread cost/token attribution, historical import, or background reset redemption. BBP-1 tracks the separate history investigation.

## Development checks

From this directory run `npm test`, `npm run typecheck`, `bb plugin types --check`, and `npm run test:bundle`. Bundle tests use temporary synthetic credentials and stubbed responses for both fresh and expiring OAuth tokens, without live network. The production probe RPC has been removed.
