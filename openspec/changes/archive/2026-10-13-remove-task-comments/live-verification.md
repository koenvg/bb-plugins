# Live BB verification

Operator approved a separate temporary plugin, disposable task/thread fixtures and a dedicated browser. No production upgrade was authorized or performed.

## Isolation and build

The tested copy used plugin ID `rtc-comments-check`, CLI root `rtc-tasks`, skill folder `rtc-tasks` and distinct UI labels/directive/mention IDs. These namespace changes prevented collisions with the running Tasks plugin. Runtime logic came from the reviewed worktree. Artifact hashes and the namespace-change manifest are in [identities.json](/Users/koen/.bb/thread-storage/thr_bcqrkzfw84/remove-task-comments-live/identities.json).

The copy was built with `bb plugin build`, then installed with `bb plugin install path:<owned-copy> --yes --json`. Its SDK 0.6.37 bundle was accepted by the live host. Handler statistics showed zero errors after the checks.

Owned resources:

- Tracker `RTC`, two tasks `RTC-1` and `RTC-2` in the test plugin's database.
- BB project `proj_bqydj89dwy`, rooted in the disposable copied package, not the working source or production checkout.
- Worker `thr_v9pk88yhw2`, created through the real task dispatch command using the `RTC verification only` preset.
- Separate Chrome for Testing profile and named Browser Use daemon `rtc-check-bcqrkzfw84`; two recorded task-owned tabs.

## Results

| Check | Observed result |
| --- | --- |
| Native Ticket | Selected `RTC-1`; title and rich description edits saved through the real controls and matched CLI reads. No Activity section or composer. |
| Standalone detail | Opened with the native Ticket action. Saved title, description and task file remained. Confirmed file removal through its confirmation dialog without changing the edits. |
| Native reopen | Returned to the list and reopened Ticket. Saved title/description remained on `RTC-1`; `RTC-2` retained its separate state. |
| Keyboard help | The real help dialog listed retained shortcuts, including dispatch. No comment action. `m` left row focus unchanged. |
| Files | Uploaded a 29-byte owned file through the CLI; the displayed download URL returned its exact bytes. UI removal deleted its attachment record. |
| Delegation | Real dispatch created the owned worker and moved `RTC-2` to `in_progress`. The worker returned `RTC FIXTURE ACK` and reported that it changed no task data. Its log contained no tool executions. |
| Thread-side Task | Selected the test plugin's Task tab. It displayed `RTC-2`, its description, controls and retained worker association, without Activity or a composer. |
| Thread/review state | Native thread API and log showed idle/completed. The Task panel showed Idle. Moving the task to `in_review` kept the same idle worker link and did not resume it. |
| Unavailable RPC | `createComment` returned HTTP 404 with `unknown_method`. |
| Legacy owner | An authenticated upload with `commentId` returned HTTP 400, `comment ownership is unavailable`, without creating a file. |
| No input delivery | The worker event count remained 24 after unavailable-operation checks. |
| Active storage | SQLite integrity returned `ok`; foreign-key check was empty. No comment table or attachment `comment_id` column remained. |
| Installed guidance | Audited the actual host-generated `rtc-tasks` skill and references. No comment, activity or notification procedure remained. Its report-back instructions used linked work threads and preserved status/review gates. |

The installed skill SHA-256 was `c788abc7aa5658878c5a78638d38527ad164cd2aaa8abe7be99117d2dbaaf6ef`. A [copy of the installed skill](/Users/koen/.bb/thread-storage/thr_bcqrkzfw84/remove-task-comments-live/installed-guidance/SKILL.md) and its references were retained before uninstall.

## Evidence and limits

- [Native Ticket reopened](/Users/koen/.bb/thread-storage/thr_bcqrkzfw84/remove-task-comments-live/native-ticket-reopened.png)
- [Standalone detail](/Users/koen/.bb/thread-storage/thr_bcqrkzfw84/remove-task-comments-live/standalone-detail.png)
- [Keyboard help](/Users/koen/.bb/thread-storage/thr_bcqrkzfw84/remove-task-comments-live/keyboard-help.png)
- [Thread-side Task in review](/Users/koen/.bb/thread-storage/thr_bcqrkzfw84/remove-task-comments-live/thread-side-task-review.png)
- [Retained worker link after review](/Users/koen/.bb/thread-storage/thr_bcqrkzfw84/remove-task-comments-live/rtc-retained-links-after-review.json)
- [Native worker state](/Users/koen/.bb/thread-storage/thr_bcqrkzfw84/remove-task-comments-live/worker-before-cleanup.json)
- [Worker output](/Users/koen/.bb/thread-storage/thr_bcqrkzfw84/remove-task-comments-live/rtc-fixture-worker-output.json)
- [Worker event types/sequences](/Users/koen/.bb/thread-storage/thr_bcqrkzfw84/remove-task-comments-live/rtc-fixture-worker-events-final.json)

The default Chrome shortcut was broken. An existing local Chrome for Testing executable was used with an owned profile; the shared shortcut and shared browser daemon were not repaired or restarted. The initially hidden owned tab delayed interaction/rendering. Activating that owned tab resolved the delay.

The core chat timeline still displayed `Working...` while the authoritative native API/log and the Tasks panel showed idle. This host display inconsistency was not changed or treated as a Task state transition. No core chat fix is part of this change.

These checks used a namespaced copy, not the production namespace. They do not prove a particular production backup is recoverable. Failed-save, ownership-race, compact-layout and malformed-data cases remain covered by automated tests rather than an exhaustive live browser matrix. No historical production database was migrated during the live loop.

## Cleanup

Before deletion, verified that the fixture project contained only the one owned idle worker, the test database contained only the two owned tasks and tracker, and no attachment remained. Saved evidence first.

Closed only the two recorded tabs, disabled and uninstalled `rtc-comments-check`, deleted the owned BB project/worker, stopped only the named daemon and owned browser PID, and removed the owned temporary package/profile and test plugin data directory.

Post-cleanup checks confirmed that the test plugin and project were absent and the named daemon was stopped. Production `tasks-plus` retained its original source, version, enabled state and app bundle hash. Its database and workers were not targeted. Production deployment still requires explicit approval and the [consistent backup/rollback procedure](../../../../bb-plugin-tasks-plus/COMMENT-REMOVAL-UPGRADE.md).
