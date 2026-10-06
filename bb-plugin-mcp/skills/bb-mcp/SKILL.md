---
name: bb-mcp
description: Inspect BB MCP readiness, configure allowlisted reads and thread control, or diagnose OAuth and tunnel prerequisites.
---

# BB MCP

1. Run `bb mcp status --json`. Use the effective URL and listener state. Local listening does not prove public reachability.
2. For settings, OAuth, tunnel routing, or reload problems, read [the package guide](../../README.md). Use standard BB plugin settings. A missing external issuer or existing named tunnel is a prerequisite.
3. Make live installation, remote enablement, OAuth login, and connector changes only with specific owner approval. Preserve BB threads, existing infrastructure and credentials.
4. Report local checks separately from public and ChatGPT checks. Record any missing setup. Use [the thread-read checkpoint](../../VERIFICATION-BBP80-CORRECTION.md) and [the connection checklist](../../VERIFICATION.md) for a release check.

Read [the tool reference](../../README.md#tool-and-request-limits) before thread reads and [the start and operation rules](../../README.md#thread-starts-and-operation-status) and [the follow-up rules](../../README.md#follow-up-instructions) and [the stop rules](../../README.md#stop-requests) before control or recovery. Empty project access grants no projects. Pending approval requests need action in BB.

After a lost start, send or stop reply, keep the original operation key and exact text. Read `bb_get_operation` if the ID is known, or repeat the original tool input and key. Accepted or queued means submission only. For unknown outcomes, inspect BB before a new key. This version has no local resolution command. Preserve unresolved records.

Stop acknowledgement is not confirmed completion or queue deletion. Handle pending permissions in BB. Closing MCP or disabling the plugin does not stop agents.
