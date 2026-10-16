# BBP-58 verification plan

## Result predicate

Local assembled acceptance requires complete shared/consumer tests, typechecks, lint, pinned SDK checks, independent builds, browser inspection, matched-consumer parity, operating-document audit, and one fresh whole-feature review with no unresolved blockers. Current-host SDK and installed acceptance remain separate rows. No plugin installation, activation, preference change, publication, or owned live test data is approved.

## Workflow

- [x] Read the Principles section of Poteto mode.
- [x] Phase A: Frame.
- [x] Phase B: Design the workflow.
- [x] Phase C: Run the loop.
- [x] Verify packages and fresh independent bundles. Record failures separately.
- [x] Inspect owned-browser overlay and production-reader evidence.
- [x] Review the full feature once in a fresh read-only context.
- [x] Close runtime review finding R1 after explicit approval. The protected-change review accepts the repair and SDK alignment. See [current remediation](remediation.md). Documentation finding R2 is also closed.
- [x] Phase D: Keep the audit trail.
- [x] Phase E: Verify and hand back with failed acceptance and remaining gates.

The existing BBP-57 build/parity tools and maintained verification recipes provide the harness. No new product implementation is planned. Package checks and owned browser checks use separate evidence outputs. Browser suites serialize the strict Tasks port. One reviewer examines the frozen feature source while the owner inspects test results and screenshots.

Throughput checkpoint: four frozen package installs, three complete test/typecheck targets, two SDK checks, two independent consumer builds, two browser suites, one matched-consumer run, one documentation audit, and one clean-context review. Reuse existing executable verification instead of creating another abstraction. No performance claim is made.

## Scope and evidence

Checkout: `89e062561b684b61ee6e6ac1a7f2584206b5cd0a`. Assigned task BBP-58 has seven done blockers and no attachments. Thread `bbthread://thr_225xuzb9vz` remains attached. Private evidence is `/Users/koen/.bb/thread-storage/thr_225xuzb9vz/bbp58`.

Source tasks are delivery 6 of `openspec/changes/task-markdown-preview/tasks.md`. Delivery 2's historical comment-card criteria conflict with the current comment-free product. The operator-approved replacement is recorded in BBP-54 and `bb-plugin-tasks-plus/COMMENT-REMOVAL-UPGRADE.md`. Verify migrated task files and preserved title/description/editor state. Do not restore comments or mark historical comment behavior implemented.

The full-feature review baseline is `f80724cec1d7ee6698557466227b1afefde073f5`, immediately before the first merged attachment/shared-renderer implementation. Review shared Markdown, real Reader integration, Tasks attachment routes/owner/dialog/state integration, related tests, packaging, CI, and documentation. Later unrelated task-list and provider changes are outside the feature review.

## State ledger

| Resource                     | Original state                                                              | Run changes                                                  | Final requirement                     |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------- |
| Installed Tasks Plus         | Path source in `/Users/koen/workspace/bb-plugins/bb-plugin-tasks-plus`      | None                                                         | Source and enabled state unchanged    |
| Installed Markdown Reader    | Path source in `/Users/koen/workspace/bb-plugins/bb-plugin-markdown-reader` | None                                                         | Source and enabled state unchanged    |
| Live Tasks data              | Existing user records                                                       | None except assigned-task reporting and evidence attachments | No owned behavioral test records      |
| Preferences                  | Existing user selections                                                    | None                                                         | Unchanged                             |
| Local dependencies/artifacts | Development checkout                                                        | Frozen dependencies, shared dist                             | Retained development output           |
| Browser fixtures             | No owned listener                                                           | Owned temporary fixture processes and browser contexts       | Teardown confirmed; evidence retained |
| Historical BBP-53 evidence   | Existing tracked captures                                                   | No changes permitted                                         | SHA-256 manifest unchanged            |
| Clean builds                 | Absent private directories                                                  | Isolated copies and private build-data directories           | Retained as evidence, never activated |

Prove It Works shaped the decision to inspect real production-consumer fixtures and packaged artifacts, not infer acceptance from unit tests. Live behavior cannot pass from fixture results.
