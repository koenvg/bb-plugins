# markdown-reader Specification

## Purpose

Provide a spacious, theme-aware reader for live Markdown files inside BB's file panel, with safe source access, read-only raw content, and document navigation that preserves the meaning of the original file.

## Requirements

### Requirement: Optional Markdown file opener

The plugin SHALL provide a reader for live `.md` and `.markdown` files through BB's file-opening system. It SHALL respect BB's extension preferences and one-off opener selection, leave unrelated extensions and chat Markdown unchanged, and allow BB to retain ownership of tab chrome. It SHALL NOT change file-opening preferences or other installed plugins automatically.

#### Scenario: Open a supported live file

- **WHEN** BB selects the plugin for a live `.md` or `.markdown` file
- **THEN** the file panel displays the reader for that source and path

#### Scenario: Keep BB's preview selected

- **WHEN** the user selects BB's built-in opener for Markdown
- **THEN** opening Markdown uses BB's preview rather than forcing this reader

#### Scenario: Unrelated content

- **WHEN** the user opens a non-Markdown file, a Git snapshot, a deleted file preview, a diff, or a chat message
- **THEN** this plugin does not replace that content's renderer

### Requirement: Source-aware read-only loading

The reader SHALL load the requested live file from its actual workspace, host, or thread-storage source, retaining the correct host and source identity. It SHALL NOT assume that the file exists on the server machine. Rendering and navigation SHALL NOT write document contents. Switching files or refreshing SHALL prevent an older request from replacing the latest file's contents.

#### Scenario: Workspace on a different host

- **WHEN** the requested workspace file belongs to a connected host other than the server host
- **THEN** the reader loads that file from the selected workspace host and does not substitute a server-local file

#### Scenario: Host or thread-storage file

- **WHEN** BB selects the reader for a valid absolute host path or storage-relative thread file
- **THEN** the reader displays the file from that source without treating its path as a workspace-relative path

#### Scenario: Requests complete out of order

- **WHEN** the reader switches from file A to file B and A's request finishes last
- **THEN** only file B is displayed as the current document

### Requirement: Spacious document presentation

The reader SHALL implement the approved document-first layout: a centered reading column, generous panel padding, clear heading hierarchy, more space above section headings than below them, subdued inline code and code blocks, and readable tables. Wide code and tables SHALL scroll within their own regions rather than widen the panel. Document typography SHALL remain readable in both wide and narrow panels.

#### Scenario: Wide panel

- **WHEN** a report containing headings, paragraphs, blockquotes, tables, and fenced code is displayed in a wide panel
- **THEN** prose has a bounded reading measure and the visual hierarchy matches the approved spacious mockup

#### Scenario: Narrow panel with wide content

- **WHEN** the same report is displayed in a narrow panel with a long code line or wide table
- **THEN** prose remains readable, controls remain reachable, and horizontal scrolling is limited to the wide content region

### Requirement: Preserve Markdown content and semantics

The reader SHALL render common Markdown and GitHub-flavored tables, lists, task lists, strikethrough, links, images, inline code, and fenced code without changing source values or inventing metadata. Fenced code SHALL preserve its text, including long lines and whitespace. Unknown language labels SHALL remain readable as plain code. Document-provided HTML SHALL NOT execute or introduce active DOM content.

#### Scenario: Ordinary report values

- **WHEN** a report contains inline values such as `fulfilled`, `inconclusive`, or identifiers
- **THEN** those values remain ordinary document content and the reader does not infer status badges or additional report fields

#### Scenario: Code containing markup

- **WHEN** fenced code includes HTML or script syntax
- **THEN** that syntax is displayed as code and is not interpreted as page content

#### Scenario: Bounded explicit-language highlighting

- **WHEN** a fenced block selects a documented bundled language or alias and its rendered UTF-8 text is at most 20 KiB
- **THEN** it receives passive syntax highlighting without changes to text, values, spacing or newlines
- **AND** the byte guard runs before tokenization, without automatic language detection or JSON formatting

