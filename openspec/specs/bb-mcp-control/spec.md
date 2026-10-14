# bb-mcp-control Specification

## Purpose

Lets an authorized remote client discover, inspect, and control ordinary BB threads in all standard projects through a small set of MCP tools. BB's built-in Personal project is excluded. BB execution permissions remain unchanged.

## Requirements

### Requirement: The tool set has an explicit scope

The plugin SHALL expose tools for listing projects, listing threads, reading one thread's status and recent output, starting a thread, sending instructions, stopping work, and reading a submitted operation's status. It SHALL NOT expose a generic SDK call, shell execution, direct file access, BB administration, deletion, publication, task-board mutation, or approval of pending agent permissions. Tool descriptions SHALL explain that starting or messaging an agent can still cause code changes, external actions, and provider costs under that agent's existing permissions.

#### Scenario: Tool discovery

- **WHEN** an authorized client lists tools
- **THEN** it receives the bounded tool set and accurate read/write annotations
- **AND** it receives no generic command or approval tool

### Requirement: Writes retain mode-specific authorization

Bearer-jwt mode SHALL retain both bb.read and bb.control scope checks. Cloudflare-access mode SHALL use only the explicit local read/read-control app permission, default read, for the verified owner/application. Every write SHALL also require local controlEnabled and current project/thread access. Identity alone, a forged scope claim or enabling only the control switch SHALL NOT grant Cloudflare control. Changing modes SHALL NOT alter operation identities, retention, unknown-state handling, permissions, queues or BB defaults.

#### Scenario: Cloudflare read app permission with local control enabled

- **WHEN** a valid owner/app assertion calls start, send or stop with accessPermission=read and controlEnabled=true
- **THEN** no BB read-for-dispatch or mutation is submitted

#### Scenario: Separate owner/app grants share the local control permission

- **WHEN** the owner separately approves read-control and local control for that app
- **THEN** all valid owner/app sessions share that permission and the same duplicate-operation identity
- **AND** no claim of per-client OAuth scope separation is made

### Requirement: Project discovery includes all standard projects

Project listings SHALL include all existing standard projects through `projects.list({ includePersonal: false })`. The handler SHALL exclude BB's built-in Personal project even if the SDK adapter returns it. Filtering SHALL occur before sorting, pagination, and projection. New standard projects SHALL appear on the next request without a settings edit. Discovery SHALL retain authentication and read-access checks before and after the SDK read, return only project IDs and names, and preserve bounded pagination and request limits. A standard project named Personal SHALL remain eligible.

#### Scenario: Discovery without project grants

- **WHEN** an authenticated client with current read access lists projects
- **THEN** the paginated results include all existing standard project IDs and names but not BB's built-in Personal project
- **AND** no other SDK project fields are returned

#### Scenario: Newly created project

- **WHEN** a standard project is created after a successful listing and settings remain unchanged
- **THEN** it is included in the next project listing under the same pagination and ordering rules

#### Scenario: Access changes during discovery

- **WHEN** the owner, authentication or remote-read access becomes invalid while the SDK project read is in progress
- **THEN** the request returns no project data after the read completes

### Requirement: Thread and operation scope is enforced for every identifier

Thread and operation access SHALL verify current project membership and exclude BB's built-in Personal project even when the caller supplies an identifier directly. All standard projects SHALL be eligible without per-project grants, subject to the existing global permissions. A thread or operation identifier outside the caller's scope SHALL return no private object data and SHALL be indistinguishable from an unavailable identifier. Only the submitting owner SHALL read an operation record. Stored Personal operation records SHALL remain durable under existing retention rules and available to local diagnostics, but SHALL NOT be returned through remote status or cached replies.

#### Scenario: Direct access to a Personal thread

- **WHEN** a client supplies a real thread ID from BB's built-in Personal project
- **THEN** reading, messaging, and stopping that thread are rejected without revealing its title, output, or project details
- **AND** no operation claim or BB mutation is submitted

#### Scenario: Scope changes before replay

- **WHEN** a completed operation's thread has moved to BB's built-in Personal project before retry or status lookup
- **THEN** the caller receives no cached private result and no repeated BB action

#### Scenario: Old Personal operation records

- **WHEN** a client polls or replays an operation recorded for BB's built-in Personal project
- **THEN** the remote request is denied even when no thread ID is recorded or its thread has moved to a standard project
- **AND** the record remains available to local diagnostics without redispatch

### Requirement: Read results are bounded and treated as data

List tools SHALL use bounded pages, with a maximum of 50 records per response and explicit continuation information. `bb_list_threads` SHALL exclude hidden workers and archived threads before pagination, with no caller option to include them. Archive state SHALL NOT be an access boundary: `bb_get_thread` SHALL permit direct reads of archived threads when current project membership and access checks pass. Thread reads SHALL return status, a bounded recent assistant output, and a pending-interaction indicator rather than raw transcripts. Structured responses SHALL omit credential, environment-variable, and local-filesystem fields from BB objects. Output SHALL state whether it was truncated. Tools SHALL describe agent output as untrusted data, not instructions for the calling assistant, and warn that an allowed thread's text can contain private project information.

#### Scenario: Archived threads cross page boundaries

