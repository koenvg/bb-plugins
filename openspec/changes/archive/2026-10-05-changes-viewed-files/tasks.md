# Tasks

## 1. Spike

- [x] 1.1 In the running app, pass `collapsed: true` and a `renderHeaderMetadata` checkbox to one `FileDiff` in the Changes tab; verify the shimmed `@pierre/diffs` collapses the body and shows the checkbox in the sticky header, and record pass or fail and the fallback choice (design Risks) in design.md

## 2. Core: identity and marks

- [x] 2.1 Implement `patchIdentity(patch)` in `core/viewed-files.ts` and `targetKey(target)` in `core/changes.ts`; verify unit tests: same patch gives the same identity, a one-line edit with the same counts gives another identity, and `commit` targets include the sha
- [x] 2.2 Implement `viewedState(files, patchStates, marks)` returning per-file viewed, the "N/M" counts, and the paths to prune (not in the list, or identity mismatch); verify unit tests: binary and `too_large` files are not in M, an unloaded patch is not viewed and not pruned, and a mismatch is pruned

## 3. Server: kv storage

- [x] 3.1 Add `getViewed` and `updateViewed` to `contract.ts` with zod schemas for input, output, and the kv value `{ v: 1, marks }`; verify `npm run typecheck` passes
- [x] 3.2 Implement both RPCs in `server.ts` with `bb.storage.kv`, key `viewed:v1:<threadId>:<targetKey>`, a per-key promise chain, and key delete when no marks are left; verify unit tests with a fake kv: set and remove in one call, two parallel updates keep both changes, a bad stored value reads as no marks, and a kv error returns `{ kind: "error", message }`

## 4. Changes tab UI

- [x] 4.1 Implement the viewed store and hook (keyed by thread and target, optimistic toggle, revert and error on a failed save); verify unit tests: a failed `updateViewed` puts back the previous marks and sets the error, and two threads stay separate
- [x] 4.2 Add optional `headerMetadata` and `collapsed` props to `review-ui/review-file-diff.tsx` (or the fallback from 1.1); verify its component test renders the metadata node and passes `collapsed` to `FileDiff`
- [x] 4.3 Render the "Viewed" checkbox in `FileSection` for files that can be marked, collapse viewed files also when not near the view, and load the patch early for marked `on_demand` files; verify component tests: check collapses, uncheck expands, binary and "Diff too large" have no checkbox, and the checkbox has `aria-label="Viewed <path>"`
- [x] 4.4 Render the expand or collapse chevron and keep its override in the viewed store; verify component tests: expanding a viewed file keeps "Viewed" checked and the counter, collapsing an unviewed file keeps it unviewed, check and uncheck clear the override, and the override stays after the tab unmounts and mounts again
- [x] 4.5 Load marks with `getViewed` once per thread and target (the client store keeps them after that), and prune with `updateViewed` after a successful load; verify component tests: a changed patch after refresh shows the file expanded and calls `updateViewed` with that path in `remove`, a file that left the diff is pruned, a pruned file loses its override, and an error result does not prune
- [x] 4.6 Show "N/M viewed" in the summary and "Could not save viewed state: <error>" on a failed save; verify component tests for the spec examples "2/3 viewed", "1/3 viewed" after a change, no counter when M is 0, and the error text
- [x] 4.7 Update `bb-plugin-changes/README.md` and `PLUGIN_OVERVIEW.md` with the viewed marks, the kv key format, and when a mark drops; verify every label in the docs matches the UI text in the tests

## 5. Integration

- [x] 5.1 Run `npm test`, `npm run typecheck`, and `bb plugin build` in `bb-plugin-changes/`; verify all pass
- [x] 5.2 In the running app on a real worktree: mark two files, reload bb, confirm both stay viewed; ask the agent to edit one, refresh, and confirm it expands and the counter drops by one; record the result in the PR description
