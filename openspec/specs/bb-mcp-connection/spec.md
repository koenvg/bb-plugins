# bb-mcp-connection Specification

## Purpose

Lets the owner connect ChatGPT web and the native ChatGPT mobile app to a restricted BB MCP endpoint without exposing the full BB server.

## Requirements

### Requirement: Remote access is explicitly configured

The plugin SHALL start with remote access disabled. Enabling access SHALL require a canonical public HTTPS URL, trusted OAuth issuer, and accepted owner identity. Authenticated read access SHALL permit discovery and thread reads for all current and future standard projects without per-project grants. Every remote tool SHALL exclude BB's built-in Personal project, including operation status and cached replies. Writes SHALL still require the mode-specific control permission and the local control switch. The plugin SHALL NOT create public exposure, reuse account cookies, or expose BB's main server as a setup side effect.

#### Scenario: Fresh installation

- **WHEN** the plugin is installed without remote access configuration
- **THEN** it exposes no usable remote tools and reports the missing setup locally without disclosing credentials

#### Scenario: Standard projects need no individual grant

- **WHEN** the owner enables remote reads with valid authentication
- **THEN** an authorized client can discover and read threads in all standard projects without a project allowlist
- **AND** BB's built-in Personal project is absent from discovery and unavailable to every remote tool
- **AND** writes still require the existing global control permissions

### Requirement: The connection is configurable in plugin settings

The owner SHALL be able to set the public HTTPS origin, local listener port, OAuth issuer and owner identity, and read/control access through BB's standard plugin settings. Values SHALL persist across restarts. No specific domain SHALL be hard-coded or required. Public-origin and listener-port changes SHALL take effect after plugin reload, while authentication and access changes SHALL retain their immediate effect. The local status command SHALL show the effective MCP URL and listener state without claiming public reachability from local readiness alone. Invalid origins or ports SHALL prevent the affected configuration from starting remote access.

#### Scenario: Legacy project settings do not restrict access

- **WHEN** stored settings contain the obsolete `projects` key with any value
- **THEN** configuration parsing ignores that key without changing the stored settings or the input object
- **AND** all standard projects remain eligible under the global permissions
- **AND** unrelated unknown settings and invalid security settings still fail closed

#### Scenario: Owner connects an existing tunnel

- **WHEN** the owner saves a valid HTTPS origin and matching local port with the required authentication settings and reloads the plugin
- **THEN** the plugin uses those settings and reports the full MCP URL for ChatGPT
- **AND** it does not request Cloudflare credentials, create a tunnel, change DNS, or run a connector

#### Scenario: Another installation uses another domain

- **WHEN** an owner configures an HTTPS origin outside `koenvg.be`
- **THEN** that origin is accepted under the same validation rules without a source-code change

#### Scenario: Local listener is ready but the tunnel is unavailable

- **WHEN** the plugin is listening locally but public access has not been verified
- **THEN** status distinguishes local readiness from unknown remote reachability

### Requirement: The supported deployment uses Cloudflare Tunnel

The initial supported deployment SHALL use an existing, operator-managed named Cloudflare Tunnel with a stable HTTPS hostname routed to the local MCP listener without inbound router port forwarding. The plugin SHALL NOT create, configure, delete, start, or stop tunnel infrastructure, manage DNS, or request or store Cloudflare credentials. It SHALL NOT use a temporary Quick Tunnel URL or expose BB's main server. Only the MCP and required discovery paths SHALL reach the listener; other paths SHALL return not found. Bearer mode SHALL have no Cloudflare browser-only gate, interactive challenge or extra service-token requirement. Cloudflare-access mode SHALL use the dedicated Managed OAuth flow with no separate service-token header. Restarting the tunnel connector SHALL preserve the public URL and SHALL NOT resubmit BB work. Disabling or reloading the plugin SHALL leave the operator's tunnel and connector unchanged.

#### Scenario: Cookie-free remote connection

