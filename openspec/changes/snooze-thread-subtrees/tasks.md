# Tasks

## 1. Subtree selection and eligibility

- [x] 1.1 Check the pinned SDK's thread-list filters, relationship fields, and sidebar-hook coverage; implement normalized adapters for complete membership data without adding a dependency. Verify with typed fixtures that active grandchildren beneath archived or hidden intermediates can be found without snoozing those intermediates.
- [x] 1.2 Add failing selector and eligibility tests, then implement the focused pure subtree selector and shared blocking policy. Verify parent/child/grandchild membership, selecting a child without its ancestors or siblings, collapsed/offscreen/cross-project members, excluded lifecycle/visibility records, missing data, and cycle termination.
- [x] 1.3 Document captured membership, excluded threads, subtree-wide blocking signals, and the fact that later-created children do not inherit snooze in the README. Verify each stated boundary against the selector tests and the delta spec.

## 2. Durable snooze groups

- [x] 2.1 Add migration tests, then introduce group membership in `snooze-store.ts`, with transactional group replacement, coherent deadline/membership reads, group ending, individual-member removal, and conditional due-group deletion. Verify legacy singleton preservation, overlapping descendant replacement, unrelated groups with equal deadlines, and archive of the original root.
- [x] 2.2 Extend `contract.ts` and shared snapshot types with group membership while preserving snooze/wake inputs. Verify schema tests and typecheck, including fail-closed handling of snapshots without required group data.
- [x] 2.3 Test rollback/re-upgrade compatibility for rows inserted by the previous version without group IDs and old-version upserts of existing grouped members, and document the migration/rollback limits. Verify the new store treats those rows as independent snoozes without merging unrelated rows.

## 3. Server mutations and wake propagation

- [x] 3.1 Add failing server tests for grouped snooze, then update `snoozes.ts` to resolve the full selected membership, mark included members read, persist one transaction, and publish once. Verify shared deadlines, unchanged running work, prior snoozes retained after a read failure, and no partial new group when a later read update fails.
- [x] 3.2 Implement group-wide manual, completion, and failure wakes, with individual archive/unarchive cleanup. Track terminal signals from action acceptance through queueing, hierarchy loading, and read updates so a pre-commit event cannot be lost. Verify with harness tests for child/grandchild events without clients, delayed read/event interleavings, repeated events, unrelated threads, and archive/unarchive of one member.
- [x] 3.3 Update the minute sweep to process captured due groups and mark remaining non-archived members unread. Verify all members wake with no clients, deleted members do not block the group, overdue groups wake after restart, and a delayed sweep cannot delete a newer replacement snooze or leave its members unread.
- [x] 3.4 Update the README wake table for group-wide deadline/manual/terminal behavior and individual archive cleanup. Verify its unread-state claims against server tests, including the lack of atomic rollback for read updates.

## 4. Shared frontend behavior

- [x] 4.1 Add failing model/hook tests, then make `activeSnoozes`, early-wake selection, and `use-snoozes.ts` operate on complete group snapshots. Verify any observed member attention signal removes the whole group from the effective map, one wake request is issued per group, retries are safe, and unrelated PR-only changes do not wake a group.
- [x] 4.2 Update `snooze-client.tsx`, menus, and palette applicability to use the same complete-subtree eligibility and group state. Remove the single-thread projection from palette checks. Verify loading/recovery readiness, stopped-owner generations, sidebar-closed commands, Wake now from a grouped child, and a newly blocking descendant between action listing and dispatch.
- [x] 4.3 Add list and rendered-app regressions for the reported parent snooze. Verify all included members disappear from both attention tabs, appear once nested in Snoozed with shared wake times, preserve pin/collapse behavior, and return via normal tree-tab rules. Retain context rows for awake members outside a captured group; alter list construction only if these tests require it.
- [x] 4.4 Document menu/palette equivalence and the current open-frontend limit for approval, answer, unread-error, and queued-send detection. Verify documentation agrees with frontend tests and does not imply server-only detection for those signals.

## 5. Integration verification

- [x] 5.1 Run `npm test`, `npm run typecheck`, and `npm run build` in `bb-plugin-pr-thread-list`. Verify all commands pass and existing single-thread snooze, list preferences, command ownership, and PR behavior remain covered.
- [x] 5.2 Reload the installed plugin and verify a parent with children and a grandchild from both menu and palette. Check Snoozed nesting, absence from both attention tabs, Wake now from a child, child approval/failure/completion wakes, and scheduled wake with clients closed. Record observed results and any frontend-detection limit in the change's verification notes.
- [x] 5.3 Reconcile the overlapping `thread-snooze-command-palette` planning deltas before archive, preserving its command names, focus targeting, and readiness guarantees while removing obsolete single-thread assumptions. Verify both changes pass strict OpenSpec validation and neither archive order reintroduces contradictory behavior.
