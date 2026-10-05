# Design

## Context

See [proposal.md](proposal.md) for the motivation and scope, and [the delta spec](specs/github-test-ci/spec.md) for the behavior contract.

The inspected baseline is `5abe246de7aab4d2819853f5956a3131b7351ef5`. `.github/workflows/tests.yml` contains nine plugin jobs. Every plugin exposes `npm run typecheck` as `tsc --noEmit`, but CI runs only `npm test`. Package-local lockfiles already contain compiler executables. Eight packages resolve TypeScript 5.9.3. Tasks has two aliases whose dependency trees both declare `tsc`. A cache-free Linux install during apply resolves the local `tsc` to `@typescript/old` 6.0.3, not the `typescript-7` alias. This change keeps that existing npm-script resolution; any compiler-selection repair is separate.

The workflow already provides Ubuntu, Node `>=24.15.0 <25`, npm download caching, SQLite for Tasks, and a sibling PR thread-list install for GitHub Insight. Changes includes shared `review-ui` source and tests from the full checkout. No root package, installed BB application, or credentials are needed.

Koen selected one combined result per plugin and confirmed that both commands must run after successful setup even if one fails. These decisions rule out a second typecheck matrix and a short-circuiting command chain.

[BBP-104](bbtask://BBP-104) owns Tasks lint and is marked done. GitHub confirms that [PR #87](https://github.com/koenvg/bb-plugins/pull/87) merged at `2026-10-05T09:02:11Z`; its changes are not in this planning checkout's recorded baseline. Preserve that merged lint work when choosing the apply baseline. Its owner reports clean macOS/Linux validation and completion review; those results were not independently rerun here. [BBP-93](bbtask://BBP-93) and [BBP-123](bbtask://BBP-123) remain separate coverage work. The current package commands have not been run from clean installs during planning.

## Goals / Non-Goals

**Goals:**

- Make the workflow's setup and command outcomes explicit without a new checker or orchestrator.
- Preserve the current GitHub check identities while adding visible typecheck step results.
- Make clean-install and failure evidence reproducible without modifying the user's installed tools or plugins.

**Non-Goals:**

- Change package inputs or compiler settings to obtain a green result.
- Add a dynamic package-discovery system, npm workspaces, or a compatibility matrix.
- Couple this rollout to unfinished coverage repairs or install the planned Pi/shared-Markdown packages before they land.

## Decisions

### Keep the existing matrix and check names

Extend the current `test` job and keep `Test ${{ matrix.plugin }}` as its display name. Separate steps make test and typecheck outcomes visible inside the one combined result. Keep `fail-fast: false`, job timeout, existing triggers, and superseded-run cancellation.

A separate matrix would repeat dependency setup and create additional check identities. A serial root script would hide per-plugin results. Neither fits the selected result model.

Recheck the landed plugin directories before editing. The baseline contains Changes, Code Cleanup, Codex Inspired, Codex Quota, Compose Chat, GitHub Insight, Markdown Reader, PR thread-list, and Tasks Plus. Active changes may add packages or prerequisites before apply. Preserve those landed entries rather than restoring this historical list.

### Use separate command steps with a setup-success condition

Run `npm test` first and `npm run typecheck` second as separate ordinary steps in the plugin working directory. Both use the same setup-success policy:

- The run has not been cancelled.
- Required runtime and package dependency steps completed successfully.
- Each prerequisite applicable to this matrix plugin completed successfully. An inapplicable conditional step is not a failure.

Give the relevant setup steps stable IDs and inspect `steps.<id>.outcome`. Use a status-check function such as `!cancelled()` so GitHub does not add its implicit `success()` condition after a test failure. Combine it with explicit setup outcomes. A bare `!cancelled()` or `always()` is insufficient because it can run commands after failed installs.

At the baseline, this covers Node setup, the package install, Tasks' SQLite installation, and GitHub Insight's sibling install. Check the landed prerequisite graph before finalizing the conditions. The ordinary setup chain must not itself continue after failures.

Do not use `continue-on-error`, `--if-present`, `|| true`, `npx` downloads, or a combined `npm test && npm run typecheck` step. A failed test step stays failed even if the later typecheck passes. This is how the ordinary GitHub job result retains either failure without a custom aggregator.

The typecheck step must also assert that the expected local compiler executable is present before invoking the npm script. All current scripts use `tsc`, so an executable check for `node_modules/.bin/tsc` prevents an incidental global `tsc` from hiding a broken install. This is a tool-presence check, not a second type checker. Put it in the typecheck step so a missing compiler does not suppress tests after successful installation. Recheck the expected executable if a landed package uses a different existing script.

Any separately owned lint step remains required if it has landed. It is a validation command, not dependency setup. Do not let its failure accidentally suppress this approved test/typecheck pair after setup succeeds, and do not hide its failure in the final result.

Cancellation and job timeout are the only exceptions to completing both commands after successful setup. The timeout is still 20 minutes; no step is required to run after that budget expires.

### Retain locked installs and prerequisites

Keep `npm ci`, action pins, the bounded Node 24 range, package working directories, and the current download-cache policy. Never cache or borrow node_modules. An empty npm cache must work through the same locked install path.

Keep the explicit SQLite setup/version check for Tasks and `npm ci --prefix ../bb-plugin-pr-thread-list` for GitHub Insight before either validation command. Keep the full repository checkout for shared `review-ui` files. The sibling lockfile is still authoritative even though the npm cache key currently uses GitHub Insight's lockfile only.

Do not add global compiler installs, regenerate locks, or substitute a build. Existing lock entries support compiler availability, but clean execution must verify that expectation.

### Keep source repairs separate

Run the existing compiler inputs, including current exclusions and `skipLibCheck` settings. A pass proves only those inputs. BBP-93 and BBP-123 own wider test coverage; BBP-104 owns lint dependency repair and CI lint use.

If clean execution exposes a real type error or missing prerequisite, preserve its evidence and report the rollout blocked. Record or reuse a package-owned issue. Obtain approval before expanding this change to fix that code or dependency. Do not remove a plugin, exclude a file, loosen checking, or suppress an exit status to complete CI wiring.

### Document and validate the public boundaries

Update the root README's local command example to use a plugin that exists, include `npm run typecheck`, and explain the combined result and prerequisites. Replace the tests-only CI statement without claiming all source/tests are covered or removing any separately landed lint documentation. Local reproduction must inspect both command outcomes rather than skip typecheck through an `&&` chain after a failed test.

Validation has three levels:

1. Inspect the actual workflow, matrix inventory, commands, setup-success conditions, permissions, and unchanged lockfiles. Use `actionlint` and strict OpenSpec validation. Use existing tooling or disposable fixtures for condition/failure checks; do not add a repository checker or test framework.
2. In disposable clean Linux directories or containers, use compatible Node 24, no node_modules, and an empty npm download cache. Install the locked dependencies and each applicable prerequisite. Run both commands separately and retain their exit statuses, including typecheck after failed tests. Confirm the SQLite import and sibling integration tests execute.
3. After publication is explicitly authorized, inspect the combined hosted jobs and command outcomes. Local inspection cannot prove GitHub's expression evaluation, dispatch, or fork approval behavior. Use a bounded temporary failure fixture only if hosted negative testing is authorized. Do not inject faults into the user's installed plugins or live data.

The failure matrix covers setup failure, missing script, missing compiler, test failure with passing typecheck, passing tests with type errors, both command failures, both successes, and cancellation. For setup failure, neither command starts. For completed command failures after setup, both outcomes remain visible and the plugin result fails; other plugins remain eligible to finish. Report which cases were verified statically, locally, or on GitHub, and which remain unverified.

## Risks / Trade-offs

- Existing type errors can make previously green CI fail. Preserve the failure and resolve it through separate approved package work.
- A condition that only tests cancellation can run after failed setup. Require explicit successful setup outcomes and validate inapplicable prerequisite handling.
- Later plugins or setup steps can invalidate an old condition. Recheck the landed inventory and prerequisite graph during apply and review.
- One combined result is less specific than separate top-level checks. Retain clear test/typecheck step names and logs.
- The extra compiler work can reach the existing job timeout. Measure duration during validation and report a timeout instead of silently increasing the budget.
- Coverage is incomplete in some packages. Keep the README and result claims bounded to the existing commands and link their separate owners.
- Cache-free all-plugin results and hosted failure behavior are not established by planning. Treat them as pending verification, not implied passes.

## Migration Plan

No data migration or plugin installation is needed. Apply the workflow and README changes after review of these artifacts, then run clean command validation, workflow checks, and the required single read-only completion review against the actual pre-implementation commit.

Publication and any hosted negative fixture require separate authorization. Inspect the first authorized hosted run before claiming hosted acceptance. Keep rollout blocked if required checks fail or required hosted evidence is unavailable.

Rollback removes only the added typecheck step and related command conditions/documentation. Preserve unrelated matrix additions, prerequisites, and BBP-104's lint work. No dependency, installed-plugin, account, or branch-protection rollback is needed.
