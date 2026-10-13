# Fast capability expiry verification

## Cause and fix

Fast capability evidence has a five-minute lifetime. The previous cache reused successful same-token evidence after expiry. Final payload validation then rejected the request with `Speed: expired` without another discovery attempt.

The guarded BB build profile now reuses successful evidence only while it is fresh. Expired successful evidence enters the existing coalesced discovery path. Cached discovery failures remain sticky until manual refresh or invalidation. The vendor archive, TTL, authentication checks, captured turn selection, final payload guards, and native retry policy remain unchanged.

## Automated evidence

A generated-controller continuation test failed before the implementation with:

```text
SpeedError: Speed: expired. Select Default in the BB speed selector or use /speed refresh.
 Test Files  1 failed (1)
      Tests  1 failed (1)
```

After the fix, the same generated payload reproduction produced:

```text
initial payload {"model":"gpt-5.5","service_tier":"priority"}
after expiry payload {"model":"gpt-5.5","service_tier":"priority"}
discovery requests 2
Default payload {"model":"gpt-5.5"}
```

`gpt-5.5` is a synthetic fixture model. No OpenAI request used that fixture.

The full package suite passed all 560 tests before PR preparation. Generated-source checking, typecheck, SDK checking, build, scoped lint, formatting, and diff checks passed. Regression tests cover continuation and between-turn expiry, delayed payload instrumentation, coalesced renewal, sticky failures, manual recovery, revoked access, Default operation, account changes, invalidation, and native request refusal.

One fresh routine review approved the production source change. The parent added the requested explanation for the runtime-generated test import. Full-suite testing also found test import violations. The parent switched to approved root exports and exact test-file exceptions. Production import restrictions remain unchanged. The complete suite then passed.

## Installed live check

The user approved installation from this worktree on BB 0.46.0. The plugin source switch preserved the existing installation rather than removing it. The plugin was enabled and running. The provider catalog confirmed Fast for `openai-codex/gpt-6.1-sol`.

The installed host artifact digest was:

```text
69b9704fe543c082927c2761cf796638909a8b769bca34f59a35f681624df30a
```

A fresh test thread used the real model `openai-codex/gpt-6.1-sol`, Fast, and low reasoning. Its single foreground tool waited 310 seconds, beyond the five-minute expiry. The next model request completed the same turn without manual refresh or a speed change.

The parent inspected the actual BB events, not only the child report. They showed one client turn request, one session identity, one turn start, one command execution, and a completed turn. The final assistant text was:

```text
FAST_TTL_CONTINUATION_OK
FAST_TTL_WAIT_BEGIN 1791922151
FAST_TTL_WAIT_END 1791922461
```

The command output contained the same timestamps. There were no error events or replacement identities. The parent stopped only the owned test runtime and retained the idle thread and its history. The worktree plugin remains installed.

Source thread `thr_tvxcetrpv5`. Live test thread `thr_jt9e4wvqn3`. Private local event evidence remains in `/tmp/bb-speed-live-thr_tvxcetrpv5`. Raw events were not committed because they include environment metadata.

## Limits

This proves the installed Fast continuation behavior across expiry. It is not a packet capture of the outgoing wire tier. Revoked access and discovery failure were tested with fixtures, not against a live account. Other provider lifecycle acceptance remains separate.

The required Cursor `deslop` and Comment Sicko tools were unavailable. Their exact workflows were not claimed. The user later requested a PR. These tooling limits remain recorded.

BBP-213 records the separate existing generator-input verification gap. It is not a blocker for this expiry fix. No cleanup implementation is included.
