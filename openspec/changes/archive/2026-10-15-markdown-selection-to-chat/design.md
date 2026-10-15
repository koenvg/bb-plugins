# Design

## Context

See [proposal.md](proposal.md) for motivation and [the spec delta](specs/markdown-reader/spec.md) for the behavior contract.

The reader is a React 19 file opener pinned to Plugin SDK 0.6.37, updated from 0.6.15 with explicit user approval during apply. `app.tsx` receives a source and path, builds a stable target, and remounts `Reader` when that target changes. `reader.tsx` owns the displayed snapshot, Preview/Raw state, Refresh, and Original fallback. It retains labeled old content during refresh and after a failed refresh. Preview content lives in `.mr-prose`; Raw renders one span per actual source line with `data-source-line` attributes.

The loaded `TextSnapshot` contains the original target, resolved `hostId`, source root, and resolved document path. No additional server access is needed to describe a selection. The existing tests include a public registered-app SDK harness and owned Playwright browser contexts.

Read-only inspection of the local BB checkout established the native baseline:

- `apps/app/src/components/code/BbSourceCode.tsx`, `buildLineSelectionText`, formats source references as `path:start-end` followed by selected text.
- `apps/app/src/components/thread/timeline/TimelineSelectionMenu.tsx` renders compact themed selection controls, preserves the selection on pointer activation, and clears it after activation.
- `apps/app/src/components/secondary-panel/SecondaryPanelSelectionActions.tsx` handles browser text selection and disables its custom menu for coarse pointers.
- `apps/app/src/hooks/usePromptDraftStorage.ts` and its tests show native quote appending, blank-line separation, and composer focus after adding.

These files are reference evidence, not imports or edit targets. The pinned public SDK exposes `useComposer()`, a stable composer key, `insert(parts, { at, block })`, and `focus()`. File-opener props do not expose the native selection callback or menu component.

## Goals / Non-Goals

Goals:

- Keep document selection handling separate from SDK draft mutation, with one small callback between the reader and `FileReader`.
- Match the native selection interaction without replacing the document renderer or changing the reading layout.
- Append to the correct draft using public SDK methods and loaded snapshot metadata only.

Non-goals:

- Import BB application internals, use content scripts to modify the native composer, or edit BB core.
- Add line-gutter selection, a new keyboard shortcut, touch-specific selection UI, file mention providers, server quote storage, automatic retries, or a Markdown-to-source mapping engine.
- Change the existing read-only source, navigation, image, fallback, theme, or opener-preference contracts.

## Decisions

### 1. Keep a reader-local selection controller

Add a focused selection module used by `Reader`, with a content root, ready snapshot identity, view, composer key, and an add-excerpt callback. Keep event handling, captured selection, menu placement, and dismissal together. `FileReader` owns SDK integration; `Reader` does not locate or mutate drafts itself.

Observe pointer release and keyboard/browser selection changes. Require both selection boundaries and the full range to belong to the current document root. A range spanning outline or other non-document UI is invalid. Check that selected text is not whitespace-only without trimming meaningful selected whitespace. Capture the excerpt and Raw line span before the action can move focus. Use the selection's range geometry and pointer-release location for a compact overlay confined to the reader's visible bounds. Do not add document-flow space or a permanent toolbar button.

Clear the pending action on view, snapshot, target, composer-key, loading, fallback, and unmount changes. Revalidate the captured identity at activation. Treat focus movement into the selection action as part of activation rather than an external selection clear. Escape, outside activation, and scrolling dismiss the action. Remove listeners when the reader is disabled or unmounted. No polling, DOM-wide mutation observer, or document reparse is needed.

Alternative rejected: a global content script or document-level action that guesses which panel owns the selection. That would make multiple readers and chat changes harder to keep separate.

### 2. Use the file panel's associated composer, not the file's owner

Obtain the composer through the public `useComposer()` hook in `FileReader`. Bind captured selections to its key and allow normal thread and new-thread drafts, not queued-message or sent-message edit sessions. Use the host's slot/route binding as the message destination. `source.threadId` is file provenance and must not be used as a recipient. Verify this binding in the SDK harness and installed BB, including an artifact opened from another thread and a route change with a pending selection.

