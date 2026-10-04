# Design

## Context

See proposal.md for the motivation. The specs `changes-diff-view` and `changes-review-feedback` give the behavior.

Facts that shape the approach:

- bb has no plugin API to add inline comments to its own Changes panel. `experimental_Diff` takes only `patch`, `path`, `view`, `overflow`, `showLineNumbers`, and full-file contents. It has no annotations and no gutter callbacks.
- `@pierre/diffs` is shimmed by bb at runtime and already used by `github-insight` (`ui/file-diff.tsx`). It has `lineAnnotations` + `renderAnnotation` (in use), and `enableGutterUtility` + `onGutterUtilityClick` for a "+" button.
- The SDK server area `environments` has `status` (default branch, merge base, branch commits), `diffFiles` (file list + first patches + `loadMode` per file), and `diffPatch` (patches for given paths). The diff target union is `uncommitted`, `branch_committed`, `all`, `commit`. These are the same targets as bb's panel.
- `threads.send({ threadId, mode: "auto", input })` returns `delivery`, which tells us if the message was queued. `github-insight` uses it for "Send to agent".
- Each plugin in this repo installs alone (`--subdirectory`). There is no shared package yet. A git install of one commit shares one checkout of the full repo.
- The repo pins `@get-bb/plugin-sdk` 0.5.29. The `environments` diff calls are confirmed in 0.6.16. bb on the dev machine is 0.44.0.

## Goals / Non-Goals

**Goals:**
- A review flow that is the same as OpenForge's self review: gutter "+", "Add to review", inline pending comments, one editable prompt, one send.
- Review UI parts that a second plugin can use without a copy.

**Non-Goals:**
- Persistence, line ranges, edit in place, reviewed files, file tree (later changes; see proposal).
- Any change to `github-insight` in this change, also if the shared package exists.

## Decisions

### 1. Own tab with `@pierre/diffs`, not a renderer swap

Register `threadPanelAction({ id: "changes", title: "Changes", layout: "flush" })`. Render each file with `FileDiff` from `@pierre/diffs/react`, the same way `github-insight/ui/file-diff.tsx` does, with the live code theme from `experimental_useCodeTheme`.

- Alternative: `experimental_diffRenderer`, which replaces bb's diff body in place. Rejected by the user: it keeps bb's file list and toolbar out of our control, and it also runs in timeline diffs.
- Alternative: `experimental_Diff`. Rejected: no annotations, so no inline comments.

### 2. Server RPC wraps the environment diff calls

The browser cannot call `bb.sdk.environments` directly. The server registers a small contract:

| RPC | Does |
|---|---|
| `getChanges({ threadId, target })` | Find the thread's environment, call `status` (for the default branch and commit list) and `diffFiles`. Return files, initial patches, commits, and the resolved `query` (target plus `mergeBaseBranch` or `sha`). |
| `getPatches({ threadId, query, paths })` | Call `diffPatch` with the `query` from `getChanges`, so the patches use the same base as the file list, and no second `status` call is needed. |
| `sendFeedback({ threadId, text })` | Call `threads.send` with `mode: "auto"`. Return `sent` or `queued`, or an error. |

The UI target is `all | uncommitted | branch_committed | commit(sha)`. The server fills in `mergeBaseBranch` from `status.workspace.branch.defaultBranch`, so the UI does not know branch names. `not_applicable` and `unavailable` outcomes map to the "No git repository" and error states.

- Alternative: a host worker that runs `git diff` itself. Rejected: bb already owns diff building, untracked files, and size limits.

### 3. Pending review in a module-level store, keyed by thread

A plain store module (`Map<threadId, PendingReview>`) with a `useSyncExternalStore` hook. It lives as long as the plugin frontend bundle, so it survives tab and thread switches and the remount of the tab, and is lost on reload. This is the spec's lifetime.

```
PendingComment { id, path, side: "new" | "old", line, body }
PendingReview  { comments: PendingComment[], formDrafts: Map<"path:side:line", string> }
```

- `id` is a client-generated id, so "clear sent comments" removes exactly the snapshot taken when the dialog opened, not a match on path+line+body as OpenForge does.
- Form text is stored by `path:side:line`, so an open form survives a scroll-out (the lazy section unmounts) and a refresh.
- Alternative: plugin KV storage now. Deferred: it is the "persist" change, and the store interface stays the same, so only the store body changes.

### 4. Placing comments in the current diff

A pure function takes the parsed file diffs and the pending comments and returns `{ placed: Map<path, PendingComment[]>, notInDiff: PendingComment[] }`. A comment is placed when its file is in the diff and its line exists on its side in a hunk. `github-insight/core/diff-lines.ts` has the hunk line logic; the spike decides if it is shared or copied.

Side mapping to `@pierre/diffs`: `new` = `additions`, `old` = `deletions`. Context lines take `new`.

