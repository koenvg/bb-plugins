# Implementation handoff

## Scope and result

Change: `keep-completed-task-links`, schema `spec-driven`.
Repository: `/Users/koen/workspace/bb-plugins`.
Pre-implementation baseline: `f85d1d53925d85d1e30c0b1b27d0021678a1ae8b`.
Validation used the working-tree change. No plugin deployment was made.

- Updated the Tasks skill, task-record repair reference, generated worker report-back contract, and README to keep task-to-thread links after completion, review, handoff, replacement, failure, or a move to other work.
- Agents detach only when the user explicitly requests removal of the link. Manual detach remains available. It does not stop the thread or change task status.
- Retained links grant no new ownership or reporting authority. This is guidance, not a server-enforced detach permission check.
- Added guidance tests for the skill, repair reference, and both attached and attachment-pending prompts.
- Added public API integration coverage for dispatched and manually attached workers. A public update to Done preserves the same association in `listTaskThreads` and returns the Done task in `getTasksForThread`.
- Extended explicit-detach coverage to a completed task. The task record and comments remain unchanged, no further SDK calls occur, and the unrelated association remains.
- Added header coverage for initially Done tasks in normal and compact views, opening without writes, and realtime removal of the only link. Kept the existing live status-transition test.

No API, schema, ownership model, or header-layout changes were made. Unrelated Codex Quota edits present before implementation were left untouched.

## Validation

The new guidance assertions failed against the original guidance before it was changed: four expected failures and 15 passing tests.

Initial typecheck was blocked by stale local dependencies: installed SDK `0.5.29`, while the manifest and lockfile specify `0.6.15`. With the user's approval, `npm ci` refreshed the local dependencies. The manifest and lockfile remain unchanged.

Passed after the dependency refresh, from `bb-plugin-tasks-plus`:

```sh
npm test -- reporting.test.ts reporting.integration.test.tsx delegate/delegate.test.ts api/api.test.ts views/thread-header/thread-header.test.tsx
npm run typecheck
npm run build
npm test
```

- Selected tests: 60 passed across five files.
- Full suite: 1,194 passed across 112 files.
- Typecheck and plugin build passed.
- Oxlint passed on all five changed TypeScript and TSX files.
- Oxfmt check passed on all eight changed plugin source, test, and documentation files.
- `git diff --check` passed.

`npm ci` reported 34 dependency audit findings, 33 moderate and one high. These are covered by the existing [BBP-122 follow-up](bbtask://BBP-122). No automatic audit fix or dependency-version change was made.

## Completion review

One fresh-context, read-only `delegate` reviewed the complete task change against the recorded baseline, including the untracked OpenSpec planning files. Unrelated quota changes were excluded.

Review run: `a48a6f16-0c35-4f01-b1c7-854406bf34e5`.
Verdict: approve. No blockers found. The reviewer confirmed the guidance and tests meet the specified behavior and found no API, schema, ownership, or header-layout changes. The final handoff and checkbox updates followed the review; executable code did not change afterward.

## Coverage and rollout limits

The installed Tasks Plus plugin uses a separate local source copy. Editing and building this checkout does not update that installed copy. No install, reload, or live deployment check was authorized or performed. Installed behavior remains unverified and requires a separately authorized deployment and verification step with disposable fixtures.

Tests prove the guidance text and behavior at the fake-host API and rendered header boundaries. They do not prove agent compliance, real-browser layout, or behavior of the installed plugin.

New worker prompts and agents that read the updated skill receive the retention rule. Previously delivered prompts and existing detached data remain unchanged. No production links, old prompts, task histories, stored presets, or historical comments were repaired or rewritten.

Source thread: [implementation thread](bbthread://thr_qz82jjaq6k).
