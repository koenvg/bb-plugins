## Context

- The Changes tab (`bb-plugin-changes`) already has viewed marks: `core/viewed-files.ts` (hash, summary), `core/viewed-store.ts` (client store with optimistic writes), `ui/use-viewed.ts`, and `ViewedCheckbox` and `CollapseButton` in `ui/file-section.tsx`. The server keeps the marks in kv and writes them in order through `createViewedMarksKv` in `server.ts`.
- The Review tab (`bb-plugin-github-insight/ui/review-tab.tsx`, `ui/file-diff.tsx`) renders each file through `review-ui/review-file-diff.tsx`. That component already takes `collapsed`, `headerPrefix` and `headerMetadata`. The Review tab passes only the thread count.
- `getReview` resolves the PR of the thread on the server and returns `files` with the GitHub `patch` inline. There is no lazy patch load as in the Changes tab.
- `review/draft-store.ts` already keys kv entries by `owner/repo#number`.
- `review-ui/README.md`: only `react` and `@pierre/diffs` imports, SDK values come in through props, no RPC and no plugin state.

## Goals / Non-Goals

**Goals:**

- The same behavior as the Changes tab, see `specs/pr-review-viewed-files/spec.md`.
- One copy of the checkbox, the collapse button and the hash.

**Non-Goals:**

- A shared client store or shared hook between the two plugins. Their data flows are different (lazy patches and RPC load in Changes, a single `getReview` result in Review).
- Live sync between two open Review tabs of the same PR. The other tab shows the new marks after its next load.

## Decisions

### Marks come with `getReview`

`getReview` returns `viewedMarks: Record<path, identity>` for the PR. The server reads them from kv key `viewed:v1:<owner>/<repo>#<number>`.

- Alternative: a separate `getViewed` RPC, as in the Changes tab. Rejected: the client does not know the PR ref, and the server already resolves it in `load`. A second RPC would resolve the PR again.

### `updateViewed({ threadId, set, remove })` writes the marks

The server resolves the PR of the thread, then merges `set` and `remove` into the kv entry. Writes for one PR run in order, the same way as `createViewedMarksKv` in the Changes plugin. The entry is deleted when it is empty. The RPC returns `{ kind: "ok" }` or `{ kind: "error", message }`.

The RPC does not publish a review update. A publish reloads the whole review from GitHub (files, threads, head), which costs three `gh` calls for each click.

### The client checks validity, as in the Changes tab

The client computes `patchIdentity(gitPatch(file))` for each file and compares it to the mark. Stale marks (other patch, file not in the PR, file without a patch) are removed in one `updateViewed` call.

- Alternative: prune on the server inside `load`. Rejected: then the server bundle must import `review-ui/`, and today no server code does that. The client path also keeps one validity rule for both plugins.
- `gitPatch` includes the file status and rename headers in the hash, so a change from "modified" to "renamed" also drops the mark. This is correct: the diff the user saw is different.

### Client store with optimistic writes

A module-level store in `bb-plugin-github-insight/ui/` keyed by thread id holds:

- the marks from the last `getReview` result,
- the writes in flight, applied on top of those marks until they settle,
- the collapse toggles (in memory, lost on reload),
- the last save error.

A new `getReview` result replaces the base marks but keeps writes in flight on top. A saved write also stays on top for one result that disagrees with it, because that load can have read kv before the write. A failed write restores the state from before it (an earlier write, or the base) and sets "Could not save viewed state: <message>". Checking, unchecking or a dropped mark clears the collapse toggle of that path.

- Alternative: reuse `bb-plugin-changes/core/viewed-store.ts`. Rejected: it loads marks once per key and expects a separate load RPC. `review-ui/` also forbids plugin state.

### Shared parts in `review-ui/`

- `review-ui/patch-identity.ts`: `patchIdentity(patch)`, the FNV hash moved from `bb-plugin-changes/core/viewed-files.ts`.
- `review-ui/viewed-controls.tsx`: `ViewedCheckbox` and `CollapseButton`. `CollapseButton` takes the chevron icons as props, because `review-ui/` cannot import the plugin `Icon` component.
- `bb-plugin-changes` imports these. Its tests must still pass without changes to the assertions.

### Header layout in the Review tab

`headerPrefix` gets the collapse button. `headerMetadata` gets the thread count, then the "Viewed" checkbox. The counter "N/M viewed" goes after "N files changed" in the Review header, before the open and outdated pills.

## Risks / Trade-offs

- [Two threads on the same PR write at the same time from two bb windows] → The server queue keeps one process in order. Writes from separate hosts can lose a mark. Acceptable for a local view aid.
- [GitHub truncates or drops `patch` for large files] → These files show "Diff not available" and cannot be marked, per the spec.
- [Marks stay in kv after the PR is merged] → Each entry is a small map of path to hash. No cleanup in this change.
- [A force push with the same file content keeps the mark] → Correct: the patch the user saw is the same.
