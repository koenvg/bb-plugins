# Proposal

## Why

BB's built-in Markdown file preview spreads dense reports across the panel with weak heading hierarchy and little separation between prose, tables, and code. Koen approved a spacious, Notion-style reader mockup and wants that reading experience inside BB.

## What Changes

- Add an independent `bb-plugin-markdown-reader` package that registers a `fileOpener` for live `.md` and `.markdown` files. BB keeps ownership of tabs, file-opening preferences, and one-off "Open with" choices.
- Use the approved mockup's centered reading column, generous spacing, larger document headings, subdued tables and code blocks, and optional heading outline.
- Provide Preview and read-only Raw views of the same actual file, with accessible controls and responsive behavior.
- Follow the active BB theme, including live light/dark changes. The mockup's moon button demonstrates theme variants; the production reader will not introduce a separate app-theme switch.
- Preserve Markdown semantics, safe links, relative file navigation, and images without executing document HTML or scripts.
- Load the selected source on its actual host, handle refresh and error states, and offer BB's bound original preview as a fallback.
- Document installation, extension preferences, and host-imposed limits. Add tests and the new package to the repository's existing CI matrix.

This is a file-reader plugin, not a replacement for chat Markdown, Git snapshot previews, or diff renderers. Editing, MDX execution, custom global CSS, and automatic changes to installed plugins or file-opening preferences are out of scope.

## Capabilities

### New Capabilities

- `markdown-reader`: A theme-aware, read-only Markdown file opener with spacious typography, Preview/Raw switching, heading navigation, safe source loading, and fallback behavior.

### Modified Capabilities

None. Existing chat styling and theme-retirement requirements remain unchanged.

## Impact

- New standalone package at `bb-plugin-markdown-reader/`, following the repository's TypeScript, React, per-package scripts, README, and plugin-overview conventions.
- Existing BB Plugin SDK APIs: `fileOpener`, source-aware file reads, host file/URL navigation, theme tokens, and the bound `Original` component. No BB core or public SDK changes are planned.
- Proposed dependencies: a React Markdown renderer with GFM support and a bounded syntax highlighter. Raw HTML execution is excluded.
- Collection README and `.github/workflows/tests.yml` gain the new plugin entry; existing plugins remain untouched.
- Design reference: approved thread-storage artifact `mockups/markdown-reader.html` in thread `thr_a8vncu5w4e`. Production content remains generic Markdown; no report-specific badges, labels, metadata, or data inference are added.
