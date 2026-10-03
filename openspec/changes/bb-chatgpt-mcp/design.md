# Design

## Context

See [proposal.md](proposal.md) for motivation and scope.

Observed facts:

- The repository contains independent BB plugin packages with their own manifests, tests, and README files. `.github/workflows/tests.yml` lists the test packages explicitly and uses Node 24.15 or later within Node 24.
- `bb-plugin-tasks-plus/delegate/index.ts` already creates threads through `bb.sdk.threads.spawn`. `attachments/index.ts` uses `bb.http.route` with token authentication. Neither provides a remote MCP server.
- The current BB plugin references expose project/thread SDK operations, declarative settings, plugin storage, and background-service lifecycle. Plugin HTTP routes live under `/api/v1/plugins/<id>/http/` and offer local, plugin-token, or handler-owned authentication, not a ready-made MCP OAuth server.
- The installed Connect skill says shared URLs require the owner's getbb.app browser session. Such a share is not established as a route for ChatGPT's server-to-server OAuth requests.
- Koen reports successful MCP use on both ChatGPT web and mobile. OpenAI's developer guide and help article differ on client and plan support. No BB-to-ChatGPT connection has been tested in this change.
- The SDK dependency is not installed in this checkout. A discovered SDK declaration in another checkout was outside the analysis tool's permitted root and was not inspected. Exact imports and signatures need a check against the implementation package's pinned SDK, not assumptions about another worktree.

## Goals / Non-Goals

Goals:

- Keep internet-facing authentication separate from full-trust BB operations.
- Keep the same protocol, permissions, and tool behavior for web and mobile.
- Make transport retries safe without claiming transactional guarantees that BB does not provide.
- Test through the actual MCP interface and the public BB SDK seam.

Non-goals:

- A general remote BB API, custom OAuth authorization server, new agent scheduler, or ChatGPT-specific visual UI.
- Replacing BB's execution defaults, queueing, permissions, or task-specific thread-start workflow.
- Guaranteeing support on every plan, mobile OS, or voice interface without client evidence.

## Decisions

### 1. A headless BB plugin owns a separate loopback listener

Create `bb-plugin-mcp`, with plugin ID `mcp`, a server entry, and no frontend entry. A BB background service owns a Node HTTP listener bound only to `127.0.0.1` on an explicitly configured port. The listener serves `/mcp` plus OAuth protected-resource metadata. Koen selected Cloudflare Tunnel for the public connection. Use a named tunnel and a stable hostname in a Cloudflare-managed DNS zone, not a temporary Quick Tunnel URL.

The request path is `ChatGPT servers → HTTPS hostname on Cloudflare → encrypted tunnel → cloudflared → loopback HTTP listener → BB SDK`. Cloudflare handles the public HTTPS certificate and terminates that HTTPS connection. `cloudflared` runs on the BB server computer and establishes outbound encrypted connections to Cloudflare; no public IP, router port forwarding, or inbound firewall opening is needed. HTTP is used only for the last loopback connection on the same computer. Cloudflare is a trusted traffic intermediary, not an end-to-end opaque relay.

The operator creates and manages the named tunnel outside the plugin. The plugin only needs the public HTTPS address and matching local listener port. The operator's ingress configuration must route `/mcp` and the plugin's OAuth protected-resource metadata paths to that listener, reject other paths with a not-found response, and never forward BB's main port. A local configuration example can use a final `http_status:404` rule. The configured public MCP URL is the OAuth resource audience and stays unchanged across connector restarts.

Do not place Cloudflare Access browser login, interactive bot challenges, or a separate service-token header requirement in front of these paths. ChatGPT authenticates with the plugin's OAuth bearer token, not a Cloudflare browser cookie. Keep unrelated Cloudflare applications and protection settings unchanged. Validate the route with cookie-free server-to-server requests and preserve the Authorization and MCP protocol headers.

The operator runs `cloudflared` as a separately managed service on the BB server computer, with restart-on-failure behavior. The plugin does not install, start, stop, or configure it; create or delete tunnels; change DNS; or request or store Cloudflare credentials. Installing, reloading, and disabling the plugin leave the existing tunnel untouched. Both BB and the connector must remain running and the computer must remain online and awake. Restarting the connector restores reachability without changing the configured ChatGPT URL or resubmitting BB work.

