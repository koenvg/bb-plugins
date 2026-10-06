# MCP project reads

A headless BB plugin for authenticated, allowlisted project listing. It uses BB's standard plugin settings. It exposes one read-only tool, `bb_list_projects`. It has no thread tools, control tools, admin routes, shell tools, file tools, or generic forwarding.

Requires BB 0.45 with SDK 0.6.15 and Node 24.15 or later in Node 24. The official MCP SDK and `jose` versions are pinned in [package.json](package.json). Each request uses a new stateless Streamable HTTP transport with JSON responses. GET streams and session deletion are not supported. A reconnect can initialize again or send a protected request without a previous session ID.

## Safety and consent

Allowed project names can be sent to ChatGPT. Later thread-read tools can also send allowed project content. Only allow projects whose content you consent to share. Names and other project text are untrusted data, not instructions. An allowlist limits access to BB objects. It is not an agent filesystem sandbox.

Remote access and control start disabled. This version never exposes control tools, even if the reserved control setting is enabled. Disabling the plugin or remote access releases only its listener. It does not stop BB threads or change the external tunnel.

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
| `controlEnabled` | Reserved control switch, false by default. Has no effect on this read-only catalog.                                                                    |

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

Request and complete response bodies are limited to 64 KiB. A very large project-name page returns a safe error; use a smaller page. The listener permits eight concurrent HTTP requests and eight outstanding BB reads, 120 admitted requests per minute across the endpoint, 32 TCP connections, and a five-second request deadline. It uses one global rate bucket because the external connector hides client IPs; forwarded IPs cannot bypass it. Issuer responses are limited to 32 KiB and three seconds per fetch.

A timed-out read is not retried automatically. BB's project-list API has no cancellation parameter; the bounded read can finish later, but its output is discarded. Its read slot stays occupied until it settles. Disable/reload closes transport resources and the listener without calling any thread operation.

Routine rejection logs contain only a generated request ID and fixed safe error code. They omit tokens, request bodies, project names and BB error text.

## Local checks and release limits

Run the package's `test`, `typecheck`, and `build` scripts after `npm ci`. Also run `bb plugin types --check` against the supported BB version and repository `npm run check`. CI includes this package and its standalone build.

See [VERIFICATION.md](VERIFICATION.md) for evidence and external checks. No plugin installation, live OAuth account, public tunnel access, or ChatGPT web/mobile test is part of the local test run. These remain unverified. Read-only local MCP results do not establish native mobile support or later control-task acceptance.
