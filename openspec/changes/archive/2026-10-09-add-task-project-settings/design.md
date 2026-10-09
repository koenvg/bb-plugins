# Design

## Context

See `proposal.md` for motivation and `specs/tasks-project-settings/spec.md` for the behavior contract.

`ManagePanel` contains Labels, Presets, and Folders tabs and defaults to Labels. The Tasks settings icon opens this page. `useProjects` supplies the tracker inventory and subscribes to `projects:changed`. The `updateProject` RPC accepts a project ID, name, and color, preserves omitted fields, and publishes that event. Database updates retain identity and existing task keys. `ColorSwatchPicker` already supplies named, keyboard-accessible choices for project creation and labels.

User feedback approved replacing the selector planned at revision `20db7c8da2c9b00a6c2f9545f934fb1e38dbc886` with the fixture-previewed table and stable loading/save treatment. The table replaces the selector, not supplements it. Delivery 1 edits names with saved colors read-only. Interactive color controls belong to delivery 2.

Keep this addition focused. Do not expand or refactor unrelated Manage editors.

## Goals / non-goals

**Goals:**

- Keep identity-bound row drafts and the single-flight table save state in a focused project-settings component.
- Reuse current data hooks, RPC contract, event refresh, UI controls, and slot-test harness.
- Separate saved values from local drafts so events cannot erase edits or transfer them between identities.
- Preserve the approved compact table layout and stable loading/save treatment.

**Non-goals:**

- No host-level settings page, navigation redesign, new route, or new command.
- No prefix editing, automatic prefix derivation on rename, folder management, BB-link editing, deletion, or BB workspace mutation.
- No new API, schema, dependency, generalized form framework, or unrelated Manage refactor.
- No interactive production color editing in delivery 1.

## Decisions

### 1. Add a project table to Manage

Render `views/manage/projects-section.tsx` from the Projects tab in `manage-panel.tsx`. Update the Manage description. Keep Labels the default and the other tabs available.

Keep the Projects table mounted but hidden when another Manage tab is active. Switching tabs must not discard its pending guard or response; other tabs remain usable. This is local component lifetime, not a new navigation lock or global draft policy.

Show one row per project, keyed by ID, with prefix, inline name input, saved color, and explicit row Save/Cancel. Equal names remain distinct through prefix and identity. Editing a row does not call task navigation or change the BB workspace. Drafts in different rows are independent; there is no selection/discard action and no hidden save.

Use the approved compact stacked-row layout at narrow Tasks panel widths, even inside a wide desktop window. Use the section's inline-size container, not viewport width, to select the stacked arrangement. Keep the table headers mounted during initial loading without guessing its eventual project count. Once inventory is available, retain real rows throughout refresh. Reserve a status line below the table and fixed Save/Cancel widths, so loading and pending labels do not shift displayed controls. Do not add spinners, animated skeletons, or a fixed fixture row count to production.

Alternative: editing in the project-switcher menu mixes browsing and settings. A separate settings route adds navigation work without a benefit for two fields. The previously proposed selector was rejected in user feedback.

### 2. Bind each draft to its row identity

Track saved name/color separately from local drafts. On a successful inventory refresh, update saved values and update only clean drafts. Cancel restores that row's latest loaded saved values and clears its local save error. Cancel must not change another row. A successful save establishes the returned project as the row's baseline and draft.

Preserve saved colors exactly, including values outside the palette. Never substitute `DEFAULT_COLOR` for an existing project. Delivery 1 shows saved color read-only and always sends it unchanged. Delivery 2 adds the existing palette; a custom color need not have a selected swatch until the user deliberately replaces it.

Only a successful inventory can remove a row. Remove the keyed editor and its draft without transferring either to another identity. A failed refresh is not removal. Keep cached rows and local drafts mounted while inventory is loading or failed, and disable new saves until it is ready.

Alternative: copying every inventory update into drafts can erase unsaved work. Looking up projects by name can update the wrong project when names match.

### 3. Use explicit saves and one table-wide guard

Delivery 1 submits exactly `{ projectId, name: draftName.trim(), color: savedColor }`. Delivery 2 submits the deliberately chosen draft color instead. Do not send prefix, folder, or linked BB project fields. Validate the trimmed name and compare normalized draft values with the saved baseline.

Use one synchronous in-flight table guard as well as pending rendering, so repeated or cross-row activations cannot start a second request before React renders. Lock editable controls, Save and Cancel in all rows during a request. Check the guard at editing/Cancel boundaries too. This lock is local to project settings, not global navigation.

Keep save errors local to the row. Clear them on a new attempt, that row's Cancel, or successful save. A failed request retains the draft, shows an alert, and permits manual retry. Inventory errors use a separate alert and Retry action. Do not reset a draft or report success after failure.

Apply the RPC response immediately. Reads that overlap the save must not overwrite its returned baseline, whether their event arrives before the save response or their result arrives afterward. Consume those overlapping snapshots without replaying them when the lock clears. Later independent successful reads update the row's baseline normally. If the save fails, a successfully refreshed project still provides the latest Cancel baseline without erasing the entered draft. Inventory failures never replace saved values or become save failures.

Identify overlapping reads by the canonical inventory resource's revision at Save completion. Ignore that revision and earlier ones for this row's saved baseline, not the next settled render. A later read must still apply if it supersedes an overlapping request before that older request settles.

Use the existing `projects:changed` subscription to refresh consumers. Editor success must not depend on a later inventory fetch.

Alternative: optimistic global writes or a new API add rollback or contract work when the existing update already persists fields and publishes the required event.

### 4. Keep inventory readiness separate

Use `useProjects` data, loading, error, and refresh values. Distinguish cold loading from successful empty data. Show an inventory alert and Retry on error even if cached rows remain. Gate new saves on a current successful inventory and a row identity that still exists. Retain dirty drafts during ordinary refreshes.

Label table, row name inputs and row actions by prefix. Use alerts for save/inventory failures. In delivery 2 use named radio choices for colors. Keep tabs and row controls usable at compact width without page overflow.

Alternative: `projects.data ?? []` alone makes a failed request look empty and permits stale rows to save.

## Risks / trade-offs

- Another actor can edit a project while a row is dirty. Preserve its draft, update the Cancel baseline on ordinary successful refresh, and let explicit Save write its name/color. Version-based conflict detection is outside scope because the API has no revision precondition.
- Multiple rows can hold local drafts. Save/Cancel affect only their identity; one pending save locks relevant actions across the table, without adding a global draft system.
- Events and save responses can arrive in either order. Deferred save and inventory tests must prove pending draft retention and response precedence without duplicate requests.
- The first inventory's row count is unknown. Reveal actual rows on success rather than inventing fixture rows; keep already displayed rows and actions stable during subsequent loading and saving.
- The new tab can crowd a narrow panel. Verify tab wrapping and compact rows without page-level overflow.
- Existing callers can store custom colors. Preserve those values on name-only saves.

## Migration plan

No data migration is needed. Build through the existing plugin process. Installation or reload requires separate approval. Rollback removes the UI; names and colors saved through it remain valid for the old API and database.
