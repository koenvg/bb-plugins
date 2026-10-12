# Project settings production fixture preview

This preview renders the actual `ProjectsSection`, not a separate table editor. BBP-97's accepted name editor is inherited. BBP-98 adds the existing named color palette in each row's responsive popover or compact drawer. Name and color drafts stay local until that row's Save. Custom colors remain exact until a deliberate replacement. Cancel restores both latest loaded values for that row.

## Project deletion early preview

The check mark saves a row, the undo arrow cancels its edits, and the separated red trash icon opens deletion confirmation. Each icon has a named tooltip and a 36px minimum target. The name and colour editor and compact table layout are unchanged.

Open trash while a row has a draft. The dialog shows the saved name and prefix, not that draft. Cancel or Escape closes it without saving. Cancel gets initial focus. On opening, the prefix field is empty. Type the exact case-sensitive prefix, without surrounding spaces, to enable **Delete project and tasks**. Matching alone sends no deletion request.

The fixture count loads two pages containing 42 tasks, including completed tasks and subtasks. The total describes the tasks observed during confirmation; it is not a fixed deletion snapshot. Use **Toggle zero task count** before opening for a known zero. Use **Fail next task count** before opening for an error, then **Retry task count**. Deletion is disabled while counting or on count failure.

Deleting here changes browser memory only. All row edits and actions, the prefix field and dialog dismissal lock while the request is pending. **Fail next deletion** keeps the confirmation for manual retry. Successful deletion removes only the selected fixture row; Reset restores both fixtures. The production API permanently deletes the Tasks project and all its tasks. It does not delete linked BB workspaces, BB threads or workspace files. No restoration or undo is provided.

Use **Overlap stale inventory on next delete** before opening the dialog to start a delayed old inventory during deletion. The deleted row must stay absent when that read returns. To test a successful deletion followed by a failed refresh, arm **Fail post-delete refresh** before opening. The row disappears and success stays separate from the inventory alert. Select **Allow inventory reads**, then inventory **Retry** to recover without deleting again.

