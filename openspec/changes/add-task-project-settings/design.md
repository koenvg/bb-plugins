# Design

## Context

See `proposal.md` for motivation and `specs/tasks-project-settings/spec.md` for the behavior contract.

`ManagePanel` currently contains Labels, Presets, and Folders tabs and defaults to Labels. The Tasks navigation menu opens this page through the existing settings icon. `useProjects` supplies the tracker inventory and subscribes to `projects:changed`. The `updateProject` RPC already accepts a project ID, name, and color, preserves omitted fields, and publishes that event. The database update retains identity and existing task keys. `ColorSwatchPicker` already provides named, keyboard-accessible choices used by project creation and labels.

The Manage page also contains unrelated editors. Keep this addition in a focused component rather than expand those editors or redesign the page.

## Goals / Non-Goals

**Goals:**

- Keep project selection, draft ownership, and save state inside a small project-settings component.
- Reuse the current data hooks, RPC contract, event refresh, UI controls, and slot-test harness.
- Separate the last saved values from the local draft so events cannot erase an edit or transfer it to a different project.

**Non-Goals:**

- No host-level settings page, navigation redesign, new route, or new command.
- No prefix editing, automatic prefix derivation on rename, folder management, BB-link editing, deletion, or BB workspace mutation.
- No new API, schema, dependencies, generalized form framework, or unrelated Manage refactor.

## Decisions

### 1. Add Projects to the existing Manage page

Create `views/manage/projects-section.tsx` and render it from a new Projects tab in `manage-panel.tsx`. Update the page description to include projects. Keep the current Labels default to avoid changing the existing entry behavior.

Use a labelled project selector showing name and prefix, followed by a compact form with name, read-only prefix context, the existing color picker, Save, and Cancel. Default selection is the first available project when there is no selection. Selection here does not call task navigation. Project changes discard only this local unsaved draft and start a new draft for the selected identity. Make that behavior clear with short form text. This is a proposed default, not an existing behavior.

Alternative: restore editing inside the project-switcher menu. That would mix browsing with settings and would not put the controls where requested. A separate settings route adds navigation work without a benefit for two fields.

### 2. Keep each draft tied to a project identity

Key the editor by project ID. Track saved name/color values separately from draft name/color values. On an inventory refresh, update the saved values but update the draft only when it is clean. Cancel restores the latest loaded saved values and clears the save error. A successful save uses the returned project as the saved baseline and draft values.

Preserve a saved color that is not in the palette. Never substitute `DEFAULT_COLOR` on an existing project. The palette can have no selected swatch for a custom color until the user chooses a replacement.

On successful removal of the selected project, remove its keyed editor. A fallback selection can then create a fresh editor; it must not inherit the removed draft. Do not treat a failed refresh as removal. Keep selection and draft stable while inventory data is unavailable and disable new saves until inventory is ready.

Alternative: copy every inventory update into form state. That is shorter but can erase unsaved work when another project changes. Looking up projects by name would also target the wrong project when names are equal.

### 3. Save through the existing RPC with explicit failure handling

Submit only `{ projectId, name: draftName.trim(), color: draftColor }`. Do not send prefix, folder, or linked BB project fields. Validate the trimmed name and check that the normalized draft differs from the saved values.

Keep save errors local and catch them at the editor's save boundary. Clear the error only on a new attempt, Cancel, project selection, or successful save. Do not close or reset the editor after a failed request. Use a synchronous in-flight guard as well as pending state so two activations cannot send two requests before React renders.

Disable the project selector and editable controls during a save. Use a disabled fieldset for the name and color picker so the shared palette does not need a new state API. Keep Cancel unavailable during the request. Show a pending Save label. This pending lock is local to project settings and does not introduce a new global navigation or unsaved-change policy.

Use the existing `projects:changed` subscription to refresh other project consumers. Apply the RPC response to the local saved state immediately; do not make editor success depend on a later inventory fetch. If the subsequent inventory fetch fails, show its error and Retry separately from the save result.

Alternative: add optimistic global writes or a new update API. Both add rollback or contract work when the existing update path already persists these fields and publishes the required event.

### 4. Treat inventory readiness as a separate state

Use `useProjects` loading, error, data, and refresh values. Distinguish initial loading from successful empty data. Show a visible alert and Retry on error, including an error after cached rows were displayed. Gate Save on a current successful inventory and a selected project that still exists. Retain dirty drafts across ordinary refreshes.

Use accessible labels for the selector and input, named radio choices for colors, and alerts for failures. Let selectors, tab controls, and form rows fit or wrap in narrow panels without adding a fixed-width form.

Alternative: use `projects.data ?? []` alone. That makes a failed request look like an empty inventory and permits stale editors to save.

## Risks / Trade-offs

- Another actor can edit the same project while a draft is dirty. Preserve the local draft, update the cancel baseline on refresh, and let explicit Save write its name/color. Version-based conflict detection is outside this change because the current API has no revision precondition.
- Selecting a different project discards this unsaved draft. Explain this next to the selector and test that no hidden save occurs. Do not add a new global draft system for this small editor.
- The event can arrive before the save response. Test with deferred save and inventory calls so a refresh cannot reset pending values or issue another save.
- The new tab can crowd a narrow panel. Verify wrapping or horizontal scrolling of the tab list without page-level overflow and check the form in a compact layout.
- Existing callers can store colors outside the palette. Preserve those values when changing only the name.

## Migration Plan

No data migration is required. Build and install the updated Tasks plugin through the existing process. Rollback removes the new UI; names and colors saved through it remain valid for the old API and database.
