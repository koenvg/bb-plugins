# Tasks

A completed planning artifact is not a passed installed check. The former usage plugin's scaffold, SQLite probe, and failed bridge-file check do not pass any of these new quota tasks. Keep the built-in Provider usage plugin disabled throughout installed acceptance. If host Pi authentication or the private quota response cannot be verified, record the exact non-sensitive blocker and leave dependent tasks unchecked.

## 1. New plugin and account feasibility

- [x] 1.1 Scaffold `bb-plugin-codex-quota` with BB server, host, app, types, and a minimal host RPC. Verify package tests, typecheck, `bb plugin types`, and `bb plugin build` against installed BB 0.43.4 / SDK 0.5.9 without using the deleted usage plugin.
- [x] 1.2 On the selected enrolled host, prove that the plugin host worker can use Pi's public `ModelRuntime` to check/refresh `openai-codex` OAuth and obtain a recognized Codex quota response. Verify a real installed host RPC round trip with Provider usage disabled, using fixed diagnostics and no token, claim ID, header, or raw response in logs/RPC. If it fails, leave this task and dependent work unchecked and record the blocker; do not send a Pi model turn.

## 2. Host-owned quota snapshot

- [x] 2.1 Implement a bounded quota GET and strict normalizer for general and separate additional windows, valid used/remaining percentages, absolute/relative reset times, optional plan, and integer banked-reset count. Verify tests for 0% and 100% used, conflicting windows, tied binding windows, invalid and missing fields, absent versus zero reset count, malformed or oversized responses, and safe request failures.
- [x] 2.2 Implement a host-worker-memory cache scoped to the active Pi account with request coalescing, account-change invalidation, a result-time identity/fingerprint recheck, a five-minute fresh limit, stale-on-error status, and a 24-hour maximum age. Verify fake-host tests with a delayed response after an account switch, an uncheckable identity, reload, simultaneous badge/dashboard calls, offline host, the five-minute boundary without a failed refresh, 24-hour expiry, and absence of credentials or raw responses in plugin state, logs, and RPC.
- [x] 2.3 Document Pi sign-in, quota-only scope, snapshot age, banked-reset uncertainty, private-upstream compatibility risk, and the absence of transcript/history reading in the plugin README. Verify the documented build and test commands.

## 3. BB sidebar and dashboard

- [x] 3.1 Validate explicit enrolled-host selection, bind each request to its selection generation, and recheck that selection after host RPC returns before publishing only bounded normalized quota/status results. Verify tests with a delayed response after host switch, unselected or foreign host rejection, and no call to `system.usageLimits` or the Provider usage plugin.
- [x] 3.2 Add the Codex Quota dashboard with general and additional allowance windows, per-window reset time or unknown, binding remaining percentage, observation/stale status, banked-reset count or unknown, and the fixed official Codex Usage link. Verify UI tests for missing data, 0% remaining, 100% remaining, unavailable authentication, link reachability, and no in-plugin redemption or token/cost claims.
- [x] 3.3 Add a presentational sidebar badge sharing the dashboard's host and snapshot, with a visible short remaining-percentage text and accessible scope/window/time labels. Use one concise dashboard observation line and no loading spinner; never present a loading badge as fresh. Verify ties, missing selection, stale and offline states, five-minute freshness transition in both badge and dashboard without a refresh error, keyboard/mouse navigation, shared refresh deduplication, timer cleanup, and compact dashboard access in UI tests and a narrow preview.

## 4. Installed acceptance

- [x] 4.1 Run package tests, typecheck, public-SDK-only check, and `bb plugin build` after the UI is complete; record results and verify there are no bridge-file, collector, transcript, `system.usageLimits`, or built-in Provider usage dependencies.
- [x] 4.2 With Provider usage disabled, install the new plugin on BB 0.43.4 and observe one real authenticated selected-host quota snapshot in the sidebar and dashboard. Check correct remaining-window math, reset time or unknown, banked count or unknown, official link, compact navigation, refresh/stale behavior, and clean disable/reload. Record sanitized evidence and versions. A failed or unavailable real observation leaves acceptance unchecked.