Append using `composer.insert(quote, { at: "end", block: true })`, then call `composer.focus()`. Never call `submit`, `setText`, or a whole-draft replacement. The explicit end position avoids replacing a selected range in the composer and preserves existing mentions and attachments. Build the blockquote by prefixing each reference/excerpt line with `> ` and adding a final newline. Preserve excerpt indentation and internal blank lines; normalize browser CRLF to LF for the quote only. Match native blank-line separation in the integration tests.

If the associated composer is unavailable, show the selected action as unavailable with a short explanation. If insertion throws, show a concise local error and leave the draft unchanged, with no automatic retry. A focus failure after successful insertion must not repeat insertion or report that the quote was lost.

Alternative rejected: selecting the first mounted composer or the storage-owner thread's composer. Both can write to a different conversation than the one the user is reading.

### 3. Quote the selected view and identify its source

For Preview, use the browser's visible selected text and a file reference without line numbers. Do not reconstruct Markdown or expand a selection to AST blocks. For Raw, use the selected text and derive inclusive source lines from the existing spans and range boundaries. A range ending at the beginning of the next line must not claim that unselected line. Wrapped visual rows do not affect numbering.

Use the requested path for workspace and thread-storage references, and the resolved absolute document path for host references. Format the first quote line as `path:start-end` for Raw or `path` for Preview. Add a short provenance line naming source kind and resolved host; include workspace project/environment identity when available and the storage-owner thread for thread-storage files. Generate all fields from the captured snapshot, not current global context. Render these values as ordinary quote text, not active links or mention pills.

Alternative rejected: native path mentions. The pinned mention contract has only workspace and thread-storage path kinds, cannot describe every absolute-host source, and does not contain the selected excerpt. A plain quote works for every supported source without a provider or send-time RPC.

### 4. Reuse the existing visual language

The user explicitly confirmed that BB's code-viewer selection action is the intended model with "yesh indeed that's what I mean". This is approval of native parity, not of a new visual design or the implemented result. No separate prototype or new visual world is needed for this bounded addition.

Use the existing reader buttons, icon conventions, focus tokens, and live host colors. The baseline is the native `TimelineSelectionMenu`, not a new toolbar or modal. Keep the action near the selection, inside narrow panels, and above local scrolling content without widening the panel. Pointer activation must not lose the captured excerpt. Keyboard-created selections must have a reachable action, Enter/Space activation, visible focus, and Escape dismissal. Follow the native fine-pointer behavior; leave the operating system's coarse-pointer selection controls intact.

The working UI still needs user approval in installed BB before implementation is marked complete. Compare native and plugin actions in light/dark themes and narrow/wide panels. Save the reviewed acceptance evidence with the change when permitted; do not claim browser fixtures prove native host behavior.

## Risks / Trade-offs

- Browser selection text can normalize line endings and rendered table spacing. The excerpt contract follows the selected view; Raw source display itself remains exact. Check partial lines, blank lines, and cross-node code selection in a real browser.
- Composer binding differs between plugin slots and route drafts. Test recipient isolation through the public harness, then confirm native file-panel routing before declaring acceptance. Do not add a fallback to another composer.
- A pending selection can outlive a view or route change. Bind it to snapshot, view, target, and composer identity, then invalidate and recheck before insertion.
- Selection overlays can move focus or overflow narrow panels. Use captured text, explicit focus handling, bounded placement, and browser tests. Keep the existing reading layout unchanged.
- Retained stale content is readable but cannot be added through this action. Disable selection-to-chat while loading or after a failed read; keep copying, Retry, and Original available. This avoids presenting an obsolete selection as current file context.

## Migration Plan

No schema, persisted data, settings, or server migration is required. Run the existing package test, typecheck, SDK compatibility, build, lint, and browser checks plus the new selection tests. Local installation requires explicit user approval and the README's receipt/state restoration procedure. Do not change default opener or theme preferences for acceptance.

Rollback restores the prior Markdown Reader build and its recorded installation state. Quotes already added to chat drafts remain ordinary draft text and are not removed automatically.
