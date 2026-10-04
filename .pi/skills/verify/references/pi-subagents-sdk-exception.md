# Approved Pi provider SDK diagnostic exception

This is the only approved exception to the SDK checker gate in this project. It accepts one failed diagnostic after replacement checks pass. It does not fix the checker or make its result passed.

## Approval and scope

The operator approved this exception in [parent thread](bbthread://thr_ayuie4fy3w):

> Do you approve this exception for pi-subagents only? It would not authorize installation or paid tests.

The operator answered `yes`. The approved terms require matching SDK versions, tests, type checks, production builds, and bridge checks. Keep the SDK in production dependencies and report the original checker failure as an approved exception, never as a pass.

Scope is this BB Plugins project, `proj_gjz4e6jtmg`, package `bb-plugin-pi-subagents-provider`, plugin ID `pi-subagents-provider`, provider ID `pi-subagents`, with BB **0.44.0** and SDK **0.5.29**. Approval does not extend to another package/provider, another project, or any other BB/SDK version. New cases need explicit approval and evidence.

The [diagnostic investigation](bbthread://thr_qg5tdt8479) found no supported current-instance solution under the original mandatory gate. This policy exception is the resolution. Server activation remains untested.

## Accept only when every condition holds

1. Confirm the scoped project, package, plugin, provider, exact checkout, and actual versions. Keep `@get-bb/plugin-sdk` pinned to `0.5.29` in `dependencies`. Preserve manifest and lockfile bytes. Check the declared engines; unsupported engines still block.
2. Run `bb plugin types <absolute-package-path> --check`. Retain its true exit code, stdout, and stderr without filtering. The accepted case is exit **1** with exactly the matching-version informational line and runtime-dependency move diagnostic below. Any missing SDK, version mismatch, other warning/failure, or different result uses the normal gate. Never run the rewriting form.
3. Establish matching versions independently of that failed checker. Record BB CLI/build-tool version `0.44.0`, the manifest pin, the installed SDK package version `0.5.29`, and matching artifact metadata `sdkVersion` and `builtWith`. Do not treat a CLI version or artifact build as proof of server activation; runtime engine and installation identity checks remain required.
4. Retain passing clean standalone `npm ci`, non-watch package tests, and typecheck evidence for the exact source and lockfile. Record exits and test totals. Require the published public bridge conformance check to pass separately. Fixtures are not live acceptance.
5. Retain passing production-only install, all declared artifact builds, and server/host load evidence. Confirm the runtime SDK remains available without development dependencies, package source has no sibling dependency, and manifest/lockfile bytes remain unchanged. Inspect lifecycle effects before running checks. Use only credential-free checks with known effects under this approval.
6. Keep the checker row **failed**, name this approval, and list the replacement checks as separate rows using the [report rules](report.md). Only after conditions 1-5 pass may this one diagnostic use the exception. Missing replacement evidence or a failed replacement check prevents acceptance of the exception.

Expected complete output for this case:

```text
Exit code: 1
stdout:
This plugin uses the npm package @get-bb/plugin-sdk; pin is 0.5.29, host is 0.5.29.

stderr:
Move "@get-bb/plugin-sdk" from dependencies to devDependencies — bb provides its runtime (`bb plugin types` does it for you).
```

The stdout and stderr lines each end with a newline. Save the actual streams as evidence; this example is not evidence that a new run matched.

## Source evidence and reuse

The imported source baseline is `c72d3b3a06cf1a21704c2471cf52593c626eb50c`, based on `6c6bd792926de897215898e01b1e09c14ddba252`. Its clean package-only validation used Node 24.15.0, BB build tool 0.44.0, and SDK 0.5.29. It passed 28 test files / 173 tests, typecheck, public bridge conformance, all three builds, production-only install/build, and server/host load. Production-only install retained the SDK and omitted the development CLI.

[BBP-70](bbtask://BBP-70) holds the original handoff attachment `01M42W3ZBMDRGN2JK958A4ZAWD`, source hash attachment `01M42W3ZW3BSCMTBSR63H3NGVZ`, and source completion review `01M42W3ZP171VDSSE7SFGN94GA`. Fetch attachments before relying on their contents. The one source review used fixed point `6c6bd792926de897215898e01b1e09c14ddba252`; it did not review this later documentation policy.

Prior evidence can support the same unchanged source/lockfile only after checking identity and relevant file hashes. Identify reused checks as reused, not rerun. New source, dependencies, artifacts, targets, or versions require fresh applicable checks; the exception does not carry evidence forward automatically. Keep exact fresh checker output and any follow-up evidence in a new artifact. Historical reports remain unchanged.

## Permissions and remaining gates

Acceptance of this diagnostic permits the verification workflow to continue to its next gate. It grants no installation, source switch, reload, enable, paid/live agent test, destructive cleanup, BB/core patch, SDK rewrite, dependency change, publishing, schedule, default-provider change, or later-ticket dispatch permission.

All other required failures, unavailable checks, installation identity checks, live acceptance, and cleanup follow the normal report rules. The original checker stays failed even if the overall result can later pass after all other gates pass. At this documentation follow-up, overall installed acceptance remains **blocked**: no installation or paid-test approval exists, server activation is untested, and the actual GitHub CI run is unverified. BBP-70 stays `in_review`. BBP-95's separate development dependency audit remains open.
