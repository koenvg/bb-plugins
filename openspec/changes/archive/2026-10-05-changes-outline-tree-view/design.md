# Design

## Context

See proposal.md for the motivation and `specs/changes-diff-view/spec.md` for the behavior.

- `environments.diffFiles` returns `changeKind` (`added`, `copied`, `deleted`, `modified`, `renamed`, `type_changed`) and `origin` (`tracked`, `untracked`) per file. `server.ts` drops both today.
- `FileOutline` renders `buildFileTree` rows as a flat list with a `depth`. It is a fixed `w-60` `<nav>` that scrolls.
- OpenForge's baseline: `ResizablePanel.svelte` (drag handle, saved width, double-click reset, arrow keys), `FileTreeRow.svelte` (chevron, folder icon, guides every 16px, status badge), `fileIcons.ts` plus 46 vendored SVGs.
- Plugins in this repo save UI preferences in `localStorage` (`bb-plugin-tasks-plus/shell/view-preference.ts`, `bb-plugin-pr-thread-list/preferences.ts`).
- jsdom has no layout. The navigation tests stub rects per `li`.

## Goals / Non-Goals

**Goals:**
- The same look and behavior as OpenForge's changed-files tree, within bb's tokens.

**Non-Goals:**
- Keyboard navigation in the tree (OpenForge's roving focus), search, reviewed marks.
- A shared resizable-panel component for other plugins.

## Decisions

### 1. One `status` field on `ChangedFile`

`status: "added" | "modified" | "deleted" | "renamed" | "copied" | "type_changed" | "untracked"`. The server sets `untracked` when `origin === "untracked"`, else it uses `changeKind`.

- Alternative: pass `changeKind` and `origin` as they are. Rejected: the UI only needs one badge, and an untracked file is always `added`, so two fields can disagree with nothing to gain.

### 2. Folding as a pure filter over the rows

`visibleRows(rows, collapsed)` in `core/file-tree.ts`. Walk the rows in order. After a collapsed folder row at depth `d`, skip rows with depth greater than `d`. `collapsed` is a `Set` of folder paths in `FileOutline` state. All folders start open.

- The state is keyed by path, so a refresh keeps the fold state of folders that still exist. `FileOutline` has a `key` per diff target, so a target change opens all folders again, as the spec asks.
- Folding does not touch the sections, jump, or the current-file logic. When the current file is in a folded folder, no row is marked, and `revealRow` finds nothing and does nothing.
- Alternative: nested `<ul>` per folder with `hidden`. Rejected: the flat row list is already tested, and the filter keeps it.

### 3. Row look

| Part | Value |
|---|---|
| Indent step | 16px, same as OpenForge |
| Guides | One absolute 1px `bg-border` line per level, `aria-hidden` |
| Folder row | `<button aria-expanded>`, chevron (`ChevronRight` / `ChevronDown` from bb's icon set), folder icon (open or closed SVG), label parts split on `/` with a muted `/` between |
| File row | `<button>`, file-type icon, name (truncates), comment count, status letter, `DiffStat` |
| Status colors | A and U `text-success`, M `text-attention`, D `text-destructive`, R, C, and T `text-muted-foreground` |
| Text | `text-sm` sans, rows 26px high |

- The status letter has `aria-label` on an element with `role="img"`, so screen readers read "Modified" and not "M".
- Status colors follow DESIGN.md "The Color Is State Rule". R and C have no state token, so they stay neutral.

### 4. File-type icons as a TS module

- `ui/file-icons/icon-map.ts`: copy of OpenForge `fileIcons.ts` (`getFileIconName`), typed with `FileIconName`.
- `ui/file-icons/svgs.ts`: an `as const` object with the 46 SVG strings, and `FileIconName = keyof typeof FILE_ICON_SVGS`, so the compiler checks that each mapped name has an SVG, written once by a small script from OpenForge's `packages/plugin-sdk/src/ui/icons/`.
- `ui/file-icons/LICENSE`: the MIT notices of Material Icon Theme and of the `vscode-material-icons` package.
- `<FileTypeIcon name=… />` renders the string with `dangerouslySetInnerHTML` in a `size-4` span with `aria-hidden`.

- The strings are vendored static content, so the inner HTML has no user input.
- Alternative: `?raw` imports of `.svg` files. Rejected: `bb plugin build` support for raw imports is not confirmed, and a TS module needs no loader.

### 5. Resize handle

`useOutlineWidth()` returns `width`, `preview` (drag moves, no save), `commit` (pointer up and arrow keys, saves), and `reset`. It reads and writes `localStorage["bb-changes:outline-width"]`, clamps to 240..520, and defaults to 320.

```
<div class="relative hidden shrink-0 @3xl:flex" style="width:{width}px; max-width:calc(100% - 400px)">
  <nav class="min-w-0 flex-1 overflow-y-auto">…rows…</nav>
  <div role="separator" aria-orientation="vertical" aria-valuemin=240 aria-valuemax=520 aria-valuenow={width}
       tabIndex=0 class="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-ring/30"/>
</div>
```

- The handle sits outside the `<nav>` scroll box, so it does not scroll with the rows.
- Pointer events with `setPointerCapture`, not mouse events, so touch and pen work and the drag continues outside the handle.
- The width saves on pointer up or lost pointer capture, not on each move.
- The drag and the arrow keys start from the rendered width, so a width that CSS limits does not make the handle feel stuck.
- `max-width: calc(100% - 400px)` keeps 400px for the diff with no JS measurement. The saved value does not change when the tab is narrow.
- Alternative: OpenForge's `availableWidth` prop measured by the host. Rejected: CSS does the same here.

## Risks / Trade-offs

- [The icon module adds ~33KB to `app.js`] → Accept: it is static and gzips well. Only 46 icons, same as OpenForge.
- [`localStorage` is shared with bb and other plugins] → A `bb-changes:` key prefix, same pattern as other plugins.
- [jsdom cannot drag] → Test the width logic with `pointerdown`/`pointermove`/`pointerup` events and fixed `clientX` values. Check the real drag in the app.
