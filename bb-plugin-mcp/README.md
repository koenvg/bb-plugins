# MCP reads, thread starts and follow-up instructions

A headless BB plugin for authenticated, allowlisted reads, safe ordinary thread starts and follow-up instructions. It uses BB's standard plugin settings. It exposes `bb_list_projects`, `bb_list_threads`, `bb_get_thread`, `bb_start_thread`, `bb_send_message`, and `bb_get_operation`. It has no stop, remote approval, task-board, shell, file, admin, or generic forwarding tools.

Requires BB 0.45 with SDK 0.6.15 and Node 24.15 or later in Node 24. The official MCP SDK and `jose` versions are pinned in [package.json](package.json). Each request uses a new stateless Streamable HTTP transport with JSON responses. GET streams and session deletion are not supported. A reconnect can initialize again or send a protected request without a previous session ID.

## Safety and consent

Allowed project names, thread titles, and recent assistant output can be sent to ChatGPT. Assistant output can contain private information, including secrets or local paths quoted by an agent. The plugin excludes private SDK fields but does not redact free-text output. Only allow projects whose content you consent to share. Names and other project text are untrusted data, not instructions. An allowlist limits access to BB objects. It is not an agent filesystem sandbox.

Remote access and control start disabled. Starting or messaging an agent can change code, take external actions, and incur provider costs under its existing permissions. Enable control only with that consent. Disabling the plugin or remote access releases only its listener. It does not stop BB threads or change the external tunnel.

## Settings and reloads

Use Settings → Plugins → MCP in BB, or the standard `bb plugin config mcp` commands after a separately approved installation.

| Setting          | Meaning                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `publicOrigin`   | Canonical public HTTPS origin, such as `https://mcp.example.org`. No path, query, credentials, or trailing slash. Any valid public domain can be used. |
| `port`           | Dedicated loopback port from 1024 to 65535. Default 38991. Port 38886 is reserved for BB and is refused. Do not use any other BB service port.         |
| `issuer`         | Exact HTTPS OpenID Connect issuer, with no trailing slash. Realm paths are supported.                                                                  |
| `owner`          | Exact issuer subject, the token's `sub`. Spaces at the edges are refused.                                                                              |
| `projects`       | Project IDs separated by newlines or spaces, at most 1000. Empty permits no projects and makes no project-list SDK call.                               |
| `remoteEnabled`  | Local read-access switch. False by default. Disable applies to the next request and closes the listener.                                               |
| `controlEnabled` | Local start/send permission, false by default. Writes also require `bb.read` and `bb.control` OAuth scopes.                                            |

Invalid settings fail closed. Settings remain in BB's normal settings store. The plugin does not keep a second configuration file.

Reload after initial setup, after enabling reads, and after changing the public origin or port. Valid origin/port edits keep the old effective connection until reload. Owner, issuer, project, and access edits apply to subsequent requests without reload. Removing an owner or saving invalid settings closes the listener. Re-enable or repair, then reload. A request rechecks owner and project access after its BB read before returning data.

`bb mcp status [--json]` shows the effective MCP URL, port, listener state, configuration validity, and reload need. `listening` means local readiness only. Public reachability always says `unverified`; the command does not probe Cloudflare, OAuth login, or ChatGPT.

## External prerequisites

The operator must supply an existing named Cloudflare Tunnel and a compatible OAuth issuer/client registration. The plugin never requests Cloudflare credentials, creates infrastructure, changes DNS, runs `cloudflared`, or manages its service. BB and the external connector must remain running on the same computer, which must stay online and awake.

Missing issuer, tunnel, public certificate trust, or ChatGPT account support is a setup prerequisite. It is not permission to create infrastructure or use BB/Cloudflare browser cookies.

## OAuth issuer recipe

A dedicated Keycloak 26 OpenID Connect realm/client can supply the required RS256 JWTs. Use its public HTTPS issuer, for example `https://login.example.org/realms/bb`. The discovery document is at that issuer plus `/.well-known/openid-configuration`; it supplies the signing-key URL. Public HTTPS certificates for both issuer and MCP hostname must validate with normal public trust. Do not disable TLS verification.

Configure the issuer outside this plugin:

