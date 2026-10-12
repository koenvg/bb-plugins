# Design

## Context

See [proposal.md](proposal.md) for motivation and scope. `defaultGuidance()` in `bb-plugin-code-cleanup/guidance.ts` is the single factory policy source. The agent configuration resolver already selects saved custom text or that default. It contributes instructions, not task-writing tools or an imported skill.

The current creation step lists required information without a format or length target. `guidance.test.ts` checks recording safeguards and a local 2,000-character concision bound. The prompt editor accepts up to 4,096 characters. `agent.test.ts` already covers default delivery, exact custom text, reload and explicit Reset.

An existing `code-cleanup-settings-controls` change also addresses factory behavior. This change builds on the checked-in task-recording implementation and does not alter that change's enablement or storage decisions.

## Goals / Non-Goals

- Keep one authoritative format beside the task creation step.
- Demonstrate short, complete follow-ups without adding a lookup or task-writing subsystem.
- Validate the delivered policy and examples without creating live tracker tasks.
- The Markdown split is an information hierarchy, not a privacy boundary or collapsible UI. Agents receive both sections.

## Decisions

### Keep rules and examples in the factory prompt

Replace the long field inventory at the creation step with the Summary/Agent context format and its limits. State shared rules once, followed by three compact examples. Keep CLI discovery in the existing `bb tasks` help pointer rather than copying command syntax.

A separate reference file would reduce always-loaded example text, but introduce a pointer and file-access requirement for a small, always-relevant format. A new skill would add packaging and invocation work. Neither earns its cost for this first version.

### Use budgets as authoring instructions

Count whitespace-delimited words in section bodies, excluding titles and section headings. The Summary ceiling is 80 words; Agent context targets 120. Shorter is better when complete. Preserve essential constraints and briefly explain any context overrun. Put detailed evidence behind retrievable links or task attachments using existing capabilities.

There is no runtime parser, validator, truncation or rejection of task descriptions. This avoids weakening safeguards or changing manually authored tasks. Use observation-led wording when a cause is unproven.

### Demonstrate three qualifying findings

These are illustrative drafts, not evidence of issues in this repository. Replace bracketed locations, evidence and source placeholders with verified values. The implementation may shorten wording while preserving the demonstrated behavior.

#### Observed defect: Keep keyboard focus after sheet replacement

```markdown
## Summary
Replacing a sheet left keyboard controls without focus, blocking keyboard-only use.
Done when:
- The affected control retains the expected focus.
- The keyboard regression passes with its assertions intact.

## Agent context
Observed during [reproduction]. Start at [control and test locations]. Preserve draft and navigation behavior. Evidence: [retrievable trace]. Source: [verified task and thread links].
```

#### Maintenance: Consolidate filter parsing

```markdown
## Summary
Adding a label filter required matching edits in three parsers. Share the existing parsing so the next filter change needs one edit.
Done when:
- All current callers use one parser.
- Existing filter behavior passes the same public-boundary checks.

## Agent context
Matching logic appears at [three verified locations]. The duplication complicated [current change]. Keep the current filter contract. Evidence: [source comparison]. Source: [verified task and thread links].
```

#### Investigation: Diagnose local browser focus failures

```markdown
## Summary
Local focus failures prevent reliable browser validation.
Done when:
- Traces establish the cause.
- A justified fix passes relevant and full browser checks, or remaining limits are reported.

## Agent context
Failures occur in both current and baseline runs; the current change is not a proven cause. Start at [focus helper and affected tests]. Keep keyboard assertions intact; use trace-backed fixes. Evidence: [comparison report and traces]. Source: [verified task and thread links].
```

### Verify policy without treating text checks as model proof

Extend `guidance.test.ts` to check the two headings, budgets, example coverage and retained safeguards. Count each shipped example's section words. Keep a fixed total prompt ceiling of 4,096 characters for the existing project-ID fixtures. Replace the older 2,000-character expectation if compact examples cannot fit, rather than removing size checks.

Use the existing host tests to verify the new default reaches eligible sessions while custom text and Reset behavior remain exact. Avoid a new model-evaluation dependency. A read-only rewrite of the supplied focus finding is an acceptance example, not proof that every model will comply.

## Risks / Trade-offs

- Models can exceed writing targets. Mitigate with direct instructions, short examples and an acceptance rewrite; state the limit of deterministic tests.
- Short text can omit critical scope. Keep required task-specific safeguards in Agent context and allow a justified overrun there.
- Inline examples increase session context. Keep only three compact examples and one shared rule set within the existing prompt limit.
- Existing custom prompts retain verbose behavior. Preserve them exactly; adoption requires an explicit user Reset or edit.

## Migration Plan

No storage migration or live task edits. Ship the factory guidance, focused tests and documentation together. Newly constructed eligible sessions using the default receive the new format. Existing sessions retain earlier instructions.

Rollback restores the prior factory text without rewriting tasks or settings. Recheck the factory prompt when merging with overlapping cleanup work; preserve the existing routing and dependency safeguards.