- **WHEN** ChatGPT connects to the configured HTTPS hostname without Cloudflare browser cookies
- **THEN** metadata requests receive required public discovery data and unauthenticated MCP requests receive the selected deployment's OAuth challenge, with Cloudflare edge discovery/challenges separately verified for Managed OAuth
- **AND** BB admin paths are not forwarded to BB

#### Scenario: Connector restarts

- **WHEN** the tunnel connector stops and later reconnects
- **THEN** access resumes at the same HTTPS hostname once the listener and connector are ready
- **AND** no BB mutation is submitted merely because the tunnel reconnected

### Requirement: The endpoint supports remote MCP

The endpoint SHALL support MCP initialization, tool discovery, and tool calls over Streamable HTTP using a supported protocol version. The same public URL SHALL serve web and mobile connections. It SHALL support ordinary JSON responses without requiring a persistent client connection, a local subprocess, BB browser cookies, or custom BB headers. Unsupported protocol versions and HTTP methods SHALL receive protocol-appropriate errors.

#### Scenario: Reconnected mobile client

- **WHEN** a mobile client reconnects after its network connection closes
- **THEN** it can initialize and call tools with valid credentials without relying on an earlier transport session

#### Scenario: Invalid protocol request

- **WHEN** an authenticated client sends an unsupported protocol version or malformed tool request
- **THEN** the endpoint reports the error without invoking a BB action

### Requirement: Every protected request is authenticated

The endpoint SHALL authenticate MCP initialization, discovery, and tool calls using the explicitly selected mode. Default bearer-jwt mode SHALL require OAuth bearer JWT credentials and validate signature, trusted issuer, intended resource audience, expiry, validity start and configured owner. Cloudflare-access mode SHALL require a signed identity-based application assertion with the exact configured owner and dedicated application AUD, as specified below. Tokens in URLs, cookies or ordinary BB plugin tokens SHALL NOT substitute for the selected credential. Public metadata SHALL contain no BB user data.

#### Scenario: Invalid credentials

- **WHEN** a request has no token, an expired token, a forged signature, or the wrong issuer or audience
- **THEN** it receives an authentication failure and no BB operation runs
- **AND** the authentication challenge identifies the protected-resource metadata needed to connect

#### Scenario: Different account on the same issuer

- **WHEN** a valid token identifies someone other than the configured owner
- **THEN** access is denied even if that account has the requested OAuth scopes

### Requirement: Cloudflare Access is explicit and independently verified

The plugin SHALL default to bearer-jwt mode and SHALL NOT infer authentication mode from request headers or fall back after authentication failure. Cloudflare-access mode SHALL require configured public signing/OAuth issuers, stable owner subject and a dedicated app AUD before starting. It SHALL verify exactly one bounded signed Cf-Access-Jwt-Assertion using RS256 and keys only from the trusted team origin plus `/cdn-cgi/access/certs`. It SHALL enforce issuer, owner, application AUD, mandatory expiry, optional validity start, valid issuance time when present and application token type. It SHALL reject empty-sub service credentials, org tokens, malformed/combined assertions and untrusted signature/key algorithms. Token-supplied verification URLs, cookies and opaque bearer tokens SHALL NOT authorize origin calls. Signing keys SHALL use bounded retrieval, rotation and cache behavior, with no raw credential/claim logging.

#### Scenario: Invalid assertion plus a valid bearer

- **WHEN** Cloudflare mode receives a forged assertion alongside a valid bearer JWT
- **THEN** it rejects the request without a BB call or credential fallback

#### Scenario: Another app or service credential

- **WHEN** a signed assertion has another app AUD, another owner or empty-sub service identity
- **THEN** it cannot read data or invoke a BB mutation

#### Scenario: Role downgrade or audience change while waiting

- **WHEN** the local Cloudflare permission is downgraded or selected mode/AUD changes during an awaited access check
- **THEN** no unauthorized dispatch or cached private result is returned
- **AND** read-only operation inspection remains available when only write permission is removed

### Requirement: Read and control permissions are separate

