# Design

## Context

See proposal.md for motivation and specs/sidebar-thread-list/spec.md for the behavior contract.

`PrBadgeView` currently wraps its presentation in an external anchor. `ThreadRow` separately uses `actions.open(thread.id)` and `onNavigate()` for title activation. The title anchor's absolute pseudo-element covers the row, while the badge sits above it with `relative z-10`; that layering must remain.

The destination is github-insight's `threadPanelAction` with id `pr`. Its composer banner already calls `useBbNavigate().openThreadPanel({ actionId: "pr" })`. The sidebar's pinned SDK 0.5.29 and github-insight's pinned SDK 0.5.9 declare that action ids must belong to the calling plugin and that the method opens the current thread's panel. Calling it directly from pr-thread-list would therefore target the wrong plugin, and calling it before route completion could target the wrong thread. Identical panel parameters focus an existing tab rather than duplicating it.

The repository already uses a browser notification between these plugins for summary updates. This navigation handoff additionally needs a pending request because the destination listener may not yet be mounted.

## Goals / Non-Goals

Goals:
- Keep ownership of PR panel opening inside github-insight.
- Hide cross-bundle state, notification ordering, and one-shot consumption behind one small module interface.
- Test navigation before mount and navigation to an already-mounted destination without timers in callers.

Non-goals:
- Add or change public SDK navigation methods, manipulate host panel state, or query host DOM to select a tab.
- Open the Review panel or an individual GitHub check.
- Change summaries, PR lookup, badge appearance, list classification, or external links within the PR panel.

## Decisions

### One button for the whole badge

Keep `PrBadgeView` presentational, accepting an activation callback from `ThreadRow`. Replace the external anchor and URL-dependent wrapper with a `button type="button"`, preserving its compact classes, tooltips, visible status, and focus treatment. Its accessible name describes opening the PR tab and includes the existing PR status. Stop event propagation so it cannot also trigger row navigation.

The title remains an ordinary thread link with its current modified-click and split behavior. The badge button uses normal Enter and Space activation and does not have special modified-click or new-window semantics. External GitHub navigation remains available inside the destination PR panel.

### A small client-local request module owned by github-insight

Add a dependency-light module such as `bb-plugin-github-insight/pr-panel-navigation.ts`, imported by the sidebar and github-insight's receiving hook. Its interface provides requesting PR navigation with a thread id and navigation callback, registering a receiver with a thread id and panel-opening callback, and cancelling an outstanding request for ordinary navigation. It owns disposal and all transport details.

Store one pending request in a plugin-owned, versioned `Symbol.for` slot on the current `window`, and use a namespaced window event to notify receivers. This is not private BB state. Each plugin bundle may contain its own module copy, so module-local variables alone cannot implement the shared request. The window slot is memory-only and isolated from other browser tabs and desktop windows; no localStorage, server storage, or BroadcastChannel is needed.

Record the destination and a unique request token before invoking navigation. Notify after navigation starts. A receiver checks the record both on registration and on notification, and only attempts an open for its own thread. A new request replaces the previous request. Clear only the matching token after an accepted open, so a stale acknowledgement cannot clear a newer request. Rejected opens do not count as success; they must not throw or cause an external fallback. Guard reentrant attempts within the module.

Expire pending requests after 30 seconds and clear them when ordinary sidebar navigation explicitly cancels them. This timeout is a proposed internal safety default, not a UI delay or a retry loop. Keep it testable with an injected clock or fake timers. Do not preserve requests through reloads.

Rejected alternatives: a notification alone loses activations before the listener mounts; persistent or broadcast state can reopen panels in unrelated clients; direct `openThreadPanel` calls from the sidebar violate plugin ownership; an SDK extension would expand this change beyond the two plugins.

### Open from the destination's existing composer registration

Add a receiving hook under github-insight's UI and mount it in `ThreadBanner` before any conditional return for missing insight or absent blockers. It registers for the thread id after the mounting commit's parent effects finish, using a cancellable microtask, and supplies github-insight's own `openThreadPanel({ actionId: "pr" })` callback. BB resets its compact drawer in a parent effect on thread changes, so opening directly in the child's mount effect selects the PR tab but immediately hides its drawer. Deferred registration must be cancelled on unmount or scope replacement. Register independently of `useInsight` results so ready, merged, draft, and closed badges work too. Dispose listeners when the thread changes or unmounts.

The sidebar supplies its normal `actions.open(thread.id)` and `onNavigate()` sequence to the request module. This retains compact drawer dismissal. If the destination is already active, the live receiver handles the event without needing a remount. The module's matching and consumption rules protect against duplicate delivery and React effect re-registration.

Ordinary title and explicit split navigation cancel any outstanding badge request but do not create one. Preserve their existing host actions and shortcut attributes.

## Risks / Trade-offs

- Independently built bundles can disagree on the request contract. Use one imported module and a versioned key, and build both packages to verify sibling imports resolve.
- The receiver must mount even when the blocker banner renders nothing. Cover this in a host-slot test with no blockers, then verify the live thread transition.
- Embedded chat surfaces can lack a side panel. Treat an SDK `false` return as a decline, not consumption; verify the main destination opens rather than an embedded surface.
- An unavailable github-insight frontend cannot open its panel. Keep thread navigation successful, expire the intent, and retain the existing missing-plugin notice behavior. Do not silently redirect to GitHub.
- A 30-second expiry bounds abandoned requests but cannot support indefinitely delayed mounts. Test the normal mount path and expiry; no background retry service is planned.

## Migration Plan

1. Add the shared request module and github-insight receiver with tests.
2. Wire the sidebar badge and update the external-link regression test and README.
3. Typecheck, test, and build both plugins, then reload both together for live verification.
4. No data migration is needed. Rolling back restores the external-link badge; the unused memory-only request disappears on reload or expiry.
