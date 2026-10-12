# Proposal

## Why

AI-created Code Cleanup follow-ups read like investigation reports. Humans need a short statement of the work, while agents need evidence and constraints without repeated history.

## What Changes

- Give new follow-ups a short action title and two Markdown sections in the existing description field: `Summary` and `Agent context`.
- Limit the Summary to 80 words covering the problem, impact, desired outcome and up to three completion checks. There is no minimum length.
- Target at most 120 words for Agent context, covering relevant locations, verified evidence, task-specific constraints and source links. Preserve required safeguards when compression needs more words.
- Include three compact examples in the factory guidance: observed defect, concrete maintenance cost and investigation of an observed failure.
- Put detailed reports behind evidence links or existing task attachments. State each fact once and distinguish observations from uncertain causes.
- Retain task qualification, tracker routing, duplicate checks, verified dependencies and honest failure reporting.
- Leave existing tasks, saved custom prompts and active provider sessions unchanged. This format applies only to Code Cleanup follow-ups using the new factory guidance.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `code-cleanup-guidance`: Add a concise human/agent description format and examples while preserving follow-up recording safeguards.

## Impact

- Update `bb-plugin-code-cleanup/guidance.ts`, its focused tests and relevant package documentation during implementation.
- Reuse the existing description field, CLI, attachments and configuration resolver. No database, API, task UI, enablement or other task-writing changes.
- Keep the factory prompt within the existing 4,096-character instruction limit. No new dependencies or separate agent skill.
- This proposal creates planning artifacts only. It does not edit implementation or live settings.
