# Design

## Context

See [proposal.md](proposal.md) for motivation and [the footer spec](specs/codex-quota-footer/spec.md) for observable behavior.

`app.tsx` currently registers one `navPanel` at `quota`, with a `SidebarQuotaBadge` accessory. The badge and dashboard use the same module-scoped `QuotaSelectionStore`. `QuotaBadge` already derives fresh percentages, stale text, placeholders, and accessible host/window/observation details. BB hides the accessory on compact viewports and fades it on row hover or focus.

The installed BB reports version 0.44.0 with SDK 0.5.29. Its public footer registration supports a managed action with a static icon and label, but no live badge. Public app-wide overlays provide React/SDK context, and content scripts permit cleanup-safe DOM enhancement. Inspection of BB's local source found a plugin-specific `data-footer-item` key, a plugin-specific footer test ID, and a native button that owns activation, tooltips, touch sizing, and compact-drawer dismissal. These DOM details are implementation evidence, not a stable SDK contract; verify them against the running client before depending on them.

The only durable capability currently listed is unrelated `code-cleanup-guidance`. The completed quota changes remain unarchived. This change adds a footer-specific capability without rewriting those prior artifacts or changing quota data semantics.

## Goals / Non-Goals

**Goals:**
- Contain the unsupported markup dependency in one small adapter with a reversible lifecycle.
- Keep BB responsible for the actual footer button, navigation behavior, and user customization.
- Keep the existing quota store and dashboard authoritative for selection and presentation data.

**Non-Goals:**
- Changes to BB core, SDK declarations, or global sidebar preferences.
- A replacement sidebar, a new quota popover, or a redesigned dashboard.
- Backend changes, quota polling, new dependencies, or unrelated store cleanup.

## Decisions

### 1. Keep native registration and dashboard routing

Retain `navPanel({ id: "quota", path: "quota", ... })` and its fallback accessory. Register one `experimental_sidebarFooter` action with an accessible "Codex quota" label. The user's battery follow-up supersedes the original decision to keep `Gauge`: use `app.experimental_icons.register` for a plugin-prefixed battery glyph, referenced by the footer, navigation entry, and manifest branding. The icon subscribes to the existing shared store without starting quota reads or timers. Its inline SVG honors native sizing and color; its fill uses the same fresh/idle remaining percentage as the text badge.

Quota effects retain an owner in `QuotaSelectionStore` while they maintain clock ticks and account revalidation. The store publishes whether any owner remains. Registered icons are passive subscribers, not owners, and require an active owner before showing a fill. The last owner's cleanup makes retained and later-mounted icons neutral immediately, even if a pending read completes afterward. Returning owners use the existing connect/refresh path before showing current allowance.

An `experimental_appOverlay` component owns `useBbNavigate`, quota hooks, and the badge portal. Its mounted lifetime supplies the footer action with a callback calling `toPluginPanel("quota")`. Keep that callback binding window-local and clear it on cleanup. Do not call hooks from a registration callback, synthesize a click on a hidden navigation entry, or navigate with a hard-coded `window.location` URL. Normal activation must use the native action so compact-drawer dismissal remains BB-owned.

Before the navigation binding is ready, leave upper navigation unsuppressed and coalesce any startup activation until the overlay can open the dashboard. Cancel pending activation on cleanup and never invoke a stale callback or redirect to an unrelated page. This startup interval does not count as a working enhanced quota control.

Alternatives rejected: removing the nav panel would break the existing dashboard route; a footer disclosure would change the agreed click behavior; a replacement sidebar would expand scope and conflict with other plugins.

### 2. Isolate DOM attachment from quota rendering

Add a focused frontend adapter, for example `footer-adapter.ts`, mounted through a content script. It owns discovering this plugin's native footer item, adding a plugin-owned badge container and scoped styling, publishing current attachment targets to React, and restoring all changes on teardown. It does not fetch quota data or perform navigation.

Use the plugin ID from the content-script context and the registered item ID to match only this plugin's footer element. The observed `data-footer-item` format is `plugin:<encoded-plugin-id>/<encoded-item-id>`. Avoid generated IDs containing the frontend generation, positional selectors, localized labels, or matching every gauge icon. Locate fallback quota navigation only within the corresponding sidebar navigation region and by the exact plugin-panel route or verified item identity. An absent or ambiguous match must not trigger broad DOM changes.

The overlay renders into the plugin-owned container with a React portal so SDK context stays intact. Do not move BB-owned React elements or replace their contents. Give the native button sufficient width for its icon and `100%`, without changing other footer items. Add dynamic accessible status through a plugin-owned description referenced by the button, preserving any existing description references.

