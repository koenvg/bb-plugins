# Design

## Context

See `proposal.md` for motivation. Liquid Glass is a standalone theme package. Its backend is an empty factory; its manifest contributes one theme, no frontend, and no skills. Its four static tests cover packaging and CSS. No other plugin references it.

The checkout contains six plugin directories and six CI matrix entries before removal. The root README and CI spec still describe seven plugins, including an absent Task Board. Removing Liquid Glass leaves five actual matrix entries. Unrelated Task Board documentation and scenarios are not part of this change.

Read-only local discovery reports no installed `liquid-glass` plugin and active theme `plugin:ayu:ayu-light`. This is a point-in-time observation, not proof of the state when apply runs. BB plugin removal deletes plugin-owned settings, secrets, and schedules, deletes managed package files, and retains local path source files. The theme package itself declares no settings, schedules, or storage.

## Goals / Non-Goals

**Goals:**
- Make repository removal and local uninstall independently verifiable.
- Keep the remaining CI matrix and local appearance unchanged except where retirement requires a change.
- Retain a retirement contract without rewriting historical evidence.

**Non-Goals:**
- No replacement theme, BB core lifecycle changes, shared removal framework, or automatic cleanup on other machines.
- No edits to unrelated plugins, unrelated stale Task Board references, or completed historical verification results.
- No manual deletion under BB's data directory or cleanup of unrelated local source checkouts.

## Decisions

### Delete the package rather than disable or deprecate it

Delete the entire tracked `bb-plugin-liquid-glass/` directory, including screenshots, tests, and lockfile. Remove its README row and workflow matrix entry in the same task diff. Keeping a disabled package would retain an installable plugin and its maintenance burden, contrary to removal.

Replace hardcoded seven-plugin coverage claims in current README CI prose with coverage of all remaining plugin directories. Keep the workflow's explicit five-entry matrix and all its other behavior unchanged. Do not add a new discovery script or change test commands.

### Preserve history and replace the offered capability with a retirement contract

The `liquid-glass-theme` delta removes the four current appearance requirements and adds repository and local retirement requirements. The CI delta updates only the automatic-coverage requirement. Use normal OpenSpec synchronization at archive time; do not delete or rewrite the durable capability files during planning.

Archived changes and `plugin-verification-skill` records contain valid historical references. Leave them untouched. A blanket search-and-delete would destroy evidence rather than remove live integration points.

### Use BB's supported uninstall and conditional theme fallback

At apply time, inspect `bb status --json`, `bb plugin list --json`, `bb theme show --json`, and `bb theme list --json`. Confirm the intended local installation before any runtime mutation. Resolve Liquid Glass's installed ID rather than assuming a package name is a plugin ID.

If absent, record a verified no-op. If installed, use `bb plugin remove <resolved-id> --json`. If the selected theme is a Liquid Glass contribution, first use `bb theme set default --json`, preserving favicon color. If another theme is selected, do not issue any theme mutation. This avoids unnecessarily replacing Ayu Light or relying on implicit fallback selection. Stop and report if selection or removal fails.

Inspect plugin and theme lists again after the operation. Do not manually delete installed package directories. If an open client still shows glass styling, reload it and verify the remaining theme; the original package documented stale stylesheets on BB 0.43.4. Browser verification must use Koen's signed-in Arc session, and inability to connect must be reported rather than silently switching browsers.

### Verify absence through public repository and CLI outputs

Before deleting the package, check removal assertions against the old checkout so the package and matrix presence demonstrate the expected red result. After removal, check directory absence, exact matrix parity with remaining plugin manifests, current README absence, and unchanged historical records. These are public file and CLI checks, not replacement CSS tests for a theme that no longer exists.

Run remaining plugin suites with their existing commands and lockfiles, using the documented Node 24.15-or-newer Node 24 runtime and SQLite prerequisite. Validate the OpenSpec deltas. The implementation must receive the required single fresh-context completion review.

## Risks / Trade-offs

- Local state may change between planning and apply. Re-read plugin identity and selected theme immediately before uninstalling.
- BB removal may leave local path source files. The repository task deletes this checkout's package; source files outside the checkout remain outside scope.
- An open client may retain stale styling. Reload when needed and report any unverified live appearance.
- Historical Liquid Glass references will remain searchable. Classify search hits rather than treating every mention as a current integration.
- Repository and runtime changes are not atomic. Record their results separately and report partial completion if either fails.

## Migration Plan

1. Record the implementation baseline and verify repository removal assertions before mutation.
2. Remove the package, README row, and CI matrix entry; update current CI coverage prose.
3. Recheck local BB identity, plugin registration, and appearance. Preserve a non-glass theme, or select default if needed, then uninstall only the resolved Liquid Glass plugin if present.
4. Verify repository absence, CI coverage, local plugin/theme absence, and preservation of unrelated state. Run affected checks and the completion review; record evidence in the change.
5. Leave archive and durable spec synchronization to the explicit archive workflow.

Rollback restores repository files from the recorded baseline. If a previously installed Liquid Glass plugin must be restored, reinstall from its recorded source and restore its recorded theme only on an explicit rollback request. Uninstall may delete plugin-owned configuration, so do not claim rollback reconstructs unknown settings or secrets. An already-absent plugin needs no runtime rollback.
