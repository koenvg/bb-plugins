# Tasks Tiptap stack, BBP-162

## Decision

Keep the official Tiptap v2.27.3 security backport with `tiptap-markdown@0.8.10`.
Raise all 14 direct Tiptap declarations from `^2.27.2` to `^2.27.3`, including
extensions and ProseMirror wrappers. This excludes the older unsafe release
without a v3 migration, a peer override, or a local package patch.

The lockfile already selected 2.27.3. Only its root dependency declarations
change; all resolved package entries and integrity values stay unchanged.
Markdown, mentions, tables, images, links, and editor interactions therefore
use the same package bytes as before. Navigation and runtime source are unchanged.

## Backport evidence and advisory discrepancy

Checked on 2026-10-06 from baseline
`0e9e298afa7d6717cb23bc937845384817b53bde` for [BBP-162](bbtask://BBP-162).
This follows the corrected [BBP-122 evidence](bbthread://thr_efvhegafgy), not its
original claim that the locked helper was vulnerable.

- npm's `v2-latest` tag is 2.27.3. Its published `gitHead` is
  `0ed4a30a6cda23799a01881f67d01ad218a2ac6d`.
- The official [2.27.3 core changelog](https://github.com/ueberdosis/tiptap/blob/0ed4a30a6cda23799a01881f67d01ad218a2ac6d/packages/core/CHANGELOG.md)
  explicitly lists the prototype fix under `fa6abcc`. This confirms a released
  v2 backport, rather than merely a local mitigation.
- The downloaded 2.27.3 tarball matches both registry and lockfile SHA-512
  integrity. Its helper source and exported JavaScript match the clean install.
- Both 2.27.3 and the advisory's first listed patched release, 3.30.4, define an
  own data property for `__proto__` before reading or assigning other keys.
  This prevents the prototype setter from running.
- Exported-helper and DOMSerializer probes pass on 2.27.3 and 3.30.4. The
  single-object 2.27.2 control changes the result's prototype and serializes
  inherited `onerror`, `src`, and canary attributes. A later object spread can
  remove those inherited properties, so the single-object case is essential.

[GHSA-cp6q-959q-f8rh](https://github.com/advisories/GHSA-cp6q-959q-f8rh)
still lists `>=2.0.0-alpha.0 <3.30.4` as affected. That range includes the
verified official v2 backport. This is a metadata discrepancy for the inspected
2.27.3 package, not evidence that its prototype fix is absent. No upstream
advisory correction was requested or confirmed. No audit finding is suppressed.
The v2 release evidence does not establish a future support lifetime.

## Runtime boundary and regression coverage

Tiptap is a production dependency used by the Tasks browser editor. TasksEditor
loads and replaces Markdown strings through a fixed schema. There is no new
arbitrary attribute-object import, user-defined extension, or HTMLAttributes
configuration in this change. Keep that restriction. The helper fix is not a
sanitizer for deliberately supplied executable attributes.

The two existing regression tests still cover raw HTML load/replacement and
unknown JSON attributes through the fixed schema. A third test calls the public
`mergeAttributes()` helper with an own JSON-origin `__proto__` key, then uses
ProseMirror DOMSerializer. It checks the result's prototype and the absence of
inherited executable attributes. It also covers merging between ordinary
attributes. The existing editor suite checks Markdown round-trip, links,
mentions, tables, images, paste, replacement, checklists, and keyboard actions.

## Verification and remaining gate

Node 24.15.0 and npm 11.12.1 were used in this checkout.

| Check                                            | Result                                             |
| ------------------------------------------------ | -------------------------------------------------- |
| Root and Tasks clean `npm ci`                    | Passed                                             |
| `npm ls @tiptap/core @tiptap/pm tiptap-markdown` | Passed, no invalid peers                           |
| Focused editor tests                             | Passed, 2 files and 45 tests                       |
| Tasks lint                                       | Passed, four existing warnings outside this change |
| All Tasks tests                                  | Passed, 95 files and 1,012 tests                   |
| Tasks typecheck                                  | Passed                                             |
| Tasks plugin build                               | Passed                                             |
| Changed source and manifest formatting           | Passed                                             |
| Full and omit-dev npm audits                     | Exit 1, 33 moderate entries each                   |

All remaining audit entries resolve to this one Tiptap advisory. Neither audit
reports high or critical findings. The counts remain visible despite the
verified backport. No live plugin install or browser execution test was run;
JSDOM checks DOM attributes, not browser script execution.

The required fresh-context completion review was not run because the task
forbids worker dispatch. BBP-162 must remain `in_review`, not `done`, until that
gate is resolved. No workers were dispatched and no threads were notified.
Detailed package checks, audit JSON, probes, and validation logs are attached
to BBP-162.
