# BB plugin verification map

This is the maintained source for the repository's user-facing verification recipes. Read the selected package map before choosing a convenient fixture. A package has local checks, user entry paths and installed prerequisites; coverage of one is not coverage of another.

## Baseline preconditions

- Use Bun 1.4.3 and Node `>=24.15.0 <25`. Inspect scripts, run frozen setup and keep both test and typecheck exit codes.
- Run the selected map's additional prerequisites. Root tooling does not install each package's dependencies.
- Create private evidence outside tracked source. Each browser run gets its own new directory; never overwrite an earlier proof.
- Own every browser context/tab, listener, process and test record driven by the run. A signed-in BB browser shares the server/database even with a separate profile.
- Live mutation requires the [installed workflow](../references/installed-workflow.md), actual build identity and an approved state ledger. Do not install competing plugins, change defaults, send messages or contact paid providers to manufacture prerequisites.

## Package index

Set `PLUGIN` to the package suffix below; the installed plugin ID matches unless noted. All packages expose `test` and `typecheck`. Local check totals do not prove the listed live paths.

| Package / map | Local user-path recipe | Live entries and additional prerequisites |
| --- | --- | --- |
| [browser-annotate](browser-annotate.md) | SDK tests; no standalone browser suite | Desktop Browser toolbar, pins and composer pills; conflicts with bundled agent-annotations |
| [changes](changes.md) | SDK/UI tests; owned local video playback runner; BB-backed filename-control check with page-local fixtures | Changes right-panel tab, diff target, Viewed and review; owned Git diff, sibling review-ui |
| [code-cleanup](code-cleanup.md) | Actual Settings preview on an owned port, temporary SQLite | Settings project overview/dialog and bb code-cleanup; project/setting ledger |
| [codex-inspired](codex-inspired.md) | Theme/font integrity tests; no frontend bundle | Appearance and bb theme; theme selection affects other clients |
| [codex-quota](codex-quota.md) | Owned ephemeral-port Playwright runner; maintenance RPC and packaged temporary-host fixtures | Dashboard/sidebar, selected enrolled host, Pi OAuth, activity/history/import |
| [compose-chat](compose-chat.md) | Owned ephemeral-port Playwright runner | Native composer, Settings effects, speed metadata and content-script activation |
| [github-insight](github-insight.md) | SDK/GitHub fixtures; no standalone browser suite | PR Overview/Files, badge/banner, Pull Requests and CLI; signed-in gh on actual host, linked PR, sibling pr-thread-list install |
| [live-output](live-output.md) | SDK tests; no standalone browser suite | Navigation page, footer gauge, chart and contributor; existing approved stream |
| [markdown-reader](markdown-reader.md) | Owned smoke proof and ephemeral-port Playwright runner | Open with/File openers, workspace/host/storage, line opening and live draft |
| [mcp](mcp.md) | Controlled transport/token/SDK tests, provider discovery and explicit selection through the production adapter | Authenticated MCP tools and bb mcp status; existing issuer/tunnel/client consent |
| [pi-subagents-provider](pi-subagents-provider.md) | Public bridge/scripted Pi regression tests | Plugin pi-subagents-provider, provider pi-subagents, Subagents panel and approved lifecycle |
| [pr-thread-list](pr-thread-list.md) | SDK/UI tests; no standalone browser suite | Appearance Sidebar, tabs, rows and badge; GitHub Insight dependency |
| [tasks-plus](tasks-plus.md) | Owned ephemeral-port Playwright overlay/navigation/image fixtures plus SDK tests and owned loopback webhook receivers | Tasks panel, details, CLI, webhooks and workers; SQLite, built local Markdown package, Quota dependencies, pinned TypeScript 7, migration/competing-plugin safeguards |

The index deliberately records missing harnesses. Do not invent a preview URL or a browser launch command for a package that has none. Follow its real installed entry instead and report blocked prerequisites.

## Markdown Reader subfeature recipes

Keep these detailed maps for the previously proved reader path:

- [Document views](document-views.md)
- [Heading and line navigation](navigation.md)
- [Refresh and recovery](refresh.md)
- [Add selection to chat](selection.md)
- [Shared Markdown consumer builds and parity](../references/shared-markdown.md)

The root fixture proves only component handling, not native BB routing or the live composer. Use [the local reader recipe](../references/markdown-reader-local.md) for its launch, Doctor and evidence details.

## Driving and proof conventions

- Use actual user actions and stable accessible names. DOM/runtime reads may observe the result; setters and fabricated passing state cannot replace the action.
- Each feature file uses four H2 sections: Sub-features, How to get to it (user POV), Driving it with the named harness, and Gotchas.
- Capture actions and resulting state, plus a second read of any side effect. Preserve failures and retry semantics. A read-only proof observes no sends/writes, rather than trusting a label.
- Classify every requested entry as passed, failed, blocked or not run. Keep fixture, build/activation, installed behavior and cleanup results separate. No local run implicitly verifies all 13 installed plugins.

For direct existing Markdown Reader suite commands in the subfeature maps, set a new `SUITE_EVIDENCE` and export `PLAYWRIGHT_HTML_OUTPUT_DIR="$SUITE_EVIDENCE/html"` and `PLAYWRIGHT_JSON_OUTPUT_FILE="$SUITE_EVIDENCE/results.json"` before invocation. The shared `scripts/browser.sh` sets these automatically and forces ephemeral ports for its three supported packages. Tasks Plus uses its package runner with a separate ephemeral origin and private-capture config. Code Cleanup's chosen port must be free. Neither reuses a listener.

## Maintenance

Update the package map and this index together when a package, entry point, harness or permission requirement changes. Read the exact package README and installed CLI help before a live run. Use `/maintain-verification-skill` when available. A documented but unexecuted live recipe remains unverified, not a pass.