#### Scenario: Plain-code fallback

- **WHEN** a fenced block has an unknown or missing language, exceeds 20 KiB of rendered UTF-8 text, or its tokenizer fails
- **THEN** the reader displays the unchanged rendered code as plain readable text and keeps the complete exact Raw source

#### Scenario: Embedded active HTML

- **WHEN** a Markdown file contains script tags, event handlers, iframes, or other raw HTML
- **THEN** the reader does not execute that HTML or mount active document-supplied elements

### Requirement: Preview and exact Raw views

The reader SHALL provide accessible Preview and read-only Raw controls. Raw SHALL display the complete loaded Markdown text, not a shortened or reconstructed version. Switching views SHALL retain the same source and content without writing the file or requiring a new read. The initial view SHALL be Preview unless BB requests a source line range, which SHALL open in Raw.

#### Scenario: View original source

- **WHEN** the user selects Raw after loading a file
- **THEN** the entire loaded source, including frontmatter and original code whitespace, is shown read-only

#### Scenario: Return to Preview

- **WHEN** the user switches back to Preview
- **THEN** the same source content is rendered without modifying or refetching the document solely because of the view switch

### Requirement: Optional document outline

The reader SHALL derive an optional outline from actual rendered headings, support repeated and non-ASCII heading text with distinct navigation targets, and navigate within the current document without reopening the file. It SHALL display an aside when sufficient panel width is available and a collapsible inline outline at constrained widths. It SHALL not display an empty outline for a document without headings.

#### Scenario: Select a heading

- **WHEN** the user activates an outline entry
- **THEN** the reader navigates to the corresponding heading in the same document

#### Scenario: Repeated or non-ASCII headings

- **WHEN** the document contains repeated headings or headings written in non-ASCII text
- **THEN** each outline entry targets its own heading without collisions

#### Scenario: Constrained panel

- **WHEN** the panel cannot fit both prose and an outline aside
- **THEN** the outline is available as a collapsible inline control rather than squeezing the reading column

#### Scenario: Hide the outline

- **WHEN** the user turns off the outline control
- **THEN** the outline is hidden and the document reclaims the available space

### Requirement: Safe source-relative links and images

The reader SHALL resolve relative file links and images from the containing document to decoded, normalized paths lexically within the permitted source root and SHALL preserve the source's host identity. In-document fragments SHALL navigate locally. Valid external HTTP(S) links SHALL use BB's URL-opening behavior. Unsupported or executable schemes, malformed encodings/URLs, encoded traversal, and lexical paths outside the permitted root SHALL be inert and SHALL NOT cause an SDK file read, preview allocation, image request, or navigation.

Reader reads and local-image content requests SHALL use explicit host/root identity and SDK confinement during the operation. Confined SDK reads MAY occur before the host rejects a symlink escape. A rejected confined read or image request SHALL NOT deliver outside-root content and SHALL leave an actionable reader error or readable image alt/error content. Metadata-only validation before activation is not required. Each local-image URL SHALL select exactly one supported raster file, SHALL use BB's normal frontend route access checks, SHALL hide host/root/path identity, and SHALL reject changes to its opaque file identity. It SHALL NOT grant access to a folder or other files, SHALL NOT allocate a folder-preview lease, and SHALL NOT expire based on elapsed time. Loaded images SHALL remain visible without a timeout. Plugin reload or server restart MAY invalidate old URLs; Refresh SHALL issue fresh URLs.

Local file links SHALL use BB's normal source-aware file-opening behavior and permissions after lexical validation. The plugin SHALL NOT claim an additional guarantee that native file navigation keeps a symlink's final target within the original source root. The README SHALL document this limit. Remote HTTP(S) images SHALL load as ordinary images without proxying authenticated BB credentials; local images SHALL use confined host file-preview transport.

#### Scenario: Keep a local screenshot available

- **WHEN** a supported local screenshot is displayed and the document remains open longer than 60 seconds
- **THEN** the image remains visible and its URL continues to serve that same image without renewal
- **AND** a changed opaque identity is rejected without reading any file
- **AND** extra file/root parameters cannot change which file that URL serves

