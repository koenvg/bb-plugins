# Add selected text to chat

Users select Preview or Raw text and choose Add to chat. The reader appends a cited blockquote to its associated draft without sending or editing the file.

## Sub-features

- `selection-preview`: visible selected text receives a file/source reference.
- `selection-raw`: exact selected source text uses inclusive one-based source lines.
- `selection-draft`: existing text, mentions and attachments survive insertion; composer receives focus; zero messages are sent.
- `selection-keyboard`: keyboard-created selection and Enter/Space activation work.
- `selection-ineligible`: stale, cross-reader, whitespace and coarse-pointer contexts do not show an inappropriate custom action.

## How to get to it (user POV)

- Open a Markdown file associated with a thread or new-thread draft, select text in **Preview**, and activate **Add to chat** near the selection.
- Choose **Raw**, select source text and activate the same action.
- With browser caret browsing enabled, select with the keyboard, Tab to the action, and press Enter or Space.
- Controlled selection data opens at `/tests/selection-preview.html` or `/tests/selection-preview.html?document=raw`.

## Driving it with Playwright

Preconditions:

- Setup passes and `SUITE_EVIDENCE` is fresh.
- Live draft acceptance requires an approved owned destination draft with no sends. Preserve any pre-existing draft and attachments.

- **Preview, Raw and keyboard entries.** Run `bun run --cwd bb-plugin-markdown-reader test:browser selection.spec.ts --trace on --output "$SUITE_EVIDENCE/tests"`. The existing suite selects actual DOM text, activates the role-button `Add to chat`, and observes the SDK-bound composer. Preview selection must append `> Selected` after `Keep @owner`. The draft retains its mention and `keep.txt` attachment, focus count becomes one and submits remain zero.
- **Raw lines.** In the same suite, selecting raw lines 3–4 must retain indentation and blank lines and cite `note.md:3-4`; an endpoint at the start of line 5 must not include that line.
- **Eligibility and isolation.** The suite checks stale/loading text, whitespace, controls, two readers, file changes, keyboard focus, Enter and Space, narrow panels and coarse pointers. Inspect cases before filtering; the first Preview case alone is incomplete.
- **Native draft.** In the installed reader, perform selection and Add to chat by the real UI, capture the action and resulting composer contents, and verify unchanged file hash and zero sends. Restore only owned draft additions, subject to concurrent user edits.

## Gotchas

- The selection suite's DOM Range setup models browser text selection; it does not bypass the production Add to chat action. Keyboard cases use real key events.
- The fake SDK composer proves integration at that boundary, not the installed composer.
- An associated thread/storage owner identifies origin and may not be the destination chat.
- Refresh, view changes, Escape and scrolling dismiss the action. Select again after a successful read.
- A focus failure after insertion must not cause a duplicate append.
