# Tasks

## 1. File status from the server

- [x] 1.1 Add `status` to `changedFileSchema` and map it in `server.ts` from `changeKind` and `origin` (design Decision 1); verify `server.test.ts`: an untracked file maps to `untracked`, a tracked rename to `renamed`, a deletion to `deleted`, and `npm run typecheck` passes

## 2. Tree model

- [x] 2.1 Add `visibleRows(rows, collapsed)` in `core/file-tree.ts` (design Decision 2); verify unit tests: a collapsed folder hides all deeper rows until the next row at its depth or less, a collapsed nested folder hides only its own rows, and an empty set returns all rows

## 3. File-type icons

- [x] 3.1 Add `ui/file-icons/` with `icon-map.ts`, `svgs.ts` (46 SVGs from OpenForge), `LICENSE`, and a `FileTypeIcon` component (design Decision 4); verify unit tests for `getFileIconName`: `a.ts` gives `typescript`, `a.tsx` gives `react_ts`, `package.json` gives `nodejs`, `README.md` gives `readme`, `x.d.ts` gives `typescript-def`, `notes.xyz` gives `file`, and every name in the map has an SVG

## 4. Outline rows

- [x] 4.1 Change file rows to icon, name, comment count, status badge, and counts, and folder rows to chevron, folder icon, and split label, with indent guides (design Decision 3); verify tab tests: the status badge name for added, modified, deleted, renamed, copied, type change, and untracked; `a.ts` row shows the TypeScript icon; `src/ui/lib` shows 3 parts; `src/ui/a.ts` row has 2 guides
- [x] 4.2 Fold and unfold folders on click with `aria-expanded` (design Decision 2); verify tab tests: clicking `src` hides its file rows and keeps all sections, clicking again shows them, and jump and the current-file mark still work for files outside the folded folder
- [x] 4.3 Update the "File outline" part of `README.md` with folding, status letters, icons, and the icon license note; verify the README matches the behavior in the running app

## 5. Resize handle

- [x] 5.1 Add `useOutlineWidth` with `localStorage` and clamping (design Decision 5); verify unit tests: default 320, a stored 400 loads as 400, a stored 900 loads as 520, bad stored text loads as 320, `reset` removes the key
- [x] 5.2 Add the separator handle with pointer drag, double-click reset, and arrow keys; verify tab tests: a drag from 320 by +100 gives 420 and saves it on pointer up, a drag to 700 gives 520, a double-click gives 320, ArrowRight gives 330
- [x] 5.3 Add the resize behavior to `README.md`; verify the README text

## 6. Integration

- [x] 6.1 Build, reload the installed plugin, and check in the running app: drag the handle, double-click it, fold a folder, icons and badges show; verify with a screenshot
- [x] 6.2 Run `npm test`, `npm run typecheck`, `bb plugin build` in `bb-plugin-changes`, and `openspec validate changes-outline-tree-view --strict`; verify all pass