Use the official MCP TypeScript SDK with stateless Streamable HTTP and JSON responses. Let that SDK handle protocol negotiation, JSON-RPC, notifications, and method errors. Do not hand-write a partial MCP implementation. Each request has its own authenticated context and transport resources; a client reconnect never authorizes a request by session ID alone. An unsupported GET stream may return the protocol-defined method error rather than keeping an idle stream alive.

Register the listener through BB's background lifecycle. Abort closes the listener and transport resources; reload must await port release before rebinding. A configuration change can disable access immediately through per-request policy checks even before a listener restart completes. Listener shutdown does not call `threads.stop`.

Why not BB's main HTTP listener: a separate port lets the proxy expose MCP discovery routes without publishing BB admin routes or depending on root-route changes in core. Why not stdio: ChatGPT's remote connector needs HTTP. Why not BB Connect by default: its documented browser-session gate is not MCP OAuth authentication. A future proven server-to-server Connect integration can replace the ingress without changing the tools.

### 2. Use an external OAuth authorization server

The plugin is an OAuth resource server, not an authorization server. Use a maintained verifier such as `jose` with a configured trusted issuer and its signing keys. The supported initial deployment uses signed JWT access tokens, authorization code with PKCE S256, refresh support, and one ChatGPT-compatible registration mode offered by the chosen issuer. Document and verify one concrete issuer with the Cloudflare Tunnel recipe before release; support for every issuer is not required.

Declare settings through BB's standard `bb.settings.define` form, so configuration is available in the installed plugin's settings without a custom frontend. Fields are `publicBaseUrl`, `listenPort`, `remoteEnabled`, `controlEnabled`, `issuer`, `ownerSubject`, `allowedProjectIds`, and allowed browser origins. Both enable flags start false. `publicBaseUrl` is an HTTPS origin with no credentials, path other than `/`, query, or fragment. The MCP URL is that origin plus `/mcp`. Validate the port and keep binding fixed to loopback.

For Koen, `https://bb-mcp.koenvg.be` is a suggested setting value and `https://bb-mcp.koenvg.be/mcp` is the resulting ChatGPT URL. These are examples, not hard-coded defaults or provisioned routes. Other installations can use their own domain without a code change. The `koenvg.be` website and its existing routes remain unchanged.

Persist values with BB's settings storage. Public-origin and listener-port changes take effect on plugin reload; authentication and access changes keep their immediate per-request checks. Document the reload requirement and show the effective listener port and full MCP URL in `bb mcp status`, along with configured/listening/error facts. A local listener being ready does not establish public tunnel reachability; report remote verification as unknown unless separately checked. Changing the origin requires the operator to update the external tunnel, OAuth audience, and ChatGPT connection. None of those changes happen automatically.

The canonical resource is the effective configured HTTPS MCP URL, never a value derived from untrusted forwarded headers. Protected-resource metadata names that resource, issuer, and scopes. Match JWT signature, algorithm, issuer, audience, expiry, optional not-before, and the exact configured issuer/subject pair. Never fetch a verification URL supplied by a token.

Require `bb.read` for reads and both `bb.read` and `bb.control` for writes. Every request checks live settings. Every mutation checks again before dispatch; a cached mutation result also needs current access checks. Standard authentication challenges point ChatGPT to resource metadata. The metadata route is public; MCP initialization, discovery, and calls require authentication. No URL secrets, BB plugin-token forwarding, or borrowed browser cookies.

OAuth handles user authorization. Local settings provide an immediate kill switch and narrow its effect. ChatGPT's confirmation UI provides an additional user check, not a replacement for token and project enforcement. If an existing token must be blocked immediately, disable remote access or remove its owner locally; do not claim that JWT validation alone provides instant upstream token revocation.

Why not an unauthenticated endpoint or token in the URL: it would expose agent execution or leak credentials. Why not build OAuth issuance here: account login, client registration, PKCE, consent, and refresh-token storage are a separate security responsibility.

### 3. Expose seven tools, not SDK methods

| Tool | Input | Result and BB operation |
| --- | --- | --- |
| `bb_list_projects` | Optional page controls | Allowed project IDs and names from `projects.list` |
| `bb_list_threads` | Project ID, page controls | Bounded visible thread summaries from `threads.list` |
| `bb_get_thread` | Thread ID | Current status, latest bounded output, pending-interaction indicator from `threads.get`, `output`, and interaction reads |
| `bb_start_thread` | Project ID, prompt, optional title, operation key | Ordinary visible thread from `threads.spawn`, using `environment: { type: "project-default" }` and BB execution defaults |
| `bb_send_message` | Thread ID, message, operation key | `threads.send` with normal auto behavior, reporting accepted or queued state |
| `bb_stop_thread` | Thread ID, operation key | `threads.stop`, preserving history and reporting any remaining queued state rather than promising queue deletion |
| `bb_get_operation` | Operation ID | Owner/project-scoped persisted outcome, with thread ID when known |

