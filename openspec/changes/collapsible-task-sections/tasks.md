# Tasks

## 1. Scoped section preferences

- [ ] 1.1 Add failing preference tests for `collapsedStatuses` defaults, valid status deduplication, invalid values, legacy preferences, scope isolation, storage failures, and future-version protection. Verify each new behavior fails for the expected reason before implementation.
- [ ] 1.2 Extend `ListPreference`, defaults, sanitation, load, and store with the additive field; preserve filters and sorting. Verify `views/list/list-preference.test.ts` passes and existing version 1 data retains its filters and sorting.
- [ ] 1.3 Make filter, sort, and clear-filter updates preserve section choices. Add persistence tests that switch among All tasks, Active work, and two projects, then remount. Verify `views/list/list-preference.persistence.test.tsx` passes with no scope leakage or loss of saved choices.

## 2. Visible tree and safe selection

- [ ] 2.1 Add section visibility to the rendered group model and make `visibleTreeTasks` omit collapsed groups without deleting entries or changing counts. Add tests through that interface and list rendering for hidden parents, hidden children, filtered matches, and unchanged subtask expansion. Verify focused selection and subtask tests pass.
- [ ] 2.2 Route section toggle commits and persistence through `onRequestContextChange`, and render visibility from the tree returned by `useSelectionTree`. Add browse-workspace tests for selected parent and child collapse, a selected task in another section, failed save, and successful retry. Verify the collapse is not saved on failure and accepted collapse clears only the hidden selection.

## 3. Header controls and restored layout

- [ ] 3.1 Replace each displayed static status header with a full-width native button and disclosure chevron; retain the sticky background, status icon, label, count, and header data marker. Add list UI tests for every task status, expanded defaults, independent toggles, and an all-collapsed non-empty list. Verify hidden rows are absent and activating a header does not open a task.
- [ ] 3.2 Add keyboard and focus tests for Enter, Space, expanded-state announcements, navigation that skips hidden rows, and focus after selected-task reconciliation. Verify the focused keyboard tests pass and no hidden row action can run from header activation.
- [ ] 3.3 Update scroll readiness and layout revision handling for header-only content, using restored scope preferences before a settled visible order. Extend scroll and persistence tests for all-collapsed navigation return, scroll clamping, hidden panes, and a section that disappears under a filter and returns. Verify the focused scroll-restoration and persistence tests pass.
- [ ] 3.4 Update the task-list section of `bb-plugin-tasks-plus/README.md` to explain header toggles, independent device-local scopes, expanded defaults, and unchanged counts. Verify the documented behavior against the section interaction tests.

## 4. Integrated verification

- [ ] 4.1 Run the complete Tasks Plus test suite, typecheck, lint, and build from `bb-plugin-tasks-plus` using `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. Verify all checks pass or report a specific external blocker without claiming completion.
- [ ] 4.2 Check the list in a browser at wide and narrow panel widths. Verify readable header names and counts, touch and keyboard targets, visible focus, sticky headers, navigation persistence, reload restoration, and no horizontal scrolling. Record screenshots and any limits on app-restart verification.
- [ ] 4.3 Run the required single fresh-context read-only completion review against the complete implementation diff and pre-implementation commit. Resolve blocking findings and rerun affected checks; verify the review gate is clear before reporting implementation complete.
