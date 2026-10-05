# Combined manual-first acceptance

BBP-42 integrates the local BBP-38, BBP-37 and BBP-86 handoffs once, in that order, from cumulative baseline `1eee962a6a095ec7d30080c9823f28f00b5162a3`. The whole-feature review target is epic baseline `e06bfb1ef19a338f68bca0fc1b99bea425a6ab63`, including untracked files. The task attachments contain exact delivered commits, logs, browser captures, the single review and its disposition.

## Retained behavior

- Compact status, scope records, stored outcomes/references/provenance and non-notifying report comments remain. Reports are suppressed with no new native delivery intent.
- New orchestration dispatch/adoption returns deferred before claim or worker creation. Scope begin/pause/resume does not operate workers or cancel Core work.
- Recovery can reconcile or attach the exact historical original and explicitly release/replace local ownership. Release and replacement do not grant execution. Known original identity, admission rejection, old associations and live/released history survive retries and reload.
- Recovery uses migration 9; stored reports use migration 10. Migration and compatibility tests cover preserved associations and history.
- Both approval consumers retain the complete shared canonical tracker fields. Names are display-only. Exact IDs, fingerprints and the submitted proposal remain unchanged.
- Approval actions stay outside the bounded scrollable scope details. Changing layout and labels does not change consent, proposal contents or native worker permissions.
- Ordinary operator-led Tasks dispatch, attach/detach, notifications and Unblocked comments remain separate.

## Checks

The combined focused suite runs production registration and public CLI/RPC/tool/store paths, historical report retries, native-origin provenance refusal, scope controls, recovery and ordinary delegation. It passes 225 tests in 24 files. The full suite passes 789 tests in 78 files. Typecheck, lint, build, package discovery and cumulative diff checks pass. Five existing lint warnings remain. The build warns that the package pins SDK 0.5.9 while the existing BB build SDK is 0.5.29. No dependency or SDK change was made.

The local oxlint command was not on PATH. Validation used already installed oxlint 1.86.0 from the npm cache, with the same npm script and arguments. No install ran. Initial red checks caught old recovery tests that still invoked dispatch and misleading execution UI wording. Historical recovery fixtures now import local claim/native observation history without invoking worker APIs.

The single whole-feature review returned request changes. The owner fixed all three findings without another review. Recovery and reporting now share original-worker native fact validation, including creation time. Older metadata-discovered children cannot become original owners or issue new reports; exact durable adopted associations remain valid. The inactive admission/ownership implementations and execution-only release grants were deleted. Bookkeeping record parsing and the no-input public retry checks remain.

Browser acceptance uses the production approval form/summary, built plugin-scoped CSS and canonical fields, with isolated local SDK substitutes. Eight views cover desktop, 320-pixel width, 100 long-label tasks, empty selection, resume, other permissions, stale metadata fallback and missing parameters. Real browser clicks check exact begin/resume proposal submission and cancel without submission. Keyboard expansion/editing checks invalidation and validation errors. Missing parameters must be checked before exact submission. Actions remain reachable and no horizontal overflow occurs. Scope details now use a bounded scroll area with approval/cancel outside it, rather than sticky positioning. Corrected viewport-only captures wait for two animation frames in an isolated visible headless renderer, compare geometry before/after capture and retain action crops from the same PNG. The final screenshots show both actions, including the 100-long-label view. Default-browser and earlier paint-mismatched captures are not accepted painted-visibility evidence.

Early browser setup failures were fixture failures, not product evidence: an unresolved JSX import, missing plugin CSS scope/theme values, hidden-tab animation-frame waits and an incomplete Enter event. Corrected final captures and the browser acceptance JSON supersede those attempts.

## Limits

These are isolated production-module and browser checks. No production package installation, native decision, picker check, provider turn or queue investigation ran. Synthetic approval is not proof of a human decision. Pi on exact BB 0.44.0 remains the earlier verified boundary; no wider provider/version support is claimed.

The original reporting fixture was not inspected, changed, reloaded, resumed or unloaded. Its earlier bounded idle/empty/paused/held check is historical only. Two earlier post-pause executions remain failed, unresolved evidence. This release removes the automated input path; it does not claim to repair that path or establish its cleanup safety.

Automatic dispatch, routing, delivery, retry, wakeup, artifact delivery and integration-role execution remain deferred in BBP-39/40/41. BBP-130 remains a separate blocked fixture-cleanup task. Child completion does not imply whole-epic acceptance. The parent owns BBP-33 status. No push, PR, production publication or protected merge is part of this acceptance.