Schemas reject unknown fields and blank input. Start and send accept text only, not attachments, paths, terminal commands, permission overrides, or arbitrary SDK parameters. A normal agent can still act on the user's files and external services under its configured permissions. A project allowlist restricts MCP access to BB objects; it is not a filesystem sandbox for the agent.

List only allowed objects. For direct thread IDs, obtain the current thread and validate its project before returning data or acting. Operation reads validate owner and current project access, and current thread membership when a thread ID is known. Return the same safe unavailable error for missing and disallowed targets. Do not expose hidden worker threads in default listings.

Set truthful `readOnlyHint` annotations. Starting and messaging agents are open-world write actions and must describe their possible costs and side effects. Stopping work is also a write. Do not mark writes as reads to work around client restrictions. BB approval interactions remain in BB; the remote result reports that attention is needed.

Limit pages to 50 records, latest output to 8 KiB of UTF-8 text, prompts/messages to 32 KiB, and total request/response bodies to 64 KiB. Return explicit continuation or truncation flags. Construct result objects from selected fields instead of forwarding complete SDK objects. Do not promise that arbitrary assistant text contains no private data; connecting a project permits its selected output to reach ChatGPT. Tool descriptions identify that text as untrusted content.

### 4. Persist mutation identity without inventing exactly-once execution

Use a plugin-owned SQLite operation table with a unique key over owner identity, tool name, and caller operation key. Store operation ID, project/target IDs, normalized-input hash, state, timestamps, and bounded result or safe error. Do not keep a second raw prompt or transcript copy.

The control module validates and authorizes input, claims the key transactionally, rechecks access, and dispatches one SDK action. A duplicate with the same hash observes the existing record. A duplicate with a different hash fails. Namespace these records by owner; a caller-chosen key is not an authorization credential.

States are `pending`, `accepted`, `failed`, and `unknown`. `accepted` means BB accepted the action, not that an agent completed the work. A known pre-dispatch rejection can be failed. A timeout or disconnect after dispatch is unknown unless a result later establishes the outcome. Any pending record left by a stopped plugin generation becomes unknown on restart and is never auto-dispatched. Include an operation ID in plugin metadata when spawning, to help local investigation, without using that metadata as proof of authorization.

A tool waits at most five seconds for a fast SDK response, then returns a pending operation ID. The tracked dispatch can finish afterward and update its record. Apply a bounded SDK deadline; a deadline after dispatch is an uncertain outcome, not permission to retry. A disconnected HTTP client does not cancel an accepted BB action. Do not add a durable prompt queue or agent-completion wait inside an MCP request.

Retain completed records for at least 24 hours and unresolved records until local resolution. Add local `bb mcp status`, `bb mcp operations`, and `bb mcp resolve-operation` commands for diagnostics and owner-confirmed record resolution. Resolution records an observed outcome, does not replay a mutation, and cannot make the original key executable again within its retention window. The owner must inspect BB before deciding to submit a new operation key. Document the limits after retention expiry. Refuse new mutations if the bounded ledger cannot retain their safety records rather than silently dropping unresolved keys.

Why not HTTP request IDs: clients can use a different JSON-RPC ID when retrying. Why not blind SDK retries: BB creation and the plugin's database commit are not one transaction. Why not a new workflow engine: BB already owns execution; the plugin only needs submission identity and observation.

### 5. Keep two deep modules and a small composition entry

`server.ts` registers settings, the background listener, storage migrations, and local diagnostic commands.

The `remote-access` module owns HTTP/MCP transport, OAuth verification, request limits, and lifecycle. Its interface receives live policy access and a typed tool executor; it does not own BB execution logic.

The `control` module owns tool schemas, owner/project checks, result projection, mutation records, and the supported SDK calls. Its interface accepts a verified owner and a validated tool request and returns a bounded result. Inject only the BB SDK operations it uses, the operation store, and a clock. Do not create a generic wrapper for all BB SDK areas or one pass-through module for every tool.

Tests call the same tool interface as the transport. Protocol integration tests use an actual local HTTP listener and MCP client. BB effects can use a narrow fake at the SDK seam for deterministically testing retries and scope changes. Live checks establish that actual BB hooks, queues, defaults, and permission behavior remain intact.

