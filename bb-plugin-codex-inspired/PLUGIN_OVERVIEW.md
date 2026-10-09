Read chat and Markdown documents in Libron, with an Inter sidebar and a quiet neutral palette. One stylesheet supports both light and dark mode.

## Typography

Chat messages use Libron at 16px. Markdown Reader document text also uses Libron. The composer keeps native system sans at 16px; the reader's toolbar, outline, and Raw view keep their original fonts. Sidebar thread names use 14px regular text, unread names use medium emphasis, and group headings use 14px medium text. File paths, branch metadata, and code keep a monospace font. Narrow touch screens retain BB's larger small-text tokens.

## Selection and compatibility

Installing the plugin adds Codex Inspired to Settings > Appearance. It changes nothing until you select the theme. The palette applies across BB clients, while each client keeps its light or dark preference. Switching to another palette removes this theme's styling.

The plugin does not replace navigation or the thread list, alter Fonts plugin settings, or download fonts. Inter is already bundled in BB. Libron regular and bold are embedded under the SIL Open Font License 1.1; browsers synthesize italic styling. No system font installation is needed. Ayu and other palettes remain separate choices when their owning plugins are loaded.

## Requirements

BB 0.45 or newer and Plugin SDK 0.6.15 or newer, below 0.7. The sidebar typography rules depend on current BB and Threads with PRs markup. Theme and thread-list upgrades should be checked together. No external service or account is required.