- **WHEN** a client lists an allowed project with archived threads interspersed among nonarchived threads across page boundaries
- **THEN** each page contains only visible nonarchived threads, up to the requested page limit
- **AND** continuation cursors advance through the filtered list without gaps caused by archived rows

#### Scenario: Only archived threads remain

- **WHEN** an allowed project contains only archived threads
- **THEN** `bb_list_threads` returns an empty thread list and no continuation cursor

#### Scenario: Direct read of an archived thread

- **WHEN** a client supplies an archived thread's ID and its current project membership and access checks pass
- **THEN** `bb_get_thread` returns the same bounded status and output fields as for a nonarchived thread
- **AND** the archived thread remains excluded from `bb_list_threads`

#### Scenario: Large thread output

- **WHEN** the latest assistant output exceeds the documented response limit
- **THEN** the response contains a bounded excerpt and a truncation indicator instead of the full transcript

#### Scenario: Permission request blocks a thread

- **WHEN** a thread is waiting for a permission decision
- **THEN** the read result reports that the owner must handle it in BB and does not resolve it

### Requirement: Starting a thread uses BB defaults

Starting a thread SHALL require an allowed project ID, a nonempty prompt, and a caller-supplied operation key. It SHALL create an ordinary visible thread using that project's configured default environment and execution settings. Remote input SHALL NOT override agent permission mode, filesystem location, provider credentials, or machine selection. Creating a thread SHALL NOT create or update a Tasks Plus task.

#### Scenario: Successful start

- **WHEN** an authorized owner submits a valid start request
- **THEN** the response identifies the operation and the created thread, or reports a pending or uncertain outcome if completion cannot yet be established
- **AND** the plugin does not wait for the agent to finish its work

#### Scenario: Missing project defaults

- **WHEN** BB rejects the project's default execution or environment configuration
- **THEN** the plugin reports the BB failure without choosing another machine or reducing agent permissions

### Requirement: Follow-up and stop use ordinary BB behavior

Sending instructions SHALL require a permitted thread, a nonempty message, and an operation key. It SHALL use BB's normal send behavior for idle and active threads and report the actual accepted or queued state. Stopping work SHALL require a permitted thread and an operation key, preserve the thread and its history, and report the actual outcome. A queued message SHALL NOT be reported as completed work. A transport disconnect SHALL NOT cancel an accepted instruction or stop a thread.

#### Scenario: Instructions arrive during active work

- **WHEN** the client sends instructions to an active allowed thread
- **THEN** BB applies its normal queue or steer behavior and the response reports what BB accepted

#### Scenario: Owner stops a thread

- **WHEN** the owner submits a permitted stop request
- **THEN** the plugin asks BB to stop that thread without deleting it or approving any pending interaction

### Requirement: Mutation retries do not silently repeat work

Each state-changing request SHALL include an operation key scoped to the authenticated owner and tool. The plugin SHALL durably associate the key with the validated input and outcome before reporting success. Concurrent requests and retries with the same key and input SHALL NOT dispatch another BB mutation. Reusing the same key with different input SHALL fail. Completed records SHALL remain available for at least 24 hours, and unresolved records SHALL remain protected from replay until locally resolved. Documentation SHALL state the retention window and require reuse of the original key after a transport error.

#### Scenario: Reply is lost after a successful start

- **WHEN** the client retries the same start operation within the retention window
- **THEN** it receives the recorded thread result without creating another thread

#### Scenario: Two requests use the same key

- **WHEN** duplicate mutation requests arrive concurrently
- **THEN** at most one request dispatches the BB action and the other reports the existing operation

#### Scenario: Key is reused with another prompt

- **WHEN** the same owner and tool receive the same operation key with different validated input
- **THEN** the plugin reports a conflict without executing the changed input

#### Scenario: BB outcome is uncertain

- **WHEN** the plugin loses its connection or stops after dispatch but before recording the outcome
- **THEN** the operation is reported as unknown or pending, not failed with a safe-to-retry promise
- **AND** repeating its key does not dispatch it again

### Requirement: Operation status supports asynchronous use

A submitted operation SHALL have a stable ID and an inspectable status that distinguishes pending dispatch outcome, accepted action, confirmed failure, and unknown outcome. Status reads SHALL not repeat the mutation. Accepted actions SHALL identify their thread when known and SHALL not imply that the agent finished the requested work. Unknown outcomes SHALL direct the owner to inspect BB before submitting a new operation.

#### Scenario: Client returns after a disconnect

- **WHEN** the owner requests the status of an operation created before the disconnect
- **THEN** the plugin returns the persisted outcome without starting or messaging an agent

### Requirement: BB remains responsible for execution controls

All mutations SHALL use BB's normal project and thread operations and respect its queueing, dispatch hooks, concurrency controls, environment checks, and agent permission requests. MCP write tools SHALL be marked as writes, with risk descriptions suitable for ChatGPT confirmation. Client annotations SHALL NOT substitute for server-side authorization or be changed to bypass a client's restrictions.

#### Scenario: BB defers work

- **WHEN** a BB dispatch rule or concurrency limit defers a submitted instruction
- **THEN** the plugin reports the deferred state without trying another route to run it

#### Scenario: Agent requests permission

- **WHEN** an agent started through MCP asks for an approval
- **THEN** the request remains pending in BB until the owner handles it through BB's existing workflow
