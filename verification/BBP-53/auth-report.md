# BBP-53 real-host authentication check

## Result

Passed. After explicit user approval, the parent temporarily loaded this checkout's Tasks plugin, ran nine read-only HTTP probes against the current BB instance, and restored the original source. No uninstall, enabled-state change, settings change, or live test record ran. This report supersedes the authentication blocker in the earlier parent-report.md snapshot. Hosted CI remains unrun, so BBP-53 stays in_review with 10 of 11 delivery gates complete.

## Exact runtime identity

The temporary Tasks source was this worktree's bb-plugin-tasks-plus package. Runtime status was running, enabled was true, SDK was 0.6.37, and the frontend generation was 0b55f2500507982a. Served app.js and app.css matched the checkout's SHA256 values exactly. The new preview route returned the expected structured handler responses and the exact previously attached BBP-53-validation.md source. The saved report had generic application/octet-stream metadata, a supported filename, and 3783 original bytes. No attachment was uploaded for the probes.

## Observed checks

| Check                                     | Expected                           | Observed                             | Result |
| ----------------------------------------- | ---------------------------------- | ------------------------------------ | ------ |
| Trusted local Host, missing saved ID      | Handler returns structured missing | HTTP 404, error.code missing         | Passed |
| Trusted local Origin, missing saved ID    | Handler returns structured missing | HTTP 404, error.code missing         | Passed |
| Untrusted Origin, no credentials          | Middleware rejects before handler  | HTTP 403, not a local BB app origin  | Passed |
| Opaque Origin, no credentials             | Middleware rejects before handler  | HTTP 403, not a local BB app origin  | Passed |
| Untrusted Host, no credentials            | Host policy rejects before handler | HTTP 403, forbidden_host             | Passed |
| Extra path parameter                      | Route rejects source input         | HTTP 400, error.code invalid-request | Passed |
| Existing saved Markdown validation report | Exact ID, filename, bytes, text    | HTTP 200, exact snapshot             | Passed |
| Served app bundle                         | Exact checkout SHA256              | HTTP 200, SHA256 match               | Passed |
| Served CSS bundle                         | Exact checkout SHA256              | HTTP 200, SHA256 match               | Passed |

The SDK local mode uses Origin and Host checks, not a per-plugin token. Trusted loopback requests without credentials are permitted by that contract. Denial observations above prove actual middleware behavior, not fake-host registration alone. No credentials or unrelated task content were read or retained. No browser was needed for these backend-only probes. Installed browser interaction and mobile keyboard behavior were not tested.

## Restoration

Before restoration, the parent checked that the source and enabled state still matched the temporary values. No concurrent change was present. The supported install command restored path:/Users/koen/workspace/bb-plugins/bb-plugin-tasks-plus without removal. The final plugin is enabled and running. Its frontend hash is 58a2aaed68425cbf, identical to the original hash. The task-thread link remains intact. The earlier validation attachment remains unchanged. No cleanup remains for this run.

## Evidence

Private, access-restricted evidence is in [the live-check directory](/Users/koen/.bb/thread-storage/thr_3r4ynw3avg/verification/BBP-53-auth-20261014-201510). It contains auth-probes.mjs, auth-results.json, probes.log, ledger.json, installation records, exact served bundle hashes, and original/final source and runtime observations. Probe exit code was 0, and activation/restoration commands exited 0.

Remaining gate 1.2 is hosted CI execution. The independent review findings are closed by parent inspection and rerun checks documented in parent-report.md and review-closure.md. No new reviewer approval or GitHub Actions pass is claimed.
