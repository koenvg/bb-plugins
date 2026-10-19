# BBP-250 timeline observer teardown

## Result

Unmount the timeline before restoring its observer globals. The source change adds `cleanup()` at the start of the nested `afterEach` in `bb-plugin-github-insight/ui/timeline.test.tsx`.

The controlled full-suite reproduction failed before that change and passed after it. Five consecutive parent-run full suites passed on the final source, each with 99 files and 1645 tests. Production code, Vitest configuration, and all comment visibility and glow assertions are unchanged.

## Identity and scope

- Baseline commit: `c904a7344ea639ef2a2dcb80ab0431006affa2f5`.
- Task: BBP-250. Source incident: BBP-238.
- Work thread: `bbthread://thr_zk3v4xmsz3`.
- Runtime: Bun 1.4.3 and Node v24.15.0, with frozen package dependencies.
- Package: `bb-plugin-github-insight`, including its shared review UI tests.
- Private logs: `/Users/koen/.bb/thread-storage/thr_zk3v4xmsz3/evidence-bbp-250`.

This verifies the test-lifetime correction, not installed plugin acceptance. No plugin was built, installed, activated, or deployed. No settings, production data, credentials, or secrets were accessed or changed. The only external work records are the assigned task and its PR.

## Cause

The timeline RPC resolves asynchronously. The test's DOM-based `loaded(slot)` wait can return after React commits the comment cards but before passive effects mount the observer.

Runtime logging confirmed that Vitest executes the nested `afterEach` before the file-level cleanup. The nested hook removed `IntersectionObserver`. The later cleanup unmounted the React root inside `act`, which flushed the pending passive mount effect. That effect tried to construct the removed observer.

An ordinary baseline run passed. A controlled React Scheduler run held the first glow test after its DOM commit and before its passive effect. The full suite then failed in the same test, at the same observer constructor and with the same passive-mount stack as BBP-238. Adding only the early `cleanup()` made that controlled full-suite run pass.

The historical incident has no scheduling trace. This establishes a sufficient failure mechanism in the baseline, not the precise historical interleaving. No cross-file global mutation was needed.

## Controlled full-suite evidence

Before the fix, exit 1, from `writer-full-controlled-before-1.log`:

```text
BBP250 held after paint new conversation comments > glows only the new comment 3
BBP250 glow body end 0
BBP250 inner teardown new conversation comments > glows only the new comment 0
BBP250 outer cleanup start new conversation comments > glows only the new comment undefined
FAIL  ui/timeline.test.tsx > new conversation comments > glows only the new comment
ReferenceError: IntersectionObserver is not defined
 Test Files  1 failed | 98 passed (99)
      Tests  1 failed | 1644 passed (1645)
```

After the fix, exit 0, from `writer-full-controlled-after-1.log`:

```text
BBP250 held after paint new conversation comments > glows only the new comment 3
BBP250 glow body end 0
BBP250 observe 3 new conversation comments > glows only the new comment
BBP250 inner teardown new conversation comments > glows only the new comment 1
BBP250 outer cleanup start new conversation comments > glows only the new comment undefined
BBP250 outer cleanup end new conversation comments > glows only the new comment
 Test Files  99 passed (99)
      Tests  1645 passed (1645)
```

## Repeat the diagnostic

Use a disposable checkout at the baseline commit. Do not apply the diagnostic to an active worktree. The retained [controlled schedule patch](controlled-schedule.patch) changes test scheduling and adds logs. It is evidence tooling, not part of the normal test execution.

1. Install the sibling and package dependencies from their lockfiles:

   ```sh
   bun install --cwd bb-plugin-pr-thread-list --frozen-lockfile
   bun install --cwd bb-plugin-github-insight --frozen-lockfile
   ```

2. Apply `controlled-schedule.patch` from this directory to that baseline checkout with `git apply`.
3. Run `bun run --cwd bb-plugin-github-insight test --silent=false --reporter=verbose`. Expect the observer ReferenceError and only the first glow test to fail.
4. Add `cleanup();` first in the nested `afterEach` for `new conversation comments`, before its diagnostic log and `vi.unstubAllGlobals()`.
5. Repeat the full-suite command. Expect 99 files and 1645 tests to pass, with observer registration before global restoration.

The trigger wraps Scheduler entry points before React DOM loads. Only the first glow test selects the controlled Scheduler. It advances until the event DOM exists and holds passive effects until unmount. Other tests use the original Scheduler.

No permanent Scheduler mock or new product test was added. Existing tests remain the behavior checks. The diagnostic supplies deterministic regression evidence without changing their normal execution. A separate failing-test commit was not used because the reproduction is full-suite scheduling instrumentation, not a small permanent test.

## Final-source checks

| Check                                                                | Observed result                             | Evidence                                        |
| -------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Five sequential `bun run --cwd bb-plugin-github-insight test` runs   | Each exit 0, 99 files and 1645 tests passed | `parent-full-1.log` through `parent-full-5.log` |
| `bun run --cwd bb-plugin-github-insight typecheck`                   | Exit 0                                      | `parent-typecheck.log`                          |
| `bun run lint bb-plugin-github-insight/ui/timeline.test.tsx`         | Exit 0                                      | `parent-lint.log`                               |
| `bun run format:check bb-plugin-github-insight/ui/timeline.test.tsx` | Exit 0                                      | `parent-format.log`                             |
| `git diff --check`                                                   | Exit 0                                      | Parent command output                           |
| Worker targeted timeline and visibility-hook suite                   | Exit 0, 32 tests passed                     | `writer-targeted-final.log`                     |

The staged whitespace check covers the source and this report. The saved unified diff contains required single-space context rows for blank lines. Git's blanket staged whitespace check flags those patch-content rows, so that check excludes only `controlled-schedule.patch`. The diagnostic remains byte-identical to the reviewed evidence.

Independent completion review and remote CI are reported separately in the PR. Cursor-only control, deslop, and loop commands were unavailable. Verification used the actual Vitest CLI and direct diff inspection. Manual-only how and why workflows were not invoked.

## State and cleanup

Temporary Scheduler instrumentation and diagnostic logging were removed from the executable test source. The diagnostic patch remains only in this verification directory. No test assertions were removed or weakened. No persistent test records, background servers, browser contexts, or plugin activation changes were created. The task branch and evidence are intentionally retained for review.

No additional actionable cleanup was found in the edited code.
