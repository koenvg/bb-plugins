# Design

## Context

See [proposal.md](proposal.md) for motivation and [specs/sidebar-thread-list/spec.md](specs/sidebar-thread-list/spec.md) for behavior. BB 0.43.4 exposes an exclusive `experimental_threadList` frontend slot: it replaces the scrolling list only. The installed bundled `thread-list` plugin remains available. The current project has a separate Tasks plugin, but no thread-list plugin or durable sidebar capability spec.

The installed SDK 0.5.9 supplies `experimental_useSidebarThreads`, `experimental_useSidebarThreadActions`, `experimental_useSidebarThreadPullRequest(threadId)`, split and row-status hooks, and a test harness with seeded sidebar threads and PRs. The PR hook is opt-in per rendered row; BB owns environment-level lookup sharing, refresh, and staleness. Archived threads are paginated. The built-in list has project, machine, and section modes plus per-client selection under Settings > Appearance > Sidebar.

## Goals / Non-Goals

**Goals:**
- Keep data access, list organization, thread actions, and row presentation separate so future sidebar changes can be added without changing the host integration.
- Maintain usable list performance on large projects and avoid fetching PRs for invisible rows.
- Keep BB as the source of truth for thread state and PR status.

**Non-Goals:**
- Changing BB's sidebar shell, Git host integration, or Tasks plugin.
- Adding new sidebar customizations in version one, or claiming exact pixel or preference-storage parity with the bundled list.

## Decisions

### 1. Standalone, selectable frontend plugin

Scaffold `bb-plugin-pr-thread-list` with `bb plugin new pr-thread-list`, remove unused scaffold examples, and register one `experimental_threadList` component. Keep only the minimal server entry required by the manifest; the list uses public frontend SDK hooks and host actions rather than plugin RPC or a duplicate backend. Do not disable the bundled list or force the active client selection. Alternative: DOM decoration of the bundled list; rejected because it would depend on private markup and would not provide a reliable home for future list changes.

### 2. Explicit list model and scoped client preferences

Derive a visible tree from the live threads, projects, and sections: filter hidden and chosen lifecycles, place pinned roots once, build project/machine/section groups, nest children, apply sorting and collapse state, then flatten visible items for rendering. Keep grouping and preference normalization in pure modules, apart from React row components. Mirror the bundled list's key controls and defaults; persist this plugin's filters, sort, grouping, and collapsed IDs in a versioned, plugin-scoped per-client store. Do not read another plugin's private preference storage. The first selection may therefore start at defaults even if the built-in list was customized; subsequent reloads retain this plugin's choices. Use the SDK archive query and its `fetchNextPage` for archived results.

Alternative: depend on the bundled plugin's stored preferences or duplicate its compiled frontend; rejected because those are not a stable integration contract. Keep its current behavior as a manual parity checklist rather than depending on its internals.

### 3. Host-owned actions and accessible row structure

Use thread `href` for a row anchor and `experimental_useSidebarThreadActions` for opening, pinning, read state, rename, archive, and BB's deletion confirmation. Use the public SDK for section updates, pinned reordering, and unarchive, and the split hook for drag gestures. Compose the host-provided activity and indicator labels with draft, plugin row-status, and shortcut hooks; attach BB's required keyboard-target attributes to the row anchor and call `onNavigate()` after opening a thread on compact viewports.

Render the PR link as a sibling of the thread anchor, not a nested anchor, so it opens the PR without triggering thread navigation. Provide textual status via its accessible name or visible label; color alone does not carry meaning. Unknown thread status kinds fall back to host-provided labels.

### 4. One small PR badge component per mounted row

Render the badge only for mounted, visible rows; the badge calls `experimental_useSidebarThreadPullRequest(thread.id)`. Derive its label and tone from the returned `attention` value, with `state` as the fallback for draft/open/merged/closed and unknown attention. Include the PR number and link. A pending lookup or null PR produces no badge, never a failed-state guess. Do not issue direct GitHub/`gh` calls, compute checks/review precedence, or add a plugin polling loop. Rows sharing an environment may display the same PR; BB deduplicates their lookup.

### 5. Window and test the list

Render only visible flattened items plus overscan, including group headers, so the per-row PR hook cannot trigger for hundreds of offscreen threads. Keep the visible-item derivation and PR status mapping testable without mounting the host. Use `renderSlot` with seeded threads and `sidebarPullRequests` for interaction and state tests; add a live check with an actual PR-bearing worktree, a no-PR checkout, archive paging, a compact viewport, and switching back to the bundled list. Test the current grouping, menu, shortcut, drag, and pin flows before selecting the replacement as a daily driver.

## Risks / Trade-offs

- [Exclusive list ownership can regress familiar interactions] -> Compare against the bundled list with a parity checklist and tests for modes, filters, row actions, shortcuts, and compact navigation; keep the bundled list as immediate rollback.
- [Experimental SDK contracts can change with BB releases] -> Pin and typecheck against the installed SDK, keep host access in one adapter, and run build and live smoke tests after upgrades.
- [Too many PR lookups or slow phones] -> Window mounted rows, exclude collapsed/hidden rows, and rely on BB's environment-scoped cache and polling.
- [Per-client preferences do not automatically migrate from the bundled plugin] -> Match its defaults, preserve the replacement's own choices across reloads, and state the first-selection reset in the plugin README.
- [A null PR result can mean absent or unavailable] -> Show no PR badge in either case; do not display a false failed or merged status.

## Migration Plan

Build and install the new plugin without removing `thread-list`. Select it in Settings > Appearance > Sidebar on a test client, verify the sidebar and a PR-bearing thread, then select it on other clients if desired. Roll back on any client by choosing BB's bundled Thread list in the same setting; no data migration or Git host configuration is required.
