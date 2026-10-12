# Acceptance rewrite

Read-only draft from the supplied screenshot. No tracker task or live configuration was changed. Observations and evidence references below are reported by the screenshot, not independently verified test results. The source thread link was not visible.

## Draft title

Diagnose local browser focus failures

## Draft description

```markdown
## Summary
Local keyboard/focus failures block reliable browser validation of a fixture-only change.
Done when:
- Retained traces establish the cause; add a public-boundary regression if justified.
- Relevant focused tests and the full local browser suite pass on the settled change; Linux CI remains green.
- Keep keyboard assertions intact and report any unresolved platform limit.

## Agent context
Reported during ALLERGIES-41 and on the baseline; the current change is not a proven cause. Production JS/CSS match. Start at tests/e2e/controls.ts:5-11, imports/source-scope.spec.ts:125, review/updates.spec.ts:47,92 and matching/restaurant.spec.ts:122 under tests/e2e; inspect browser focus ownership. Establish the cause from traces before choosing application or fixture changes. Preserve focus, draft and navigation contracts. Keep toBeFocused and keyboard actions; avoid action retries, arbitrary sleeps and broader budgets. Broader owner-visible UI changes need approval. Evidence archive reportedly attached to ALLERGIES-41, not retrieved here. Source thread link unavailable.
```

## Acceptance checks

- The Summary covers the problem, impact and three completion checks.
- Context preserves the baseline uncertainty and required keyboard, focus, draft, navigation and scope safeguards.
- Detailed run history and commit hashes stay out of the description.
- Evidence access limits remain explicit. This draft does not claim the diagnosis or validation is complete.
- Deterministic prompt tests and this rewrite do not prove that every model will follow the writing targets.
