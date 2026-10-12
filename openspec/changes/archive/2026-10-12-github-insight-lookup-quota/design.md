# Design

## Context

All PR lookups in github-insight go through `createPrLookup` in `pr-lookup.ts`. `resolvePr(threadId)` and `resolveEnvironmentPr(environmentId)` call `sdk.environments.pullRequest` and `sdk.environments.get` every time. The callers are the insight service (poll, `getInsight`, `refresh`, `cachedPr`, `refreshAfterWrite`, `refreshOnIdle`), the review service, review writes, and the review-queue relink.

The insight service has a pause (`pausedUntil`) that starts only when `fetchInsight` throws `GhFailureError` with `rate_limited`. A host lookup failure comes back as `{ kind: "error", message }`, so it never starts the pause.

`host.ts` already reads the GraphQL reset time with `gh api rate_limit` (free) after its own rate-limited calls. That function is not exposed in the host contract.

## Goals / Non-Goals

**Goals:**

- One place owns the lookup cache and the pause, so every caller gets them without changes of its own.
- Keep the caller-facing `PrResolution` type the same.

**Non-Goals:**

- Change what bb does inside `gh pr view`.
- Persist the lookup cache across a plugin restart. The first poll after a restart does one lookup per environment, as today.
- Pause the review-queue search poll or the Review tab's own GitHub reads on the shared pause. Their PR lookups do follow the pause, because all lookups go through one module.

## Decisions

### 1. Cache inside `createPrLookup`, keyed by environment ID

The cache stores `{ resolution, expiresAt }` per environment, plus a map of running lookups for dedupe. TTL comes from the resolution:

| Resolution | TTL |
|---|---|
| `pr`, host state open or draft | 60 s |
| `no_pr` | 5 min |
| `pr`, host state closed | 15 min |
| `pr`, host state merged | 60 min |
| `error` | not stored, and clears the stored result |

The lookup picks the TTL from the host state when it stores the result. `PrTarget` does not change.

A lookup through a disconnected host can hang. Later callers stop sharing a running lookup after 30 seconds (`LOOKUP_SHARE_MS`) and start their own.

`resolvePr(threadId)` still calls `sdk.threads.get` each time. That is a local bb call with no GitHub cost.

- Alternative: cache in the insight service. Rejected: the review service, review writes, and the review-queue relink would still call bb directly.
- Alternative: one TTL for all. Rejected: merged PRs are the most common case in a long thread list, and they never change back.

The 60-minute TTL for merged PRs, not "never", covers a new PR on the same branch after a merge. The fresh idle lookup covers the common case sooner.

### 2. `fresh` option for user and idle refreshes

`resolvePr(threadId, { fresh: true })` and `resolveEnvironmentPr(environmentId, { fresh: true })` skip the valid cache entry and replace it with the new result. The insight service passes `fresh` from `refresh`, `refreshAfterWrite`, and both lookups in `refreshOnIdle`. A fresh call does not join a lookup that is already running, because that lookup can have started before the change the caller wants to see. It waits for it to end (or for 30 seconds), then starts a new one. Fresh calls that arrive together share that new lookup.

- Alternative: drop the cache entry on `thread.idle`. Rejected: it hides the reason in the event wiring, and manual refresh needs the same thing.

### 3. One shared rate-limit pause object

A small `createRateLimitPause()` module in `github/rate-limit-pause.ts` owns `pausedUntil()`, `isPaused()`, and `pauseUntilReset(resetAt | null)`. A null reset time pauses for `RATE_LIMIT_FALLBACK_MS` (5 min). `server.ts` creates one instance and gives it to both the lookup and the insight service. The insight service keeps `pauseAfter(error)` but calls the shared object.

The lookup detects a rate limit when the host message matches the same `/rate limit/i` pattern that `classifyGhFailure` uses. It then asks the host for the GraphQL reset time through a new host contract call `readRateLimitReset` (it wraps the existing `readRateLimitReset` in `host.ts`), using `environment.hostId`. It pauses until that time, or for the fallback time when the time is null. The rate-limited lookup returns the stored PR, or "rate limited" when the stored result is not a PR, so a Retry during a pause never shows "No pull request".

- Alternative: return a new `PrResolution` kind `rate_limited` and let each caller pause. Rejected: every caller would need the same handling.
- Alternative: parse the reset time out of the host message. Rejected: `gh pr view` does not include it.

### 4. Lookups during a pause

When paused and the call is not `fresh`, the lookup returns the stored result even when it is expired, and makes no bb call. With no stored result it returns `{ kind: "error", message: "rate limited" }`. A `fresh` call ignores the pause, because the user asked for it (t3code does the same for interactive reads).

`getInsight` already skips the background refresh while paused. It also returns the cached entry with `error: "rate limited"` when the entry has no error of its own, so the PR tab shows the snapshot with the error strip and Retry button. Retry runs `refresh`, which is `fresh`.

## Risks / Trade-offs

- [A PR opened outside an agent turn, for example by hand in a terminal, shows up to 5 minutes late] → Manual refresh is fresh. The thread-idle refresh covers PRs that agents open.
- [A merged PR whose branch gets a new PR shows the old PR for up to 60 minutes] → The idle refresh after the next agent turn is fresh.
- [`/rate limit/i` also matches GitHub's secondary rate limit text] → Correct: secondary limits also need a pause.
- [The reset-time call fails on a disconnected host] → It returns null and the 5-minute fallback applies.

## Migration Plan

No stored data changes. A plugin update replaces the old behavior. Rollback is a revert.
