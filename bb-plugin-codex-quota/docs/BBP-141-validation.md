# BBP-141 dependency update

## Result

Quota now pins `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` to `1.0.1`. A clean install resolves `minimatch@10.2.6` to `brace-expansion@5.0.12`. The three requested brace-expansion advisories no longer appear in installation or audit results.

Completion is blocked by two existing typecheck errors in [BBP-153](bbtask://BBP-153). The required fresh-context review has not run because this task prohibits worker dispatch. The task must not be marked done yet.

Source task: [BBP-141](bbtask://BBP-141). Source thread: [implementation evidence](bbthread://thr_a7wq5rvkey).

## Baseline and exposure

The pre-change commit is `57c2cd8fb27e45a774ff528a8adb01057b214e76`. The working tree was clean. Checks ran on Node `24.15.0`, npm `11.12.1`, BB Plugin SDK `0.6.15` on 2026-10-06.

The baseline dependency path was:

```text
@earendil-works/pi-coding-agent@0.87.1
  minimatch@10.2.6
    brace-expansion@5.0.9
```

A clean baseline `npm ci` reported two high-severity dependency findings. Brace-expansion was affected by [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), and [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr). Audit also reported the separate source-map-js advisory.

- Quota imports `getAgentDir` and `ModelRuntime` through Pi's public package entry in `src/account/pi-auth.ts`. History maintenance also imports `getAgentDir`.
- Pi uses minimatch for model-scope globs in `dist/core/model-resolver.js` and package resource patterns in `dist/core/package-manager.js`. Brace expansion runs through minimatch. Quota has no direct minimatch or brace-expansion imports.
- The Quota host bundle contains these modules and brace expansion. Its source map names them, and its JavaScript contains `braceExpand` and `parseCommaParts`. The server source map contains neither dependency. Bundle presence is not proof that Quota inputs can reach the vulnerable functions.
- Source inspection found no Quota request path into model-scope or package-resource glob matching. The private model runtime disables model-network loading and initial refresh. Quota passes a fixed `openai-codex` provider to auth checks. This investigation does not prove that exploitation is unreachable.
- The baseline build and test installation included the vulnerable production dependency. Packaged history tests use Pi's public extension loader in temporary synthetic agent directories. This plugin lockfile does not control dependencies inside the external BB build tool.

## Why the Pi pin changed

A three-field lockfile edit to select brace-expansion `5.0.12` was tested and reverted. Pi `0.87.1` publishes its own `npm-shrinkwrap.json` that still selects `5.0.9`. After clean installation, `npm ls` and the installed package reported `5.0.9`, and the install audit still reported the vulnerability. A later `npm audit` read the edited parent lockfile and incorrectly appeared clean for brace expansion. Audit alone was not sufficient evidence of a fix.

Separate scoped and global override probes also installed `5.0.9`. No override remains in the plugin manifest.

Published Pi packages `0.99.0`, `0.99.1`, `0.99.2`, and `1.0.0` still contain the affected shrinkwrap entry. Pi `1.0.1` is the first published release with the upstream fix. Its changelog names all three advisories and pins brace-expansion `5.0.12` as a direct dependency. It no longer includes the shrinkwrap.

Before changing the repository pins, an isolated Quota copy with both public Pi dependencies at `1.0.1` passed all 645 tests, the SDK check, and every bundle check. Its only typecheck failures matched the unchanged baseline. This is the compatibility evidence for the update, not a general certification of Pi `1.0.1`.

The final lockfile was generated with `npm install --package-lock-only --ignore-scripts`, not `npm audit fix`. Removing the old shrinkwrapped tree accounts for the large lockfile diff. Runtime source, SDK pin, and other direct dependency ranges are unchanged. Both old and new Pi packages require Node `>=22.19.0`.

## Final verification

| Check                                            | Result                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| Clean `npm ci`                                   | Passed; only the separate source-map-js advisory remains           |
| `npm ls` for Pi, minimatch, and brace-expansion  | Passed; actual installed brace-expansion is `5.0.12`               |
| Actual resolution from Pi through minimatch      | Passed; resolves the installed `5.0.12` package                    |
| Ordinary numeric brace and file-pattern matching | Passed                                                             |
| `npm audit --json`                               | Exit 1; one high source-map-js finding, no brace-expansion finding |
| `npm audit --omit=dev --json`                    | Passed; zero reported production findings                          |
| `npm test` in isolated compatibility copy        | Passed; 59 files, 645 tests                                        |
| Initial final-checkout `npm test`                | One calendar test exceeded the existing 5-second timeout           |
| Focused calendar-host suite                      | Passed; 23 tests                                                   |
| Final `npm test -- --maxWorkers=2`               | Passed; 59 files, 645 tests, unchanged test timeouts               |
| `npm run typecheck`                              | Failed; the same two baseline TS2322 errors                        |
| `bb plugin types --check`                        | Passed; pinned and host SDK `0.6.15`                               |
| `npm run build`                                  | Passed                                                             |
| `npm run test:bundle`                            | Passed; every packaged check, including fresh and refreshed OAuth  |
| Node 22 packaged history check                   | Passed on Node `22.23.3`                                           |
| Fresh-context completion review                  | Not run; dispatch restriction                                      |

The final typecheck log is byte-identical to the baseline log. Both errors are in `src/history/identity/identity-discovery.test.ts`, at lines 108 and 384. The fixtures require an argument where the public SDK allows omitted `ThreadListArgs`. [BBP-153](bbtask://BBP-153) already tracks this issue; no fixture changes are included here.

The rebuilt host source map now names the root `node_modules/brace-expansion/src/index.ts`, whose installed package is `5.0.12`, instead of the old Pi-nested copy.

## Remaining findings and installed limits

The remaining high-severity finding is `source-map-js@1.2.1`, [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). Its development path is `vitest@5.0.2 -> vite@8.3.1 -> postcss@8.5.28 -> source-map-js@1.2.1`. [BBP-152](bbtask://BBP-152) records the separate update. This patch does not establish exposure to that advisory or fix it.

The public Pi dependencies remain exact pins. Other Pi packages use upstream compatible ranges; this lockfile also installs some `1.0.4` transitive packages, including a separate pi-ai copy under pi-agent-core. The synthetic OAuth bundle checks passed with the private runtime and its registered provider instance. They do not prove compatibility for every Pi consumer.

No installed plugin source or enabled state changed. No existing session restarted. Tests used temporary SQLite storage, synthetic credentials, and stubbed OAuth/quota/activity responses. They made no billed model turns or live account checks. Existing installed artifacts do not acquire this fix until an approved rebuild and deployment. Node 22 verification covered packaged history, not the full acceptance suite on that runtime.
