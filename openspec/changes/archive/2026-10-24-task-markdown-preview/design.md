# Design

## Context

See `proposal.md` for motivation and the two delta specs for the behavior contract.

Observed implementation:

- `views/detail/attachments.tsx` renders non-image task attachments as download anchors. It owns task attachment removal and the image lightbox.
- `views/activity/task-activity.tsx` has a separate `FileAttachmentCard`, `AttachmentTracks`, and per-comment image lightbox. Task-only changes would miss comment attachments.
- `shared/attachments.ts` exposes the ID-based download URL and the 25 MiB attachment allowance. `attachments/index.ts` confines saved blob paths to the Tasks plugin data directory. The GET download route sends non-raster files with attachment disposition and reads the whole blob.
- The vendored `components/ui/dialog.tsx` supplies portal scoping, modal focus behavior, browser dimming, and a compact drawer presentation. Reuse this rather than extend the image lightbox with a document reader.
- Tasks uses React, Vitest, Testing Library, strict no-emit TypeScript, SDK 0.5.9, and per-package npm scripts. The collection CI runs independent package jobs with Node 24; it has no shared-package bootstrap today.

The active `markdown-reader` change plans a standalone file opener, not a task attachment route. Its renderer and plugin package do not exist in this checkout. Its design supplies the approved reading measurements, GFM rendering, 1 MiB document limit, 20 KiB highlighting limit, safe source handling, and file-opener fallback. This design coordinates reuse of that presentation without implementing its complete file reader here.

## Goals / Non-Goals

**Goals:**

- Put generic document presentation behind one small interface, used by two different source adapters.
- Keep source authorization and state ownership outside the presentation module.
- Make each built plugin self-contained, with no dependence on another installed plugin.
- Preserve existing attachment contracts and underlying task state.

**Non-Goals:**

- Replace chat Markdown or the Tasks editor, register a Tasks file opener, or change extension preferences.
- Infer sibling attachments from filenames, access blob directories as document roots, edit attachments, or watch their files.
- Deliver the entire workspace/host/thread-storage reader, refresh transport, or file-opener registration owned by `markdown-reader`.
- Install or publish plugins, remove user records, or modify the existing reader planning artifacts during this proposal workflow.

## Decisions

### 1. Bundle a shared document module into both plugins

Create a private build-time package at `packages/markdown-document/`. Give it a documented document interface, compiled ESM and type exports, a scoped stylesheet, representative fixtures, and its own tests. Keep React as a peer supplied by the consumer/BB build; do not bundle a second React runtime. Use `react-markdown`, `remark-gfm`, and a small explicit-language highlighter as planned by the reader change. Do not add raw-HTML or MDX execution support.

The interface accepts immutable source text, the requested Preview/Raw view, a reader-local heading namespace, and an explicit destination policy. The module owns parsing, document rendering, heading targets, optional outline, and exact source presentation. Consumers own loading, view controls, dialog/tab chrome, and permitted source navigation. Keep the file reader's requested line-range presentation possible without giving attachment callers a filesystem identity.

The two real source policies justify the seam. The file reader resolves destinations within its known root and host. The attachment policy has no filesystem root and permits only heading fragments, safe external links, and credential-free remote images. The shared module rejects malformed and active destinations before dispatch to either adapter. A missing destination policy denies source-dependent access.

Add a local build-time dependency in each consumer and commit corresponding lockfiles. Build the shared package before consumer checks in CI. Verify `npm ci`, type resolution, CSS inclusion, and BB bundling from a clean checkout. Installed plugin artifacts must include the document implementation and CSS, not a reference to a sibling directory or a runtime RPC to Markdown Reader.

Alternatives: copying the renderer into Tasks would allow typography and safety fixes to diverge. Importing a private source file from another plugin would bind Tasks to an absent package and its build layout. Runtime cross-plugin rendering would make Tasks depend on installation order. BB's exported `Markdown` has chat typography and no public heading/destination controls, so it does not deliver the approved document design.

### 2. Coordinate with the reader change through an explicit completion dependency

`markdown-reader` continues to own its full file-opener behavior. This change owns the shared document package, attachment integration, and replacing or connecting the file reader's presentation to the shared interface when that consumer exists.

Implement the common module and attachment dialog without needing the other plugin installed. Before marking this change complete, the actual file reader must also consume the common module and pass parity tests. If the reader implementation is not yet available, report that integration as blocked and leave its tasks open. A test adapter is useful module evidence but is not proof that an absent production reader works.

When the reader implementation starts, use this design as an additional integration constraint. Coordinate any change to its planning artifacts explicitly rather than silently rewriting them. Its original file-source, root-confinement, refresh, line-range, theme, and bound `Original` fallback requirements remain intact.

Alternative: widening this task into the entire reader implementation would duplicate the other change's scope. Shipping two temporary renderers would fail the requested reuse.

### 3. Add a bounded ID-based attachment preview read

Add authenticated `GET /attachments/preview?attachmentId=...` beside the existing attachment routes. Follow the existing Tasks GET authentication policy. Accept only a saved attachment ID, look up its current metadata in the Tasks store, require a supported non-image filename, and use the existing confined blob lookup. Never accept a client path, source URL, or presumed workspace target.

Check actual stored size, then read at most 1 MiB plus one byte so a concurrent size change cannot bypass the cap. Decode UTF-8 strictly and retain the decoded source without trimming, newline conversion, or BOM removal. Reject invalid encoding, NUL-containing binary content, and control bytes other than ordinary text whitespace. Return a structured JSON snapshot with attachment identity, original filename, byte size, and source text. Return bounded structured missing, unsupported, and read-failure responses; do not expose blob paths.

