# Tasks for BB

A local task board inside BB. Tasks belong to BB projects, persist in the plugin's own SQLite database, and can link to existing BB threads. No OpenForge service or account is required.

## Use it

Install from this directory:

```sh
bb plugin build
bb plugin install . --yes
```

Open **Tasks** in the BB sidebar. Pick a project and fill in a prompt to create a task; priority defaults to normal. Edit the prompt, priority, status, attention flag, labels, prerequisites and linked thread in the detail pane. The board shows an excerpt of each prompt and has Focus, In flight, Out of focus, Backlog and Done views. Focus and Out of focus are manual flags on in-progress tasks; In flight includes both. Each view and search query filters the entire project before paging 200 results at a time. Existing prerequisites can be removed even when they are not on the current page; add a new one by copying its full ID from its task details.

Agents and scripts can use the same store:

```sh
bb task-board list --project proj_example
bb task-board add --project proj_example --prompt "Write the docs" --priority high
bb task-board update TASK-id --patch '{"status":"doing","focus":"focus","labels":["docs"]}'
bb task-board update TASK-id --patch '{"threadId":"thr_example","dependsOn":["TASK-other"]}'
bb task-board update TASK-id --patch '{"status":"done"}'
```

CLI responses are JSON. `bb task-board list` supports `--view`, `--query`, `--limit` (1–500) and `--offset`; the result includes filtered `total` and project-wide view counts. `bb task-board show <task-id>` returns one complete task. The detail pane checks `updatedAt` when saving: if another writer changed the task, it keeps your draft and offers an explicit reload instead of overwriting the new version. Scripts may pass `expectedUpdatedAt` in an update patch for the same check. `bb task-board help` shows command usage. The included `project-tasks` skill explains this workflow to BB agents.

Upgrading an existing install combines each task's old title and description into its prompt, with a blank line between them. Existing tasks keep their other fields.
## Boundaries

- Prerequisites must belong to the same project and form an acyclic graph. They must be done before moving a task to In progress. Deleting a prerequisite clears that link from its dependents.
- A linked thread must already exist in the same project. Linking does not create, start, or change the thread. Task status and thread status are independent.
- Task deletion does not delete a linked thread. Project deletion does not automatically delete the plugin's stored task rows; orphaned tasks are hidden when their project is gone.
- This plugin does not import OpenForge tasks or reproduce its agent runs, PR reviews or attention automation.

## Development

```sh
npm install
npx vitest run
npx tsc --noEmit
bb plugin build
bb plugin reload task-board
```

The backend is `server.ts` (SQLite, RPC, CLI, realtime); the sidebar page is `app.tsx`. The plugin uses the host's theme tokens and vendored UI controls. Test state with `@get-bb/plugin-sdk/testing` in `server.test.ts`.
