# Tasks

Acceptance follows [the guidance delta](specs/code-cleanup-guidance/spec.md). Technical decisions and illustrative examples are in [design.md](design.md). Each delivery includes its tests and documentation; implementation requires the applicable project validation and independent review.

## 1. Deliver concise factory follow-up guidance

- [x] 1.1 Update `bb-plugin-code-cleanup/guidance.ts` with Summary/Agent context instructions and three compact illustrative examples. Preserve qualification, tracker routing, complete duplicate search, existing labels, verified dependencies and failure reporting. Extend `guidance.test.ts` to check the format, budgets, examples and safeguards; verify each example meets the 80-word Summary ceiling and 120-word context target and the prompt fits 4,096 characters for existing ID fixtures.
- [x] 1.2 Verify new factory delivery, exact custom-text preservation and explicit Reset through `agent.test.ts`, adding coverage only where missing. Keep existing tasks, enablement, APIs and UI unchanged; verify the host tests pass without new runtime logic or dependencies.
- [x] 1.3 Update the relevant README factory-behavior section with the format, adoption and writing-target limits, pointing to the factory source instead of duplicating examples. Deliver a read-only acceptance rewrite of the supplied focus finding; verify its short sections preserve cause uncertainty, required keyboard safeguards, checkable completion conditions and honest evidence-link limits without creating or editing a live task.

## 2. Verify the complete change

- [x] 2.1 Run the full Code Cleanup test suite, typecheck and scoped lint/format checks using package scripts. Run strict OpenSpec validation; report results and any unrun checks. Confirm the diff contains only factory guidance, necessary tests/docs and this change's artifacts, with no stored-data or configuration writes.
- [x] 2.2 Obtain one independent read-only routine review against the delta, design, diff and validation evidence. Resolve blocking findings, rerun affected checks and report remaining limits, including that prompt tests do not prove every model follows the writing targets.
