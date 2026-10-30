# Change the open task's properties

Open a loaded task through its task route in BB's Tasks panel. Press Cmd+Shift+P and choose:

- **Tasks: Change status**.
- **Tasks: Set priority**.
- **Tasks: Set due date**.
- **Tasks: Edit labels**.
- **Tasks: Change linked BB project**.

Personal bindings are available in **Settings > Keyboard**. The plugin supplies no defaults.
The visible picker receives keyboard focus. Choose a value to save, or press Escape to cancel
and return focus to the visible trigger. Blocked-work confirmation still applies to In progress.

These commands do not target focused list rows, board cards, embedded tasks or hidden panels.
Loading, missing and failed task lookups are unavailable.

Set due date offers Today, Tomorrow, Next week, and a native custom date input. Choose a preset
or select a non-empty custom date to save it. Choose **Remove due date** to clear an existing date.
Opening the picker or pressing Escape without a choice changes nothing. There is no bare-key due-date shortcut.

Change linked BB project requires a loaded tracker project. The picker names it and explains that
its link applies to all its tasks. Changing the selection does not save. Choose **Save** or explicitly
**Unlink**. Escape discards unsaved selection. Failed saves keep the selection and report the error.
This changes the tracker-project link, not task membership or existing threads, and starts no agent.
There is no bare-key linked-project shortcut.

**Tasks: Dispatch task...** and `d` open the visible preset menu without starting an agent or selecting the last preset.
Escape closes the menu and returns focus to its trigger. Only selecting a preset starts an agent for the open task.
Blocked-work confirmation and delegation errors still apply. The command is unavailable while presets load, fail to load,
are missing, or the shown control awaits confirmation or delegation. The mouse primary button still uses the last preset.

## Navigate the open task

On a loaded standalone task, choose **Tasks: Previous task**, **Tasks: Next task**, or **Tasks: Back** in Cmd+Shift+P.
Assign personal bindings in **Settings > Keyboard** if needed. The plugin supplies no defaults.
Previous and Next share the existing `[` and `]` pager actions, including when narrow layouts hide the buttons.

The standalone pager uses top-level tasks in its project scope, or across projects.
It groups tasks by status and keeps their existing order within each status.
Browse filters, browse sort, expanded subtasks, and Active-only filtering do not define this order.
A direction is unavailable at an end or before its destination is known. Invoking it does nothing and queues no navigation.

Back restores the remembered browse route, including the original project list or board after paging.
Without a remembered route, a direct task link falls back to All tasks, like the Back button and Escape.
Navigation does not update tasks or projects, or start an agent.
The commands target only the loaded, shown standalone task, not list previews, boards, embedded tasks, or hidden panels.

Nine detail commands are registered. There is no Write a comment command under the comment-free Tasks contract.