The new route limits preview work without changing the existing 25 MiB download allowance or content-disposition behavior. Download remains the original ID-based anchor, available before loading and after an error. Authorization denial remains distinct from a successful text read. The frontend checks response identity and bounds before passing content to the shared module.

Alternative: fetching the current download route would load up to 25 MiB on the server before the reader rejects it. An arbitrary host-file preview endpoint would use the wrong source and increase exposure.

### 4. Use one task-scoped preview owner for both attachment lists

Add an attachment preview owner mounted in the task detail lifetime. Task and comment attachment cards pass the selected saved attachment and their invoking element to this owner. Keep image callbacks and removal controls separate. Use one extension eligibility rule shared by both card variants; image attachments retain image behavior even when their filename ends in a Markdown extension. Staged, unsaved attachments remain outside this feature.

The owner contains selected identity, loading state, snapshot, view, and a request sequence. Each open starts in Preview and loads the current saved attachment. Abort pending fetches on close, replacement, task change, and unmount; also guard results with a sequence because abort alone does not prove that all asynchronous work stopped. Retry starts a new read without retaining another attachment's snapshot. View changes use the same text and make no read or write.

Close a preview when current attachment data confirms its removal. Restore focus only to a connected invoking element; otherwise use a stable task detail control. Do not route away, remount task editors, or mutate task/comment state to open the reader. No persistent document cache or polling is needed for saved immutable attachment blobs.

Alternative: separate per-comment dialogs duplicate state and can leave several preview owners active. Extending the image lightbox lacks document focus, loading, and responsive-reader behavior.

### 5. Keep the approved document layout inside existing modal behavior

Reuse the vendored responsive Dialog for title, focus containment, Escape, Close, portal scope, and compact presentation. Use a wide desktop body, around 960 px where the viewport allows, bounded to viewport height. Retain a visible toolbar and a document scroll region. On compact viewports the existing drawer remains an overlay over the same task rather than a new page. Test focus restoration and Escape propagation in both presentations.

Use the `markdown-reader` design's content measurements in the shared stylesheet: roughly 720 px maximum prose width, 16 px body text with 1.75 line height, clear heading levels, more space before sections than after them, quiet code/table backgrounds, and local horizontal scrolling. Derive responsiveness from the document container, not the desktop width. Collapse the outline inside typical dialog widths; do not squeeze the prose to force an aside. Dialog controls keep Tasks styling while document content shares the reader's scoped theme-token styling.

External links use BB URL navigation and preserve ordinary anchor accessibility. Relative and filesystem destinations render only text or alt text in attachments. Remote images use credential-free loading, no authenticated BB proxy, and no referrer; block same-origin BB resource URLs from this remote-image path. Do not allow a document to request Tasks or BB authenticated endpoints as an image.

Alternative: a side panel contradicts Koen's chosen dialog. A new modal implementation duplicates existing focus, keyboard-inset, and compact behavior.

### 6. Verify the shared interface and real consumers

Run common GFM, unsafe-content, fence-exactness, heading-collision, destination-policy, and responsive-layout fixtures through the public document interface. Run attachment transport tests through registered HTTP behavior, including actual oversize bytes, strict decoding, empty text, missing IDs, and unchanged downloads.

Exercise task and comment cards through rendered UI and the BB frontend harness. Check supported extensions, generic MIME metadata, non-Markdown/image regressions, loading, Retry, Raw exactness, races, close, task changes, removal, focus, shortcut isolation, draft preservation, and standalone-plugin independence. Test actual file-reader adoption separately, with its own source and line-range contracts.

Browser acceptance must inspect the real overlay at compact and desktop widths in light/dark themes, with a custom-token fixture. Compare the same report in the file reader and dialog at matched content widths. Record passed, failed, and blocked checks separately. Obtain explicit approval for changing installed plugin sources or state and for owned live test records. Follow the operator's browser/session rules; do not copy credentials or use private screenshot task content as test data.

## Risks / Trade-offs

- The file reader is not implemented yet. Keep its production adoption and parity checks as an explicit completion dependency, not an assumed pass.
- Independent npm jobs do not currently build a common package. Add deterministic shared-package setup, lockfiles, and clean-checkout CI tests without moving unrelated plugins into a workspace.
- Shared CSS can leak through portals. Namespace document selectors and verify both portal scope and an unchanged Tasks editor/chat fixture.
- Attachment-relative assets cannot be resolved safely. Keep them inert and show their alt text; explain this limit in documentation.
- Remote images cause requests to their hosts. Use credential-free loading and disclose this behavior; reject authenticated same-origin BB resources.
- Task shortcuts or compact drawer behavior can break dismissal. Exercise real keyboard focus, Escape, and task navigation in both layouts.
- The approved reader mockup lives in another thread's storage. Use its documented measurements and a committed generic fixture; report an unavailable reference or browser as blocked evidence.

## Migration Plan

1. Implement and test the common package, then the bounded Tasks read and dialog. Coordinate the file-reader consumer without taking over its full change.
2. Add shared dependency setup and tests to CI. Update Tasks operating documentation and record parity/visual evidence in an acceptance report.
3. Run affected local checks and the required independent completion review. Leave reader integration or live checks explicitly blocked when prerequisites are unavailable.
4. Install/reload only after required checks pass and explicit approval covers any installation-source or enabled-state changes. Use bounded owned test records and preserve existing Tasks data.
5. Roll back to the previous Tasks build if necessary. The old download links continue to work because attachment storage and download routes do not change. No database rollback or file-opening preference restoration is needed.
