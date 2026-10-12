# Tasks

## 1. Shared rate-limit pause

- [x] 1.1 Add `github/rate-limit-pause.ts` with `createRateLimitPause()` (`isPaused`, `pausedUntil`, `pauseUntilReset`), and verify a unit test covers that a later pause is kept and an earlier one does not shorten it
- [x] 1.2 Make `createInsightService` take the pause object as a dependency instead of its own `pausedUntil`, wire one instance in `server.ts`, and verify the existing `pr-poller` rate-limit tests in `server.test.ts` still pass

## 2. Host reset-time call

- [x] 2.1 Add `readRateLimitReset` to the host contract in `contract.ts` and `host.ts`, reusing the existing `readRateLimitReset` helper, and verify a host test returns the reset time when GraphQL `remaining` is 0 and null otherwise

## 3. PR lookup cache

- [x] 3.1 Add the per-environment cache to `createPrLookup` with the TTLs from design.md (keep the raw host state on the entry; `PrTarget` does not change), using `Date.now` (tests fake `Date`), and verify `pr-lookup.test.ts` covers each TTL, that errors are not stored, and that `PrResolution` output is unchanged
- [x] 3.2 Add in-flight dedupe per environment and verify a test where two concurrent `resolveEnvironmentPr` calls make one `sdk.environments.pullRequest` call
- [x] 3.3 Add the `{ fresh: true }` option to `resolvePr` and `resolveEnvironmentPr` and verify tests where a fresh call skips a valid entry and replaces it, sees bb's answer from after a running lookup, and shares one call with other fresh calls
- [x] 3.4 Pass `fresh` from `refresh`, `refreshAfterWrite`, and both lookups in `refreshOnIdle` in `insight-service.ts`, and verify the `refresh on idle` test "agent opens a PR" finds the new PR within the 10-second retry while a `no_pr` result is cached
- [x] 3.5 Update `server.test.ts` tests that change the linked PR between polls so they advance time past the TTL or use a fresh path, and verify the full github-insight test suite passes

## 4. Pause on rate-limited lookups

- [x] 4.1 In `createPrLookup`, detect a host message matching `/rate limit/i`, read the reset time through the host call from 2.1, and start the shared pause (fallback 5 minutes); verify a test where the bb message `gh pr view failed: GraphQL: API rate limit already exceeded` pauses until the returned reset time
- [x] 4.2 While paused, return the stored result (also when expired) without a bb call, or `{ kind: "error", message: "rate limited" }` when none exists, and let `fresh` calls through; verify tests for all three cases
- [x] 4.3 In `getInsight`, return a cached entry with `error: "rate limited"` while paused when the entry has no error of its own, and verify a `getInsight` test shows the snapshot with that error after a rate-limited lookup
- [x] 4.4 Verify a `pr-poller` test: after a rate-limited host lookup, no further `sdk.environments.pullRequest` or `fetchOverviewPage` calls happen until the reset time

## 5. Docs

- [x] 5.1 Update the `pr-lookup.ts` and `refresh/insight-service.ts` entries in `bb-plugin-github-insight/README.md` and the update line in `PLUGIN_OVERVIEW.md` with the lookup TTLs, fresh lookups, and the shared pause, and verify the text matches the TTL table in design.md

## 6. Integration check

- [x] 6.1 Run the github-insight typecheck, lint, and tests from the repo root, and verify all pass
