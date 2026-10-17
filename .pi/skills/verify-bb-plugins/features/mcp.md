# Authenticated MCP reads and thread control

Users connect an authenticated MCP client to inspect eligible standard projects/threads and, with separate control consent, start/send/stop bounded operations.

## Sub-features

- mcp-read: bb_list_projects, bb_list_providers, bb_list_threads and bb_get_thread.
- mcp-auth: configured issuer/owner, read/control authorization and Personal exclusion.
- mcp-control: bb_start_thread with optional explicit provider selection, bb_send_message, bb_stop_thread and bb_get_operation.
- mcp-readiness: effective listener identity versus public tunnel/OAuth/client reachability.

## How to get to it (user POV)

- Open Settings > Plugins > MCP for configuration, without changing it during a read-only Doctor.
- Inspect `bb mcp status --json`.
- Invoke the named public tools through the configured authenticated MCP client at the effective URL.

## Driving it with BB and package harnesses

Preconditions:

- Follow [shared Launch and Doctor](../SKILL.md), then this package's [README](../../../../bb-plugin-mcp/README.md). Use the new evidence directory and resolved package/instance/host IDs. Local checks do not install the plugin.
- Installed actions follow [the installed workflow](../references/installed-workflow.md), with exact-checkout identity, needed permissions and an owned record/state ledger. Missing prerequisites remain blockers.

Run local tests/typecheck; they use controlled token/SDK/transport boundaries, not a public OAuth session. Read the package's Safety and consent and current authentication-mode requirements before installed checks. Doctor is `bb mcp status --json`; listening means local readiness only. Do not enable remote/control access, create a tunnel or edit issuer/owner settings to clear a blocker. With an already approved authenticated client, invoke bb_list_projects, bb_list_providers, bb_list_threads and bb_get_thread for an owned standard project/thread. Capture safe tool inputs and bounded responses and verify built-in Personal exclusion without exposing private output. Start/send/stop require explicit operation-specific consent because they can change code and cost money; observe operation status through bb_get_operation and BB's second read. Preserve idempotency/error evidence and never retry an uncertain mutation blindly.

Local provider checks use `tests/provider-selection.test.ts` and the production adapter in `tests/projects-adapter.test.ts`. Verify the bounded discovery projection, exact project membership, both authentication modes, cancellation, and unresolved-read limits. Start checks cover omitted, same-provider, and different-provider payloads, unchanged permission modes, legacy-key replay, selection conflicts, and failed versus unknown outcomes. These checks use synthetic providers and do not establish installed provider readiness.

Before any separately approved explicit start, read [the provider selection contract](../../../../bb-plugin-mcp/README.md#thread-starts-and-operation-status). Use a provider ID from discovery without changing project defaults or enabling a provider. Record the chosen ID and original key with the approved operation evidence.

## Gotchas

- The default dedicated port is 38991, but the effective status URL/port is authoritative. BB's 38886 is forbidden.
- No deletion, file, shell or generic-forwarding tool exists.
- Free-text assistant output is not redacted; keep it out of shared evidence when private.
- The plugin does not manage Cloudflare or provider credentials. Authentication and public reachability must each be proved separately.
