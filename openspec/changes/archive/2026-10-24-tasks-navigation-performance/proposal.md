# Proposal

## Why

Moving between tasks interrupts scanning because the Ticket pane clears and takes roughly 300–500 ms to show the next description in the initial headless-browser measurements. Repeated list rendering and the quota footer's document-wide observer add work on the same browser thread, so fixing the detail request alone will not make navigation smooth.

## What Changes

- Keep unchanged task rows and their metadata stable during selection; reuse date formatters without changing displayed dates.
- Restrict quota-footer reconciliation to changes that can affect its own sidebar integration. Keep late attachment, fallback navigation, visibility checks, and cleanup intact.
- Reuse recently loaded task data and prefetch the previous and next visible task with bounded memory and concurrency. Show only data for the accepted selected identity.
- Preserve the current save barrier, native Ticket tab and portal ownership, keyboard guards, and task-owned comment drafts.
- Fetch dependency candidates when their picker opens, not during ordinary task browsing.
- Replace activity's per-comment attachment request fan-out with an additive batched read, and defer offscreen activity editor work without removing comments or explicit composer access.
- Add deterministic work-count regressions and a paired browser benchmark. Target warm navigation p95 at or below 100 ms with both plugins enabled, and publish cold-load and main-thread results separately.

## Capabilities

### New Capabilities

- `tasks-navigation-performance`: Fast task selection with bounded preview loading, deferred secondary work, correct invalidation, and repeatable performance evidence.

### Modified Capabilities

- `codex-quota-footer`: Add a requirement that footer integration does not reconcile or force visibility checks for unrelated page changes, while preserving its existing access and lifecycle guarantees.

## Impact

- Tasks: `shell/browse-workspace.tsx`, `shell/browse-keyboard.ts`, list row/data modules, detail query modules, dependency picker, and activity feed. The first two files exist in the newer native-Ticket source, not this checkout's current executable code.
- Quota: `bb-plugin-codex-quota/footer-adapter.ts` and its adapter tests.
- Add an activity read contract and task-scoped attachment metadata query. Existing RPC and CLI contracts, database schema, attachment ownership, and explicit comment notification behavior remain compatible. No new runtime dependency is planned.
- Implementation must first use the repository source that contains the installed native Ticket composition. The installed Tasks source was `/Users/koen/.bb/local-plugins/tasks-plus-native-a5c397775cb4`; matching native-Ticket code was found on `bb/bbp-8-remembered-project-and-editable-ticket-spl-thr_v9ni4kqgxa`. These are discovery references, not permission to edit another checkout or replace an installation.
- Coordinate with `tasks-split-view` for selection and save safety and with `markdown-reader` for any future read-only renderer. This change does not redesign the workspace or implement the separate Markdown reader.
- The CPU trace identifies quota visibility checks as a hotspot, but the attempted browser isolation did not remove that observer. Its causal share of the delay remains unmeasured. No speed-up has been verified yet.
