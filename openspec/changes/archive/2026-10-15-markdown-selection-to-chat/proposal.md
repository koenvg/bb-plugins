# Proposal

## Why

The Markdown Reader has no way to add selected text to a chat draft. Users must copy and paste it manually, although BB's code viewer already provides an "Add to chat" selection action.

## What Changes

- Add a compact, selection-anchored "Add to chat" action to Preview and Raw, following BB's code-viewer interaction and active theme.
- Append the selected excerpt as a quote with a source-aware file reference to the reader's associated chat draft. Preserve existing text, mentions, and attachments, then focus the composer. Do not send a message.
- Use visible selected text in Preview and selected source text in Raw. Include source lines in Raw references where they are known; do not invent source-line mappings for Preview.
- Restrict selection to document content. Dismiss obsolete actions when the view, document snapshot, file, or owning chat changes. Keep document loading, navigation, and file access read-only.
- Add SDK-harness integration tests, real-browser selection tests, and a user-reviewed installed-BB acceptance check.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-reader`: Add selection-to-chat behavior for Preview and Raw, draft preservation, source-aware excerpt references, and selection-action lifecycle and accessibility.

## Impact

- `bb-plugin-markdown-reader/app.tsx` will connect the reader to BB's public composer API. `reader.tsx`, document selection handling, and `app.css` will add the selection action without changing the reading layout.
- The existing Raw source-line spans and loaded snapshot identity provide reference and invalidation data. Preview does not need a new Markdown-to-source mapping layer.
- Tests will extend the existing SDK app harness and Playwright fixtures. The README will describe the new action and its limits.
- No new server RPC, file writes, automatic sends, settings, opener preferences, or changes to BB core or other plugins. Reuse the pinned Plugin SDK and existing UI dependencies.