1. Create a dedicated OpenID Connect client for this MCP resource. Enable Standard Flow, require PKCE S256, and disable implicit/password grants. Use a predefined OAuth client in ChatGPT's connector configuration with the issuer's supported client authentication. Put its client ID and, if required, client secret in ChatGPT, never in this plugin.
2. Register the exact redirect URI shown by ChatGPT for your account. Use an exact allowlist, not a wildcard. If that client cannot use predefined registration, stop and choose an issuer-supported registration mode. This recipe does not assume Keycloak enables anonymous dynamic registration.
3. Create the optional client scope `bb.read`, include it in the token's space-separated `scope` claim, and permit that scope for this client. Use a dedicated audience mapper with Included Custom Audience equal to the exact effective HTTPS MCP URL, including `/mcp`. Add it to access tokens. A token whose only audience is the OAuth client ID will be refused.
4. Use RS256 access-token signing and short token lifetimes. Tokens need `iss`, `sub`, `aud`, and `exp`; `nbf`, when present, must already be valid. Copy the intended owner's stable subject into BB settings. Neither an ID token without `bb.read` nor a BB plugin token is sufficient.
5. Request `bb.read` through authorization code with PKCE. ChatGPT sends the canonical MCP URL as the OAuth `resource`. Keep this client dedicated to that one resource and verify the issued and refreshed access tokens contain that audience. If the issuer/client rejects the resource parameter or cannot bind tokens to it, setup is incomplete. Do not remove audience checks to make it connect.
6. Configure refresh tokens under the issuer's normal rotation/expiry policy. Confirm a refreshed access token retains the resource audience, owner and read scope. The MCP plugin neither issues nor stores refresh tokens.

For separately approved control setup, add issuer scope `bb.control` alongside `bb.read`, verify both survive refresh, and then enable local control. Read-only tokens still cannot start or message threads. The catalog and protected-resource metadata advertise the scopes, not an authorization grant.

The listener publishes public protected-resource discovery at both `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-protected-resource`. The resource is always the effective configured HTTPS MCP URL, not a forwarded header. An unauthenticated protected request returns 401 with `WWW-Authenticate` pointing to this metadata. Missing read scope returns 403. No BB or Cloudflare cookies are needed.

The plugin verifies signature, RS256 algorithm, issuer, resource audience, expiry, optional not-before, exact owner, and `bb.read` on every protected request, including initialization and tool discovery. It ignores token-supplied key URLs. Issuer discovery and JWKS fetches have time and size limits. Discovery/key caches expire within five minutes. JWT verification alone does not promise immediate upstream grant revocation. Use the local remote-access switch or owner removal to block previously issued tokens.