Use **Toggle light/dark** and resize the panel to inspect both layouts. These tokens approximate the host themes. Koen approved the shorter copy and adjusted spacing/typography with "Perfect". See [the change's implementation notes](../../../openspec/changes/archive/2026-10-10-delete-task-projects/implementation-notes.md) for current validation, visual evidence and review limits. Approval of this preview is not deployment approval.

## BBP-98 delivery and feedback history

BBP-98 stays attached to `bbthread://thr_yaw3edehh3`, with coordinator `bbthread://thr_djtxs2h8t2`. Koen approved the combined editor and then its scoped round, borderless swatches with "looks good!". The coordinator authorized final delivery validation and one fresh independent full-delivery review, not deployment or publication. Delivery-1 boxes 1.1-1.9 are checked; delivery-2 boxes 2.1-2.6 stay unchecked for coordinator evidence checking. User visual approval, implementation validation and coordinator completion checking remain separate.

Open either route below. Edit a name, open its color control and choose a named swatch. No update occurs before Save. Try independent changes in HOME and WORK, then Cancel one. HOME starts with a custom color and no selected palette swatch; opening/dismissing the palette does not replace it. Name-only saves preserve its exact color. Combined saves keep prefixes, task keys, folder and BB links unchanged. All row controls lock while one save is pending.

In the project table only, palette choices are round and have no normal borders. A solid ring marks the selected color. A separate dashed outline marks keyboard focus. Swatches keep their 36 px targets and wrap within the existing responsive popover or compact drawer. Other Manage and New project palettes are unchanged.

Early-gate, round-swatch feedback and final delivery evidence are stored with the BBP-98 worker at `bbthread://thr_yaw3edehh3`. The final evidence includes commands, test results, browser geometry, review and handoff. The history below belongs to accepted BBP-97 only and is not evidence of BBP-98 acceptance.

No live plugin, host endpoint or live project data is used. RPC handlers keep fixture projects in browser memory. Failure buttons, removal, empty inventory and Reset affect only these fixtures. The separate integration test uses the actual Tasks RPC and temporary SQLite through the SDK fake host.

## Open the preview

- Production table: `http://127.0.0.1:4179/project-settings-preview/table.html`
- Full registered Manage page: `http://127.0.0.1:4179/project-settings-preview/index.html`. Labels remains the default. Select Projects to edit.
- A remote Local Share, when active, may expose only this approved fixture server on port 4179. Shares expire. Check status before reusing an old URL; do not expose another server or live endpoint.

The server binds to loopback. It serves generated static HTML, one bundled script and styles, without source-module or HMR requests from the preview. The earlier remote source-module fetch failed; the precise network cause was not established. Static bundling removes that failed delivery path.

From the worktree root, build first, then start the fixture server only if port 4179 is free:

```sh
bb plugin build bb-plugin-tasks-plus
node bb-plugin-tasks-plus/node_modules/vite/bin/vite.js build --config bb-plugin-tasks-plus/scripts/project-settings-preview/bundle.config.mjs
node bb-plugin-tasks-plus/node_modules/vite/bin/vite.js --config bb-plugin-tasks-plus/scripts/project-settings-preview/vite.config.mjs
```

Generated files in `public/project-settings-preview/` are ignored. The preview reuses the locked SDK, Vite and Vitest dependencies. React's development build is necessary for the SDK slot harness's `act()`; this does not alter the production plugin build.

## Try the table

1. Edit HOME and WORK independently. They deliberately have the same saved name. Prefix and identity distinguish their rows.
2. Cancel one row. Only that draft resets; no update is sent. Save trims the name and saves its color draft. Without a color choice, the exact existing color is preserved. Prefix, task keys, folder and BB link stay unchanged.
3. Enter whitespace. Save is unavailable. Name input Enter and the row Save button use the same explicit form submission.
4. Save a changed name. Editing, Save and Cancel are locked across rows until the request finishes. The Save button retains its width.
5. Arm **Fail next save**, then Save. The row announces an error and retains its draft. Retry Save, or Cancel to clear that row's error.
6. Use **Refresh inventory** while a row is dirty. Cached rows stay mounted and the draft remains. Loading appears in the reserved status line; new saves wait for ready inventory.
7. Use **Fail next inventory refresh**, then **Retry**. This error stays separate from save errors and is not an empty inventory. Failed reads do not remove rows or erase drafts.
8. Use fixture removal or empty inventory. Successful inventories remove only their keyed rows. Reset restores the fixture data.
9. On the full Manage page, switch tabs during a pending save and return to Projects. Its row, draft and single-flight guard remain mounted; other settings stay available.

On a cold inventory with no known rows, the table headers and status are present. Actual rows appear when their count becomes known. Production does not copy the prototype's two-fixture placeholder assumption. Once displayed, row geometry and Save/Cancel widths remain stable through refresh and saving. An inventory change that adds/removes rows, or an error that needs an alert, can change content height.

## Approved planning change

Koen approved the table and stable loading treatment in the fixture feedback gate. The parent then authorized replacing the production selector and completing BBP-97 name editing, validation and review. Local OpenSpec proposal/design/spec/tasks now describe one row per identity with independent drafts and explicit per-row Save/Cancel, not selection/discard or a second editor option.

This is an approved deviation from planning revision `20db7c8da2c9b00a6c2f9545f934fb1e38dbc886`. Task IDs 1.1-1.9 and 2.1-2.6 are unchanged. Delivery-1 boxes were checked after coordinator acceptance; delivery-2 boxes remain unchecked. The earlier colour-editing prototype was retired in favour of rendering production directly; its unshipped reference remains in the BBP-97 worker evidence.

## Accepted BBP-97 validation history

Commands run from `bb-plugin-tasks-plus` unless stated otherwise. Final checks use the production table.

Evidence filenames below refer to external BBP-97 worker artifacts at `bbthread://thr_znwgaraqtp`, not files in this repository.

| Check                                                            | Result                                                                                  | Evidence                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------- |
| Focused rendered/integration and affected inventory/picker tests | 35 passed across 4 files, exit 0; 18 production-table tests                             | `bbp97-review-fixes-green.log`  |
| Full `npm test`                                                  | 124 files, 1236 tests passed, exit 0                                                    | `bbp97-full-tests.log`          |
| `npm run typecheck`                                              | Exit 0                                                                                  | `bbp97-typecheck.log`           |
| `npm run lint`                                                   | Exit 0; four warnings in unchanged files                                                | `bbp97-lint.log`                |
| `npm run build`                                                  | Exit 0                                                                                  | `bbp97-build.log`               |
| Fixture bundle                                                   | Exit 0; dependency directive warnings                                                   | `bbp97-preview-bundle.log`      |
| Oxfmt on all changed supported files                             | Exit 0                                                                                  | `bbp97-format.log`              |
| Native browser input and compact layout                          | Exit 0 at 1000, 375 and 320 CSS px                                                      | `bbp97-production-browser.log`  |
| Narrow panel within a wide desktop viewport                      | Exit 0; table and full Manage at 500, 375 and 320 px panel widths in a 1000 px viewport | `bbp97-narrow-panel-green.log`  |
| Strict OpenSpec validation                                       | Exit 0; all checkboxes remain unchecked                                                 | `bbp97-openspec-validation.log` |

The integration test drives the actual `updateProject` RPC, reads persisted data through a separate Tasks store over temporary SQLite, forwards actual published `projects:changed` events, and observes the existing browse project picker. It verifies unchanged project identity, prefix, task key, colour, folder, BB link, no BB-project writes and no navigation calls.

Rendered tests cover local row ownership, no hidden updates, blank/unchanged drafts, exact trimmed payload, custom colours, table-wide synchronous locking, returned baselines, row errors/manual retry, dirty and clean refresh, cached inventory failure/Retry, successful removal, both overlapping read orders, post-save read failure and pending row removal. A red regression proved that tab unmounting lost the pending guard; keeping Projects mounted while hidden fixes it. Evidence is `bbp97-tab-lock-red.log` and the green log above.

A browser regression also found a 62 px row shift when a failed-save alert cleared at retry start. A hidden, non-announced copy retains that alert's layout space only while retrying. The native checks now verify identical row/action geometry before and during retry at all three widths. The red evidence is `retry-layout-red.json` and `bbp97-retry-layout-red.log`; the green evidence is in the final browser JSON and focused log.

Browser evidence: `production-browser-evidence.json`. At each width the native checks used trusted Tab, Enter and Space events for Save/Cancel/Retry and failure recovery. They confirmed accessible table/rows, Labels default and native tab selection on the full Manage page, stable table/action geometry during saving and refresh, no captured runtime errors and no horizontal page overflow. An earlier browser connection became unavailable; a fresh default-browser connection reused only the recorded owned tab. Focus emulation was scoped to that tab and reset; no user tab was activated or closed.

Screenshots:

- `production-table-ready-1000.png`
- `production-table-ready-375.png`
- `production-table-ready-320.png`
- `production-manage-375.png`

The browser driver initially attempted another save before inventory was ready. The UI correctly blocked it; the driver now waits for readiness. The failed driver run is retained at `bbp97-production-browser-first.log`. The repeat passed. This did not require a production change.

The four lint warnings are in `api/index.ts`, `attachments/index.ts`, `shell/keyboard.test.tsx` and `views/list/list-preference.ts`, none changed by this task. No audit fixes were made. Locked root tooling was installed with `npm ci`; no manifests or lockfiles changed.

## Independent review and repairs

One fresh generic read-only reviewer inspected the full working tree from the baseline, including new files, planning and preview. Its original report is `bbp97-independent-review.md` in the BBP-97 worker evidence. It requested changes for two blockers. No second review was launched after repairs.

- A boolean that skipped the next settled inventory could also skip a later independent read when it superseded an overlapping read. The editor now uses the inventory owner's revision at Save completion. The deferred regression fails before the repair and passes afterward. It checks clean-name refresh, Cancel's baseline and the exact saved-colour payload on the next Save. Red: `bbp97-superseded-read-red.log`. Green: `bbp97-review-fixes-green.log`.
- The compact layout used viewport width, leaving an 84 px name input in a 500 px panel within a 1000 px window. The section now uses a local inline-size container. Native Save/Cancel and refresh checks pass on both fixture routes at 500, 375 and 320 px panel widths with no section overflow or geometry shift. Red: `bbp97-narrow-panel-red.log` and `narrow-panel-red.json`. Green: `bbp97-narrow-panel-green.log` and `narrow-panel-evidence.json`.

The internal query now exposes its read revision. An existing picker fixture needed the new fields for typecheck; `bbp97-read-revision-fixture-typecheck-red.log` retains the initial failure. Final typecheck and the affected picker tests pass.

The reviewer also found duplicate local Input/Button styling. Recorded as [BBP-184](bbtask://BBP-184), backlog and blocked by BBP-97 because it depends on this table. It does not block BBP-97. No unrelated cleanup was performed.

The original review verdict remains "request changes". The worker repaired and verified both blockers; there is no independent post-repair approval or user acceptance claim. Readiness and acceptance remain with the coordinator and Koen.

## Delivery boundary

The required independent clean-context read-only review covers the complete working-tree change, including planning, documentation and preview files. Its result and the review-readiness handoff belong to `bbthread://thr_znwgaraqtp`. The coordinator checks evidence and OpenSpec boxes; user feedback/acceptance remains separate from implementation and test results.

BBP-97 is accepted and done. BBP-98's visual feedback gate is satisfied; final validation and one new independent full-delivery review are authorized. Coordinator evidence checking remains required. Do not mark BBP-98 done, merge, publish, install/reload a live plugin, replace installed code or change live data without the required authorization. Theme tokens approximate the host and its full CSS reset is absent here. Fixture checks do not establish installed-host styling or authenticated remote rendering. Live validation was not run and is not authorized.

Starting and current HEAD: `7ee5dbe4de04d451576051726118046af77e7da9`, with no commits made. BBP-97's original starting worktree was clean; BBP-98's was not.

Branch: `bb/bbp-97-project-name-editor-early-preview-thr_znwgaraqtp`.

Worktree: the isolated BBP-97 worker checkout linked to `bbthread://thr_znwgaraqtp`.

Current task: BBP-98, parent BBP-99. Worker: `thr_yaw3edehh3`; coordinator: `thr_djtxs2h8t2`. BBP-97 is done and BBP-98 is unblocked. BBP-98 inherited 22 changed/new files at this HEAD; exact starting status, hashes and a source snapshot are in its early-preview evidence directory. No inherited changes were reset or overwritten.
