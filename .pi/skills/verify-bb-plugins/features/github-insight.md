# GitHub pull requests and reviews

Users inspect a thread's PR, review its files/conversation, and manage review drafts, queue state and PR actions.

## Sub-features

- github-overview: blockers, reviewers, checks, conversation and description.
- github-files: diffs, outdated/resolved threads and local pending comment drafts.
- github-queue: Pull Requests panel, Needs review/Reviewed and linked hidden review threads.
- github-write: external comments, reviews, merge/enqueue, branch updates and auto-merge.

## How to get to it (user POV)

- Open PR in the thread's right panel, or activate its sidebar PR badge/composer banner.
- Choose Overview or Files; use Show resolved, Retry and Load older events when shown.
- Open Pull Requests in the navigation; read review threads via `bb github-insight review list --json` in the selected thread context.

## Driving it with BB and package harnesses

Preconditions:

- Follow [shared Launch and Doctor](../SKILL.md), then this package's [README](../../../../bb-plugin-github-insight/README.md). Use the new evidence directory and resolved package/instance/host IDs. Local checks do not install the plugin.
- Installed actions follow [the installed workflow](../references/installed-workflow.md), with exact-checkout identity, needed permissions and an owned record/state ledger. Missing prerequisites remain blockers.

Before local checks install this package and its sibling with `bun install --cwd bb-plugin-pr-thread-list --frozen-lockfile` from the root. There is no standalone owned Chromium recipe here; tests use controlled SDK/GitHub boundaries. For installed Doctor require an exact linked PR and signed-in gh on the thread's actual host, not only the local machine. Follow the installed workflow, open Overview from each requested badge/banner entry, then Files, and verify correct PR/head identity and state preservation across sub-tab switches. Capture the action and resulting diff/thread placements. Read-only CLI list must agree with the visible thread list. Creating a draft writes plugin storage; replies, Post + resolve, review submission, merge/enqueue, update-branch and auto-merge change GitHub or Git refs and each need separate bounded approval. Verify external results by a second read and retain failures without automatic replay.

## Gotchas

- A PR-less environment is not evidence that badges/reviews work.
- PR reads contact GitHub and can hit rate limits; a local fake-host pass does not prove auth.
- Post + resolve can partially succeed: the reply may exist even if resolution fails. Do not repost automatically.
- Pull Requests review-thread creation starts an agent and requires approval; do not use it as harmless navigation setup.
