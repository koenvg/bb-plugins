# Tasks

## 1. Remembered scope and compatible browse routes

- [ ] 1.1 Add a versioned browser-profile-wide project-or-All preference beside `shell/view-preference.ts`, preserving session usability when storage fails; verify unit tests cover missing/malformed storage, explicit All, separate BB-project entry, valid project ids, and unknown future-version write protection.
- [ ] 1.2 Distinguish undirected Tasks entry from explicit All and resolve it only after a successful project inventory; verify shell tests cover reopening, refresh, remembered board mode, deleted projects, loading/stale inventory, lookup failure with retry, and blocked storage without a navigation loop.
- [ ] 1.3 Extend browse-route parsing/serialization with optional `task=KEY` and replacement preview navigation while retaining existing task/project/board destinations; verify round-trip and host-encoded-route tests, explicit-route precedence, direct cross-project links, and explicit All/Active/Manage palette commands.
- [ ] 1.4 Document scope restoration and explicit-link precedence in the README and correct its outdated filter-persistence limitation; verify the documented behavior matches the preference and route test cases without implying server-side or cross-device sync.

## 2. Safe editable-ticket transitions

- [ ] 2.1 Make `views/detail/description-save.ts` flushing awaitable and serialize originating-task writes without clearing newer or failed drafts; verify deferred-promise tests cover debounce flushing, server rejection, transport failure, retry, older response ordering, and multiple edits during an in-flight save.
- [ ] 2.2 Add a bounded detail edit-session/transition interface that includes pending title and property writes, commits only after successful saves, and coalesces rapid requested destinations; verify detail/workspace tests keep the originating ticket and draft visible on failure and never apply its content to another task.
- [ ] 2.3 Add task-id-keyed in-memory comment draft and staged-attachment ownership for embedded detail while retaining standalone composer defaults; verify activity tests cover A-to-B-to-A text/files/notification preference, explicit send/removal, send/upload completion during a switch, and zero comment, upload, notification, or delegation side effects from selection alone.
- [ ] 2.4 Expose visible retry for transition save failures and guard detail rendering against stale task responses; verify slow A/fast B lookup and failed-save tests, and add concise interface comments documenting confirmed-save and task-ownership guarantees.

## 3. Split workspace and inline project navigation

- [ ] 3.1 Add the `shell/` browse-workspace owner for All, Active, and project-list destinations, adapting `ListView` to controlled selected identity and settled visible-order reporting; verify click-selection integration tests show the existing editable `DetailView` beside a retained list without a duplicate task editor or independent focused-index state.
- [ ] 3.2 Adapt useful project/folder navigation into a list-header selector and secondary-action menu, remove the permanent fixed Navigation tab registration, and retain the sidebar accessory/commands; verify app-registration and shell tests cover All, project switching, folder grouping, no-project creation, Active, Manage, and preset-management reachability.
- [ ] 3.3 Route embedded task/subtask navigation through the workspace when the target is visible, with standalone links otherwise; verify visible subtask detail opens in place, off-list and cross-project links remain valid, label controls and new-task defaults follow the current project, and board/thread-embed tests remain unchanged in behavior.
- [ ] 3.4 Preserve selected identity during transient list refresh and safely clear it on settled removal, filter change, collapse, deletion, or project switch; verify list tests cover visible sorted order, dimmed parents, expanded subtasks, pending-save failure during context changes, and no hidden row left highlighted.
- [ ] 3.5 Add select-a-ticket, selected-ticket loading, lookup error/retry, and confirmed-missing states without disabling the list; verify shell/detail integration tests show the correct selected identity and never reuse the previous ticket's content under a new selection.
- [ ] 3.6 Update README navigation guidance for inline project selection, retained list context, and the editable right pane; verify each documented destination remains reachable in the shell integration fixtures.

## 4. Keyboard selection and focus ownership

- [ ] 4.1 Add workspace-owned `j`/`k` and arrow movement using committed selection and the list's settled visible order, retaining real row focus and scroll visibility; verify list/workspace tests cover first movement, start/end bounds, empty lists, custom sort/filter order, expanded subtasks, and movement from non-editable detail controls.
- [ ] 4.2 Gate list/detail action registrations by actual focus owner while retaining the shared shortcut table, single listener, and all existing guards; verify shortcut/provider tests cover simultaneous panes, hidden compact panes, one action per key, editable descendants, composition, modifiers, open menus/dialogs, and another BB pane.
- [ ] 4.3 Implement Enter/`o` focus transfer and Escape return without replacing the split list; align split-browse previous/next actions with visible order while preserving standalone pager and board keys; verify shell/list/detail keyboard tests include asynchronous detail loading and safe saves before movement.
- [ ] 4.4 Update shortcut definitions/help labels and the README keyboard table for split versus standalone/board behavior; verify help is still derived from definitions, focus returns after menus/help, and duplicate-key tests permit only explicitly focus-exclusive actions.

## 5. Responsive layout and retained view state

- [ ] 5.1 Compose a narrower left list and flexible detail with independent scroll areas, BB tokens, and a persistent accessible selected-row marker; verify list/row/layout tests cover full task identity, long titles, important state badges, selection with focus in detail, and unchanged filters/sort/expansion counts.
- [ ] 5.2 Use actual Tasks panel width for split/compact switching, starting at the design's 880 px threshold, and keep selection/drafts stable across resize; verify mocked-width integration tests cover a narrow panel inside a wide window, both transition directions, no unintended editor autofocus, and no state reset from layout changes.
- [ ] 5.3 Implement compact single-detail navigation and Back to list while retaining the mounted list and its scroll restoration; verify mobile-layout and scroll-restoration tests restore scope, filters, sort, expansion, selected row, and position after selection, return, and resize.
- [ ] 5.4 Document compact fallback and the current-session limit of unsent draft retention in the README; verify descriptions match responsive and draft tests and do not promise persistence after panel closure or browser reload.

## 6. Whole-plugin and host acceptance

- [ ] 6.1 Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` from `bb-plugin-tasks-plus`; verify all commands pass, including board, dependencies, delegation, mentions, and embeds, and record any pre-existing failures separately.
- [ ] 6.2 Verify the built plugin in BB using the supplied ticket data or equivalent existing tasks, with approved installation/connection steps if needed; inspect split and compact widths together in light/dark and the available third-party theme, confirm no obsolete right Navigation pane remains, keyboard/save/scroll/project-memory flows work, and fix observed defects in one batch followed by at most one confirmation inspection.
- [ ] 6.3 Confirm host-level compatibility and the final change boundary: check direct task links, palette entry, board drag/open, thread-side embeds, and comment/delegation actions; run the required read-only completion review and `git diff --check`, record any unverified host acceptance instead of claiming it passed, and keep the pre-existing `.impeccable/design.json` refresh separate from feature changes.
