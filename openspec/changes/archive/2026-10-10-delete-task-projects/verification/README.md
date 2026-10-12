# Deletion verification

The fixture renders the production project table and deletion dialog. It changes browser memory only. Koen approved the adjusted preview with “Perfect”. These captures do not verify the installed BB host.

## Evidence

- [Desktop dark](desktop-dark-confirmation.png) and [light](desktop-light-confirmation.png).
- [320px panel, dark](narrow-panel-dark-confirmation.png).
- [375px mobile viewport, light](mobile-light-confirmation.png).
- Row captures use the same filename prefixes with `-rows.png`.
- [Measured results](browser-evidence.json): four layout/keyboard scenarios and three supplemental fixture flows.
- `first-desktop-confirmation.png` retains the early reset/spacing defect, not the final rendering.

Native Tab, Space, text input and Escape were used for the four captured scenarios. All row actions are at least 36px; confirmation alone sends no deletion request. The description inherits native typography and has an 8px paragraph gap. Both pending deletion scenarios keep the primary action rectangle unchanged and preserve the surviving row's draft.

After viewport switches, native pointer/keyboard input failed in later scenarios. Supplemental flows use DOM clicks on rendered buttons and a synthetic Escape event while pending. They verify rendered state and RPC behavior, not native touch delivery. No native touch or installed-host check is claimed. Browser scrollbar gutters remain visible in the mobile fixture.

## Reproduce

This change is archived. The commands below and the helper's output path refer to its former active location. They are historical evidence; do not run the archived helper as-is, because it would recreate that location.

Use the existing task-owned daemon and target in `browser-check.py`. Do not borrow another user's or agent's tab. If that target is gone, create your own fixture tab and update the target first.

```sh
BU_NAME=delete-projects-thr92-preview BH_REQUIRE_EXISTING_DAEMON=1 \
  browser-use < openspec/changes/delete-task-projects/verification/browser-check.py
```

The visual phase uses native keyboard input. The supplemental phase uses rendered DOM controls because of the input-delivery limit above. To rerun only those flows without more screenshots:

```sh
BU_NAME=delete-projects-thr92-preview BH_REQUIRE_EXISTING_DAEMON=1 BB_PREVIEW_FLOWS_ONLY=1 \
  browser-use < openspec/changes/delete-task-projects/verification/browser-check.py
```

Browser Use is local verification tooling, not a new plugin dependency. Do not run another visual polishing cycle without an agreed need.
