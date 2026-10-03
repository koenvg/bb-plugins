# Design

## Context

See `proposal.md` for the motivation and `specs/codex-quota-background-refresh/spec.md` for the behavior contract.

The inspected implementation already has the necessary boundaries:

- `app.tsx` has a module-local `QuotaSelectionStore` shared by badge and dashboard. Each `useQuota` consumer currently installs its own one-second aging timer and focus listener, then connects and reads on mount or focus.
- `selection-store.ts` coalesces selection synchronization and reads, checks revisions before publishing, and clears observations when the selection changes. It has no automatic read schedule or app-owner lifetime token.
- `quota-cache.ts` coalesces host-side requests and limits upstream attempts to one per 30 seconds. A non-forced read returns a fresh cached observation without contacting Codex. `freshness.ts` marks observations stale at five minutes and unavailable at 24 hours.
- `quota-view.tsx` suppresses every badge percentage while loading. `quota-view.test.tsx` expressly expects that dash, and `app.test.tsx` expects separate consumer timers that never read when they tick.
- `server.ts` owns one process-memory host selection and generation, shared across windows. It aborts active host requests on a selection change. No selection persistence or per-window account selection is added here.
- SDK 0.5.9's `ExperimentalAppOverlayRegistration` mounts once per app window with SDK React context. The sidebar accessory is not mounted in compact layouts. A content-script mount has lifecycle context but no React RPC hook context.
Implementation baseline updated to `2c2ecdec5b9100b606fb475f7d40fd57eb82c03d` after preserving local work in recovery stash `a4b55803db22c00ad76601e5a00b26c07b8c87b0` and fast-forwarding main. This baseline adds the footer adapter, proportional battery, readiness/active-owner guards, and minute countdown notifications. Preserve those APIs and rendering choices: `start` retains one active owner for the app lifetime, view hooks become passive, and the existing footer overlay/adapter remain unchanged. A dedicated refresh overlay is additive. Synchronizing an unchanged selected host must not invalidate its still-fresh observation or duplicate a pending read; changed selection and failed revalidation still clear or mark data stale. Battery fill uses the same fresh-while-updating rule as its adjacent percentage. The earlier six completed tasks are reopened until their tests pass on this baseline.

The original quota spec is still in the completed `bb-codex-quota` change, not the main-spec inventory. Its prohibition on loading looking like a fresh percentage and its on-demand-only design conflict with this follow-up. The intentional replacement is narrower: a same-selection observation keeps its normal five-minute validity during a pending read; loading does not itself mean unknown. All other freshness and attribution rules remain. Do not edit or archive that original change as part of implementation; when specs are later consolidated, reconcile that one older loading clause so it does not contradict this capability.

## Goals / Non-Goals

**Goals:**

- Give refresh one app-window owner independent of route and responsive UI mounting.
- Keep request timing, selection invalidation, pending-read coalescing, and cleanup testable together with the existing shared store.
- Preserve an honest observation during updates, including when time advances while a request is pending.

**Non-Goals:**

- Server jobs, host daemons, polling after all clients close, or guaranteed execution while a browser or operating system suspends BB.
- A cross-window scheduler, automatic host choice, persisted selection, new settings, or new RPC payloads.
- OAuth changes, transcript collection, Provider usage integration, historical quota storage, or reset redemption.

## Decisions

### One app-window React owner, with subscriber-only views

Register a small `QuotaRefreshOwner` through `app.slots.experimental_appOverlay`. It returns `null`, reads the existing typed `useRpc` client, and starts the shared store's lifetime-managed refresh behavior from an effect. This uses the installed app-wide slot without introducing visible overlay UI or DOM inspection.

Move all automatic connect/read scheduling, freshness ticks, and focus/resume listeners out of dashboard and badge consumers. Their `useQuota` hook subscribes to the store and exposes selection/manual actions, but does not start timers or automatic reads. Opening another page, rendering split views, or mounting the accessory cannot multiply automatic refresh ownership.

Alternative rejected: reference-counting mounted badge/page consumers. It stops refreshing when both disappear in compact layouts. A content script would require another way to obtain authenticated RPC context, while the app-wide React slot already supplies it. A server service would violate the requested lifetime.

### Keep refresh policy beside selection and read state

Extend the shared selection-store module with an explicit start/dispose boundary, an owner generation, a next-attempt deadline, and consecutive-failure state. Inject clock/timer behavior where needed for deterministic tests rather than adding a general polling framework. Starting the owner must be idempotent or replace a previous owner safely; cleanup is idempotent as well, including React effect replay.

Use one completion-scheduled timeout for automatic reads and one shared one-second aging timer. The aging timer only calls the existing freshness calculation; it never issues an RPC. Completion-based scheduling prevents overlapping reads and avoids accumulated interval callbacks while a request is slow.

A fresh completed result resets failure state and schedules the next automatic read 60 seconds later. A rejected request or a stale/unavailable result advances retry delays through 60, 120, 240, and 300 seconds, remaining capped at 300. Do not classify transport success alone as recovery. All read triggers must feed the same scheduling outcome so a manual success clears backoff and a manual failure cannot accidentally start a second loop.

