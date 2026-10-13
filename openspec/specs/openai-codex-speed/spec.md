# openai-codex-speed Specification

## Purpose

Let users select speed tiers supported by their active ChatGPT account and OpenAI Codex model in standalone Pi and BB's Pi with subagents provider, without exposing unavailable subscription options.

## Requirements

### Requirement: Account and model determine availability

The system SHALL offer non-default speed tiers only when the active `openai-codex` account's authoritative model capability response confirms their availability for the selected model. Static model names, subscription labels, provider-wide tier declarations, and another account's cached catalog SHALL NOT establish availability.

Ultrafast SHALL remain absent while its wire mapping is unverified. The current BB provider SHALL declare only Default and Fast.

#### Scenario: Current account supports Fast only

- **WHEN** the active account's selected model advertises Fast and does not advertise Ultrafast
- **THEN** Default and Fast are selectable
- **AND** Ultrafast is absent, not a disabled choice

#### Scenario: Account supports both tiers

- **WHEN** the active account's selected model explicitly advertises Fast and Ultrafast tiers with verified wire mappings
- **THEN** both options are selectable with Default

#### Scenario: Model has no advertised speed tiers

- **WHEN** the selected model has no confirmed non-default tiers
- **THEN** neither Fast nor Ultrafast is selectable

### Requirement: Uncertain discovery grants no tier

Missing, expired, failed, or unrecognized account-capability data SHALL expose no non-default speed tier. Standard-speed operation SHALL remain usable. The system SHALL provide a manual refresh action and distinguish a discovery failure from a successful response with no additional tiers. The BB-managed source SHALL renew expired successful evidence before non-default dispatch with at most one discovery attempt per validation, coalescing pending discovery. Only fresh evidence for the current account and request token SHALL authorize the final payload. Cached discovery failures for the same token SHALL require manual refresh or invalidation before discovery can run again. This renewal SHALL NOT retry a model request after server refusal.

#### Scenario: Initial discovery fails

- **WHEN** account-capability discovery fails while the selection is Default
- **THEN** the user can run at Default and retry discovery manually
- **AND** Fast and Ultrafast remain hidden

#### Scenario: Successful evidence expires before dispatch

- **GIVEN** the BB-managed adapter has a successful capability snapshot for Fast
- **WHEN** that snapshot expires before a new turn or continuation payload is ready
- **THEN** the source renews discovery once before dispatch and authorizes Fast only with fresh evidence
- **AND** failed or revoked discovery blocks Fast while Default remains usable without discovery

#### Scenario: Unknown tier is returned

- **WHEN** the response contains an unknown tier or an incomplete tier mapping
- **THEN** that tier is not offered or sent to OpenAI
- **AND** confirmed recognized tiers remain usable

### Requirement: Speed selection is separate from reasoning

Standalone Pi SHALL provide a speed command with an interactive picker and explicit tier arguments. The BB `pi-subagents` provider SHALL use BB's native model-picker speed controls and its native service-tier setting. Selecting speed SHALL leave model, reasoning effort, and the running turn unchanged and SHALL NOT initiate a model request. The user accepts BBP-201: when discovery fails or revokes Fast, a model or reasoning edit can submit BB's displayed fallback Default as explicit and replace saved Fast. This known limitation SHALL be documented; it does not relax non-default entitlement or payload guards. BB SHALL support `/speed refresh` privately and reject all other `/speed` commands and attachments without model dispatch or execution reconciliation.

#### Scenario: User chooses Fast

- **WHEN** the user chooses available Fast in Pi or BB
- **THEN** Fast is shown as the selected speed for the next applicable turn
- **AND** model and reasoning effort remain unchanged

#### Scenario: User types an unavailable tier

- **WHEN** a command or incoming thread option requests an unconfirmed tier
- **THEN** the system rejects the selection with a clear explanation
- **AND** no request using that tier is sent

#### Scenario: Change is made during an active turn

- **WHEN** the user selects another available speed during a running turn
- **THEN** the change applies to the next turn without changing in-flight requests

#### Scenario: Accepted BB fallback Default

