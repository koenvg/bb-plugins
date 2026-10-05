# Spec Delta

## Purpose

Lets the owner connect ChatGPT web and the native ChatGPT mobile app to a restricted BB MCP endpoint without exposing the full BB server.

## ADDED Requirements

### Requirement: Remote access is explicitly configured

The plugin SHALL start with remote access disabled. Enabling access SHALL require a canonical public HTTPS URL, trusted OAuth issuer, accepted owner identity, and explicit project allowlist. An empty allowlist SHALL grant access to no projects. The plugin SHALL NOT create public exposure, reuse account cookies, or expose BB's main server as a setup side effect.

#### Scenario: Fresh installation

- **WHEN** the plugin is installed without remote access configuration
- **THEN** it exposes no usable remote tools and reports the missing setup locally without disclosing credentials

#### Scenario: No projects are allowed

- **WHEN** the owner configures authentication but allows no projects
- **THEN** the client receives no project data and cannot operate on a project or thread

### Requirement: The connection is configurable in plugin settings

The owner SHALL be able to set the public HTTPS origin, local listener port, OAuth issuer and owner identity, allowed projects, and read/control access through BB's standard plugin settings. Values SHALL persist across restarts. No specific domain SHALL be hard-coded or required. Public-origin and listener-port changes SHALL take effect after plugin reload, while authentication and access changes SHALL retain their immediate effect. The local status command SHALL show the effective MCP URL and listener state without claiming public reachability from local readiness alone. Invalid origins or ports SHALL prevent the affected configuration from starting remote access.

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

The initial supported deployment SHALL use an existing, operator-managed named Cloudflare Tunnel with a stable HTTPS hostname routed to the local MCP listener without inbound router port forwarding. The plugin SHALL NOT create, configure, delete, start, or stop tunnel infrastructure, manage DNS, or request or store Cloudflare credentials. It SHALL NOT use a temporary Quick Tunnel URL or expose BB's main server. Only the MCP and required discovery paths SHALL reach the listener; other paths SHALL return not found. MCP requests SHALL reach OAuth authentication without a Cloudflare browser-login gate, interactive challenge, or extra service-token requirement. Restarting the tunnel connector SHALL preserve the public URL and SHALL NOT resubmit BB work. Disabling or reloading the plugin SHALL leave the operator's tunnel and connector unchanged.

#### Scenario: Cookie-free remote connection

- **WHEN** ChatGPT connects to the configured HTTPS hostname without Cloudflare browser cookies
- **THEN** metadata requests receive the required public discovery data and unauthenticated MCP requests receive the plugin's OAuth challenge
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

The endpoint SHALL require OAuth bearer credentials for MCP initialization, discovery, and tool calls. It SHALL validate token signature, trusted issuer, intended resource audience, expiry, validity start, and configured owner identity. Tokens in URLs or ordinary BB plugin tokens SHALL NOT substitute for OAuth credentials. Public resource metadata SHALL contain no BB user data.

#### Scenario: Invalid credentials

- **WHEN** a request has no token, an expired token, a forged signature, or the wrong issuer or audience
- **THEN** it receives an authentication failure and no BB operation runs
- **AND** the authentication challenge identifies the protected-resource metadata needed to connect

#### Scenario: Different account on the same issuer

- **WHEN** a valid token identifies someone other than the configured owner
- **THEN** access is denied even if that account has the requested OAuth scopes

### Requirement: Read and control permissions are separate

Read tools SHALL require `bb.read`. State-changing tools SHALL require both `bb.read` and `bb.control`, plus the owner's local remote-control setting. Control SHALL be disabled by default. Disabling remote access, disabling control, removing an owner identity, or removing a project SHALL apply to subsequent requests, including requests using previously issued tokens. Authorization SHALL be checked again immediately before a state-changing BB call.

#### Scenario: Read-only connection attempts a mutation

- **WHEN** a connected client has `bb.read` but not `bb.control`, or local control is disabled
- **THEN** it can read allowed data but cannot start, message, or stop a thread

#### Scenario: Access is removed during a connection

- **WHEN** the owner removes a project's access after a client has connected
- **THEN** subsequent reads and writes for that project are denied
- **AND** previously running BB work is not stopped merely because remote access was removed

### Requirement: Connection setup follows OAuth discovery

The public endpoint SHALL publish protected-resource metadata with its canonical resource identifier, trusted authorization-server location, and supported scopes. Setup documentation SHALL describe an OAuth authorization-code flow with PKCE, supported ChatGPT client registration, and token renewal. It SHALL distinguish the MCP resource server from the authorization server and reject credentials minted for another resource.

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