#### Scenario: Open a sibling document

- **WHEN** a user activates a relative link whose decoded, normalized path is lexically within the permitted source root
- **THEN** BB opens the resolved file in the same source and on the same host using its normal opening behavior and permissions, without an additional plugin symlink-confinement guarantee

#### Scenario: Render a local image

- **WHEN** a document references an image relative to its directory within the source root
- **THEN** the image is served from the correct confined host location, fits the reader, and retains its alt text

#### Scenario: External link

- **WHEN** a user activates an HTTP(S) link
- **THEN** BB handles the link according to the client's browser preference

#### Scenario: Unsafe destination

- **WHEN** a link or image contains an executable or unsupported scheme, malformed encoding/URL, encoded traversal, or a decoded, normalized path lexically outside the permitted root
- **THEN** the destination is not read, allocated a preview, fetched, or activated and the document remains usable

#### Scenario: Confined SDK request rejects a symlink escape

- **WHEN** the host rejects a reader read or local-image content request because its resolved target escapes the supplied root
- **THEN** the attempted SDK call, preview allocation, or image request is permitted, but no outside-root content reaches the reader and its error or image alt text remains readable

### Requirement: Theme and keyboard accessibility

The reader SHALL follow BB's active light, dark, and third-party theme tokens without changing global appearance. It SHALL provide accessible names, visible keyboard focus, semantic headings and tables, and keyboard-operable view and outline controls. Live theme changes SHALL update the reader without a reload. Body text SHALL meet a contrast ratio of at least 4.5:1 in the tested built-in themes.

#### Scenario: Theme changes while reading

- **WHEN** BB's active appearance changes between light and dark
- **THEN** the reader updates its colors while preserving document content and reader state

#### Scenario: Keyboard-only reading

- **WHEN** the user operates the reader using the keyboard
- **THEN** view controls, outline controls, and links are reachable, visibly focused, and operable with their expected keys

### Requirement: Refresh, failure states, and fallback

The reader SHALL provide a refresh action for live file content, an explicit loading state, a readable empty-file state, and actionable failures for missing, unreadable, disconnected, or unsupported files. It SHALL support text files up to 1 MiB without unbounded highlighting work and offer BB's original preview for larger or non-text files. A read failure SHALL never disguise stale content as a successful refresh. The user SHALL be able to invoke BB's original preview from the reader without recursive replacement.

#### Scenario: Refresh an edited file

- **WHEN** the file changes outside the reader and the user selects Refresh
- **THEN** Preview and Raw update to the newly loaded source

#### Scenario: File cannot be read

- **WHEN** a read or refresh fails because the file is absent, inaccessible, or its host is disconnected
- **THEN** the reader shows the failure with Retry and Open in BB preview actions and does not present previous contents as newly loaded

#### Scenario: Empty file

- **WHEN** the loaded file is empty
- **THEN** Preview shows a clear empty-file message and Raw preserves the empty source

#### Scenario: Unsupported content or size

- **WHEN** the requested file is non-text or larger than 1 MiB
- **THEN** the reader explains its limit and offers the original BB preview instead of attempting unbounded rendering

#### Scenario: Explicit fallback

- **WHEN** the user selects Open in BB preview
- **THEN** BB's original preview is displayed for the same source and path without resolving this plugin again

### Requirement: Source-line navigation

The reader SHALL honor BB's requested inclusive one-based line ranges in Raw view, reveal the range, and apply subsequent requests even when they repeat the same values. It SHALL preserve the loaded document model and SHALL NOT confuse source line numbers with visually wrapped lines.

#### Scenario: Open at a requested range

- **WHEN** BB opens a Markdown file with a requested source line range
- **THEN** the reader shows Raw, highlights and reveals the applicable source lines after loading

#### Scenario: Repeat a range request

- **WHEN** BB sends a new request object containing the same line range for the active file
- **THEN** the reader reveals that range again without requiring a content reload

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