In bearer-jwt mode, read tools SHALL require `bb.read`; writes SHALL require both `bb.read` and `bb.control`. In cloudflare-access mode, an explicit LOCAL app permission SHALL default to `read`; writes SHALL also require `read-control`. All state-changing tools in either mode SHALL require the owner's local control setting, disabled by default. Cloudflare permissions SHALL be shared by every valid owner/app session, not treated as OAuth scopes or per-client grants. Current owner, issuer, mode, audience, expiry, thread/operation project access and write permission SHALL be rechecked after waits, before dispatch and before cached private results. Removing access SHALL NOT stop existing BB work.

#### Scenario: Read-only connection attempts a mutation

- **WHEN** a connected client has `bb.read` but not `bb.control`, or local control is disabled
- **THEN** it can discover standard projects and read their thread data but cannot start, message, or stop a thread

#### Scenario: Access is removed during a connection

- **WHEN** the owner disables remote reads after a client has connected
- **THEN** subsequent project discovery, thread-content reads, operation reads, and writes are denied
- **AND** previously running BB work is not stopped merely because remote access was removed

### Requirement: Connection setup follows OAuth discovery

The public endpoint SHALL publish protected-resource metadata with its canonical resource identifier and configured authorization-server issuer. Bearer mode SHALL advertise its supported BB scopes. Cloudflare mode SHALL NOT advertise unproved BB OAuth scopes, and SHALL distinguish the verified OAuth server issuer from the assertion-signing issuer. Setup documentation SHALL describe authorization code with PKCE, supported ChatGPT registration and renewal. Credentials for another resource/application SHALL be rejected.

#### Scenario: First connection and later token renewal

- **WHEN** the owner connects from ChatGPT and later needs a renewed token
- **THEN** ChatGPT can discover the configured authorization server, complete the supported authorization flow, and resume permitted tool calls

### Requirement: Public exposure is bounded

The remote entry point SHALL expose only MCP and required connection metadata, not BB's general HTTP interface or a generic proxy. It SHALL reject untrusted supplied origins and hosts, enforce request size and time limits, and rate-limit requests. Client-supplied forwarded headers SHALL NOT change the trusted public resource URL. Credentials, prompts, and thread output SHALL NOT appear in routine request logs.

#### Scenario: Attempt to reach BB through the MCP entry point

- **WHEN** a remote caller requests a BB admin path, supplies an untrusted origin or host, or exceeds a configured request limit
- **THEN** the entry point rejects the request without forwarding it to BB

#### Scenario: Failed authenticated tool call

- **WHEN** a tool fails after authentication
- **THEN** local diagnostics identify the tool, request, and safe error code without recording its bearer token, prompt, or thread output

### Requirement: Plugin lifecycle closes remote access

Disabling, reloading, or shutting down the plugin SHALL stop accepting new requests and release its listener and transport resources. Closing an MCP connection or reloading the plugin SHALL NOT stop a BB thread. Incomplete state-changing operations SHALL remain inspectable after restart, without automatic replay.

#### Scenario: Reload during a thread start

- **WHEN** the plugin reloads while the outcome of a submitted start operation is not yet known
- **THEN** the new instance can report that operation as unresolved and does not submit it again automatically
- **AND** the old listener does not remain active

### Requirement: Web and mobile are release acceptance targets

The release SHALL include a verification record for ChatGPT web and the owner's native ChatGPT mobile app. Each target SHALL test connection, tool discovery, an allowed read, a confirmed start, follow-up instructions, status retrieval, stop, and denied access after revocation. The record SHALL identify date, account plan or workspace, client version or browser, mobile OS, endpoint build, expected results, and observed results without secrets. Protocol tests alone SHALL NOT count as client compatibility verification.

#### Scenario: Both clients complete the workflow

- **WHEN** the required workflow succeeds on web and the owner's mobile app
- **THEN** the release record marks both targets passed and identifies the exact tested configuration

#### Scenario: A client blocks write tools

- **WHEN** either client cannot invoke a correctly declared write tool because of account access, client support, or policy
- **THEN** the release record marks that target blocked or failed with evidence
- **AND** the plugin does not relabel a write as read-only or claim that web-only verification satisfies the request
