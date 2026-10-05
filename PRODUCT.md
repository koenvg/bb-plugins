# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Primary: the repo owner (Koen), who runs coding agents in BB every day. Each plugin starts as a fix for a gap in that daily workflow.
- Secondary: other BB users who install a plugin from this repo with `bb plugin install git:... --subdirectory <plugin>`. They must be able to use a plugin from its README alone.

## Product Purpose

A collection of independent BB plugins. Each plugin adds a feature that BB does not have yet. There is no single theme across plugins: each one fills its own gap.

Success: a plugin removes a reason to leave BB or to work around it, and another BB user can install and use it without help.

## Positioning

Built from real daily use of BB by one heavy user, then published. Each plugin solves an observed workflow gap, not a guessed one.

## Operating Context

- Plugins run inside the BB desktop app (an agentic IDE for coding-agent threads, projects, and environments).
- UI surfaces are host slots: sidebar thread list, thread right-panel tabs, sidebar badges and footers, dashboards, full panels, themes.
- Users work next to running agent threads. Plugin UI shares the screen with BB's own UI and is read in short glances.
- Some plugins depend on host tools: `gh` CLI login (GitHub Insight), Pi Codex OAuth (Codex Quota), SQLite CLI (Tasks Plus tests).

## Capabilities and Constraints

Current plugins:

| Plugin           | Gap it fills                                                                                                  | UI surface                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| GitHub Insight   | PR checks, blockers, and review threads inside a thread; review requests and review threads started from them | Thread right-panel PR and Review tabs, Pull Requests panel |
| Threads with PRs | PR status beside each thread                                                                                  | Sidebar thread list                                        |
| Codex Quota      | Codex allowance and reset times                                                                               | Sidebar badge, footer, dashboard                           |
| Tasks Plus       | Tracked tasks delegated to agent threads                                                                      | Tasks panel (list, board, detail)                          |
| Liquid Glass     | Alternative look for BB                                                                                       | Theme CSS only                                             |
| Code Cleanup     | Records adjacent cleanup as separate tasks                                                                    | None (agent guidance only)                                 |

- Each plugin is a separate package with its own dependencies, tests, and README. Install one at a time.
- React 19 and the BB Plugin SDK. Node 24.15+ within Node 24.
- Plugin UI must work inside host slots and with the active BB theme, including light, dark, and third-party themes such as Liquid Glass.
- Agents must never post to external services on the user's behalf without the user (for example, GitHub Insight drafts replies but never posts them).

## Brand Commitments

- Plugin UI follows BB's structure, tokens, and conventions so it reads as part of BB.
- Each plugin may add small details of its own (for example, a status treatment or an accent) when they help its job. These details must not break the native feel.
- No shared brand across plugins beyond the repo name "BB plugins".

## Evidence on Hand

- Per-plugin README.md and PLUGIN_OVERVIEW.md.
- `bb-plugin-liquid-glass/COMPATIBILITY.md`: observed host hooks and validation.
- `openspec/specs` and `openspec/changes`: specs per capability.
- No user counts, testimonials, or marketplace listings exist. Do not invent them.

## Product Principles

1. Fill a real gap. A plugin exists because daily use showed BB lacked something.
2. Feel native. A user should not stop to learn a new visual language inside BB.
3. Glanceable first. Plugin UI shares the screen with agent threads, so the state that needs action must read at a glance.
4. Self-contained. Each plugin installs, runs, and tests on its own.
5. User stays in control. Agents draft and propose; the user approves anything that leaves BB.
