# Spec Delta

## Purpose

Let users read Markdown task and comment attachments in a dialog over the task, without downloading first or changing the task underneath.

## ADDED Requirements

### Requirement: Open supported attachment cards in a dialog

Tasks SHALL open saved task and comment attachment cards whose filenames end in `.md` or `.markdown`, without regard to extension case, in a read-only dialog over the current task. The filename SHALL determine eligibility even when upload metadata uses a generic MIME type; actual content SHALL still pass text validation. Other file cards SHALL retain download behavior, and image attachments SHALL retain their image preview behavior. The dialog SHALL NOT require the standalone Markdown Reader plugin to be installed or enabled.

#### Scenario: Open a task attachment

- **WHEN** a user activates a task attachment named `investigation.md`
- **THEN** a dialog opens over the task with that filename and a loading state, followed by its Markdown Preview when the read succeeds

#### Scenario: Open a comment attachment with a generic MIME type

- **WHEN** a user activates a saved comment attachment named `NOTES.MARKDOWN` with `application/octet-stream` metadata and valid UTF-8 content
- **THEN** the same dialog behavior loads and renders that attachment

#### Scenario: Preserve other attachment actions

- **WHEN** a user activates a PDF file card or a raster image attachment
- **THEN** the existing download or image preview action occurs without opening the Markdown dialog

#### Scenario: Reader plugin is absent

- **WHEN** Markdown Reader is not installed or is disabled and the user opens a supported Tasks attachment
- **THEN** the attachment dialog still uses the shared document presentation

### Requirement: Preview, exact Raw, and original Download

The dialog SHALL start in Preview and provide named Preview, Raw, Download, and Close controls. Preview and read-only Raw SHALL use the same loaded UTF-8 snapshot. Raw SHALL preserve the complete decoded text, including frontmatter, blank lines, line endings, and code whitespace, without reconstruction from rendered content. Switching views SHALL NOT refetch or write content. Download SHALL retain the original attachment bytes and filename through the existing download contract, including when preview is unsupported or fails.

#### Scenario: Read original source

- **WHEN** a user switches from Preview to Raw and back
- **THEN** Raw contains the complete loaded source and Preview uses that same snapshot without a new read or write

#### Scenario: Download from a failed preview

- **WHEN** preview fails or the attachment exceeds the preview limit and the user activates Download
- **THEN** the original attachment is downloaded with its existing filename and unchanged bytes

### Requirement: Bounded authenticated text loading

Attachment preview SHALL read only an attachment identified by its saved ID through the existing Tasks authentication boundary. It SHALL NOT accept arbitrary filesystem paths or fetch a document-supplied URL as attachment content. It SHALL accept valid UTF-8 text up to and including 1 MiB, reject non-text, invalid UTF-8, and larger content before Markdown parsing, and enforce the limit against actual bytes rather than trust client metadata alone. Preview SHALL NOT change the 25 MiB upload/download allowance. Loading, empty, missing, denied, failed, and unsupported states SHALL have readable messages; recoverable failures SHALL offer Retry. The latest open request SHALL be the only request permitted to update the dialog.

#### Scenario: Metadata understates content size

- **WHEN** an attachment reports a size below 1 MiB but actual stored content exceeds that limit
- **THEN** preview reports its size limit without parsing the oversized content, while Download remains available

#### Scenario: Exact size boundary

- **WHEN** valid UTF-8 text contains exactly 1 MiB of bytes
- **THEN** preview accepts it subject to the normal text and content-safety checks

#### Scenario: Invalid text or empty content

- **WHEN** a supported filename contains invalid UTF-8 or non-text bytes, or contains zero bytes
- **THEN** invalid content shows an unsupported message and empty content shows an empty-file message, with the original Download available in either case

#### Scenario: Missing attachment and retry

- **WHEN** an attachment read returns missing, denied, or a recoverable transport failure
- **THEN** the dialog shows the relevant failure without displaying another attachment's content, and recoverable failures expose Retry

#### Scenario: Late response after close or replacement

- **WHEN** attachment A is closed or replaced by attachment B before A's read finishes
- **THEN** A's response cannot reopen the dialog, overwrite B, or retain visible content after close

### Requirement: Accessible dismissal and task-state preservation

The dialog SHALL have an accessible filename title, visible keyboard focus, keyboard-operable controls, and modal focus containment. Close and Escape SHALL dismiss the preview without leaving the task. Task shortcuts SHALL NOT run while focus is in the dialog. Dismissal SHALL return focus to the invoking attachment card if it still exists, or a stable task control otherwise. Opening, switching views, and closing SHALL preserve the underlying task route, scroll position, drafts, and workflow state. Changing tasks or removing the active attachment SHALL close its preview and discard the pending read.

#### Scenario: Keyboard reading and dismissal

- **WHEN** a user opens an attachment with the keyboard, moves through the controls, and presses Escape
- **THEN** focus stays within the open dialog, no task navigation shortcut runs, and dismissal restores focus to the invoking card

#### Scenario: Preserve unfinished work

- **WHEN** a user has a comment draft and a scrolled task page, reads an attachment, and closes it
- **THEN** the draft, scroll position, task route, and task status remain unchanged

#### Scenario: Task changes while preview loads

- **WHEN** the active task changes or the active attachment is removed while its preview is loading
- **THEN** the preview closes, a late response is ignored, and focus restoration does not target a removed element

### Requirement: Source-safe attachment destinations

Attachment Markdown SHALL support local heading fragments and valid external HTTP(S) links through BB's URL-opening behavior. It SHALL NOT treat attachment names or blob storage as a workspace directory. Relative file links and relative images SHALL remain unactivated and SHALL NOT cause file reads, navigation, or requests. Rejected links SHALL retain readable text and rejected images SHALL retain accessible alt text. Executable schemes, malformed encodings, absolute filesystem paths, and unsupported internal schemes SHALL remain inert. Remote HTTP(S) images SHALL NOT receive BB credentials or use an authenticated BB proxy.

#### Scenario: Relative destination has no source root

- **WHEN** attachment Markdown contains `../notes.md` or `images/chart.png`
- **THEN** its readable label or alt text remains, but no filesystem read, navigation, or asset request occurs

#### Scenario: Safe link and heading fragment

- **WHEN** a user activates a valid external HTTP(S) link or a heading fragment
- **THEN** the external link uses BB's browser preference and the fragment navigates inside the current dialog without reopening it

#### Scenario: Unsafe document destination

- **WHEN** a link or image uses an executable scheme, malformed encoding, or a filesystem path
- **THEN** the destination remains inert and the rest of the document remains usable

### Requirement: Shared presentation in a responsive dialog

The attachment dialog SHALL use the same spacious document presentation as the file reader, including heading hierarchy, bounded prose width, quiet code and tables, optional heading navigation, and active BB theme tokens. Dialog chrome SHALL remain Tasks-owned. At narrow widths the preview SHALL remain an overlay over the task, with reachable controls and scrolling limited to the document or local wide-content regions. The reader SHALL NOT change chat/editor styling or global appearance.

#### Scenario: Compact dialog with wide content

- **WHEN** a user opens a report with a wide table and long code line on a 390 px viewport
- **THEN** controls remain reachable, prose fits the dialog, and table/code overflow scrolls locally without widening the task page

#### Scenario: Live theme change

- **WHEN** BB switches theme while the dialog is open
- **THEN** document colors update without reloading content, changing the selected view, or changing global theme preferences
