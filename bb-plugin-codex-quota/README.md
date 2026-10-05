# Codex Quota

Built against BB 0.45 and Plugin SDK 0.6.15. See [ARCHITECTURE.md](ARCHITECTURE.md) for module ownership, test seams, and durable local installation.

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

Quota and account activity do not read Pi or BB transcripts, require a collector, or start an import. BBP-1 remains a completed investigation. History readiness is a separate host-local check. This release provides opt-in live workspace totals, with verified exact-thread attribution, and explicit configured-source import, plus bounded 30-day calendar recorded-usage reports. It does not redeem resets.

## Thirty-day calendar usage

The primary page shows the remaining allowance, then a Recharts bar chart with date and value axes. Recorded usage covers thirty local dates ending yesterday in the viewer's IANA timezone. Previous/Next move by thirty calendar dates within retained bounds. Choose Tokens or Estimated cost; metric changes are local. Grouping, comparison, ranking and daily-detail sections are not shown on this page.

Hover a date or use the chart's keyboard navigation for exact values, coverage, pricing and recorded exclusions. A screen-reader table carries the same facts. Missing values are unavailable, not zero. Only reliable scoped observed inactivity permits token zero; imported, omitted, paused, recovery and unfinished-work intervals do not certify inactivity.

Captured estimated cost uses only original finite positive eligible Pi prices. Missing/zero/negative/invalid prices keep their tokens but remain unpriced. No eligible price means unavailable money, not zero or free use. Priced-record counts and distinct priced-entity averages are separate from the all-record token denominator. Tiny positives do not round to a monetary zero; unsafe sums become unavailable without removing useful tokens. Dollar labels are captured estimates, not billed subscription charges. No current model price, currency conversion or account allocation is used.

The reporting API retains conservative current/prior known subtotals, verified thread attribution and entity denominators. The primary chart uses the selected host's workspace totals without assigning unknown workspace usage to threads. Active-period percentages remain unavailable because existing evidence cannot prove complete active collection.

Opening the page or changing host makes the same normal, bounded readiness/index attempt used before this layout change. That attempt can maintain storage and does not prove complete collection. Chart navigation and Retry chart read the bounded index only, without quota/activity calls, transcript reads, import execution or collector/root changes. An unavailable chart offers Retry chart, or Latest 30 days for an invalid range. Collection, identity, import, account activity and additional quota windows are in the plugin's Usage collection settings section.

See [CALENDAR.md](CALENDAR.md) for states, retention, keyboard use, read-only storage limits and synthetic verification. Quota and the official link remain above report failures. This slice has no installed/live acceptance and does not prove complete active-range comparisons.

## Selected-host collection and workspace totals

Select an enrolled host. History readiness checks SQLite support and this plugin's asset without installing it or using account credentials. **Check readiness** also reconciles compact plugin-owned logs after installation. It never discovers or reads transcript bodies, starts an import, or refreshes quota/activity.

Open **Collection and privacy** for these explicit selected-host actions:

- **Install collector** creates only `bb-codex-usage/index.js` under Pi's resolved agent extension directory and enables capture. Other extensions and settings stay unchanged.
- **Repair collector** atomically replaces only that asset. It preserves earlier events, the immutable first observation boundary and paused state. It cannot repair a newer/unsupported database or damaged or missing control metadata on an established installation. It fails closed and does not enable a paused collector. Reinstall also cannot bypass lost control metadata.
- **Pause capture** publishes disabled control metadata. Loaded collectors check it before each new append. Already-owned writes can finish. The database keeps the pause interval.
- **Resume capture** enables new writes and closes the pause interval. It does not fill the gap.
- **Prepare legacy stop proof / Retire stopped legacy logs** require paused capture and an explicit statement that every old process exited or loaded the new writer. A 15-minute source/control-bound challenge, protocol-2 fence and resumable bounded copy protect retained bodies and first ownership. Quiet files and repair are not stop proof. See [RETENTION.md](RETENTION.md) for the control steps and failure states.

Restart existing Pi sessions yourself after installation or repair to load the new code. The plugin does not restart sessions. The **installed Pi extension can outlive BB's UI/plugin**. Closing the page, disabling BB's plugin or disconnecting the host does not stop it. Pause on the owning host before removal when possible. An offline host cannot receive new pause controls. Remove only Pi's `extensions/bb-codex-usage` directory to uninstall the extension after pausing. Keep host history data to preserve totals. No automatic removal is provided.