- **WHEN** failed or revoked discovery narrows the displayed BB speed to Default and a model or reasoning edit submits that fallback as explicit
- **THEN** BB may replace saved Fast with Default under the accepted BBP-201 limitation
- **AND** unconfirmed non-default dispatch remains blocked, with no automatic retry after a server refusal

### Requirement: Dispatch uses the selected supported tier

Each applicable `openai-codex` request SHALL use the verified wire tier associated with the selected speed, including continuation requests. Default SHALL use standard provider behavior. A server refusal of a selected non-default tier SHALL be reported without an automatic downgrade or speculative retry at another tier.

#### Scenario: Fast request is inspected

- **WHEN** Fast is selected and remains confirmed for the current account and model
- **THEN** the outgoing request contains the verified Fast service-tier value
- **AND** tool continuations retain that turn's selected speed

#### Scenario: Default request is inspected

- **WHEN** Default is selected
- **THEN** the speed feature adds no non-default service tier to the request

#### Scenario: OpenAI refuses the tier

- **WHEN** OpenAI rejects the selected tier
- **THEN** the error is visible and the user can select Default or refresh availability before retrying
- **AND** the feature does not resend at a different tier automatically

### Requirement: Resume restores and revalidates selection

Pi session resume and BB thread resume SHALL restore the saved speed preference and validate it against the active account and model before sending a non-default request. If the saved tier is unavailable or cannot be confirmed, the system SHALL report the problem and require an explicit supported selection or successful refresh rather than silently downgrading.

BB SHALL restore its native service-tier setting without consulting or deleting the superseded private preference sidecar. Speed initialization SHALL NOT publish native history or reopen the session before its first model prompt.

#### Scenario: Supported Fast selection is resumed

- **WHEN** a session or thread saved with Fast resumes and Fast is still confirmed
- **THEN** its next applicable request uses Fast without another selection

#### Scenario: Subscription no longer provides the saved tier

- **WHEN** the saved tier is absent from the active account's current model capabilities
- **THEN** the unavailable tier is not offered in the picker
- **AND** the next non-default turn is blocked with instructions to select an available tier

#### Scenario: Account changes

- **WHEN** the active Pi account changes
- **THEN** prior account capability data does not authorize a tier for the new account
- **AND** the saved preference is revalidated before dispatch

#### Scenario: New BB thread uses the native writer

- **WHEN** a new Pi with subagents thread starts before its first model prompt
- **THEN** speed initialization does not replace or reopen the native session
- **AND** Pi persists the first user message and resumed history through its own session writer

### Requirement: Scope stays limited to the selected provider

Speed handling SHALL apply only to `openai-codex` in standalone Pi and the BB provider `pi-subagents`. It SHALL leave other model routes, the bundled BB Pi provider, provider defaults, and existing subagent lifecycle and observation behavior unchanged. Separate child sessions SHALL keep their own settings without new automatic inheritance.

#### Scenario: User changes to another model route

- **WHEN** the selected model uses a route other than `openai-codex`
- **THEN** the feature offers no Fast or Ultrafast choice and injects no service-tier field
- **AND** the route's ordinary behavior remains unchanged

#### Scenario: Bundled Pi provider remains installed

- **WHEN** the updated Pi with subagents plugin is installed
- **THEN** the bundled BB Pi provider is not modified, disabled, or replaced
- **AND** no provider default is changed

#### Scenario: Parent delegates work

- **WHEN** a parent using Fast launches or observes a subagent
- **THEN** existing subagent behavior remains intact
- **AND** this feature does not overwrite the child session's speed settings

### Requirement: Account credentials stay private

Capability discovery SHALL use Pi's active `openai-codex` authentication through its supported runtime. Tokens, account identifiers, and raw authenticated responses SHALL NOT be sent to BB's server or app, persisted in session metadata, or included in diagnostics. Only normalized, non-secret availability and error information SHALL cross the bridge.

#### Scenario: BB requests model availability

- **WHEN** the BB plugin probes the selected workspace's Pi model catalog
- **THEN** its result contains normalized supported tiers and safe descriptions
- **AND** it contains no authentication token or account identifier

#### Scenario: Authentication or discovery fails

- **WHEN** an authenticated capability request fails
- **THEN** the user receives a safe error category and a manual retry action
- **AND** diagnostics contain no credentials or raw authenticated response
