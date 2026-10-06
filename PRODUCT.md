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
- UI surfaces include sidebar thread lists, thread right-panel tabs, sidebar badges and footers, dashboards, full panels, settings forms, file readers, themes, and native chat styling.
- Users work next to running agent threads. Plugin UI shares the screen with BB's own UI and is read in short glances.
- Some plugins depend on host tools: `gh` CLI login for GitHub Insight, Pi Codex OAuth for Codex Quota, and SQLite CLI for Tasks Plus tests.

## Capabilities and Constraints

Current plugins:

| Plugin           | Gap it fills                                                                                                                | UI surface                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| GitHub Insight   | PR checks, blockers, review requests, and reviews inside BB; user-controlled PR actions                                     | Thread right-panel PR and Review tabs, composer PR banner, Pull Requests panel and sidebar badge                         |
| Threads with PRs | PR status and attention groups beside each thread                                                                           | Selectable sidebar thread list                                                                                           |
| Codex Quota      | Codex allowance and reset times, account activity, and recorded usage reports with token totals and captured cost estimates | Sidebar badge and footer, quota dashboard with a thirty-day calendar chart, Usage collection settings                    |
| Tasks Plus       | Task tracking and delegation to agent threads                                                                               | Tasks panel with list, board, and detail views, sidebar count, thread Task tab and header action, task cards in messages |
| Codex Inspired   | Optional neutral light and dark palette with native chat typography and an Inter sidebar                                    | Selectable theme CSS in Appearance settings                                                                              |
| Code Cleanup     | Project guidance for agents to record substantial adjacent cleanup as separate tasks                                        | Code Cleanup settings with project enablement and a Markdown prompt editor and preview                                   |
| Changes          | Local thread diffs and inline review comments sent to the agent as one message                                              | Thread right-panel Changes tab                                                                                           |
| Markdown Reader  | Read-only Preview and Raw views of live workspace, host, and thread-storage Markdown                                        | File opener with a reading panel and optional heading outline                                                            |
| Compose Chat     | Restyles native chat and adds keyboard access to native voice controls                                                      | Native composer, follow-up footer, conversation messages, and active tool indicators                                     |

- Each plugin is a separate package with its own dependencies, tests, and README. Install one at a time.
- React 19 and the BB Plugin SDK. Node 24.15+ within Node 24.
- Plugin UI must work inside host slots and with the active BB theme, including light, dark, and third-party themes such as Codex Inspired.
- Code Cleanup settings control the default for standard projects without an override, explicit project enablement, and custom prompt text. The plugin supplies agent guidance; it does not inspect code or create tasks itself. Guidance changes apply to new agent sessions.
- Codex Quota keeps account-wide activity separate from selected-host recorded usage. Collection and historical import require explicit setup. Reports can be incomplete; missing values are not zero. Captured cost estimates are not billed subscription charges.
- Codex Inspired is an optional theme, independent of Compose Chat. Installing it does not select it. Compose Chat uses the active theme and keeps BB's native chat controls.
- Agents must never post to external services on the user's behalf without the user. GitHub Insight agents prepare drafts; the user submits reviews and runs PR actions through the UI.

## Brand Commitments

- Plugin UI follows BB's structure, tokens, and conventions so it reads as part of BB.
- Each plugin may add small details of its own (for example, a status treatment or an accent) when they help its job. These details must not break the native feel.
- No shared brand across plugins beyond the repo name "BB plugins".

## Evidence on Hand

- Each plugin's `package.json` and `README.md`; `PLUGIN_OVERVIEW.md` where present.
- `BB-0.45-COMPATIBILITY.md`: compatibility checks and remaining deployment limits.
- `bb-plugin-codex-inspired/README.md` and `bb-plugin-codex-inspired/themes/codex-inspired.css`: theme scope, selector contract, and approved stylesheet.
- `bb-plugin-code-cleanup/README.md` and `bb-plugin-code-cleanup/app.css`: settings behavior and styling.
- `bb-plugin-codex-quota/README.md`, `bb-plugin-codex-quota/docs/CALENDAR.md`, and `bb-plugin-codex-quota/docs/ACTIVITY.md`: quota, usage reports, account activity, and validation limits.
- `openspec/specs` and `openspec/changes`: specs and change records per capability. Historical specs are not proof of a current package.
- No user counts, testimonials, or marketplace listings exist. Do not invent them.

## Product Principles

1. Fill a real gap. A plugin exists because daily use showed BB lacked something.
2. Feel native. A user should not stop to learn a new visual language inside BB.
3. Glanceable first. Plugin UI shares the screen with agent threads, so the state that needs action must read at a glance.
4. Self-contained. Each plugin installs, runs, and tests on its own.
5. User stays in control. Agents draft and propose; the user approves anything that leaves BB.
