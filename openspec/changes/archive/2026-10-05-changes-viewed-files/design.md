# Design

## Context

See proposal.md for the motivation and `specs/changes-viewed-files/spec.md` for the behavior.

Facts that shape the approach:

- `environments.diffFiles` gives path, previous path, line counts, `binary`, and `loadMode`. It gives no blob sha, so the file identity must come from the patch.
- The patch is the full difference between the base and the file. A change to the file changes the patch, unless the file becomes the same as an earlier state. A hash of the patch text therefore drops the mark on every edit, also when the line counts stay the same.
- `auto` patches come with `getChanges`. `on_demand` patches load through `getPatches` when the section nears the view (`ui/use-patches.ts`). `too_large` and binary files have no patch.
- `FileList` already loads the patch of a file early when the file has a pending comment (`ui/changes-tab.tsx`). Viewed files can use the same path.
- `@pierre/diffs` 1.2.9 (the version in `package.json`) has the option `collapsed` and the `FileDiff` props `renderHeaderPrefix` and `renderHeaderMetadata`. bb shims this package at runtime. The copy in bb 0.44.0 (`FileDiff-*.js` in the app bundle) also reads `options.collapsed` and `renderHeaderMetadata`.
- `bb.storage.kv` has `get`, `set`, `delete`, and `list`. `github-insight/review/draft-store.ts` uses it with prefixed keys and a zod schema on read.
- OpenForge (`packages/pr-review-ui`) hashes the patch with FNV-1a 32 when there is no blob sha, keeps a `Map<path, identity>` per PR, collapses on mark, and prunes stale entries when the file list loads.

## Goals / Non-Goals

**Goals:**
- One source of truth for a mark: the stored patch hash. "Viewed" is always computed, never stored as a flag.
- No extra `gh` or git process. Only the existing environment diff calls and kv.

**Non-Goals:**
- Save the expand or collapse toggle. Only the mark is saved.
- Sync between two open windows on the same thread. The last write wins.

## Decisions

### 1. Identity is a hash of the patch text

`patchIdentity(patch) = "<length>:<fnv1a32 hex>"`, a pure sync function in `core/viewed-files.ts`, the same as OpenForge.

- The patch already holds the path, the previous path, and the blob shas, so no other fields go into the hash.
- Sync, so the UI can compute "viewed" during render with no async state.
- Alternative: SHA-256 with `crypto.subtle`. Rejected: async for no gain. A collision only keeps a mark that should drop, and length plus FNV makes this very rare.
- Alternative: path plus line counts. Rejected: the user wants every change to drop the mark, and this misses an edit with the same counts.
- Alternative: `git hash-object` on the server. Rejected: needs a git process next to bb's diff API, and binary files are out of scope anyway.

### 2. Storage: one kv entry per thread and target

```
key:   viewed:v1:<threadId>:<targetKey>
         targetKey = all | uncommitted | branch_committed | commit:<sha>
value: { v: 1, marks: { "<path>": "<identity>" } }
```

- Per target, because the patch of a file is different per target. A single map per thread would make a mark on one target overwrite the mark on another.
- The base branch is not in the key. When it changes, the patches change, and the marks drop by Decision 1.
- The server reads with a zod schema. A bad or old value reads as no marks.
- Alternative: one key per file. Rejected: a load needs `list` plus one `get` per file.

### 3. RPCs

| RPC | Does |
|---|---|
| `getViewed({ threadId, target })` | Returns `{ kind: "ok", marks }` or an error. |
| `updateViewed({ threadId, target, set, remove })` | `set: Record<path, identity>`, `remove: string[]`. Reads, changes, and writes the entry. Deletes the key when no marks are left. Returns `{ kind: "ok" }` or an error. |

- The server runs the updates of one key one after the other (a promise chain per key), so two quick clicks do not lose a write.
- Alternative: the client writes the full map. Rejected: a slow write can overwrite a newer one.
- `updateViewed` does not return the marks. The client keeps its optimistic marks, because the answer to an earlier click can arrive while a later click is still on its way.

### 4. Client store and "viewed" check

A module store like `core/pending-review.ts`, keyed by `threadId + targetKey`, with a `useSyncExternalStore` hook. It holds the marks from the last `getViewed`, and applies a toggle at once (optimistic). When `updateViewed` fails, it puts back the previous marks and sets the error that the tab shows.

```
isViewed(file, patchState, marks) =
  file can be marked
  and patchState is loaded
  and marks[file.path] == patchIdentity(patch)
```

- A file with a mark and an `on_demand` patch loads its patch early, like a file with a pending comment. Until the patch loads, the file shows as not viewed.

The same store holds the expand toggles in memory, per thread and target: `Map<path, boolean>` of overrides.

```
collapsed(file) = override[file.path] ?? isViewed(file)
```

- A check or uncheck of "Viewed" deletes the override, so check collapses and uncheck expands.
- When a mark drops by prune, its override is deleted too, so the changed file expands.
- Alternative: save the toggles in kv. Rejected: GitHub also collapses viewed files again after a reload, and it adds a write per click.

### 5. Pruning

When the file list and the patches of all marked files are known, the tab calls `updateViewed` with `remove` for:
- marked paths that are not in the file list of this target, and
- marked paths whose identity does not match the loaded patch.

Prune runs only after a successful `getChanges`. It never runs on an error or `no_git` result, so a failed load does not delete marks.

### 6. UI

- `ReviewFileDiff` gets two optional props, `headerMetadata?: ReactNode` and `collapsed?: boolean`, passed to `renderHeaderMetadata` and the `collapsed` option. The component stays free of RPC calls.
- `FileSection` renders the "Viewed" checkbox in the header metadata, after the line counts, with `aria-label="Viewed <path>"`. It renders a chevron button in the header prefix, with `aria-label="Collapse <path>"` or `"Expand <path>"` and `aria-expanded`.
- A collapsed file renders `FileDiff` also when the section is not near the view, because a collapsed diff is cheap and the header must show the checkbox.
- `DiffSummary` shows "N/M viewed" after the file count.

## Risks / Trade-offs

- [The `@pierre/diffs` that bb ships has no `collapsed` or `renderHeaderMetadata`] → Spike 1.1 passed on bb 0.44.0: the chevron (`renderHeaderPrefix`) and the checkbox (`renderHeaderMetadata`) show in the sticky header, and `collapsed` hides the body. The fallback is not needed.
- [Pending comments on a collapsed file are hidden] → The count in "Send feedback (N)" still includes them and the prompt still lists them. Expand the file to see them.
- [After a refresh an `on_demand` viewed file shows as not viewed until its patch loads] → The early load makes this short. The counter can show a lower N for a moment.
- [kv entries of deleted threads stay] → Small values. A later change can clean them up.
- [Mark on a commit target of a rebased branch] → The new sha is a new key, so the marks on the old sha stay unused. Same as deleted threads.