The panel shows enabled/paused state, the first boundary, captured workspace totals, pause count, invalid records, unconfirmed entry count and reconciliation backlog. The boundary records the first explicit setup, not proof that running sessions loaded a writer. Installation leaves writer activation **unconfirmed**. Accepted live records make activation **observed in captured records**, not complete across all sessions. Empty logs mean **no captured usage**, not zero actual usage. The management totals remain partial. A scoped internal coverage query can certify zero only with reliable inactivity evidence for the entire interval, never from file presence or installation. Unloaded sessions, failed/overflowed writes, unconfirmed entries, pause intervals and backlog can leave gaps.

Totals belong to the selected host's persistent storage and one normalized captured full workspace path. The collector resolves existing filesystem aliases on that host when possible, without lowercasing paths. It retains a normalized captured path if the workspace no longer exists. Shared paths count once, even when several threads or terminal Pi sessions use them. These are not per-thread or account-wide totals. The panel shows up to 50 workspace rows and discloses truncation. Use **Check readiness** again to process remaining backlog. There is no background scan or history polling owner.

Records contain only version/UUID, original UTC instant, Pi session identity, optional bounded provider-session basename, optional BB thread **claim**, actual workspace, Codex provider/model, token classes, recorded total and original positive captured cost or `null` for missing price. Non-Codex messages are ignored. Reasoning/cache values are classes, not extra total tokens. Zero or absent costs stay missing. No pricing tables, guessed prices, subscription spending or quota debits are calculated. Account sign-in does not prove historical account ownership. Calendar reports are separate from management totals. They display known captured estimates, priced-record coverage and distinct priced-entity denominators without filling missing prices. Historical import is explicit and configured separately. Retention and safe recovery are described in [RETENTION.md](RETENTION.md).

The host owns `<host plugin dataDir>/history/usage-v1.sqlite`, daily `events-v1-YYYY-MM-DD.jsonl` and `confirmations-v1-YYYY-MM-DD.jsonl` partitions, retained legacy logs and `collector-control-v1.json`. BB supplies `dataDir` through its public host SDK. The installed asset contains this fixed host configuration, its code and applicable MIT notice. It has no checkout/server dependency. Per-process writes are serialized and shutdown drains owned writes. Entry confirmation checks at most 128 public in-memory session entries by object identity. It does not open transcript bodies or retain message/tool data. Pending capture/confirmation work is capped at 128; failures use one fixed content-free diagnostic.

Routine reconciliation uses real host-local SQLite transactions and durable UTF-8 byte offsets. A read processes at most 500 lines and 8 MiB across bounded fixed-name daily partitions and four fixed legacy/retained sources, including bounded source-edge checks. Unchanged completed or stalled sources require no body read. Partial lines wait for an append. Oversized/malformed lines count as invalid without storing fragments. Truncation/replacement restarts bounded source work; accepted UUIDs and confirmed Pi session/entry evidence prevent replay from charging twice. Transactional workspace projections and diagnostic counters persist across reloads. Ranked reads use a bounded persistent index, not a full event scan. The first confirmed capture owns an entry regardless of UUID order. Contradictory workspace/scalar evidence leaves original metadata unchanged, excludes that entry from totals and increments a visible conflict count. Unresolved conflicts stay excluded; this slice does not repair them. Equal times, token counts or prices do not prove replay. Confirmed entry links remain separate from claimed BB threads. Storage supports later projections and attribution without a public table/cursor RPC.

Readiness reports fixed unavailable states for missing runtime support, unsupported storage, invalid control, offline hosts or modified collector code. Newer storage remains unchanged. Quota, activity, footer, countdown and the official link remain independent. Host switches immediately clear history and disable controls until selection settles. Queued controls recheck cancellation before dispatch, late results stay hidden, and host work uses request/lifecycle signals. Browser RPC cannot undo an action already committed on a host; check its state after reconnecting. Browser results contain only bounded status, workspace paths, verified thread IDs/display metadata and numeric totals, never event bodies or unverified session/thread claims, authentication or arbitrary errors.

Live installation, existing-session restart, billed turns, live host/account changes and installed plugin source/enabled-state changes remain approval-blocked. All evidence for this slice uses isolated synthetic fixtures. This is not live installed acceptance.

## Explicit historical import

Open **Historical import**. Enter the selected host's actual BB Pi source root, optional ordinary Pi session directories and known workspace paths, then use **Save import sources**. No root is guessed or read from private BB configuration. These are configured sources, not independently discovered effective roots or proof of complete coverage. Custom BB roots must be entered explicitly. Configuration and status do not discover or read transcripts.

Only **Start import** and **Resume import** read retained transcripts. Each action runs one bounded cycle. Reload shows durable stopped progress and never resumes automatically. One unfinished generation freezes roots, owning-host workspace proofs, UTC range and cursors. Resume or cancel it before changing sources. **Check import status** reads saved progress only. **Cancel import** stops further work; committed records remain. Host switches hide old results and cannot roll back committed host work.

