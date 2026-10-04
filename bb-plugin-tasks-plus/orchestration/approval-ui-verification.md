# Readable approval form verification (BBP-86)

## Scope and boundary

This UI slice starts at cumulative BBP-36 baseline `1eee962a6a095ec7d30080c9823f28f00b5162a3`. It changes Tasks-owned approval rendering and display-only labels. It does not change run payloads, source guards, fingerprints, dispatch/claim/report APIs, migration versions, provider settings or permissions. BBP-42 must integrate and validate the combined approval surface before epic acceptance.

All previews use disposable in-memory task/thread responses through the SDK app harness. Generated markup uses the package's built scoped CSS in a dedicated unsigned Chromium profile. The pages contain no executing approval handlers or BB connection. They are visual evidence, not an installed native interaction or picker-click check. The live reporting fixture `thr_v2smpavigx` / `pint_gcxsjmp9rf` was not used, messaged, submitted, installed over or reloaded.

## Checks

- Red-first UI regression: `/tmp/bbp86-ui-red.log`.
- Early baseline/candidate previews at desktop and 320-pixel viewport widths were inspected and attached to BBP-86 before the full matrix.
- Corrected final previews cover complete begin, resume, missing parameters and 100 selected tasks with long labels. At 1024×900 and 320×812 there is no page-wide horizontal overflow; approval and cancel stay visible outside technical details.
- Native browser keyboard input focuses the details summary, expands it with Enter, reaches editable JSON and both approval/cancel buttons with Tab, with visible focus. Complete scope text and bound proposal remain accessible in separate scrollable blocks.
- Public renderer tests check exact proposal submission, changed-parameter invalidation, validation errors, cancellation, missing parameters, action labels, permission warnings, escaped labels, expansion, empty/long values, bounded read-only lookups and unavailable/changed/foreign display metadata. Task names require matching identity, membership and bound fingerprint; coordinator names require matching thread/project identity. Failures fall back to exact IDs without changing approval readiness or server authority checks.
- Focused run/form/workflow/migration checks: 61 tests across 5 files. Full package checks: 706 tests across 68 files. Typecheck, lint, build and diff-check passed. Five lint warnings remain in unchanged files.

Post-fix logs are `/tmp/bbp86-{focused,full,typecheck,lint,build,diff-check}-post-review.log`. Corrected preview measurements are `/tmp/bbp86-browser-checks-corrected.json`; paint-settled screenshots are `/tmp/bbp86-corrected-final-*.png`. The original pre-review captures and logs remain separate historical evidence. Durable task attachments preserve both sets, the offline harness, the single completion review and cleanup evidence.

## Preview tool limits

The single fresh-context review found one P2 blocker: duplicated tracker fingerprint fields. `run-scope-fields.ts` now owns the unchanged ordered projection. The server keeps Node hashing and the renderer keeps WebCrypto; the browser bundle contains no Node crypto, SQLite or Node filesystem import. Added public RPC-to-renderer tests use a real preview with non-empty Unicode/linked-reference descriptions, reject changed descriptions and foreign task/coordinator identities, preserve exact submission, and cover a late failed lookup after proposal replacement. All post-fix checks passed. No second review was run.

The reviewer also reported a mismatch between two initial screenshots and their geometry-only measurements. Those measurements do not prove painted visibility. Corrected captures wait for two animation frames, use viewport-only capture (`captureBeyondViewport: false`), and check visibility, opacity and button-center hit testing. Two-frame waiting alone did not remove the expanded-view discrepancy; the viewport-only capture did. The new long-data, expanded-details and keyboard-focus screenshots were inspected; approval/cancel are visible. Missing-parameter approval is visibly disabled and intentionally does not receive pointer events. The initial files were retained, not replaced. This improves evidence; it does not establish the cause of the original mismatch.

Browser-use first failed to discover a default browser, so the preview used the existing dedicated Chrome-for-Testing binary and isolated profile. Later CLI reconnect attempts failed with `No local browser path found` and `Session 'bbp86-preview' is already running with different config`. Final measurements and screenshots used direct CDP on the same isolated localhost browser, restricted to its one preview target. Incorrect initial probe assumptions (warning text and Enter key character data) were corrected without changing product code. No installed verification is claimed.