Use an idempotent, coalesced `MutationObserver` to handle sidebar mount/replacement. Observe only the relevant structural or visibility changes, ignore owned text updates, and avoid rescanning on every quota clock tick. Each current sidebar gets at most one attachment; detached elements release their attachment. No polling loop is needed.

Alternatives rejected: squeezing text into a registered 16px icon risks clipping and poor accessibility; a fixed overlay would not follow sidebar visibility; a fully custom footer button would duplicate native keyboard and drawer behavior.

### 3. Suppress the upper entry only after successful attachment

The adapter exposes attachment readiness separately from data readiness. A placeholder badge with working dashboard activation is a valid enhancement; a missing target, unmounted portal, or missing navigation callback is not.

Only after the badge has committed and navigation is ready may the adapter mark that sidebar's normal quota row as suppressed. Use plugin-owned attributes and scoped styles, not persisted preference writes. On target loss, portal failure, cleanup, or user-hidden footer state, remove suppression immediately. If the upper row currently has keyboard focus, move focus to the working footer control before hiding it.

Retain the ordinary navigation registration as the compatibility fallback. Do not undo the user's own choice to hide that navigation item; restoration means removing this plugin's suppression, not forcing a preference. If a third-party sidebar cannot be identified safely, leave its navigation untouched even if this temporarily creates two entry points.

### 4. Reuse the quota presentation and lifecycle

Reuse `QuotaBadge` behavior, with only the layout or a small shared presentation helper needed for footer use. Fresh, idle state shows the percentage. Loading and unavailable states show the existing nonnumeric placeholder; stale state can retain the existing short "Stale" indicator. "No text label" means no persistent product-name or "remaining" caption, not hiding necessary failure feedback.

Keep `useQuota`, `visibleView`, and `QuotaSelectionStore` as the source of truth. The footer must initialize while the dashboard is closed, honor focus/account revalidation, age into stale/expired state, and share existing in-flight reads with the dashboard and fallback accessory. Do not add a fetch timer or change host cache policy to make the badge appear continuously fresh.

The adapter's disposer removes only its nodes, attributes, description references, styles, observers, and queued callbacks. Overlay cleanup removes portals and the navigation binding; existing quota effects clean up their own timers and focus listeners. Cleanup must be safe in either order and repeated calls must do nothing harmful.

### 5. Test behavior at the existing public boundaries

- Pure presentation tests cover fresh `0%`, `72%`, `100%`, stale, loading, unavailable, expired, and missing selection.
- Adapter DOM fixtures cover owned selectors, duplicate prevention, mount/replacement, hidden/missing footer, focused-row handoff, unrelated plugins, and full disposal.
- SDK registration/render tests extend `app.test.tsx` using `loadPluginApp` and `renderSlot` to cover the footer action, overlay, native navigation callback, shared selection/read behavior, and unmount cleanup.
- Preview the actual icon-and-percentage layout early, before the full check suite. Browser acceptance must cover desktop, narrow sidebar, and a 375px open drawer; DOM reachability alone does not prove readable layout or native keyboard behavior.

## Risks / Trade-offs

- BB markup can change. Keep selectors in the adapter, require safe identity matches, and leave ordinary navigation available when enhancement fails.
- Native React rerenders can replace an attachment. Use owned child containers, reconcile structural changes, and test remounts without touching BB-owned nodes.
- Width changes can disturb neighboring controls. Scope styling to the quota item and check `100%`, "Stale", focus, hover, and coarse-pointer sizing in a real client.
- A plugin crash could otherwise strand navigation. Require portal/callback readiness before suppression and restore it when either is lost.
- A headless DOM fixture cannot establish live compatibility. Installed-client acceptance remains required, and missing Arc access must be reported rather than replaced by an unsupported browser session.

## Migration Plan

No stored data or preferences migrate. Build and verify the plugin, then explicitly install or reload this checkout for the live check; the installed plugin was observed pointing at a different worktree, so editing this checkout alone does not update the running UI. Preserve its existing plugin ID and selected-host state.

Record acceptance in the plugin's documentation without overwriting historical evidence. Run package tests, typecheck, SDK pin/public-surface checks, and the synthetic bundled OAuth checks. Verify reload and disable/re-enable in signed-in Arc with Provider usage still disabled, then run the required single read-only completion review.

Rollback means reinstalling the prior plugin build. Disposal removes the enhancement; the original navigation registration and quota dashboard require no preference repair. Do not mark live acceptance complete if only fixtures pass.