### 6. Treat web and mobile as separate required checks

The user requires both ChatGPT web and their native mobile app. The release record must identify the actual mobile OS and app version; this request does not imply verified support on every mobile OS. Do not downgrade acceptance to a mobile browser or to read-only mobile access.

Use the same OAuth identity, endpoint, tool names, and permissions on both. With explicit approval for test execution and provider costs, use an allowlisted test project to connect, list, start, read, send, and stop a thread from each client. Exercise token renewal, reconnect, repeat-operation-key handling, scope removal, and a pending BB approval. Record passed, failed, or blocked results. A local MCP client proves protocol behavior, not ChatGPT UI availability. If either client is unavailable, implementation can be tested locally but this feature is not end-to-end verified.

## Risks / Trade-offs

- Agent text can contain prompt injections or private project content. Mitigation: small selected outputs, clear data labeling, project consent, accurate tool risks, and server-side access checks. These controls do not make agent text safe instructions.
- A permitted prompt can cause broad work through existing agent permissions. Mitigation: preserve those permissions, use a test project first, and make that risk explicit when enabling control.
- Cloudflare Tunnel and the external issuer add setup work and availability dependencies. Mitigation: ship one tested recipe, run the connector as a managed service, and report connection prerequisites locally. Cloudflare terminates public TLS and can process the HTTP traffic, so treat it as a trusted third party.
- JWTs remain valid until expiry unless locally blocked. Mitigation: short-lived tokens and an immediate local access/control switch.
- Plugin reload or a network loss can leave a BB action's outcome unknown. Mitigation: durable operation keys, no automatic replay, local reconciliation, and an explicit unknown response.
- ChatGPT account or client support can change independently. Mitigation: record actual web/mobile tests and never claim universal client support from MCP compatibility alone.
- The listener adds an internet-facing route. Mitigation: loopback binding, dedicated HTTPS ingress, trusted Host/Origin handling, body/deadline/concurrency/rate limits, safe logs, and shutdown tests. Accept only the configured host and explicitly trusted proxy information; never derive authorization or the OAuth audience from client-supplied forwarding headers. Cloudflare must preserve the OAuth Authorization header and must not add a separate cookie-login gate or interactive challenge to the MCP paths.

## Migration Plan

1. Add the standalone package and tests. Do not change other plugins' state, dependencies, or BB core.
2. Build against the current supported SDK and add the package to the repository test matrix and README.
3. On explicit setup approval, install with remote access and control disabled. Record the installed source and version.
4. Have the operator provide an existing named Cloudflare Tunnel routed only to the MCP and discovery paths. Enter its public HTTPS origin and matching listener port in the plugin settings, together with the compatible issuer, owner identity, and test-project allowlist. Reload and confirm a cookie-free remote request reaches the OAuth challenge, not a Cloudflare login page, before enabling reads. Missing tunnel setup is a prerequisite, not permission for the plugin to create infrastructure.
5. Connect the account, verify reads, then explicitly enable control and run the approved web/mobile acceptance checks.
6. Roll back by disabling remote access and control, revoking the test OAuth grant, restoring approved temporary plugin settings, and disabling the plugin if needed. Keep operation records for investigation. Leave the operator's existing tunnel, connector service, DNS, and Cloudflare credentials unchanged. The operator can separately remove an unwanted route. Do not stop or delete existing BB threads as a rollback side effect.

## Deployment values to confirm during setup

Confirm the operator-provided public HTTPS origin, matching loopback port, and OAuth issuer and registration mode, plus the owner subject, selected project IDs, ChatGPT plan/workspace, and mobile OS/app version. Koen owns `koenvg.be`; `bb-mcp.koenvg.be` is the suggested subdomain, not an application requirement. Record effective settings without secrets in the verification report. If the existing tunnel or issuer cannot meet the documented contract, report the missing prerequisite instead of changing Cloudflare infrastructure.

## References

- [OpenAI developer mode](https://developers.openai.com/api/docs/guides/developer-mode)
- [OpenAI MCP help](https://help.openai.com/en/articles/12584461), conflicts with the developer guide and the user's observed mobile use
- [OpenAI MCP authentication](https://developers.openai.com/apps-sdk/build/auth)
- [MCP HTTP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), baseline for the selected SDK's negotiated protocol
- BB plugin backend, HTTP, background-service, and Connect references supplied by the installed BB skills
- [Cloudflare Tunnel architecture](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
- [Cloudflare Tunnel ingress configuration](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/)
