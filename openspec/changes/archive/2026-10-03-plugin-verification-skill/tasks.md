# Tasks

## 1. Skill entry and verification scope

- [x] 1.1 Check for a conflicting `verify` skill, then initialize the repository-local skill at `.pi/skills/verify/` using the skill-creator workflow. Add BB-specific frontmatter and the standard `/skill:verify` invocation. Verify the directory contains a valid `SKILL.md`, does not shadow an unrelated skill, and no global copy is created.
- [x] 1.2 Write the target-resolution and evidence-checklist steps, including committed changes, multiple plugin packages, and relevant OpenSpec scenarios. Walk through the spec's ambiguous-target and clean-working-tree cases; record in this change's `verification.md` that the first asks before installation and the second produces checks for the supplied change.
- [x] 1.3 Add discovery of package checks, dependency prerequisites, a read-only SDK compatibility check where supported, and `bb plugin build`, with no automatic source or dependency repairs. Walk through build failure and missing-test-script cases against the package shapes in this repository; verify the skill blocks installation on failure without claiming missing tests passed.

## 2. Installation and approval boundaries

- [x] 2.1 Add the original-state ledger and guarded install/reload decisions for absent, same-path, different-path, managed, disabled, and competing installations. Verify walkthroughs require explicit approval for source switches and destructive replacement, identify both sources, and state the intended final installation without executing those mutations.
- [x] 2.2 Add a pre-mutation source recheck and post-activation proof of the loaded checkout, including reload failure, old-instance retention, and stale browser state. Verify a walkthrough cannot pass using an older running instance or an unchanged version string alone.
- [x] 2.3 Add scoped permissions for test data, thread creation, external actions, paid resources, and cleanup. Verify the thread-start and missing-live-PR scenarios stop at the approval or prerequisite boundary and never substitute a fixture result for live evidence.

## 3. Browser checks, reporting, and restoration

- [x] 3.1 Add `references/live-checks.md` and its conditional pointer from `SKILL.md`, reusing `browser-use`, `bb-cli`, and `bb-plugin-authoring` guidance. Cover dedicated Chrome-family sessions, authentication blockers, real UI actions, refresh/persistence checks, scoped screenshots and diagnostics, and session-only cleanup. Verify command shapes against installed help and walk through unavailable authentication without opening Arc or importing credentials.
- [x] 3.2 Add behavior-specific branches for themes without `bb.app`, sidebar and settings changes, backend/CLI operations, and host-backed behavior. Walk through Liquid Glass's theme shape and Code Cleanup's backend-only shape; verify the former requires a browser check and the latter documents relevant installed-runtime evidence instead of a meaningless screenshot.
- [x] 3.3 Add `references/report.md` with expected/observed/evidence/result rows, failed/blocked/passed aggregation, optional diagnostic limitations, the state ledger, and final installation disclosure. Verify example reports for a full pass, a runtime failure despite visible UI, and passing local checks with missing live data produce the specified outcomes.
- [x] 3.4 Add cleanup on both success and failure, including comparison with temporary values before restoring settings, owned test-data cleanup, safe evidence retention, and no automatic uninstall. Walk through sidebar restoration, concurrent user edits, and failed interaction cleanup; verify conflicts or incomplete cleanup prevent an overall pass.

## 4. Integration validation

- [x] 4.1 Run the skill-creator validator, check all relative reference links, and confirm Pi discovers the installed skill after reload or in a fresh session. Review the complete skill against every requirement and scenario in `specs/plugin-verification/spec.md`; record the coverage and remaining limits in `verification.md`.
- [x] 4.2 Run one bounded end-to-end verification on an explicitly identified plugin, obtaining any required source-switch or test-action approval first. Confirm local checks, exact-source activation, a changed browser-visible interaction, safe screenshot evidence, runtime diagnostics, and cleanup. Keep this task incomplete if access or approval blocks the live run, and record the blocker rather than declaring success.
- [x] 4.3 Run `openspec validate plugin-verification-skill --strict`, inspect repository and skill-directory changes for accidental plugin mutations, and deliver the skill path plus the integration evidence and final BB state. Verify the summary distinguishes skill validation from the tested plugin's result and names any unfinished checks.

## 5. Separately approved SDK prerequisite update

- [x] 5.1 Update only `bb-plugin-pr-thread-list`'s SDK/type dependency pins and lockfile to the running BB SDK. Verify `bb plugin types --check`, the existing tests, typecheck, and build pass; record dependency changes and any remaining compatibility issues in `verification.md`.
- [x] 5.2 Run the required read-only completion review for this newly authorized dependency-change scope, resolve findings, and rerun affected checks. Verify the review evidence distinguishes this SDK work from the already-reviewed verification skill.
