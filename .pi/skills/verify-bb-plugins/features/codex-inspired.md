# Codex Inspired theme

Users select a BB theme with distinct reading and control fonts, without changing their sidebar provider or Fonts settings.

## Sub-features

- theme-select: Appearance and CLI selection of the contributed theme.
- theme-palette: light/dark contrast, chat typography and monospaced code.
- theme-scope: Markdown reading fonts versus native UI/composer fonts.
- theme-restore: original theme and user Font overrides survive verification.

## How to get to it (user POV)

- Open Settings > Appearance and select Codex Inspired.
- Inspect CSS with `bb theme show plugin:codex-inspired:codex-inspired --css`.
- After explicit selection approval, the equivalent CLI is `bb theme set plugin:codex-inspired:codex-inspired`.

## Driving it with BB and package harnesses

Preconditions:

- Follow [shared Launch and Doctor](../SKILL.md), then this package's [README](../../../../bb-plugin-codex-inspired/README.md). Use the new evidence directory and resolved package/instance/host IDs. Local checks do not install the plugin.
- Installed actions follow [the installed workflow](../references/installed-workflow.md), with exact-checkout identity, needed permissions and an owned record/state ledger. Missing prerequisites remain blockers.

Run package tests/typecheck to validate embedded fonts, CSS checksum/size and side-effect-free activation. There is no frontend bundle or standalone browser fixture. Doctor uses `bb theme show plugin:codex-inspired:codex-inspired --css` and installed source identity. Record the original active theme and Font overrides before any approved selection. In installed BB, choose the theme through Appearance, capture the selecting action and readable chat, composer, sidebar and Markdown document in both client light/dark modes. Observe code/Raw remaining monospaced and Font overrides retaining precedence. Restore only settings that still match the verification values.

## Gotchas

- Theme selection is server-wide and affects other clients; separate browser profiles do not isolate it.
- Installation alone does not activate the theme.
- No font download or system font installation is needed.
- Local-path installations must use a durable checkout if retained after verification.
