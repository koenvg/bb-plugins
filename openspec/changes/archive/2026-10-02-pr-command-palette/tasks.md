# Tasks

## 1. Intent bus

- [x] 1.1 Add `ui/command-intents.ts` with `postIntent` and a `useCommandIntent(threadId, tab)` hook: one pending intent per `(threadId, tab)`, a post replaces it, a take removes it, and an intent older than 10 s is dropped. Verify with `ui/command-intents.test.tsx`: delivery to a mounted subscriber, delivery on a later mount, no delivery to another thread, one take only, and the 10 s drop.

## 2. Commands

- [x] 2.1 Add `ui/commands.ts` with the six registrations from design.md, all with `isAvailable: (ctx) => ctx.threadId !== null`. Each `run` calls `ctx.openPanel({ actionId })` without params and posts its intent (if any) only when `openPanel` returns true. Verify with `ui/commands.test.tsx`: titles, hidden without a thread, the action id and intent for each command, and no intent on a declined open.
- [x] 2.2 Register the commands in `app.tsx` with `app.commands.register`. Verify in `app.test.tsx` that the six commands are registered, and in `ui/commands.test.tsx` that no command id or title mentions the agent.

## 3. PR tab

- [x] 3.1 Make the merge confirm dialog in `ui/merge-action-button.tsx` controlled and add an optional `request: { onHandled }` prop: a request runs the enqueue or opens the dialog, then reports it handled. Verify with `ui/merge-action-button.test.tsx` (dialog for merge, one enqueue, nothing without a request) and in `app.test.tsx` (two quick commands send one request, the composer banner never reacts).
- [x] 3.2 In `ui/pr-tab.tsx`, take the `pr` intent and act only when the insight has a result and no refresh runs: `merge` sets `requested` when a merge action button shows, `refresh` calls `refresh`, `open-on-github` calls `useBbNavigate().openUrl(pr.url)`. Verify with tests: the dialog opens after the first load, a blocker or no PR causes no write and no URL, refresh shows progress, and a remount does not act again.

## 4. Review tab

- [x] 4.1 In `ui/review-tab.tsx`, take the `review` intent and open the submit panel on `submit`, and keep it open with its body when it is already open. Verify in `ui/review-tab.test.tsx`.

## 5. Docs

- [x] 5.1 Document the six commands in `bb-plugin-github-insight/README.md` and `PLUGIN_OVERVIEW.md`, and change the README line "Only a click in the tab or the banner merges or enqueues" to include "GitHub: Merge PR". Verify by reading both files against `specs/pr-commands/spec.md`.

## 6. Availability

- [x] 6.1 Add `ui/pr-availability.ts` (remember a load per thread: ok sets, no_pr deletes, error keeps; read "has PR" and "can merge") and call it from `useInsight` after each load. Verify with `ui/pr-availability.test.ts`.
- [x] 6.2 Use it in `isAvailable` of `ui/commands.ts`: Merge PR needs "can merge", the others need "has PR". Verify in `ui/commands.test.tsx` (no entry, no PR, PR with a blocker, ready PR) and in `app.test.tsx` that a composer banner load makes the commands available.
- [x] 6.3 Update the README "Command palette" section and `PLUGIN_OVERVIEW.md` with the new visibility rule. Verify by reading both against `specs/pr-commands/spec.md`.

## 7. Integration

- [x] 7.1 Run the plugin test suite and typecheck (`npm test` and `npm run typecheck` in `bb-plugin-github-insight`) and verify both pass.
- [x] 7.2 In bb, open a thread with a PR and run each command from the palette. Verify: Merge PR shows the dialog and cancel writes nothing, Refresh PR shows progress, Open PR on GitHub opens the PR, Submit review opens the panel, and the commands are not listed on a thread without a PR, and Merge PR is not listed for a PR with a blocker.
