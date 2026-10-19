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

Nine detail commands are registered. Dispatch task..., Previous task, Next task and Back are currently unavailable.
There is no Write a comment command under the comment-free Tasks contract.
