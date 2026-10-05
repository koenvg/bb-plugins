# Spec Delta

## Purpose

Keep attachment dialogs and live-file previews consistent through one Markdown document interface, while each source retains its own loading and destination permissions.

## ADDED Requirements

### Requirement: Common document presentation across consumers

The document module SHALL provide one common presentation contract for the attachment dialog and Markdown file reader. Given the same text, theme, available document width, and allowed destinations, both SHALL preserve the same document semantics, heading hierarchy, tables, lists, code styling, and heading navigation. Consumer chrome and loading controls SHALL NOT determine how Markdown content is parsed. Each plugin SHALL remain usable without the other plugin installed or enabled.

#### Scenario: Same report in both readers

- **WHEN** the same GFM report is loaded into the task attachment dialog and the live-file reader under equivalent theme and content-width conditions
- **THEN** both render equivalent document content and use the same typography and code/table treatment, excluding their source-specific controls

#### Scenario: Consumers are installed independently

- **WHEN** either Tasks or Markdown Reader is installed without the other
- **THEN** its document presentation works without a runtime request to the missing plugin

### Requirement: Preserve generic Markdown safely

The document module SHALL render common Markdown and GFM headings, paragraphs, lists, read-only task lists, strikethrough, tables, blockquotes, links, images, inline code, and fenced code without inventing metadata or status badges. Raw HTML, scripts, event handlers, iframes, and MDX SHALL NOT execute or introduce active document-supplied content. Fenced code SHALL preserve its text and whitespace. Unknown fence languages and fences larger than 20 KiB SHALL display as plain code rather than trigger unbounded highlighting.

#### Scenario: Ordinary content is not inferred metadata

- **WHEN** a report contains inline identifiers or values such as `fulfilled` and `inconclusive`
- **THEN** they remain document text without inferred report fields or status pills in either consumer

#### Scenario: Malicious Markdown in either consumer

- **WHEN** Markdown contains raw active HTML, script syntax in a code fence, or unsafe links
- **THEN** neither consumer executes document code or mounts active raw HTML, and code-fenced syntax remains text

#### Scenario: Highlighting fallback

- **WHEN** a code fence uses an unknown language or exceeds 20 KiB
- **THEN** both consumers show unchanged plain code with local overflow handling

### Requirement: Source permissions remain separate from presentation

The module SHALL use the consumer's explicit source policy to resolve links and images. It SHALL NOT infer an environment, host, filesystem root, or attachment relationship from document text. Without explicit permission, source-dependent destinations SHALL remain inert. Source loading, authorization, and file writes SHALL remain outside the presentation contract. Different source policies SHALL NOT weaken common restrictions on malformed encodings, executable schemes, or active document content.

#### Scenario: Same relative link under two source policies

- **WHEN** a file reader with a permitted source root and an attachment dialog without a source root render the same relative link
- **THEN** the file reader can resolve it only within its permitted root and host, while the attachment dialog leaves it inert without a request

#### Scenario: No explicit source policy

- **WHEN** document content includes a source-dependent destination but the consumer has not supplied permission to resolve it
- **THEN** the module does not guess a source or initiate a filesystem read

### Requirement: Scoped headings and responsive theme-aware layout

The module SHALL derive headings and its optional outline from the same parsed document. Repeated and non-ASCII headings SHALL have distinct targets. Navigation SHALL stay within the mounted document and SHALL NOT collide with another reader or underlying task headings. Layout SHALL follow the document container's width, with local table/code scrolling, responsive outline disclosure, semantic headings and tables, visible focus, and active BB theme tokens. Styles SHALL be confined to document-owned roots.

#### Scenario: Concurrent documents with repeated headings

- **WHEN** the underlying task and two mounted readers contain headings with identical text
- **THEN** each reader's outline and fragments target only its own headings

#### Scenario: Container narrows without a viewport change

- **WHEN** a reader's document container narrows while the desktop viewport remains wide
- **THEN** its prose, wide-content scrolling, and outline adapt to that container without styling other BB content
