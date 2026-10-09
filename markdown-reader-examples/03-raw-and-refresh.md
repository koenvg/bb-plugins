---
title: Willow Garden handover
session: 7
status: draft
private_data: none
---

# Willow Garden handover

Preview is for reading the handover. Raw is for checking the complete source, including the frontmatter above this heading.

The reader does not edit the file or watch it for changes. Use a separate editor to change the status below, then select Refresh here.

## Current status

**Status: Draft, waiting for the closing check.**

For a manual refresh demonstration:

1. Open this file in an editor.
2. Change the status line to **Status: Ready for the next session.**
3. Save the file.
4. Return to Markdown Reader.
5. Select Refresh and check the new status in Preview and Raw.

Switching between Preview and Raw alone does not reread the file.

## The handover checklist

The checkboxes show recorded state. They are read-only in the viewer.

- [x] Return clean tools to the shed.
- [x] Clear the main path.
- [ ] Confirm the damaged trowel is in the repair box.
- [ ] Update the task board.
- Ask the session lead to inspect the gate latch.

### Keep the nested details

- Tool shed
  - Hand tools in the low rack.
  - Damaged tools in the repair box.
    - Include a short note about the fault.
- Shared table
  - Remove empty cups.
  - Leave the handover notebook in its tray.

### Continue a numbered list

7. Check the tap is closed.
8. Coil the hose.
9. Close the gate.

This list intentionally starts at seven.

## Preview hides metadata, not body content

The leading YAML block describes this example. Preview hides that block. Raw retains it.

The separator below belongs to the body and should remain visible.

---

A heading written with underline syntax
--------------------------------------

This is a Markdown heading too. It should appear in Outline beside the other body headings.

## Source spacing stays intact

This code has a blank line, indentation, and inline JSON objects. Switching views should not turn it into a different source file.

```json
{
  "north": { "buckets": 4, "checked": true },

  "south": { "buckets": 0, "checked": false }
}
```

Inline code stays distinct from prose: `status: draft` is metadata, while the bold status line above is visible document content.

## Links stay local where possible

Use [Current status](#current-status) to return to the refresh exercise without opening another file. Follow this footnote and its return link.[^handover]

Open the [reading example](01-reading-and-outline.md) or the [example index](README.md) to try a supported sibling-file link.

[^handover]: All garden names, records, and tasks in these files are fictional.
