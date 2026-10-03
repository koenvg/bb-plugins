# Proposal

## Why

Koen wants to control BB remotely from both ChatGPT web and the native ChatGPT mobile app. Koen already uses MCP connections on both, so this change must verify that workflow instead of assuming that mobile is unsupported from conflicting provider documentation.

## What Changes

- Add a separate, headless `bb-plugin-mcp` package. It uses an existing, operator-managed Cloudflare Tunnel with a stable HTTPS hostname, without exposing BB's main server.
- Make the public HTTPS address, local listener port, OAuth connection, project access, and read/control settings configurable through BB's standard plugin settings. No domain is hard-coded. The plugin does not create tunnels, manage DNS, run `cloudflared`, or request Cloudflare credentials.
- Support a small set of tools to list allowed projects and threads, read thread status and recent output, start a thread, send instructions, stop work, and inspect a submitted operation.
- Use OAuth access tokens, an explicit owner identity, project allowlists, and separate read and control permissions. Keep remote control disabled until configured.
- Treat starting and messaging an agent as write actions with possible code changes, external actions, and provider costs. Keep BB's existing permission and approval behavior.
- Return promptly for long-running work. Protect mutations against duplicate requests and report uncertain outcomes instead of silently retrying them.
- Document connection setup and require live read and write checks in both ChatGPT web and Koen's native mobile app. Record account and client details because availability can vary.

## Capabilities

### New Capabilities

- `bb-mcp-connection`: Authenticated remote MCP transport, restricted exposure, connection lifecycle, and web/mobile compatibility verification.
- `bb-mcp-control`: Project-scoped BB tools, bounded results, safe mutation retries, and preserved BB execution controls.

### Modified Capabilities

None. The task-specific composer and linking behavior in `task-thread-start` stays unchanged. This plugin creates ordinary BB threads, not Tasks Plus tasks. The verification skill remains unchanged.

## Impact

- New package `bb-plugin-mcp/`, with its own manifest, backend, tests, build checks, and README. Update the repository plugin list and applicable test CI entries during implementation.
- Uses the public BB Plugin SDK for project and thread operations and plugin-owned background work, settings, and storage.
- Adds the official MCP TypeScript SDK and maintained OAuth token-verification support. Exact compatible versions must be checked against the BB runtime before implementation.
- Requires an existing named Cloudflare Tunnel routed to the MCP listener, with `cloudflared` managed separately on the BB server computer, plus a compatible OAuth authorization server. The tunnel requires no inbound router port. BB Connect's browser-session-protected shares are not assumed to be usable by ChatGPT's remote requests.
- No BB core changes, app-store publication, custom ChatGPT UI, voice-mode support, shell/file tools, task-board changes, or remote approval of pending agent permissions in the first version.
- This change contains planning artifacts only. It does not install a plugin, expose a port, connect an account, or start an agent.
