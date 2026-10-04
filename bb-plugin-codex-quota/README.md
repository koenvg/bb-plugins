# Codex Quota

This standalone BB plugin shows quota windows for the Pi `openai-codex` account on an explicitly selected enrolled host. Its quota-only sidebar and dashboard passed installed acceptance on BB 0.43.4 with BB's Provider usage plugin disabled. It never calls `system.usageLimits`.

## Sign-in and account scope

Sign in to OpenAI Codex through Pi **on the selected host** before checking quota. The host worker uses Pi's existing OAuth credentials; it does not initiate a model turn or copy tokens to BB's server or browser. The selected Pi account can differ from the account signed in to your browser. Open [Codex Usage](https://chatgpt.com/codex/settings/usage) to check details, expiry, and redeem resets yourself; this plugin does not redeem them.

The browser gets bounded normalized percentages and reset times, an optional known plan, and a banked-reset count only when the upstream explicitly reports a nonnegative integer. **Unknown** is not zero. The limiting general window is the lowest remaining percentage; additional/model-specific limits stay separate. These percentages are not exact token balances or costs.

## Account details and activity

Open **Account details and activity** below the quota windows and official usage link. This section is collapsed by default and makes no activity request until you open it. Use **Refresh activity** to request a new account observation. This button does not refresh quota. Changing Daily, Weekly, or Cumulative changes only the displayed table.

The profile endpoint can report lifetime tokens, peak daily tokens, daily token buckets, longest turn duration in seconds, and current/longest streak days. Each missing or invalid value is **Unknown**, not zero. Weekly totals group the returned daily buckets by Monday UTC. Cumulative totals cover those returned buckets only, not lifetime usage. Missing dates are not filled. Invalid/duplicate dates or more than 366 daily buckets make those tables unknown. Overflow makes the affected derived totals unknown, while valid daily buckets remain available.

These values are **account-wide Codex activity**. Local collected history, when available, is **selected-host Pi usage**. The scopes can differ. Account activity does not fill local gaps, set monetary prices, or prove that old records belong to the current account. It needs no collector, history database, transcript import, or transcript read.

Activity uses the selected enrolled host's existing Pi sign-in. Credentials, account claims, headers, and raw responses stay on that host. The browser receives only fixed status codes, observation time, numeric summaries, and dated token buckets. It receives no email or account identifier.

The activity cache is independent from quota and stays in host-worker memory. Reads share pending work and allow at most one upstream attempt per 30 seconds, including manual refresh. A successful observation is fresh for less than five minutes. It expires at 24 hours, even without a new request. A failed update retains stale values only after the host confirms the same identity, with the original observation time. Changed or uncheckable identities discard them. Host-worker eviction or reload discards its cache.

While details are open and the page is visible, activity refreshes when due. Failure retries wait at least 30 seconds. Closing details or hiding the page stops its timer and clears unconfirmed browser data. Reopening makes a cache-aware identity check. The public browser RPC does not expose wire cancellation; closing discards its pending result, and any already-sent server/host read is bounded to 12 seconds. Starting a host switch immediately clears activity and stops its scheduling. Its check stays disabled until selection settles, then makes an independent cache-aware read without waiting for quota authentication. This also applies when switching back to the same committed host/generation. The existing app-window quota refresh owner is unchanged.

At narrow widths, summary cards stack and values wrap. Token tables have named focusable scroll regions. Use Tab to focus a table and the arrow keys to scroll it. Use Enter or Space on the native disclosure to open or close details.

### Activity troubleshooting

- `auth-required` or an auth/OAuth status: check Pi Codex sign-in on the selected host. Do not change browser sign-in to repair host authentication.
- `host-offline`: reconnect the selected enrolled host. Results from other hosts are not a fallback.
- `service` or `network`: retry after 30 seconds. Valid quota is unaffected. Local history has no sign-in requirement.
- `unsupported`: the private endpoint changed, its response was malformed, or it exceeded 64 KiB. Unknown fields are not repaired with quota or local usage.
- `expired`: the observation is at least 24 hours old. A new successful read is needed before numeric activity can appear.

This slice passed isolated synthetic checks only. Existing quota acceptance does not certify live activity. Installed plugin changes and live account checks still require approval. See [ACTIVITY.md](ACTIVITY.md) for test seams and preview instructions.

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

Quota and account activity do not read Pi or BB transcripts, require a collector, or start an import. BBP-1 remains a completed investigation. History readiness is a separate host-local check. This release does not provide historical reports, live collection controls, or reset redemption.

## Selected-host history readiness

Select an enrolled host, then read the History readiness section below the quota controls. It checks the host's SQLite support and only this plugin's collector asset. Check readiness retries that check, not quota. It does not create a database, install an extension, read transcript bodies, scan sessions, or start an import. No account sign-in is needed for readiness.

- **Not configured** means storage support is present but the database or collector is missing. Quota remains usable.
- **Storage unavailable** means the host cannot provide SQLite or read plugin-owned storage. No server-machine storage fallback is used.
- **Storage incompatible** means the file type or schema marker is unsupported. The check does not migrate, delete, or repair it.
- **Collector incompatible** means the plugin-owned asset is unreadable, oversized, modified, or uses a different host configuration/version. Other extensions are not inspected or loaded by this check.
- **Compatible asset, version 1** checks the exact packaged code and serialized host configuration. It does not prove that a running Pi session loaded it. Writer activation remains unconfirmed, and no complete-history claim follows from installation.

The host database path is `<host plugin dataDir>/history/usage-v1.sqlite`. BB supplies the persistent, plugin-scoped data directory through its public host SDK. The packaged collector uses that fixed path, not an OpenForge checkout or BB server connection. Its own extension name is `bb-codex-usage` under Pi's resolved agent extension directory. It never replaces `openforge-codex-usage` or other extensions. There is no install/import action in this readiness release. Do not install the test fixture into your live Pi configuration.

A collector runs separately from BB's UI and plugin lifecycle. Closing the dashboard or disabling BB cannot stop a writer on an offline host. A future explicit installation must explain pause controls and require restarting already-running Pi sessions to load the new extension. No session is restarted by this release.

The compatibility asset stays inactive without explicit compatible plugin-owned control metadata. Its isolated loading fixture tests scalar-only synthetic usage and shutdown draining. Historical reconciliation, live-entry confirmation, durable coverage, collector controls, and reports belong to the next slices. Captured costs are usage estimates, not subscription charges or measured quota debits. Unknown prices are not zero. Neither readiness nor quota inspects retained transcripts.

Missing capabilities, offline hosts and history errors do not remove quota refresh, the sidebar footer, reset countdowns or the official usage link. Starting a host switch clears readiness immediately and disables its check until selection settles. Readiness resumes independently from quota authentication and rejects earlier-host responses, including a switch back to the same host. Browser results contain only bounded status values, not local paths, usage logs, authentication data or arbitrary errors.

## Development checks

Packaged history checks use real temporary `node:sqlite` storage, a copy of the host bundle outside its dependency tree, and Pi 0.87.1's public extension loader in a temporary agent directory. They test both the missing-control and explicit synthetic-control paths. Run `node scripts/check-bundled-history.mjs` on Node 22 or later after building. The Node 22 compatibility run is recorded separately from the default Node 24 development run. These checks are not installed acceptance or proof of real costs/capture.

From this directory run `npm test`, `npm run typecheck`, `bb plugin types --check`, and `npm run test:bundle`. Bundle tests use temporary synthetic credentials and stubbed responses for both fresh and expiring OAuth tokens, without live network. The activity bundle check also verifies independent failures, real private-runtime account rechecks, and disposal with temporary synthetic auth. The production probe RPC has been removed.
