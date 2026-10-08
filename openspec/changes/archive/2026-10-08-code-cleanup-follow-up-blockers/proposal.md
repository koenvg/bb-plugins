# Proposal

## Why

The default Code Cleanup instructions mention required blockers but do not state the dependency direction. A cleanup ticket that needs the current change merged first must wait for the current ticket, not prevent that ticket from finishing.

## What Changes

- Tell the agent to mark a new cleanup ticket as blocked by the current ticket when the cleanup needs the current change merged first.
- Require verified task keys and a saved dependency, not just a note in the description. Report a missing key or failed dependency write without claiming success.
- State that this follow-up must not block completion of the current ticket. Do not add a dependency when the cleanup is independent.
- Preserve custom project instructions and the existing task-recording safeguards.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `code-cleanup-guidance`: Add an explicit rule for follow-up dependency direction and failure reporting in the default instructions.

## Impact

- Update `bb-plugin-code-cleanup/guidance.ts`, policy tests in `guidance.test.ts`, and the factory-behavior paragraph in `README.md`.
- Keep Settings, storage, task APIs, dependencies, and custom prompts unchanged. Fresh sessions using the factory prompt receive the updated rule; existing sessions keep their prior instructions.
- The durable spec still describes reporting candidates only. The existing `code-cleanup-settings-controls` delta and current source already use BB Tasks. This proposal builds on that task-recording behavior and adds a separate requirement, without replacing or reverting the other change. Integrate the settings change before archiving this delta.
