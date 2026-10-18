# BBP-233 verification

Markdown Reader's SDK import audit now excludes violations under only the package-root `playwright-report/` and `test-results/` directories. The package retains its SDK allowlist, narrow fixture exceptions and manifest private-dependency check. No production plugin code changed.

## Reproduction

The clean baseline passed all 235 unit tests and typecheck. With an owned Playwright HTML report under the package root, the same unit command failed on exactly two generated trace modules:

```text
playwright-report/html/trace/assets/defaultSettingsView-D-g2vrvf.js
playwright-report/html/trace/uiMode.CYwC_gH1.js
reason: dynamic-specifier
Test Files  1 failed | 10 passed (11)
Tests  1 failed | 234 passed (235)
```

The committed regression also failed before the fix:

```text
AssertionError: expected [ { file: 'app.tsx', …(2) }, …(35) ] to have a length of 30 but got 36
```

After the fix, the generated report remained in place. The regression checks that private imports, outside-package relative imports and non-literal dynamic imports still produce the exact expected violations in entry points, test fixtures, nested same-name directories, lookalike directory names and root lookalike filenames. A declared private dependency also remains reported.

## Checks

Commands ran from the repository root with Bun 1.4.3 and Node v24.15.0. `E` was `/Users/koen/.bb/thread-storage/thr_gt7dvj45p5/bbp-233-evidence`.

| Command                                                                        | Result             | Evidence under E                                                                           |
| ------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------ |
| `bun install --cwd packages/markdown-document --frozen-lockfile`               | Exit 0             | `shared-install.log`                                                                       |
| `bun run --cwd packages/markdown-document build`                               | Exit 0             | `shared-build.log`                                                                         |
| `bun run --cwd packages/markdown-document test --maxWorkers=1`                 | Exit 0             | `shared-tests.log`                                                                         |
| `bun run --cwd packages/markdown-document typecheck`                           | Exit 0             | `shared-typecheck.log`                                                                     |
| `bun install --cwd bb-plugin-markdown-reader --frozen-lockfile`                | Exit 0             | `install.log`                                                                              |
| `bun run --cwd bb-plugin-markdown-reader test` before browser checks           | Exit 0, 236 passed | `pre-browser-tests.log`                                                                    |
| `bun run --cwd bb-plugin-markdown-reader typecheck`                            | Exit 0             | `typecheck.log`                                                                            |
| `bun run lint bb-plugin-markdown-reader`                                       | Exit 0             | `lint.log`                                                                                 |
| `bun run format:check bb-plugin-markdown-reader/tests/server.test.ts`          | Exit 0             | `format.log`                                                                               |
| `.pi/skills/verify-bb-plugins/scripts/browser.sh markdown-reader "$E/browser"` | Exit 0, 71 passed  | `browser/command.log`, `browser/results.json`, `browser/html/index.html`, `browser/tests/` |
| `bun run --cwd bb-plugin-markdown-reader test` after browser checks            | Exit 0, 236 passed | `post-browser-tests.log`                                                                   |
| `git diff --check`                                                             | Exit 0             | Checked before review and publication                                                      |

The full isolated browser suite also passed all 71 tests before the fix. Both suites used the existing owned loopback runner, fresh contexts and unchanged assertions. They exercised local fixtures, not an installed BB plugin. The final suite retained all traces and success screenshots.

## Evidence and limits

- The first reader checks ran before the shared package dependencies were installed. Their dependency-resolution failures remain in `baseline-tests.log` and `baseline-typecheck.log`. Documented shared setup resolved them without source changes. The subsequent clean baseline passed.
- The deliberate package-local report-generation run passed 68 browser cases and failed 3. Its log records Vite page reloads from generated HTML and one destroyed execution context. No browser assertion changed. The isolated-output baseline and final full runs each passed 71 cases. The original package-local report and its failures remain preserved.
- The formatter excludes `.pi/**` by repository configuration. An explicit guide-format command returned exit 2 because it matched no eligible file. The changed guide was inspected directly; the source formatting check passed.
- The original audit failure is in `repro-tests.log`. The failing regression is in `regression-red.log`. Task attachments preserve the historical report and failure separately.
- The final fixture listener at port 59187 and temporary parent `bb-browser-fixture-9pknwU` were absent after exit. The isolated baseline listener at port 58464 and temporary parent `bb-browser-fixture-hw70hA` were also absent. The original reproduction listener at port 57333 and its temporary parent `bb-browser-fixture-oh4vEL` were absent. Evidence files remain.
- Installed acceptance, plugin build/activation, production access, settings changes, merge and deployment were not run. This change is confined to test auditing and its documentation.

Source thread [thr_gt7dvj45p5](bbthread://thr_gt7dvj45p5). Raw evidence remains in that thread's private storage and the task's verification attachments.
