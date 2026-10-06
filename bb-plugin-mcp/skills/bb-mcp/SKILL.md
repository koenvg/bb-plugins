---
name: bb-mcp
description: Inspect BB MCP readiness and operation outcomes, record owner-verified local resolution, configure project access, or diagnose OAuth and tunnel prerequisites.
---

# BB MCP

1. Run `bb mcp status --json`. Use the effective URL and listener state. Local listening does not prove public reachability.
2. For settings, OAuth, tunnel routing, or reload problems, read [the package guide](../../README.md). Use standard BB plugin settings. A missing external issuer or existing named tunnel is a prerequisite.
3. Make live installation, remote enablement, OAuth login, and connector changes only with specific owner approval. Preserve BB threads, existing infrastructure and credentials.
4. Report local checks separately from public and ChatGPT checks. Record any missing setup. Use [the thread-read checkpoint](../../VERIFICATION-BBP80-CORRECTION.md) and [the connection checklist](../../VERIFICATION.md) for a release check.

Read [the tool reference](../../README.md#tool-and-request-limits) before thread reads and [the start and operation rules](../../README.md#thread-starts-and-operation-status) and [the follow-up rules](../../README.md#follow-up-instructions) and [the stop rules](../../README.md#stop-requests) before control or recovery. Empty project access grants no projects. Pending approval requests need action in BB.

After a lost start, send or stop reply, keep the original operation key and exact text. Read `bb_get_operation` if the ID is known, or repeat the original tool input and key. Accepted or queued means submission only. For unknown outcomes, inspect BB and preserve unresolved records. A fresh key is not a safe recovery test.

For local investigation, read [diagnostics, verification and retention rules](../../README.md#local-diagnostics-and-resolution). Run `bb mcp operations --operation <operationId> --json`, or page with `--limit 1..50` and `--cursor <nextCursor>`. Summaries omit content and credentials. With owner approval for the specific record, manually verify BB acceptance or non-acceptance before using `bb mcp resolve-operation <operationId> --outcome accepted|failed --project <projectId> [--thread <threadId>] [--delivery sent|queued] --verified --json`. Preserve the existing target. Active or final records are refused. Keep insufficient evidence unknown. Resolution only records the observation; it submits no action and answers no permission. Resolved keys stay protected for at least 24 hours. Keep the ledger during cleanup and leave the external tunnel unchanged.

Stop acknowledgement is not confirmed completion or queue deletion. Handle pending permissions in BB. Closing MCP or disabling the plugin does not stop agents.
