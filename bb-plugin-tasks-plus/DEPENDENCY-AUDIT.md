# Tasks dependency audit, BBP-122

## Scope and decision

Reviewed on 2026-10-06 from baseline `43b3075d8a068ea7875701bd972a464f9e021d58`.
Source tasks are BBP-104 and BBP-127. Source thread is
[BBP-122](bbthread://thr_efvhegafgy).

Update Hono from 4.11.9 to exactly 4.13.13 and source-map-js from 1.2.1 to 1.2.2.
Keep the exact locked Tiptap v2 package after the package verification below.
[BBP-162](bbtask://BBP-162) tracks the advisory discrepancy and the separate
supported-stack decision. Do not infer a required migration from npm counts alone.

Only the Hono and source-map-js package entries change in the lockfile, plus
the root Hono declaration. The source-map-js update satisfies the existing
`^1.2.1` parent ranges. No override or new direct dependency is needed.
Hono 4.13.13 satisfies the SDK 0.6.15 peer range `^4.11.9`.
The lockfile was updated with a named-package update, not `npm audit fix`.
The root lint lockfile, navigation, and runtime source are unchanged.

## Hono exposure

Paths are `Tasks devDependencies -> hono` and
`@get-bb/plugin-sdk@0.6.15 -> peer hono ^4.11.9`.
Tasks uses BB's HTTP API rather than constructing a Hono app.
The SDK's bundled type declarations import Hono's `Context`. Its main production
entry, `dist/index.js`, does not import Hono. No direct or subpath Hono imports
were found in Tasks source. No Hono import was found in either built plugin
JavaScript artifact.

Hono does run during Tasks tests. `server.test.ts` and other integration tests
import `@get-bb/plugin-sdk/testing`. That SDK entry imports Hono in
`dist/testing/index.js` and constructs an app in `fetchHttp()`. It registers
the fake host's HTTP routes and uses `app.request()` in process, rather than
opening a network listener. The development path is
`Tasks tests -> @get-bb/plugin-sdk/testing -> hono`. The upgrade also covers
this test-time use; the production absence claim does not apply to SDK tests.

- GHSA-q5qw-h33p-qvwr needs protected route subpaths and `serveStatic` from
  the same static root. Encoded slashes can bypass route middleware.
  The advisory states that this does not escape the static root.
- GHSA-88fw-hqm2-52qc needs CORS with `credentials: true` and an unset or
  wildcard origin. Tasks does not configure this middleware.
- No local Tasks call to the other listed Hono APIs was found. They include
  authentication, cookies, SSE, static serving, JSX SSR, body/query parsing,
  proxying, SSG, IP restrictions, mounting, caching, and AWS adapters.
- Upgrade the local development package despite the absent production import path.
  Do not infer that a `devDependency` is always harmless.
  This update does not change or audit the Hono package used by the installed
  BB host. Host routes and middleware remain outside this review.

The baseline audit returned these exact Hono advisories. The updated audit
returns no Hono finding.

| Advisory | Severity | Affected range | Reported issue |
| --- | --- | --- | --- |
| [GHSA-gq3j-xvxp-8hrf](https://github.com/advisories/GHSA-gq3j-xvxp-8hrf) | low | `<4.11.10` | Hono added timing comparison hardening in basicAuth and bearerAuth |
| [GHSA-5pq2-9x2x-5p6w](https://github.com/advisories/GHSA-5pq2-9x2x-5p6w) | moderate | `<4.12.4` | Hono Vulnerable to Cookie Attribute Injection via Unsanitized domain and path in setCookie() |
| [GHSA-p6xx-57qc-3wxr](https://github.com/advisories/GHSA-p6xx-57qc-3wxr) | moderate | `<4.12.4` | Hono Vulnerable to SSE Control Field Injection via CR/LF in writeSSE() |
| [GHSA-q5qw-h33p-qvwr](https://github.com/advisories/GHSA-q5qw-h33p-qvwr) | high | `<4.12.4` | Hono vulnerable to arbitrary file access via serveStatic vulnerability  |
| [GHSA-r5rp-j6wh-rvv4](https://github.com/advisories/GHSA-r5rp-j6wh-rvv4) | moderate | `<4.12.12` | Hono: Non-breaking space prefix bypass in cookie name handling in getCookie() |
| [GHSA-xf4j-xp2r-rqqx](https://github.com/advisories/GHSA-xf4j-xp2r-rqqx) | moderate | `>=4.0.0 <=4.12.11` | Hono: Path traversal in toSSG() allows writing files outside the output directory |
| [GHSA-wmmm-f939-6g9c](https://github.com/advisories/GHSA-wmmm-f939-6g9c) | moderate | `<4.12.12` | Hono: Middleware bypass via repeated slashes in serveStatic |
| [GHSA-xpcf-pg52-r92g](https://github.com/advisories/GHSA-xpcf-pg52-r92g) | moderate | `<4.12.12` | Hono has incorrect IP matching in ipRestriction() for IPv4-mapped IPv6 addresses |
| [GHSA-qp7p-654g-cw7p](https://github.com/advisories/GHSA-qp7p-654g-cw7p) | moderate | `<4.12.18` | Hono has CSS Declaration Injection via Style Object Values in JSX SSR |
| [GHSA-hm8q-7f3q-5f36](https://github.com/advisories/GHSA-hm8q-7f3q-5f36) | low | `<4.12.18` | Hono has improper validation of NumericDate claims (exp, nbf, iat) in JWT verify() |
| [GHSA-p77w-8qqv-26rm](https://github.com/advisories/GHSA-p77w-8qqv-26rm) | moderate | `<4.12.18` | Hono's Cache Middleware ignores Vary: Authorization / Vary: Cookie leading to cross-user cache leakage |
| [GHSA-9vqf-7f2p-gf9v](https://github.com/advisories/GHSA-9vqf-7f2p-gf9v) | moderate | `<4.12.16` | Hono: bodyLimit() can be bypassed for chunked / unknown-length requests |
| [GHSA-69xw-7hcm-h432](https://github.com/advisories/GHSA-69xw-7hcm-h432) | moderate | `<4.12.16` | hono/jsx has Unvalidated JSX Tag Names that May Allow HTML Injection |
| [GHSA-xrhx-7g5j-rcj5](https://github.com/advisories/GHSA-xrhx-7g5j-rcj5) | moderate | `<4.12.21` | Hono: IP Restriction bypasses static deny rules for non-canonical IPv6  |
| [GHSA-3hrh-pfw6-9m5x](https://github.com/advisories/GHSA-3hrh-pfw6-9m5x) | moderate | `<4.12.21` | Hono: Cookie helper does not sanitize sameSite and priority, allowing Set-Cookie injection |
| [GHSA-f577-qrjj-4474](https://github.com/advisories/GHSA-f577-qrjj-4474) | moderate | `<4.12.21` | Hono: JWT middleware accepts any Authorization scheme, not only Bearer |
| [GHSA-2gcr-mfcq-wcc3](https://github.com/advisories/GHSA-2gcr-mfcq-wcc3) | moderate | `<4.12.21` | Hono: app.mount() strips mount prefix using undecoded path, causing incorrect routing for percent-encoded paths |
| [GHSA-458j-xx4x-4375](https://github.com/advisories/GHSA-458j-xx4x-4375) | moderate | `<4.12.14` | hono Improperly Handles JSX Attribute Names Allows HTML Injection in hono/jsx SSR |
| [GHSA-rv63-4mwf-qqc2](https://github.com/advisories/GHSA-rv63-4mwf-qqc2) | moderate | `<4.12.25` | hono: Body Limit Middleware can be bypassed on AWS Lambda by understating `Content-Length` |
| [GHSA-wgpf-jwqj-8h8p](https://github.com/advisories/GHSA-wgpf-jwqj-8h8p) | moderate | `<4.12.25` | hono: Lambda@Edge adapter keeps only the last value of a repeated request header, dropping the rest |
| [GHSA-88fw-hqm2-52qc](https://github.com/advisories/GHSA-88fw-hqm2-52qc) | high | `<4.12.25` | hono: CORS Middleware reflects any Origin with credentials when `origin` defaults to the wildcard |
| [GHSA-wwfh-h76j-fc44](https://github.com/advisories/GHSA-wwfh-h76j-fc44) | moderate | `<4.12.25` | hono: Path traversal in `serve-static` on Windows via encoded backslash (`%5C`) |
| [GHSA-j6c9-x7qj-28xf](https://github.com/advisories/GHSA-j6c9-x7qj-28xf) | moderate | `<4.12.25` | hono: AWS Lambda adapter merges multiple `Set-Cookie` headers into one value, dropping cookies on ALB single-header and Lattice |
| [GHSA-xgm2-5f3f-mvvc](https://github.com/advisories/GHSA-xgm2-5f3f-mvvc) | moderate | `>=4.3.3 <4.12.27` | Hono: API Gateway v1 adapter can drop a distinct repeated request header value during de-duplication |
| [GHSA-hvrm-45r6-mjfj](https://github.com/advisories/GHSA-hvrm-45r6-mjfj) | moderate | `>=4.11.8 <4.12.27` | hono/jsx does not isolate context per request, leading to cross-request data disclosure |
| [GHSA-w62v-xxxg-mg59](https://github.com/advisories/GHSA-w62v-xxxg-mg59) | moderate | `>=4.0.0 <4.12.27` | Hono: Server-Side XSS via JSX Escaping Bypass in cx() Utility |
| [GHSA-8j4g-w8fx-2239](https://github.com/advisories/GHSA-8j4g-w8fx-2239) | moderate | `<4.12.34` | Hono: ReDoS in CORS middleware via Access-Control-Request-Headers |
| [GHSA-f23p-vx2j-j53r](https://github.com/advisories/GHSA-f23p-vx2j-j53r) | moderate | `>=3.8.0 <4.12.34` | Hono: `memo()` retains SSR output across requests, leading to cross-user data disclosure |
| [GHSA-79qm-7rj5-m7r9](https://github.com/advisories/GHSA-79qm-7rj5-m7r9) | low | `>=4.7.0 <4.12.34` | Hono: Proxy Helper does not remove response headers listed in the `Connection` header |
| [GHSA-gqvv-2mrq-wpjv](https://github.com/advisories/GHSA-gqvv-2mrq-wpjv) | moderate | `<4.13.5` | Hono: Incomplete fix for CVE-2026-39408: `toSSG()` still writes files outside the output directory |
| [GHSA-g6gw-c38x-mqfc](https://github.com/advisories/GHSA-g6gw-c38x-mqfc) | moderate | `<4.13.5` | Hono: Unbounded dot-notation nesting in `parseBody()` can cause memory exhaustion |
| [GHSA-crvj-82cr-hjcx](https://github.com/advisories/GHSA-crvj-82cr-hjcx) | moderate | `<4.13.5` | Hono: Query parser reads parameters after the URL fragment, causing cache-key and proxy interpretation differentials |
| [GHSA-26pp-8wgv-hjvm](https://github.com/advisories/GHSA-26pp-8wgv-hjvm) | moderate | `<4.12.12` | Hono missing validation of cookie name on write path in setCookie() |
| [GHSA-hxh3-vqpv-xpqv](https://github.com/advisories/GHSA-hxh3-vqpv-xpqv) | moderate | `<4.13.7` | hono/jsx renders plain strings unescaped in boundary components, leading to XSS |
| [GHSA-v8w9-8mx6-g223](https://github.com/advisories/GHSA-v8w9-8mx6-g223) | moderate | `<4.12.7` | Hono vulnerable to Prototype Pollution possible through __proto__ key allowed in parseBody({ dot: true }) |

## source-map-js exposure

[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
affects `>=1.0.0 <1.2.2`. Indexed source maps with an excessive section line
offset can block the event loop. Version 1.2.2 is the first fixed release.

Development paths found by `npm explain source-map-js`:

- `vitest -> vite -> postcss -> source-map-js`.
- `jsdom -> css-tree -> source-map-js`.
- `jsdom -> @asamuzakjp/dom-selector -> css-tree -> source-map-js`.
- `jsdom -> @bramus/specificity -> css-tree -> source-map-js`.
- `jsdom -> @csstools/css-syntax-patches-for-csstree -> peer css-tree -> source-map-js`.

The locked package is development-only. Tasks has no source-map-js import.
Neither built JavaScript artifact contains source-map-js.
This is a development parser risk, not an observed Tasks request path.
Update it rather than depend on trusted-map assumptions.

## Tiptap exposure and bounded retention

[GHSA-cp6q-959q-f8rh](https://github.com/advisories/GHSA-cp6q-959q-f8rh)
reports the affected range `>=2.0.0-alpha.0 <3.30.4`. Tasks locks
`@tiptap/core@2.27.3`. The advisory's structured data lists 3.30.4 as the
first patched version; its description still says no fixed release was found.
No v2 release is outside npm's reported affected range.

The advisory describes an own JSON `__proto__` key changing the object returned
by `mergeAttributes()`. ProseMirror can then copy inherited event handlers to
DOM nodes. That described mechanism does not match the exact locked package:

- `node_modules/@tiptap/core/src/utilities/mergeAttributes.ts:8-17` defines
  `__proto__` as an own data property with `Object.defineProperty()`, rather
  than invoking the prototype setter. Exported `dist/index.js` does the same.
- The reviewer verified the cached package tarball against the lockfile's
  SHA-512 integrity and compared those two files with the installed package.
  The parent repeated those checks; both files match exactly. The core lock
  entry is unchanged from the baseline. No local dependency patch was made.
- A direct parent probe of the exported helper with a JSON-origin own
  `__proto__` key kept `Object.prototype` as the result's prototype. The result
  had an own `__proto__` key, but no inherited `onerror` or canary attribute.
  `package-verification.json` in the corrected evidence archive records the
  integrity, file hashes, and probe result.

Keep npm's findings visible, but distinguish the advisory's version range from
this observed package behavior. The inspected locked helper already contains
hardening for the described prototype-setter mechanism. This is not a claim
that all Tiptap versions or HTML inputs are safe. Resolve the metadata and
supported-version discrepancy under BBP-162 before selecting a migration.

This is a production dependency. Tasks imports Tiptap in its browser editor.
The 33 remaining npm findings all refer to this one root advisory and
propagate through extension/core peer relationships.

The observed input boundary limits the current exposure:

- `editor/tasks-editor.tsx` accepts `value: string` and passes Markdown
  strings at initial load and `setContent`. There is no public document-JSON
  or arbitrary HTML-attribute-object import.
- `editor/extensions.ts` uses a fixed extension schema. It enables Markdown
  raw HTML, but schema parsing selects declared attributes. Mention nodes
  construct named attributes and convert display values to strings.
  Icon attributes come from the bundled icon package, not a task API payload.
- No application call to `mergeAttributes()`, dynamic user extension, or
  user-supplied `HTMLAttributes` configuration was found.
- `editor/dependency-exposure.test.tsx` checks raw HTML load and replacement
  through TasksEditor and an own JSON `__proto__` key through the fixed schema.
  Images stay present, while event handlers and injected attributes do not.

These tests support the inspected string-input and fixed-schema boundary.
They do not establish the helper's implementation; the direct helper probe
and integrity checks above provide that separate evidence. The tests cover
image attributes, not every schema node or paste route. JSDOM attribute
assertions are not a browser execution test.

Retain the verified locked package without an unsupported peer override.
Keep the fixed-schema, string-input boundary as an additional restriction.
Do not add an arbitrary attribute-object import or user-defined extension
without a separate security review. Keep the two boundary regression tests
and reassess if the package bytes, editor schema, or import format changes.

A core-only v3 update is not compatible with `tiptap-markdown@0.8.10`,
which requires `@tiptap/core ^2.0.3`. The other v2 extensions also require
v2 peers. Do not force peer resolution, silently patch node_modules,
suppress audit findings, or combine the editor migration with navigation work.
BBP-162 records the separate supported-stack update.

### Remaining advisory paths

Each entry below is a node reported by npm audit. They are not 33 independent
security defects. All resolve to GHSA-cp6q-959q-f8rh.

- `node_modules/@tiptap/core` via [GHSA-cp6q-959q-f8rh](https://github.com/advisories/GHSA-cp6q-959q-f8rh).
- `node_modules/@tiptap/extension-blockquote` via `@tiptap/core`.
- `node_modules/@tiptap/extension-bold` via `@tiptap/core`.
- `node_modules/@tiptap/extension-bubble-menu` via `@tiptap/core`.
- `node_modules/@tiptap/extension-bullet-list` via `@tiptap/core`.
- `node_modules/@tiptap/extension-code` via `@tiptap/core`.
- `node_modules/@tiptap/extension-code-block` via `@tiptap/core`.
- `node_modules/@tiptap/extension-document` via `@tiptap/core`.
- `node_modules/@tiptap/extension-dropcursor` via `@tiptap/core`.
- `node_modules/@tiptap/extension-gapcursor` via `@tiptap/core`.
- `node_modules/@tiptap/extension-hard-break` via `@tiptap/core`.
- `node_modules/@tiptap/extension-heading` via `@tiptap/core`.
- `node_modules/@tiptap/extension-history` via `@tiptap/core`.
- `node_modules/@tiptap/extension-horizontal-rule` via `@tiptap/core`.
- `node_modules/@tiptap/extension-image` via `@tiptap/core`.
- `node_modules/@tiptap/extension-italic` via `@tiptap/core`.
- `node_modules/@tiptap/extension-link` via `@tiptap/core`.
- `node_modules/@tiptap/extension-list-item` via `@tiptap/core`.
- `node_modules/@tiptap/extension-ordered-list` via `@tiptap/core`.
- `node_modules/@tiptap/extension-paragraph` via `@tiptap/core`.
- `node_modules/@tiptap/extension-placeholder` via `@tiptap/core`.
- `node_modules/@tiptap/extension-strike` via `@tiptap/core`.
- `node_modules/@tiptap/extension-table` via `@tiptap/core`.
- `node_modules/@tiptap/extension-table-cell` via `@tiptap/core`.
- `node_modules/@tiptap/extension-table-header` via `@tiptap/core`.
- `node_modules/@tiptap/extension-table-row` via `@tiptap/core`.
- `node_modules/@tiptap/extension-task-item` via `@tiptap/core`.
- `node_modules/@tiptap/extension-task-list` via `@tiptap/core`.
- `node_modules/@tiptap/extension-text` via `@tiptap/core`.
- `node_modules/@tiptap/extension-text-style` via `@tiptap/core`.
- `node_modules/@tiptap/starter-kit` via `@tiptap/core`, `@tiptap/extension-blockquote`, `@tiptap/extension-bold`, `@tiptap/extension-bullet-list`, `@tiptap/extension-code`, `@tiptap/extension-code-block`, `@tiptap/extension-document`, `@tiptap/extension-dropcursor`, `@tiptap/extension-gapcursor`, `@tiptap/extension-hard-break`, `@tiptap/extension-heading`, `@tiptap/extension-history`, `@tiptap/extension-horizontal-rule`, `@tiptap/extension-italic`, `@tiptap/extension-list-item`, `@tiptap/extension-ordered-list`, `@tiptap/extension-paragraph`, `@tiptap/extension-strike`, `@tiptap/extension-text`, `@tiptap/extension-text-style`.
- `node_modules/@tiptap/suggestion` via `@tiptap/core`.
- `node_modules/tiptap-markdown` via `@tiptap/core`.

## Verification and limits

Node 24.15.0 and npm 11.12.1 were used. BB plugin build used BB 0.45.0
and SDK 0.6.15. Checks ran after a clean Tasks install.

| Check | Result |
| --- | --- |
| Root `npm ci` | Passed, zero vulnerabilities |
| Baseline Tasks `npm ci` | Passed, 35 findings, 33 moderate and 2 high |
| Updated Tasks `npm ci` | Passed, 33 moderate and zero high |
| `npm run lint` | Passed, four existing warnings |
| `npm test` | Passed, 117 files and 1,223 tests |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `npm audit --json` | Exit 1, 33 moderate, zero high |
| `npm audit --omit=dev --json` | Exit 1, same 33 moderate findings |

One read-only completion reviewer requested two exposure-record corrections.
The parent verified the locked Tiptap package and SDK test entry, then corrected
both findings in this note. No runtime, test, manifest, or lockfile edit was
needed after review. Only documentation changed, so the full validation above
remains applicable. `git diff --check` passed after the corrections. No second
review pass was run. The review and parent verification are attached to BBP-122.
These results do not approve every HTML input or remove npm's remaining findings.

No live plugin install, host dependency audit, navigation change, or browser
execution test was performed. The final full and omit-dev audit JSON files
and validation logs are attached to BBP-122. Audit counts can change as npm
adds advisories without a lockfile change.
