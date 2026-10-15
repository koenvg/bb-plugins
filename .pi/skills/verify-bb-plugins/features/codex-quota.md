# Quota, activity and recorded usage

Users inspect Codex quota for an explicitly selected host and distinguish confirmed quota, observed activity and recorded historical usage.

## Sub-features

- quota-host: selected enrolled host/account identity, percentages and unknown/stale states.
- quota-activity: disclosed active activity, host switching and bounded refresh.
- quota-history: calendar/model filters and Default/Fast/Ultrafast token totals.
- quota-import: explicit historical import with separate prerequisites and side-effect proof.

## How to get to it (user POV)

- Open Codex Quota's dashboard or sidebar contribution; select the intended enrolled host.
- Expand activity details and use calendar/model/speed filters.
- Explicit historical import is a separate action described in the package README, never an automatic fixture setup step.

## Driving it with BB and package harnesses

Preconditions:

- Follow [shared Launch and Doctor](../SKILL.md), then this package's [README](../../../../bb-plugin-codex-quota/README.md). Use the new evidence directory and resolved package/instance/host IDs. Local checks do not install the plugin.
- Installed actions follow [the installed workflow](../references/installed-workflow.md), with exact-checkout identity, needed permissions and an owned record/state ledger. Missing prerequisites remain blockers.

After frozen install, typecheck and pinned Chromium setup, run `"$SKILL/scripts/browser.sh" codex-quota "$EVIDENCE/browser"`. For a selected branch use existing names such as `calendar.spec.ts`, `activity.spec.ts`, `speed.spec.ts` or `model-filter.spec.ts` as trailing filters. These exercise the production views with synthetic RPC/host/native inputs. Retain exact number assertions and request-count/visibility behavior, not only screenshots. Installed Doctor must confirm the selected enrolled host and Pi openai-codex account; browser sign-in is unrelated. On approved live access, capture host selection, quota freshness/unknown states and activity disclosure before and after refresh. A host switch must clear unconfirmed old activity. Imports, host/account changes, billed turns and session restarts need separate approval and file/DB/network side-effect observations.

## Gotchas

- Unknown is not zero. Quota percentages are not exact token balances or billing data.
- The official usage link is inspected in local tests, not followed; no real account is read by those tests.
- `test:bundle` builds through BB and is separate from the owned browser recipe; inspect its scope and inputs before execution.
- Browser-local proofs do not establish native host collection or installed producer support for every historical speed tier.
