# Captured subagent conversation viewer

This PR implements OpenSpec [`subagent-viewer-thread-parity`](../../../openspec/changes/archive/2026-10-16-subagent-viewer-thread-parity/proposal.md). It is ready for review, not yet accepted for merge. Working-UI approval and the full installed lifecycle gate are open. The user explicitly deferred the follow-up repair.

## What changed

- Read captured task, messages and final output through public SDK Markdown. Supported tool blocks stay escaped and collapsed.
- Keep compact run navigation above the reader. Move full IDs and missing-data notices into Capture details, retain original agent labels, and preserve keyboard selection and focus.
- Record optional actual child model/provider provenance, tool names and error flags without guessing missing values. Retain accepted captures and timestamps through failed inspection and history replay.
- Match host prose typography in Codex and Default themes. Add short control/disclosure feedback with immediate reduced-motion behavior.
- Preserve version-1 capture compatibility, capture/state budgets, correlation, refresh cadence and execution behavior. No dependency or lockfile changes.

## Evidence

- [Actual installed desktop](installed-reader-light.png), [mobile](installed-reader-mobile.png), [Default theme](installed-default-light.png).
- [Legacy tool-result presentation finding](installed-legacy-tool-prose.png).
- [Validation summary and artifact hashes](checks.json).
- [Independent review excerpt and finding resolution](independent-review.md).
- Approved standalone prototype and its limits.

Screenshots show real retained child output. The old review verdict and timestamp finding displayed inside that output are historical, not a new review verdict. The timestamp finding was fixed with chronological replay and regressions. The prototype's controls are not all production controls.

## Validation

Source validation passed: 584 provider tests, 10 theme tests, both typechecks, normal SDK checks, production builds and affected Oxc checks. The public SDK source-preview harness uses plain-text Markdown; it is not host typography evidence.

The exact worktree packages were temporarily installed. Served provider JavaScript/CSS and active theme CSS matched the final builds. Actual-host checks passed for 14 native-input assertions, six layouts, reduced motion, coarse-pointer sizing, accepted-output reload and draft close/reopen retention. Current chat/viewer typography matched in Codex and Default, light and dark. Desktop reading height increased from 223px to 346px at 1200×800; mobile increased from 200px to 337px at 375×812.

Original plugin sources, enabled/running states, exact appearance, empty draft and closed panel were restored. All owned Chrome targets, process and daemon closed. No model-backed run or retained deployment occurred. Full private logs, browser snapshots, endpoint/profile details and session metadata remain local and are not part of this public evidence bundle.

## Remaining acceptance and deferred work

- **BBP-227, deferred:** six legacy records labelled `toolResult` still pass through the text-kind Markdown branch, so technical output appears as expanded reading prose. The overall installed reading check fails on this case. The user's PR request does not imply that this defect is fixed.
- **BBP-225:** background captures still lack actual model provenance when unsupported. Missing values remain honest.
- OpenSpec 4.3 lacks supported foreground, resolved-model, retained-failure and active composer/root-overview fixtures. No live work was created to manufacture them.
- OpenSpec 4.4 still requires Koen's approval of the implemented UI. Permission to create a PR is not visual approval.
- Physical touch, screen readers, native browser zoom, other browsers, actual link navigation and full console/event-network collection were not run.
- One sampled request for an older frontend asset returned 404. The active viewer assets served successfully and byte-matched. Attribution of the older request is unverified; sampled viewer alerts and runtime logs were empty.

The OpenSpec change stays open at 16/18. This PR does not archive it, close the follow-up tasks, or claim full lifecycle acceptance.
