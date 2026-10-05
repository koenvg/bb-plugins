# Design

## Context

See proposal.md for the motivation. The delta specs for `changes-diff-view` and `changes-review-feedback` give the behavior.

Facts that shape the approach:

- The tab is in the thread's right panel. Its width depends on the panel, not on the window. A media query cannot see it.
- Tailwind container queries (`@container`, `@3xl:`) already work in plugins of this repo: `bb-plugin-tasks-plus/shell/topbar.tsx`, `bb-plugin-github-insight/ui/review-queue-list.tsx`.
- `FileSection` loads its patch when it comes within 800px of the visible area (`useNearView`). A section that has not loaded is short (`min-h-10`). It grows when its diff renders. So a jump can drift: sections near the target load after the scroll and push the target down.
- `ChangesTab` has one scroll area (`overflow-y-auto`) under the header. Sections have `aria-label={file.path}`.
- `sortComments` (`core/review-prompt.ts`) sorts by the plain path string. It feeds the prompt and `NotInDiff`.
- jsdom has no layout. Tests stub `IntersectionObserver` already.

## Goals / Non-Goals

**Goals:**
- One file order for the outline, the sections, the prompt, and "Not in this diff".
- A jump that lands on the file also when diffs near it load late.

**Non-Goals:**
- Sharing the outline with `github-insight` or moving it to `review-ui/`. Do this when a second user exists.
- Virtualized sections. The lazy load is enough for thread-sized diffs.

## Decisions

### 1. One path comparator for the file order

`compareFilePaths(a, b)` in `core/file-order.ts`. Split both paths on `/`. At each segment, a folder segment comes before a file segment. At the first different name, compare with `localeCompare`. A diff can hold a file and a folder with the same name (`D foo`, `A foo/bar.ts`), so the folder check runs before the name check.

- It works for any set of paths. Comments in "Not in this diff" have paths that are not in the tree, and they still sort the same way.
- Merged folders (Decision 2) do not change the order, so the tree needs no own sort.
- `useChanges` keeps the server order. `ChangesTab` sorts `files` once with `useMemo`. The server and RPC do not change.
- `sortComments` uses `compareFilePaths` for the path, then line, then side, as today.
- Alternative: build the tree and flatten it to get the order, as OpenForge does (`orderFilesDepthFirst`). Rejected: it needs the tree for comments that are not in the diff.

### 2. Tree model as a pure function

`buildFileTree(files)` in `core/file-tree.ts` returns rows: `{ kind: "folder", label, depth } | { kind: "file", file, depth }`. Steps, the same rules as OpenForge's `fileTreeModel.ts`:

1. Insert each path into a nested map.
2. Merge a folder whose only child is a folder into one row (`src/ui/lib`). The root is not merged.
3. Walk depth first. The input is sorted with `compareFilePaths` first, and a `Map` keeps insertion order, so the rows follow the section order with no own sort.

No expand state: in this change, all folders are open. Rows are a flat list with a `depth`, so the UI is one `map` with padding per depth.

### 3. Layout with a container query

```
<div class="@container flex h-full flex-col">
  <header .../>
  <div class="flex min-h-0 flex-1">
    <nav aria-label="Files" class="hidden w-60 shrink-0 overflow-y-auto border-r @3xl:block"/>
    <div ref={scrollArea} class="min-h-0 flex-1 overflow-y-auto"> ...sections </div>
  </div>
</div>
```

- `@3xl` is 48rem (768px). The spec states 768px.
- The outline renders only when the result is `ok` and has one or more files. Loading, error, "no git", and "No changes" keep the full width.
- Alternative: measure with `ResizeObserver` and render conditionally. Rejected: CSS does it with no state. The outline stays mounted in a narrow tab, but it is cheap (one row per file).

### 4. Jump: scroll the area, then pin until the layout settles

`useFileNavigation(scrollArea, content, paths)` returns `jumpTo(path)` and `current` (Decision 5). One hook owns both, because scroll events must not move the mark during a pin.

1. Find the section by `aria-label` (add `data-path` if the label is not unique enough). Set `scrollArea.scrollTop` to the section's offset in the area.
2. Watch the area's content with a `ResizeObserver`. On each resize, set `scrollTop` to the section's offset again.
3. Stop on `wheel`, `touchstart`, or `pointerdown` in the area, on `keydown` in the document, when the section leaves the DOM (target change), or 1000ms after the last resize.

- Use `scrollTop`, not `element.scrollIntoView`. `scrollIntoView` also scrolls the ancestors, and that can move bb's own panel.
- No smooth scroll: smooth scroll and the re-pin fight each other, and a long jump is slow.
- Alternative: load all patches above the target before the jump. Rejected: most of them stay far from the view and never need to load. Only sections within 800px of the target load, and the pin covers them.
- Alternative: OpenForge's retry loop with a fixed count. Rejected: a `ResizeObserver` reacts to the actual change, with no polling.

### 5. Current file from the scroll position

`useFileNavigation` listens to `scroll` on the area, throttled with `requestAnimationFrame`. The current file is the first section whose bottom is below the area top (+1px). When no section matches, it is the first file.

- A jump sets the current file at once, so the mark does not wait for the scroll event.
- The outline calls `row.scrollIntoView({ block: "nearest" })` on the marked row only when it is outside the outline's visible part. `nearest` does not move ancestors that already show the outline.
- Alternative: `IntersectionObserver` with a thin band at the top. Rejected: harder to make exact, and the result is the same.

### 6. Comment counts from the pending review

`ChangesTab` already has `review.comments`. Count per path with one `Map` in a `useMemo`, and pass it to the outline. Comments on files not in the diff do not show in the outline. "Not in this diff" shows them.

## Risks / Trade-offs

- [Pin stops too early when a diff renders after 1000ms] → The user sees a small drift and can click again. Tune the value in the running app.
- [The order change surprises users who know the git order] → The order now matches the outline and the prompt. README states it.
- [jsdom cannot test the container query or real offsets] → Unit-test the comparator and tree. Test jump and mark with stubbed offsets and a fake `ResizeObserver`. Check the width and the drift in the running app.
- [Long file names in a 240px column] → Truncate the name with an ellipsis. The tooltip shows the full path.