### 5. Review prompt is a pure function

`buildReviewPrompt(comments)` sorts by path and then line, and renders the template from the spec. It does not include the task text or any version-control instruction. The dialog keeps its edited text in local state only, so Cancel drops the edits.

### 6. Shared review UI: spike first, then decide

Candidate shared parts, with props only and no data fetching:

| Part | Props |
|---|---|
| `ReviewFileDiff` | `fileDiff`, `annotations`, `renderAnnotation`, `onAddComment(side, line)`, `view` |
| `InlineCommentForm` | `text`, `onTextChange`, `onSubmit`, `onCancel` |
| `PendingCommentCard` | `body`, `onRemove` |
| `diff-lines` helpers | from `github-insight/core/diff-lines.ts` |

Spike: a `review-ui/` directory at the repo root with one component that imports `react`, `@pierre/diffs`, and a Hugeicons icon. `bb-plugin-changes` imports it with a relative path. Pass when `bb plugin build` and `vitest` and `tsc` succeed in `bb-plugin-changes/`, and a git-style install from a clean checkout loads the tab.

- Pass: keep `review-ui/` and add it to each user's `tsconfig` `include`. Non-shimmed imports (icons, `clsx`) resolve from the plugin's `node_modules` only if the bundler is told where to look; the spike must prove that or ban them from `review-ui/`.
- Fail: put the parts in `bb-plugin-changes/ui/` behind the same props. A later change moves them.

The spike result is written into this design before the UI tasks start.

**Spike result (pass):**
- `tsc`, `vitest`, and `bb plugin build` pass in `bb-plugin-changes/` with a component from `../review-ui/`. The bundle includes the shared code and uses bb's runtime shims.
- `bb plugin install path:<clean copy> --subdirectory bb-plugin-changes`, from a copy of the repo without `node_modules` or `dist`, installs and runs the plugin.
- Rules for `review-ui/`: import only `react` and `@pierre/diffs`. Pass SDK values (code theme, icons) in through props. A `tsconfig` `paths` entry for `@get-bb/plugin-sdk` makes `bb plugin build` treat the plugin as the legacy vendored layout, so the shared code must not import the SDK.
- Each consumer adds `../review-ui` to `tsconfig` `include`, maps `react`, `react/*`, `@pierre/diffs`, and `@pierre/diffs/*` to its own `node_modules` in `paths`, and dedupes the same packages in `vitest.config.ts`.

### 7. SDK version

Pin `bb-plugin-changes` to the lowest SDK that has `environments.diffFiles`, `diffPatch`, and `status`, and set `engines.bb` to match. Verify against the dev machine's bb 0.44.0 before writing UI code. `github-insight` keeps its current pin.

**Result:** SDK 0.5.29 (the repo pin) has all three calls, and bb 0.44.0 serves them. `engines.bb` is `>=0.44`. Live findings:
- `diffFiles` returns no `initialPatches` for this worktree, also for `loadMode: "auto"`. The tab loads every patch it shows through `getPatches`; `initialPatches` is only a cache.
- The environment `baseBranch` is null, and `diffBranches` returns `selectedBranch: null` without a query. A local default branch can be behind the remote, which pulls merged work into the diff. The server uses `origin/<defaultBranch>` when `diffBranches` lists it, else `<defaultBranch>`.
- bb 0.44 can fail its own `status({ mergeBaseBranch })` response check (HTTP 502 on commit fields). The server then returns an empty commit list and logs a warning, so the diff still loads.

## Risks / Trade-offs

- [`environments` diff calls are not in the SDK that bb 0.44 supports] -> Check first (task 1). If missing, the plugin needs a newer bb, and the README says so.
- [The spike shows bb's build cannot bundle `../review-ui`] -> Fall back to in-plugin parts (Decision 6). No spec change.
- [`@pierre/diffs` gutter API differs between versions] -> Use the version bb shims, read from the SDK `bb plugin types` pin, and test the "+" button in a component test with the real library.
- [Pending comments are lost on reload] -> Accepted for this change. The next change adds KV storage behind the same store interface.
- [bb's native Changes tab stays visible next to ours] -> Accepted for this change. The opt-in hide comes in a later change.
- [Large diffs] -> Lazy-mount sections near the visible area (same `IntersectionObserver` pattern as `github-insight`). Patches load only for mounted sections and for files that hold a pending comment or open form. Paths requested in the same tick go in one `getPatches` call. After a refresh, the previous patch of a file stays on screen until its new patch arrives.
- [`@pierre/diffs` reports the old side for a context line clicked in the left column of split view] -> `commentAnchorLine` in `review-ui/diff-lines.ts` moves a context line to its new-side line number, so context comments are always on the new side.

## Open Questions

- Should the tab refresh by itself when an agent turn ends? The spec asks only for a refresh button. This can be added without a spec conflict.
