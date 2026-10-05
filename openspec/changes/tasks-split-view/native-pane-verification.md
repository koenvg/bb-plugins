# Native Ticket pane correction

## Scope and ownership

The user clarified the layout after installing the original implementation: the
list belongs in BB's main Tasks area; the editable ticket belongs in BB's existing
right-hand pane. This correction starts at `fdfa39916cd8a5e80b7d71435abb552fa15fe244`.

The main list now opens a native **Ticket** fixed tab. There is no internal split
or 880px threshold. BB owns sizing, tabs, and compact drawer behavior. The existing
editor remains owned by the Tasks page through a stable portal, so host-tab
unmounts do not end its edit/session lifetime. A hidden/inert parking node preserves
its state; parked overlays close and cannot claim keyboard actions. Retention ends
when the Tasks page closes or the browser reloads, not when Ticket closes.

Guarded saves, committed-route selection, task-owned comments/files, remembered
scope, and settled list order retain their existing owners. Revealing Ticket on
request rather than save completion avoids overriding a later host-tab switch.
A pending context change reveals a parked origin for retryable errors. A declined
host open shows the same retained editor in a temporary recovery view, including
its actual error and Retry controls. Scroll restoration compensates
for Chrome clearing the native detail's offset when its DOM is parked.

No backend/API, schema, dependency, lockfile, or design-token changes are included.

## Validation before completion review

| Check                                                          | Result                                      |
| -------------------------------------------------------------- | ------------------------------------------- |
| `npm test -- --maxWorkers=1`                                   | 74 files, 747 tests passed                  |
| `npm run typecheck`                                            | Passed                                      |
| `npm run lint -- --threads=1`                                  | Passed; four existing warnings, zero errors |
| `npm run build`                                                | Passed                                      |
| `openspec validate tasks-split-view --strict --no-interactive` | Passed                                      |
| `git diff --check fdfa39916cd8a5e80b7d71435abb552fa15fe244`    | Passed                                      |

Native-slot tests use separately mounted public SDK page/tab surfaces. They cover
DOM placement, keyboard ownership, menu dismissal, failed saves after tab closure,
late-save tab switches, Tasks-page teardown, and declined host opens. Retained-view
tests cover editor identity, comment/file/notification ownership, pending writes,
list context, resize, focus, and detail-scroll restoration. Obsolete internal Back
and compact-layout expectations were replaced without removing their safety cases.

An Arc preview using real components and a simulated host passed eight interactive
checks: placement, hidden/inert parking, unrelated-tab keyboard ownership, editor
identity/draft retention, independent scroll restoration, close/select/reopen,
origin-draft return, and Escape focus return. Both scroll offsets survived (list
120px; detail 90px). This is fixture evidence, **not installed-host acceptance**.
The browser check caught a detail-scroll reset; its regression was red, then green.

## Review and installation status

The single fresh-context review returned three blocking findings: concurrent-outlet
ownership, delayed reveal after Retry, and inaccessible recovery after a declined
host open. The parent fixed all three and added four initially failing regressions.
The focused post-fix run passed 110 tests. No second review was run.

Installed at `/Users/koen/.bb/local-plugins/tasks-plus-native-a5c397775cb4`, with
212 source files verified and no dependency symlinks outside the snapshot.
Bundle `70cac470a8d1d290` is compatible with host SDK 0.5.29. Plugin and service are
running; the pre-existing handler error count remained 2. The prior source at
`/Users/koen/workspace/bb-plugins/bb-plugin-tasks-plus` is untouched for rollback.

Post-fix validation passed 751 tests in 74 files, typecheck, lint, build, strict
OpenSpec validation, and the baseline diff check. Twenty actual-host Arc checks
passed. They covered native placement, keyboard/focus, tab closure/switching,
unsent comment and scroll retention, standalone links, browser Back, refresh,
remembered scope, board reachability, desktop resizing, and phone drawer rendering.
The complete task JSON was unchanged by these checks.

One real-host checkpoint failed: crossing the desktop/phone breakpoint remounts
the whole Tasks page and loses unsent comments, though route selection survives.
This is an open acceptance defect, not a passing resize check. Normal native-tab
switches and desktop-only resizing passed. See the attached installation report
and responsive-remount bug report in the parent thread storage.
The responsive remount defect is tracked as BBP-50.
The user deferred that fix. It is not included in this change. Installation did
not push the branch or merge it into main.

Host acceptance items 6.2 and 6.3 remain open for the responsive remount defect and
remaining coverage. Dark/third-party themes, native desktop Browser/Terminal
execution, palette arbitration, thread-side embeds, and real send/upload/delegation
flows remain unverified. No theme changed or real comment/file/delegation action
was submitted as a test.

## Rebase validation

PR #67 was rebased onto `484cdd1b1dc608315490d686cf2019e04a863bae`.
The README keeps both sets of documentation. List rows retain main's thread and
PR summaries, wider dense-metadata breakpoint, and title minimum width alongside
compact title wrapping and coarse-pointer controls. Metadata uses the guarded
rendered task order and main's scope/filter refresh key.

Five upstream tests initially failed on old route assumptions. Their assertions
now use replacement browse selection routes and explicit All scope. No assertions
were removed. Final validation passed **933 tests in 84 files**, typecheck, lint,
build, strict OpenSpec validation, and diff checks. Lint retains four existing
warnings and no errors.

The single read-only rebase review approved the integration against `9ac0de87`,
with no blocking findings. Two later main commits only add specifications. The
final rebase preserved the reviewed and tested package tree exactly:
`52095ac2fb7e4f204fd4e96e5e0178e9fa5f7667`.

An Arc fixture with the current components verified bounded metadata at 1600,
1060, and 390px, compact title wrapping, and a 44px coarse priority control. This
is not installed-host acceptance. The rebased source was not reinstalled; the
20 installed-host checks above describe the earlier native-pane snapshot.
BBP-50 remains deferred and host-acceptance items 6.2 and 6.3 remain open.

## Evidence

Parent thread storage: `/Users/koen/.bb/thread-storage/thr_v9ni4kqgxa`.

- `bbp-8-native-validation.log`: complete verification output.
- `bbp-8-native-evidence/runtime-wide.png`: inspected Arc preview.
- `bbp-8-native-evidence/runtime-results.json`: eight fixture checkpoints.
- `bbp-8-native-evidence/check.mjs`: browser exercise script.
- `bbp-8-native-installation.md`: installed source, rollback, live results, and limits.
- `bbp-8-native-post-review-validation.log`: complete post-fix validation.
- `bbp-8-native-completion-review.md`: the single review and its findings.
- `bbp-8-native-evidence/live-checks.jsonl`: twenty passing checks and the breakpoint failure.
- `bbp-8-native-evidence/live-native-final-wide.png` and `live-native-phone.png`: installed host screenshots.
- `bbp-8-responsive-remount-bug.md`: BBP-50 reproduction and expected behavior.
- `bbp-8-rebase-validation.log`: full combined-source checks and final package-tree comparison.
- `bbp-8-rebase-review.md`: the one-pass integration approval and remaining limits.
- `bbp-8-rebase-evidence/`: layout screenshots, measured bounds, and fixture script.

The original [verification report](verification.md) and installation receipt are
historical evidence for the first layout, not acceptance of this correction.
