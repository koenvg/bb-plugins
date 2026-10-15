# BBP-54 local validation

## Result and scope

The approved replacement scope verifies migrated attachments as task files without restoring comments. Local package and browser checks pass. Independent completion review approved this scope with no actionable findings. See [the review record](review.md).

The operator approved this scope in [the linked work thread](bbthread://thr_e2sxa7qbsd). BBP-54 now records the replacement acceptance criteria. BBP-53 was verified done before work began. The thread remains attached.

Baseline: `bcb820299420ae08ab56a0ebb11e57dfd460423c`. The working-tree diff contains tests, fixture wiring, and operating documentation. No production plugin code, ownership model, migration, or installed plugin changed.

Historical OpenSpec delivery 2 still describes removed comment cards. Its checkboxes remain unchecked, not falsely marked implemented. The current BBP-54 criteria supersede that delivery for this task. Other Markdown deliveries remain outside this scope.

## Demonstrated behavior

- Four Markdown filename variants with generic MIME survive migration 12. The saved ID, filename, task ownership, metadata, blob location, exact preview text, and original download bytes remain intact. Source includes BOM, CRLF, frontmatter, blank lines, tabs, and trailing spaces. The current schema has no comment table or attachment comment owner.
- The registered saved-ID preview and download routes work against a disposable legacy database and real blob bytes through the SDK test host. The preview route retains local-auth registration. This harness proof is not a fresh real-host authentication test.
- The existing card and dialog retain filename eligibility, image priority, non-Markdown downloads, bounded errors, Retry, exact Raw, and the original Download identity. Staged Markdown stays outside saved-ID preview scope until successful task creation and upload.
- Late retry results cannot replace a newer document or take its focus. Existing lifecycle cases still cover close, replacement, task changes, unmount, confirmed absence, removal, and connected or fallback focus.
- Full-app tests preserve title and description edits, editor DOM identity, task selection, scroll, status, and priority through open, Preview, Raw, Close, and Escape. Normal autosaves remain allowed, and continued editing after dismissal reaches the save boundary.
- Full-app asynchronous removal checks exercise the real confirmation and delete RPC callback. Successful removal closes a concurrently opened preview and rejects its late response. Failure reports its error and leaves the file usable.
- Browser actions at 1280 px and 390 px cover the production card and dialog, modal keyboard focus, shortcut isolation, exact Raw, Retry recovery, Download, Close, Escape, and fallback focus. A synthetic task input is not proof of the real editor. The full-app integration tests provide that separate evidence.

## Checks

Evidence root: `/Users/koen/.bb/thread-storage/thr_e2sxa7qbsd/bbp54`.

| Check                                                    | Result                                                     | Evidence                                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Frozen dependency setup and shared build                 | Passed                                                     | `install-markdown.log`, `build-markdown.log`, `install-quota.log`, `install-tasks.log` |
| Shared document tests and typecheck                      | Passed, 4 tests                                            | `shared-tests.log`, `shared-typecheck.log`, `shared-exits.txt`                         |
| Final full Tasks tests                                   | Passed, 1,310 tests in 124 files                           | `final-test.log`, exit 0                                                               |
| Final Tasks typecheck                                    | Passed, pinned TypeScript 7.0.2                            | `final-typecheck.log`, exit 0                                                          |
| Final Tasks lint                                         | Passed with existing warnings outside this diff            | `final-lint.log`, exit 0                                                               |
| Final Tasks format check                                 | Passed                                                     | `final-format-check.log`, exit 0                                                       |
| Final SDK declaration check                              | Passed, package and host pin 0.6.37                        | `final-sdk-types.log`, exit 0                                                          |
| Final plugin build                                       | Passed with local BB CLI 0.46.0 and disposable BB_DATA_DIR | `final-build.log`, exit 0                                                              |
| Final protected browser suite                            | Passed, 11 checks                                          | `browser-http/browser.log`, exit 0                                                     |
| Historical BBP-53 evidence                               | Passed, all 71 hashes unchanged                            | `browser-http/historical-compare.exit`, exit 0                                         |
| Fixture teardown                                         | Passed, no listener on port 4193                           | `browser-http/port-after.txt`, empty; lsof exit 1 means no match                       |
| Independent completion review                            | Passed, no actionable findings                             | [Fresh routine review](review.md), fixed-point working-tree scope                      |
| Hosted clean-checkout CI                                 | Not run                                                    | No CI run is claimed                                                                   |
| Installed activation and live records                    | Not run, separate approval required                        | No installed source or enabled state was changed                                       |
| Dark and custom-token visual parity with the file reader | Not run                                                    | Broader Markdown presentation and assembled acceptance remain separate deliveries      |

The parent inspected [the desktop Raw overlay](file:///Users/koen/.bb/thread-storage/thr_e2sxa7qbsd/bbp54/browser-http/overlay-1280.jpeg) and [the compact Raw overlay](file:///Users/koen/.bb/thread-storage/thr_e2sxa7qbsd/bbp54/browser-http/overlay-390.jpeg), extracted from the successful action traces. Controls fit within each viewport. Full traces retain the Preview, Raw, keyboard, and dismissal actions.

## Download fixture and resolved failures

The browser Download check uses a real local Vite HTTP response with fixed synthetic data. It does not contact the installed Tasks server. It checks the production link click, exact saved-ID URL, suggested filename, successful completion, and saved bytes. A separate HTTP case rejects missing, unknown, and duplicate IDs.

A throwaway [browser probe](file:///Users/koen/.bb/thread-storage/thr_e2sxa7qbsd/bbp54/download-probe.cjs) established that the pinned Chromium bypasses both page and context request interception for download links. The initial intercepted-download tests failed. The fixture now serves the response through local HTTP instead. No production workaround was added, and no assertion was removed to accept a failed download.

The first browser run also found that the status region contains the message and Retry button. The exact-message assertion now selects its paragraph. Earlier failing runs remain in `browser.log`, `browser-final.log`, and `browser-complete.log`. Worker test-construction and formatting failures remain in the worker logs. Final checks supersede those attempts without deleting their evidence.

The Chromium download exceeded two bounded setup attempts. A longer setup attempt completed with exit 0. This was test-environment setup, not an observed application defect.

## Reproduce the browser proof

From the repository root, after the documented frozen setup, use a new private output directory and require port 4193 to be free:

```sh
BBP53_CAPTURE_PHASE=none bun run --cwd bb-plugin-tasks-plus test:browser \
  --config "$PWD/.pi/skills/verify-bb-plugins/references/tasks-playwright.config.ts" \
  --trace on --output /absolute/new/private/tasks-browser
```

The [Tasks verification recipe](../../.pi/skills/verify-bb-plugins/features/tasks-plus.md) defines the prerequisite checks and historical capture protection. Never reuse an existing listener or overwrite BBP-53 captures.

## State and limits

Only disposable SDK databases and blob files were used for behavioral checks. No live verification records were created. The assigned BBP-54 title, description, and status were updated as authorized. Installed plugin source, enabled state, unrelated task data, and task-to-thread links were not changed. Dependency directories, browser binaries, built local artifacts, and private evidence remain as local development outputs.

No substantial cleanup defect was observed. The obsolete comment-card task scope was corrected in existing BBP-54 rather than filed as duplicate work.

The Model the Domain principle kept the existing task-only Attachment and PreviewState shapes. Test Behavior, Not Implementation required exact route output, download bytes, retained edits, and real browser actions. Prove It Works required separate package, browser, build, and installed-evidence results.