The panel discloses partial scoped coverage, omissions and fixed diagnostics. Imported records preserve recorded UTC time, tokens, prices and workspace. Confirmed live overlap and copied fork ancestry contribute once; unresolved duplicate-sensitive identities stay excluded. Missing data is not successful zero usage. See [IMPORT.md](IMPORT.md) for the public configuration boundary, bounds, source/alias proofs, privacy, synthetic checks and BBP-23 integration.

The combined storage revision is schema 4. See [STORAGE-INTEGRATION.md](STORAGE-INTEGRATION.md) for migration, compact replay/identity, import-only retention and recovery catalog delivery. The integration checks are synthetic, not installed acceptance.

## Verified exact-thread attribution

**Check readiness** pages public BB Pi thread and environment metadata, including hidden and archived threads, and only `thread/identity` events. It reads no prompt/message events or transcripts. Discovery uses durable plugin-owned progress, at most four metadata pages of 50 rows per request, bounded 100-row host batches, and a 60-second completed catalog cache. An unfinished host delivery cannot stop another host's refresh. An unchanged catalog keeps its host delivery cursor; title-only updates do not restart usage resolution. Use the button again when progress is partial. A missing environment, failed page or invalid identity keeps discovery partial. Completed discovery means the retained public metadata was paged, not complete usage coverage.

Provider-session file keys identify BB provider sessions. They are not Pi session IDs. Multiple verified identities can belong to one thread. A captured `BB_THREAD_ID` is only a claim until matching unique provider evidence or an explicitly confirmed import relationship verifies it. A path, title, timestamp or account identity cannot verify a claim. There is no automatic import or transcript scan. Confirmed import relationships are recorded only after an explicitly started import confines and verifies a source/header on its owning host.

The panel distinguishes four grades:

- **exact-thread**: unique verified identity and no contradictory claim. These rows provide public BB navigation for available or archived threads.
- **workspace-only**: recorded host/workspace but no exact identity. Shared paths count once, without splitting or copying tokens into thread rows.
- **ambiguous**: conflicting provider/import evidence or a contradictory claim. These tokens stay out of exact-thread totals.
- **unattributed**: no recorded workspace or verified identity. Missing information is not a guessed identity.

Thread totals are a verified subset of workspace totals, not extra usage to add to them. Exact totals stay hidden during unknown/partial discovery or attribution backlog. Original host, workspace, UTC instant, token values and prices do not change when current metadata changes. Previously verified evidence remains durable. Missing, archived and deleted metadata use stable labels. Missing/deleted threads have no navigation button. Up to 50 exact-thread rows are shown, with truncation disclosed. Conflicts remain ambiguous even if one thread later disappears. Filesystem aliases require proof on the owning host; no basename, prefix, substring or time-proximity matching is used.

See [IDENTITY.md](IDENTITY.md) for the internal integration interface and synthetic checks. This slice has no live installed acceptance.

## Development checks

Packaged history checks use real temporary `node:sqlite` storage and a copy of the self-contained host artifact outside its dependency tree. They invoke the actual host control/reconciliation handlers and Pi 0.87.1's public extension loader on the same Node executable in a temporary agent/workspace configuration. They test disabled/missing control, actual serialized compact writes, original price/time, bounded entry confirmation, pause/repair and database reload. Unrelated synthetic settings/extensions remain unchanged. Run `node scripts/check-bundled-history.mjs` on Node 22 or later after building. Also run `npx --yes --package=node@22 node scripts/check-bundled-history.mjs` for Node 22 compatibility. Neither check proves real billed capture or real prices.

For the synthetic React preview, build the plugin, then run `bun build scripts/collector-preview.tsx --target browser --outdir /tmp/bbp18-preview`. Copy `dist/app.css` and `scripts/activity-preview.html` into that directory as `app.css` and `index.html`, and copy the preview JavaScript as `activity-preview.js`. Serve only that directory on `127.0.0.1:38718`, then run `uv run --with playwright python scripts/check-collector-preview.py`. This Bun use is only a browser fixture build, not a host SQLite/runtime assumption.

From this directory run `npm test`, `npm run typecheck`, `bb plugin types --check`, and `npm run test:bundle`. Bundle tests use temporary synthetic credentials and stubbed responses for both fresh and expiring OAuth tokens, without live network. The activity bundle check also verifies independent failures, real private-runtime account rechecks, and disposal with temporary synthetic auth. The production probe RPC has been removed.
