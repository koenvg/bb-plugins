# Spec Delta

## ADDED Requirements

### Requirement: Document selection action

The reader SHALL offer a compact, selection-anchored "Add to chat" action for non-empty text selected wholly within the current Preview or Raw document. The action SHALL follow BB's native selection-menu appearance, use the active theme, and leave the reading layout unchanged. Toolbar, outline, status, and other-reader text SHALL NOT be included.

#### Scenario: Select Preview text

- **WHEN** the user selects visible prose, table text, or code in Preview with a fine pointer
- **THEN** the reader offers "Add to chat" near the completed selection without moving document content
- **AND** the excerpt is the visible selected text, not an expanded source block or hidden Markdown

#### Scenario: Select Raw text

- **WHEN** the user selects part of one source line or text across multiple lines in Raw
- **THEN** the reader offers the same action for the selected source text
- **AND** it does not expand the excerpt to unselected parts of those lines

#### Scenario: Ignore unrelated or empty selections

- **WHEN** the selection is collapsed, contains only whitespace, includes reader controls, spans outside the document, or belongs to another reader
- **THEN** this reader offers no selection-to-chat action for it

### Requirement: Draft-only excerpt insertion

Activating "Add to chat" SHALL append one blockquote containing the file reference and selected excerpt to the reader's associated chat draft, separated from existing text. Existing text, mentions, and attachments SHALL remain intact. The reader SHALL focus that composer after successful insertion and SHALL NOT submit a message, replace a draft selection, or write the file.

#### Scenario: Append to a populated draft

- **WHEN** the user activates "Add to chat" while the associated draft contains text, mentions, attachments, or a selected text range
- **THEN** one quote is appended after the existing draft content without removing or replacing any of it
- **AND** the composer receives focus, the selection action closes, and no message is sent

#### Scenario: Insert into an empty draft

- **WHEN** the user activates the action with an empty associated draft
- **THEN** that draft receives the quote and remains unsent

#### Scenario: Keep destination and file provenance separate

- **WHEN** the selected file comes from thread storage owned by a different thread than the reader's associated chat
- **THEN** the quote goes only to the associated chat draft
- **AND** its file reference identifies the storage-owner thread without treating that thread as the message destination

#### Scenario: Unavailable composer or rejected insertion

- **WHEN** no eligible associated chat draft is available, or the composer rejects an insertion
- **THEN** no other draft is modified and no message is sent
- **AND** the reader makes the unavailable action or insertion failure clear without automatic retry

### Requirement: Source-aware excerpt references

Each quote SHALL identify the selected file's path and source from the displayed snapshot. References SHALL distinguish workspace, host, and thread-storage files, retain the resolved host identity, and identify the owner of thread-storage files. Raw references SHALL include the inclusive one-based source lines touched by the selection. Preview references SHALL NOT claim an inferred source-line range.

#### Scenario: Quote each supported source

- **WHEN** a selection from a workspace, absolute-host, or thread-storage document is added to chat
- **THEN** its quote identifies that document's path, source kind, and resolved host
- **AND** a thread-storage reference includes its storage-owner thread
- **AND** reference creation makes no additional file read or external request

#### Scenario: Quote a wrapped Raw line

- **WHEN** a selection occupies several visual rows of one wrapped Raw source line
- **THEN** the reference names that single source line rather than counting visual rows

#### Scenario: Preserve selected excerpt content

- **WHEN** a selection includes indentation, internal blank lines, code punctuation, or Markdown delimiters
- **THEN** the quote preserves that selected content apart from blockquote prefixes and normal browser newline normalization
- **AND** no unselected surrounding content is added

#### Scenario: Preview is not a source-line selection

- **WHEN** visible text is selected from rendered Markdown that hides syntax or frontmatter
- **THEN** the reference identifies the file without a source-line range
- **AND** the quote contains the visible selection rather than reconstructed Markdown

### Requirement: Selection lifecycle isolation

The reader SHALL invalidate a pending action when the user clears the selection outside its action, the view or loaded snapshot changes, refresh starts, the file or associated chat changes, the reader delegates to BB's original preview, or the reader unmounts. It SHALL NOT insert an obsolete selection. Loading, failed-read, and unsupported states SHALL NOT offer selection-to-chat for retained content.

#### Scenario: Switch views or refresh

- **WHEN** a selection action is open and the user switches Preview/Raw or starts Refresh
- **THEN** the action closes and cannot insert its old excerpt
- **AND** a new selection is required after the ready document is displayed

#### Scenario: Change file or associated chat

- **WHEN** a pending selection's file or associated chat changes before activation
- **THEN** the pending action is discarded instead of inserting into either an old or newly selected draft

#### Scenario: Failed refresh retains stale content

- **WHEN** refresh fails and the reader continues to show its labeled stale snapshot
- **THEN** the reader does not offer selection-to-chat until a read succeeds
- **AND** normal copying and the existing Retry and BB-preview actions remain available

#### Scenario: Independent readers

- **WHEN** two readers are mounted and text is selected in one
- **THEN** only the owning reader can offer and activate the action
- **AND** removing that reader leaves no active selection action or selection listeners owned by it

### Requirement: Accessible selection controls

The selection action SHALL have the accessible name "Add to chat", visible keyboard focus, and keyboard activation. Keyboard-created document selections SHALL expose the action without requiring a pointer. Escape and outside activation SHALL dismiss it without inserting a quote. Activating the action SHALL retain the captured excerpt until insertion completes.

#### Scenario: Keyboard selection and activation

- **WHEN** the user selects document text with the keyboard, focuses the action, and presses Enter or Space
- **THEN** the same excerpt is added to the associated draft as for pointer activation
- **AND** focus moves to the composer after insertion

#### Scenario: Dismiss without adding

- **WHEN** the action is open and the user presses Escape or activates outside it
- **THEN** the action closes without changing a draft or moving focus to the composer

#### Scenario: Pointer activation preserves selection

- **WHEN** the user presses the selection action and the browser would otherwise collapse the text selection on focus change
- **THEN** the captured excerpt is still inserted once