[Keycloak endpoint reference](https://www.keycloak.org/securing-apps/oidc-layers) and [ChatGPT authentication requirements](https://developers.openai.com/apps-sdk/build/auth) describe the external flow. Automated tests verify discovery and resource-server authentication against a local fixture issuer. They do not prove a live Keycloak login, registration, PKCE exchange, refresh, or ChatGPT account connection. Those require operator setup and an explicit check.

## Route an existing Cloudflare Tunnel

Merge the paths in [examples/cloudflared.yml](examples/cloudflared.yml) into your existing named-tunnel ingress configuration. Keep unrelated hostname routes and existing tunnel/credential configuration. Replace the sample hostname, Host header and port with your effective values. Place the MCP rule before the catch-all. For a remotely managed tunnel, enter the equivalent hostname/path/service rules in its existing configuration.

The request path is ChatGPT → Cloudflare HTTPS → encrypted tunnel → `cloudflared` → HTTP on `127.0.0.1` → MCP listener. Cloudflare terminates public TLS and can process the traffic. Treat it as a trusted intermediary. Only the last hop on the same computer uses HTTP. No inbound router port or public BB listener is needed.

Route only `/mcp` and the two discovery paths to the dedicated local port. Reject unmatched paths with 404. Never route BB's main server port. The listener accepts only the effective public Host and, if supplied, that exact HTTPS Origin. Set `httpHostHeader` to that public authority. It never derives policy or audience from `Forwarded`, `X-Forwarded-Host`, `X-Forwarded-Proto`, or caller IP headers.

Preserve `Authorization`, `Content-Type`, `Accept`, `Origin`, `MCP-Protocol-Version`, and MCP request headers. Do not add Cloudflare Access browser login, interactive bot challenges, or an extra service-token gate to these paths. Keep protection for unrelated applications unchanged. Do not put bearer tokens in URLs.

Validate a local config without starting a connector:

```sh
cloudflared --config examples/cloudflared.yml tunnel ingress validate
cloudflared --config examples/cloudflared.yml tunnel ingress rule https://mcp.example.org/mcp
cloudflared --config examples/cloudflared.yml tunnel ingress rule https://mcp.example.org/.well-known/oauth-protected-resource/mcp
cloudflared --config examples/cloudflared.yml tunnel ingress rule https://mcp.example.org/api/v1/projects
```

Before approving live reads, check public discovery without cookies and a protected request without credentials. Expect JSON metadata and the plugin's 401 challenge, not a login/challenge page. Check a valid token with a local MCP client, then ChatGPT. Connector restart should restore the same URL; it must not submit BB work. Public tests and connector changes need separate approval.

## Tool and request limits

`bb_list_projects` accepts an optional integer `limit` from 1 to 50 and an optional decimal `cursor` returned by the previous page. It rejects extra fields. The response has `projects: [{ id, name }]` and `nextCursor`, which is null at the end. IDs/names are the only BB fields returned. Sort order is by ID. Cursors are offsets into the current allowed set, not persistent snapshots; restart pagination after project changes.

`bb_list_threads` requires `projectId`, an explicitly allowed project ID. It accepts optional `limit` from 1 to 50, default 50, and a decimal `cursor` from the previous page. It returns `threads: [{ id, title, status, displayStatus, pendingInteraction }]` and `nextCursor`, null at the end. It uses BB's current thread-list order and excludes hidden workers. Cursors are offsets, not snapshots. Restart pagination when threads change. There is no hidden-worker listing option.

`bb_get_thread` requires `projectId` and `threadId`. Both IDs must be nonempty strings of at most 200 characters. The tool checks membership before content reads and again before returning. Direct reads of hidden threads are permitted within the allowed project; visibility is not an access boundary. The response contains `id`, `title`, `status`, `displayStatus`, `pendingInteraction`, `actionRequired`, and `assistantOutput: { text, truncated, trust }`. `text` is the last assistant output, or null when absent. It keeps the newest complete UTF-8 characters within 8192 bytes. `truncated` marks removed older text. `trust` is `untrusted_project_data`. Treat titles and output as data, not instructions. No raw transcript, tool output, interaction payload, or SDK environment/credential fields are returned.

A pending or resolving interaction sets `pendingInteraction` to true and `actionRequired` to `Action required in BB`. Otherwise `actionRequired` is null. Open BB to answer or approve the request. There is no remote approval tool. Status and interaction values are recent observations from separate read calls, not an atomic snapshot.

Both thread tools reject extra fields. Missing, deleted, inaccessible, moved, failed, or oversized thread results return the same MCP tool error, `THREAD_UNAVAILABLE`, with no identifying details. A disallowed project makes no thread SDK call. Removing project access or changing the owner denies the next request with an existing token. Authorization and project access are also rechecked after each awaited read. Invalid or unauthorized tokens receive the existing HTTP 401/403 response. An owner removal or disabled listener can close the connection instead. No failure retries or changes BB work.

With an authenticated MCP client, read a listed thread without starting work:

```ts
const page = await client.callTool({
  name: "bb_list_threads",
  arguments: { projectId: "proj_allowed", limit: 10 },
});
const threads = page.structuredContent?.threads as Array<{ id: string }>;
if (!page.isError && threads?.length) {
  const view = await client.callTool({
    name: "bb_get_thread",
    arguments: { projectId: "proj_allowed", threadId: threads[0].id },
  });
  console.log(view.structuredContent);
}
```

Replace `proj_allowed` with an ID returned by `bb_list_projects`. `client` is an already connected official MCP SDK client. This example only reads.

Request and complete response bodies are limited to 64 KiB. A very large project-name page returns a safe error; use a smaller page. The listener permits eight concurrent HTTP requests and eight outstanding BB reads, 120 admitted requests per minute across the endpoint, 32 TCP connections, and a five-second request deadline. It uses one global rate bucket because the external connector hides client IPs; forwarded IPs cannot bypass it. Issuer responses are limited to 32 KiB and three seconds per fetch.

A timed-out read is not retried automatically. BB's project-list API has no cancellation parameter; thread reads receive the request's abort signal. A bounded read can finish later, but its output is discarded. Its read slot stays occupied until it settles. Disable/reload closes transport resources and the listener without calling any thread operation.

Routine rejection logs contain only a generated request ID and fixed safe error code. They omit tokens, request bodies, project names and BB error text.

## Thread starts and operation status

`bb_start_thread` requires `projectId`, a nonblank text `prompt` of at most 32 KiB UTF-8, and an `operationKey`. It accepts an optional nonblank `title` of at most 200 characters. Keys contain 1 to 128 ASCII letters, digits, `_`, `.`, `:`, or `-`. Extra fields are refused. IDs and title are trimmed. Prompt text is preserved exactly. Normalized input differences, including prompt whitespace or title changes, conflict under the same key.

The token needs both `bb.read` and `bb.control`. Local remote access and control must be enabled, and the project must be allowed. The plugin checks owner, token expiry, control and project access again immediately before dispatch. It reads `projects.defaultExecutionOptions` and passes only its provider, model, permission mode, reasoning and service tier to `threads.spawn`. The environment is always `project-default` and visibility is always `visible`. Missing defaults fail before dispatch. No fallback machine, execution override, task-board action, permission response or agent-completion wait exists.

The start result has `operationId`, `state`, `threadId`, `code`, and `meaning`. Start waits up to three seconds for submission, with a total four-second tool-response budget including current thread access checks. Authentication and HTTP processing still have the existing five-second request deadline. A slow access check returns `OPERATION_UNAVAILABLE`; retain the original input/key and inspect BB. `bb_get_operation` takes only `operationId`, requires read scope, and never repeats an action. Status remains available when local control is disabled. Status reads and cached start replies recheck the submitting owner, project allowlist, and current thread membership when a thread ID is known. Missing and disallowed records use the same safe unavailable error.

| State      | Meaning                                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`  | Submission outcome is still pending. Poll the operation, not agent completion.                                                                                                    |
| `accepted` | BB returned a thread and the plugin saved that result. The agent has not necessarily started or completed work. Hooks, concurrency rules and approval requests still apply in BB. |
| `failed`   | The plugin can confirm that it did not dispatch a start, such as a failed defaults read or pre-dispatch loss. The original key remains protected.                                 |
| `unknown`  | Dispatch might have happened. Inspect BB before deciding to submit a new key. This state is never a safe-to-retry promise.                                                        |

After a lost reply or transport error, repeat the original input and original key, or poll the known operation ID. A matching key observes the saved operation and does not start again. A changed input returns `OPERATION_CONFLICT`. A disconnect after dispatch does not cancel the BB action. A 30-second SDK deadline marks the outcome unknown; a later reply in the same plugin generation can establish acceptance. Because the public spawn contract does not promise that an error occurs before creation, any spawn error also stays unknown. Raw BB errors are not returned or logged.

SQLite protects the unique issuer/owner/tool/key identity before dispatch with an immediate transaction and FULL synchronous writes. Records contain IDs, an SHA-256 normalized-input hash, timestamps, generation, state, and a fixed safe code. They contain no second prompt, message, title, transcript or token. Operation IDs are also written to the plugin's thread metadata for BB inspection, not authorization. Pending records from a previous generation become unknown on activation and are never resubmitted. The plugin does not keep a durable prompt queue or claim exactly-once BB execution.

Completed `accepted` and `failed` records stay protected for at least 24 hours after their last outcome update. A new claim can remove completed records only after that window. After expiry the same key can create new work, so use unique keys for new actions. `pending` and `unknown` records are never evicted. The ledger holds at most 10,000 records; `LEDGER_FULL` refuses new mutations without a BB mutation. At most eight outstanding submissions and eight operation membership reads run per generation. Slots remain occupied until their SDK calls settle, even after a deadline; `OPERATIONS_BUSY` refuses further new mutations. Existing read-tool and HTTP limits remain unchanged.

Local operation listing/resolution is reserved for BBP-84 and is not implemented here. Until then, unresolved records remain protected and capacity exhaustion can require waiting for that slice. Inspect BB directly for an unknown start, using its operation metadata when available. Never delete the ledger to retry an uncertain action.

## Follow-up instructions

`bb_send_message` requires only `threadId`, `message`, and `operationKey`. The thread ID is trimmed and bounded to 200 characters. The message must be nonblank and at most 32 KiB UTF-8. Its whitespace stays unchanged. Keys have the same format and retention rules as starts. Extra fields, including project, mode, attachments, scheduling and execution overrides, are refused.

Use a thread ID from an allowed listing or accepted start. With separately approved control, send the follow-up through an authenticated MCP client:

```ts
const followUp = await client.callTool({
  name: "bb_send_message",
  arguments: {
    threadId: "thr_allowed",
    message: "Run the agreed checks and report the result.",
    operationKey: "follow-up-2026-10-06-1",
  },
});
const operationId = followUp.structuredContent?.operationId;
// Poll bb_get_operation with this ID to inspect submission, not completed work.
```

Both OAuth scopes, the current owner, local control permission and current project membership are required. A direct ID does not bypass project access. Membership is checked before claiming the operation, again before send, and before returning saved results. Status reads remain available with read scope when local control is disabled, but current owner/project/thread access still applies.

The plugin calls only `threads.send` with text input and `mode: "auto"`. BB starts idle input or applies its normal queue/steer behavior during active work. It keeps existing thread execution settings, dispatch hooks, concurrency limits, environment checks and pending approvals. It never approves a request or tries another route after a deferment or rejection. Handle permission decisions in BB.

Send results keep the existing `operationId`, `state`, `threadId`, `code`, and `meaning` fields. They also include `delivery` and `waitingOn`. Existing start results are unchanged.

| Send result                             | Meaning                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state: "accepted", delivery: "sent"`   | BB accepted the input. This is not completed agent work.                                                                                                                                                                                                                                                         |
| `state: "accepted", delivery: "queued"` | BB retained the input in its queue. It might be waiting or deferred, not running or complete.                                                                                                                                                                                                                    |
| `waitingOn`                             | The saved queue wait kind, such as `thread-busy`, `plugin`, `interaction`, `host-offline`, `provisioning`, `time`, `stopping` or `turn-starting`. Null means BB returned no wait kind. Private queue text, rule reasons and host names are omitted. This is the submission observation, not a live queue status. |
| `pending`                               | The send reply has not arrived. Poll the operation ID. Delivery is null.                                                                                                                                                                                                                                         |
| `failed`                                | No send was dispatched. The original key remains protected. Delivery is null.                                                                                                                                                                                                                                    |
| `unknown`                               | Submission might have occurred. Delivery is null. Inspect BB before deciding on a new key.                                                                                                                                                                                                                       |

After a lost reply, use the same normalized thread ID, exact message and original key. A matching key observes the saved result without sending again. A changed message, including whitespace, or changed target conflicts. Start and send have separate tool/key identities. A new intended instruction needs a new unique key. Completed send keys stay protected for at least 24 hours; unresolved keys never expire or replay.

Send uses the same response budget, SDK deadline, durable claim, capacity and generation rules as start. Disconnect after dispatch does not stop work. Any SDK send error stays unknown because the public SDK does not guarantee that errors occur before submission. A later result in the same generation can establish acceptance. Reload preserves outcomes and never resends. The ledger adds only delivery and wait-kind fields, not another message copy. Never delete the ledger to retry uncertain input.

## Local checks and release limits

Run the package's `test`, `typecheck`, and `build` scripts after `npm ci`. Also run `bb plugin types --check` against the supported BB version and repository `npm run check`. CI includes this package and its standalone build.

See [the BBP-82 follow-up checkpoint](VERIFICATION-BBP82.md), [the BBP-81 safe-start checkpoint](VERIFICATION-BBP81.md) for fixture-only control evidence and [the BBP-80 checkpoint](VERIFICATION-BBP80-CORRECTION.md) for thread-read evidence and limits, and [VERIFICATION.md](VERIFICATION.md) for the BBP-79 connection checks. No plugin installation, live OAuth account, public tunnel access, or ChatGPT web/mobile test is part of the local test run. These remain unverified. Read-only local MCP results do not establish native mobile support or later control-task acceptance.
