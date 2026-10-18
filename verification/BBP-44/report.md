# BBP-44 verification

## Scope and decision

Add commands for the open task's status, priority and labels, with shared task-session targeting and focus handling.
Nine task-detail commands are registered without default bindings. Only these three have handlers in this delivery.
Due date, linked BB project, dispatch, Previous, Next and Back remain unavailable for their later deliveries.
The six existing global commands, including Switch project, retain their IDs and behavior.

Write a comment was dropped, not deferred. Koen's approval in the [work thread](bbthread://thr_sjpzswhn4c) confirms that the existing [comment-free contract](../../bb-plugin-tasks-plus/COMMENT-REMOVAL-UPGRADE.md#pending-plans) governs the older plan.
The proposal, design, specification and task checklist now describe nine commands. No comments, editor or comment API was restored.

## Local results

Baseline was `e9afeecce2d0b4675f3879bd04d2a5cd40af30fa`. Checks ran with Node 24.15.0 and Bun 1.4.3.
Frozen installs completed for root tooling, shared Markdown, Quota fixture dependencies and Tasks Plus.

| Check                                                   | Result                                              |
| ------------------------------------------------------- | --------------------------------------------------- |
| Tasks Plus `bun run test --maxWorkers=2`                | 1475 tests passed in 130 files                      |
| Tasks Plus pinned TypeScript 7 typecheck                | Passed                                              |
| Tasks Plus lint and format checks                       | Passed                                              |
| Root formatting check                                   | Passed                                              |
| Official `bb plugin types bb-plugin-tasks-plus --check` | Passed                                              |
| Official `bb plugin build bb-plugin-tasks-plus`         | Passed with CLI 0.46.1 and disposable `BB_DATA_DIR` |
| Shared Markdown build, tests and typecheck              | Passed, 129 tests in 8 files                        |
| Full Tasks Plus browser suite                           | 34 passed, traces and screenshots retained          |
| OpenSpec strict validation                              | Passed                                              |
| Mechanical design detector                              | Passed, no findings                                 |
| Independent implementation review                       | [Approved, no findings](review.md)                  |

The new rendered-command tests first failed before implementation because the command registrations were absent.
Final coverage checks all nine stable IDs and no defaults, preserved global commands, absent follow-up handlers,
route/task identity, loading/error/missing/mismatched tasks, embedded views, hidden retained panels,
ambiguous visible sessions, palette inert/aria-hidden state, task switching, unmount/remount,
canceled deferred activations, keyboard choices, Escape return and blocked-work confirmation.

The browser fixture renders the production Tasks shell and controls through the SDK test runtime.
Only its RPC responses and host-style palette are fixtures. All mutations stay in fixture memory.
The two new browser tests use the keyboard at 1200px and 650px, save only the open fixture task,
check cancel without saving, confirm visible-control focus and return, change tasks and leave the task route.
The initial wide palette test exposed close-autofocus stealing focus. Two cancellable animation frames
separate activation from that handoff. Each execution rechecks the original session before opening a control.
The compact drawer required explicit keyboard focus on its first interactive control and focus restoration to its visible trigger.

## Reproduce

Follow [Development checks](../../bb-plugin-tasks-plus/README.md#development-checks) for frozen dependency setup.
From the repository root, run:

```sh
bun run --cwd bb-plugin-tasks-plus test --maxWorkers=2
bun run --cwd bb-plugin-tasks-plus typecheck
bun run --cwd bb-plugin-tasks-plus lint
bun run --cwd bb-plugin-tasks-plus format:check
BB_DATA_DIR="$(mktemp -d)" bb-plugin-tasks-plus/node_modules/.bin/bb plugin types bb-plugin-tasks-plus --check
BB_DATA_DIR="$(mktemp -d)" bb-plugin-tasks-plus/node_modules/.bin/bb plugin build bb-plugin-tasks-plus
EVIDENCE="$(mktemp -d)"
BBP53_CAPTURE_PHASE=none bun run --cwd bb-plugin-tasks-plus test:browser \
  --config "$PWD/.pi/skills/verify-bb-plugins/references/tasks-playwright.config.ts" \
  --trace on --output "$EVIDENCE/browser"
openspec validate task-detail-commands --strict
```

Port 4193 must be free. The runner refuses another listener. After verification, no listener remained on 4193.
Raw setup, red-test, intermediate failure, successful check, build and browser logs remain in the work thread's private `bbp44-evidence` directory.
The successful browser evidence is under `browser-final`, including each property menu screenshot and Playwright traces.

## Limits and safeguards

Installed-BB acceptance is blocked, not passed. Exact-source activation would require deployment or source/settings changes, which Koen prohibited.
Temporary personal-binding checks would change Settings, so they were not run. No production task was used for UI mutations.
The fixture demonstrates palette-close behavior under a simulated host focus handoff, not the installed host's timing.
Plugin reload coverage is a full rendered unmount/remount, not a live plugin reload.
No plugin was installed, enabled or reloaded. No merge, deployment, settings change, credential access or production-data mutation was performed for verification.