Alternative rejected: a separate scheduler that only receives an untyped success boolean from RPC. Selection changes, stale host-cache returns, and manual refresh outcomes already live in the store and must agree on what counts as recovery.

### Refresh Codex, not just its fresh host cache

On activation, synchronize selection and use a normal read to show a safe fresh host-cache result immediately if one exists. Scheduled automatic reads use the existing `refresh: true` flag so the one-minute cadence produces new upstream observations rather than returning the same five-minute cache entry. Explicit manual refresh continues to use that flag. The host's 30-second gate and pending-request coalescing remain unchanged, including across windows.

Before each automatic read, synchronize server-owned selection. If synchronization fails, do not read using an unconfirmed local selection; preserve the existing unavailable behavior and apply failure backoff. With no selection, perform no quota read and schedule a bounded selection check in 60 seconds so a choice made by another window can be discovered.

A discovered selection change resets the deadline and failure counter, invalidates pending publication through the existing revision boundary, clears old observations, and permits an initial normal read for the new host. A failed host-selection attempt does not authorize reading an unconfirmed host.

Alternative rejected: non-forced reads every minute. The fresh host-cache shortcut would suppress upstream refreshes for almost five minutes, defeating the proposed update cadence. Also reject bypassing the host retry gate or adding independent badge/page force reads.

### Focus and resume are deadline checks, not unconditional force reads

Keep window focus recovery and add a visibility-resume check when the document becomes visible. On either event, immediately recalculate freshness, synchronize selection, and request at most one due read. A same-selection event before the current deadline does not fetch quota; repeated focus events do not bypass failure backoff. A newly discovered selection can trigger its initial read regardless of the previous selection's backoff.

An explicit manual Refresh can bypass the app-side deadline, but still shares an in-flight read and respects host limits. Clear or replace the existing scheduled timeout when an event or manual action starts a read; re-arm only from the completed outcome.

Browser throttling is accepted while the window is hidden or minimized. Do not stop the owner just because a route changes or the document becomes hidden, and do not replay missed minute intervals on wake. No service worker or always-running backend is added.

### Lifetime invalidation covers every asynchronous phase

The owner disposer clears its timeout, aging timer, and focus/visibility listeners, and invalidates its owner generation before any asynchronous completion can publish or re-arm. Apply both owner-generation and selection-revision checks after selection synchronization and quota reads, including explicit manual/selection actions started while the owner was active.

SDK RPC calls do not expose an app-side abort option in the inspected client contract. Do not invent one. Already-dispatched bounded requests may finish after closure, but their results cannot publish into a disposed view or schedule more work. Existing server-side selection abort and host-side identity checks still enforce request attribution.

Each window owns its own loop. When one closes, other open windows can continue. When all close, no owner remains to initiate reads; request-driven server/host handlers do not continue polling.

### Preserve freshness during loading without hiding failures

Remove loading alone from the badge's percentage eligibility test. Eligibility still requires `visibleView` to be fresh and have a valid binding percentage. Keep the existing updating accessible status, host/window identity, and original observation time, and include the retained percentage in that label.

An initial pending read remains a dash with an updating label. At five minutes, an in-flight refresh's retained observation becomes `Stale`, not a bare percentage. At 24 hours it becomes unavailable. A failed read follows existing stale/unavailable policy; it cannot rewrite `observedAt`. Host changes clear the old value immediately.

Keep the dashboard's single status line and no-spinner behavior. When a retained observation is stale during a pending read, its status line must explicitly say it is stale as well as updating, rather than suggesting it is current. No cosmetic redesign is needed.

## Risks / Trade-offs

- More upstream requests while clients are open. Mitigate with one-minute completion-based scheduling, failure backoff, shared reads, and the existing host gate. Multiple windows still have independent client loops; global leader election is outside this change.
- Suspended browser timers can make data stale despite an open window. Mitigate with honest deadline-based rendering and one bounded catch-up on focus or visibility resume; do not promise uninterrupted background execution.
- A null-rendering app-wide owner depends on an experimental SDK slot. Verify its declared contract and installed mount/cleanup behavior; do not silently fall back to view-dependent timers.
- Closing a window cannot cancel every already-dispatched RPC. Mitigate with bounded existing host requests and owner-generation publication/scheduling guards.
- Authentication outages will still produce unavailable or stale data. Keep fixed diagnostic labels, capped retries, and the official Codex Usage link; a dash is not proof of a refresh bug.

## Migration Plan

1. Add fake-timer and rendering regressions for automatic reads, sharing, fresh-while-updating presentation, backoff, teardown, and selection races before changing runtime behavior.
2. Add the app-wide owner and centralized refresh lifecycle, keeping existing RPCs and host security behavior intact. Update the two tests that currently assert per-consumer timers and a loading dash for fresh data.
3. Run package tests, TypeScript checks, SDK contract checks, and synthetic bundle/OAuth checks. Update plugin freshness documentation and record live acceptance separately from prior acceptance evidence.
4. With explicit implementation-phase permission to install or reload, verify a real selected-host quota read with Provider usage disabled, navigate away from the dashboard, exercise compact layout and resume, then verify shutdown/reload cleanup. Do not count synthetic data as installed acceptance.
5. Roll back by reinstalling the previous plugin bundle or disabling the plugin. There are no persisted state changes or data migrations.
