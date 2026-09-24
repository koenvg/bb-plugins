import { randomUUID } from "node:crypto";
import { defineRpcContract, PLUGIN_CLI_OUTPUT_MAX_BYTES, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const status = z.enum(["backlog", "doing", "done"]);
const focus = z.enum(["focus", "out-of-focus"]);
const view = z.enum(["focus", "in-flight", "out-of-focus", "backlog", "done"]);
const priority = z.enum(["low", "normal", "high", "urgent"]);
const prompt = z.string().max(25_000).refine((value) => value.trim().length > 0, "Prompt is required");
const labels = z.array(z.string().trim().min(1).max(40)).max(20);
const ids = z.array(z.string().min(1)).max(50);
const taskSchema = z.object({
  id: z.string(), projectId: z.string(), prompt,
  status, focus: focus.nullable(), priority, labels, dependsOn: ids,
  threadId: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
});
export type Task = z.infer<typeof taskSchema>;
const patchSchema = z.object({
  prompt: prompt.optional(), status: status.optional(),
  focus: focus.nullable().optional(), priority: priority.optional(), labels: labels.optional(),
  dependsOn: ids.optional(), threadId: z.string().min(1).nullable().optional(),
}).strict();

export const rpcContract = defineRpcContract({
  tasks_projects: { input: z.null(), output: z.object({ projects: z.array(z.object({ id: z.string(), name: z.string() })) }) },
  tasks_list: {
    input: z.object({
      projectId: z.string().min(1), view: view.optional(), query: z.string().max(200).default(""),
      limit: z.number().int().min(1).max(500).default(200), offset: z.number().int().min(0).default(0),
    }).strict(),
    output: z.object({ tasks: z.array(taskSchema), total: z.number(), counts: z.record(view, z.number()) }),
  },
  tasks_get: { input: z.object({ id: z.string().min(1) }).strict(), output: taskSchema },
  tasks_create: {
    input: z.object({ projectId: z.string().min(1), prompt, priority: priority.default("normal") }).strict(),
    output: taskSchema,
  },
  tasks_update: { input: z.object({ id: z.string().min(1), expectedUpdatedAt: z.string().optional() }).extend(patchSchema.shape).strict(), output: taskSchema },
  tasks_remove: { input: z.object({ id: z.string().min(1) }).strict(), output: z.object({ removed: z.boolean() }) },
});

type Patch = z.infer<typeof patchSchema>;
type Row = {
  id: string; project_id: string; prompt: string;
  status: Task["status"]; focus: Task["focus"]; priority: Task["priority"];
  labels: string; depends_on: string; thread_id: string | null;
  created_at: string; updated_at: string;
};

export default function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    `CREATE TABLE tasks (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL, status TEXT NOT NULL, focus TEXT,
      priority TEXT NOT NULL, labels TEXT NOT NULL, depends_on TEXT NOT NULL,
      thread_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ); CREATE INDEX tasks_project_updated ON tasks(project_id, updated_at DESC)`,
    `UPDATE tasks SET description = title || CASE WHEN description <> '' THEN char(10) || char(10) || description ELSE '' END;
     ALTER TABLE tasks RENAME COLUMN description TO prompt;
     ALTER TABLE tasks DROP COLUMN title`,
  ]);
  const rowToTask = (row: Row): Task => ({
    id: row.id, projectId: row.project_id, prompt: row.prompt,
    status: row.status, focus: row.focus, priority: row.priority,
    labels: JSON.parse(row.labels) as string[], dependsOn: JSON.parse(row.depends_on) as string[],
    threadId: row.thread_id, createdAt: row.created_at, updatedAt: row.updated_at,
  });
  const get = (id: string): Task | null => {
    const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Row | undefined;
    return row ? rowToTask(row) : null;
  };
  const requireTask = (id: string): Task => {
    const task = get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    return task;
  };
  const notify = (projectId: string) => bb.realtime.publish("tasks-changed", { projectId });
  async function projects() {
    return (await bb.sdk.projects.list({ includePersonal: true })).map(({ id, name }) => ({ id, name }));
  }
  async function requireProject(projectId: string) {
    if (!(await projects()).some((project) => project.id === projectId)) throw new Error(`Project ${projectId} not found`);
  }
  async function list(projectId: string, limit = 200, offset = 0, selectedView?: z.infer<typeof view>, search = "") {
    await requireProject(projectId);
    const countsRow = db.prepare(`SELECT
      COUNT(CASE WHEN status = 'doing' AND focus = 'focus' THEN 1 END) AS focus,
      COUNT(CASE WHEN status = 'doing' THEN 1 END) AS in_flight,
      COUNT(CASE WHEN status = 'doing' AND focus = 'out-of-focus' THEN 1 END) AS out_of_focus,
      COUNT(CASE WHEN status = 'backlog' THEN 1 END) AS backlog,
      COUNT(CASE WHEN status = 'done' THEN 1 END) AS done
      FROM tasks WHERE project_id = ?`).get(projectId) as Record<string, number>;
    const counts = { focus: countsRow.focus, "in-flight": countsRow.in_flight,
      "out-of-focus": countsRow.out_of_focus, backlog: countsRow.backlog, done: countsRow.done };
    const filter = selectedView === "focus" ? " AND status = 'doing' AND focus = 'focus'"
      : selectedView === "out-of-focus" ? " AND status = 'doing' AND focus = 'out-of-focus'"
      : selectedView === "in-flight" ? " AND status = 'doing'"
      : selectedView ? ` AND status = '${selectedView}'` : "";
    const where = `project_id = ?${filter} AND instr(lower(prompt || ' ' || labels), lower(?)) > 0`;
    const total = (db.prepare(`SELECT COUNT(*) AS count FROM tasks WHERE ${where}`).get(projectId, search) as { count: number }).count;
    const rows = db.prepare(`SELECT * FROM tasks WHERE ${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`).all(projectId, search, limit, offset) as Row[];
    return { tasks: rows.map(rowToTask), total, counts };
  }
  async function create(projectId: string, text: string, level: Task["priority"] = "normal") {
    await requireProject(projectId);
    const now = new Date().toISOString();
    const task: Task = {
      id: `TASK-${randomUUID()}`, projectId, prompt: text,
      status: "backlog", focus: null, priority: level, labels: [], dependsOn: [],
      threadId: null, createdAt: now, updatedAt: now,
    };
    db.prepare(`INSERT INTO tasks (id, project_id, prompt, status, focus, priority, labels, depends_on, thread_id, created_at, updated_at)
      VALUES (@id, @project_id, @prompt, @status, @focus, @priority, @labels, @depends_on, @thread_id, @created_at, @updated_at)`).run({
      id: task.id, project_id: task.projectId, prompt: task.prompt,
      status: task.status, focus: task.focus, priority: task.priority, labels: "[]", depends_on: "[]",
      thread_id: null, created_at: now, updated_at: now,
    });
    notify(projectId);
    return task;
  }
  async function update(id: string, patch: Patch, expectedUpdatedAt?: string): Promise<Task> {
    const before = requireTask(id);
    if (patch.threadId) {
      const thread = await bb.sdk.threads.get({ threadId: patch.threadId });
      if (!thread || thread.projectId !== before.projectId) throw new Error("Linked thread must exist in the same project");
    }
    // Re-read after the async thread check; validation and write are synchronous.
    const current = requireTask(id);
    if (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt) {
      throw new Error("Task changed elsewhere. Reload its details before saving your draft.");
    }
    const nextTime = Math.max(Date.now(), Date.parse(current.updatedAt) + 1);
    const next: Task = { ...current, ...patch, updatedAt: new Date(nextTime).toISOString() };
    if (next.status === "backlog") next.focus = null;
    if (next.status === "doing" && next.focus === null) next.focus = "focus";
    if (next.status === "done") next.focus = null;
    next.labels = [...new Set(next.labels)];
    next.dependsOn = [...new Set(next.dependsOn)];
    for (const dependencyId of next.dependsOn) {
      const dependency = get(dependencyId);
      if (!dependency || dependency.projectId !== next.projectId) throw new Error(`Prerequisite ${dependencyId} must be in the same project`);
    }
    const visit = (node: string, seen: Set<string>): boolean => {
      if (node === id) return true;
      if (seen.has(node)) return false;
      seen.add(node);
      return (get(node)?.dependsOn ?? []).some((parent) => visit(parent, seen));
    };
    if (next.dependsOn.some((dependencyId) => visit(dependencyId, new Set()))) throw new Error("Dependency cycle is not allowed");
    if (next.status === "doing" && current.status !== "doing" && next.dependsOn.some((dependencyId) => get(dependencyId)?.status !== "done")) {
      throw new Error("Finish prerequisites before moving this task to In progress");
    }
    db.prepare(`UPDATE tasks SET prompt = ?, status = ?, focus = ?, priority = ?, labels = ?, depends_on = ?, thread_id = ?, updated_at = ? WHERE id = ?`)
      .run(next.prompt, next.status, next.focus, next.priority, JSON.stringify(next.labels), JSON.stringify(next.dependsOn), next.threadId, next.updatedAt, id);
    notify(next.projectId);
    return next;
  }
  function remove(id: string) {
    const task = requireTask(id);
    db.transaction(() => {
      db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
      const dependents = db.prepare("SELECT id, depends_on, updated_at FROM tasks WHERE project_id = ?").all(task.projectId) as Array<Pick<Row, "id" | "depends_on" | "updated_at">>;
      const updateDependency = db.prepare("UPDATE tasks SET depends_on = ?, updated_at = ? WHERE id = ?");
      for (const dependent of dependents) {
        const old = JSON.parse(dependent.depends_on) as string[];
        if (old.includes(id)) {
          const nextTime = Math.max(Date.now(), Date.parse(dependent.updated_at) + 1);
          updateDependency.run(JSON.stringify(old.filter((item) => item !== id)), new Date(nextTime).toISOString(), dependent.id);
        }
      }
    })();
    notify(task.projectId);
    return { removed: true };
  }

  bb.rpc.register(rpcContract, {
    tasks_projects: async () => ({ projects: await projects() }),
    tasks_list: ({ projectId, limit, offset, view: selectedView, query }) => list(projectId, limit, offset, selectedView, query),
    tasks_get: ({ id }) => requireTask(id),
    tasks_create: ({ projectId, prompt, priority }) => create(projectId, prompt, priority),
    tasks_update: ({ id, expectedUpdatedAt, ...patch }) => update(id, patch, expectedUpdatedAt),
    tasks_remove: ({ id }) => remove(id),
  });

  const usage = "Usage: bb task-board list --project ID [--view VIEW] [--query TEXT] [--limit N] [--offset N] | show TASK-ID | add --project ID --prompt TEXT [--priority LEVEL] | update TASK-ID --patch JSON | remove TASK-ID";
  bb.cli.register({
    name: "task-board", summary: "Manage project tasks", commands: [
      { name: "list", summary: "List project tasks", usage: "bb task-board list --project ID [--view VIEW] [--query TEXT] [--limit N] [--offset N]" },
      { name: "show", summary: "Show one task", usage: "bb task-board show TASK-ID" },
      { name: "add", summary: "Create a task", usage: "bb task-board add --project ID --prompt TEXT [--priority LEVEL]" },
      { name: "update", summary: "Update a task", usage: "bb task-board update TASK-ID --patch '{\"status\":\"done\"}'" },
      { name: "remove", summary: "Delete a task", usage: "bb task-board remove TASK-ID" },
    ],
    async run(argv) {
      const [command, ...rest] = argv;
      if (!command || command === "help" || command === "--help") return { exitCode: 0, stdout: usage };
      const option = (name: string) => {
        const index = rest.indexOf(name);
        return index < 0 ? undefined : rest[index + 1];
      };
      try {
        let result: unknown;
        if (command === "list" && option("--project")) {
          const limit = option("--limit") ? Number(option("--limit")) : 200;
          const offset = option("--offset") ? Number(option("--offset")) : 0;
          if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isInteger(offset) || offset < 0) throw new Error("Invalid pagination");
          const selectedView = option("--view") ? view.parse(option("--view")) : undefined;
          const search = z.string().max(200).parse(option("--query") ?? "");
          result = await list(option("--project")!, limit, offset, selectedView, search);
        } else if (command === "show" && rest.length === 1) {
          result = requireTask(rest[0]);
        } else if (command === "add" && option("--project") && option("--prompt")) {
          const input = rpcContract.tasks_create.input.parse({ projectId: option("--project"), prompt: option("--prompt"), priority: option("--priority") ?? "normal" });
          result = await create(input.projectId, input.prompt, input.priority);
        } else if (command === "update" && rest[0] && option("--patch")) {
          const { id: taskId, expectedUpdatedAt, ...patch } = rpcContract.tasks_update.input.parse({ ...JSON.parse(option("--patch")!), id: rest[0] });
          result = await update(taskId, patch, expectedUpdatedAt);
        } else if (command === "remove" && rest.length === 1) {
          result = remove(rest[0]);
        } else return { exitCode: 1, stderr: usage };
        const stdout = JSON.stringify(result);
        if (Buffer.byteLength(stdout) > PLUGIN_CLI_OUTPUT_MAX_BYTES) {
          return { exitCode: 1, stderr: "Task result is too large. Request fewer rows with --limit/--offset." };
        }
        return { exitCode: 0, stdout };
      } catch (error) {
        return { exitCode: 1, stderr: error instanceof Error ? error.message : String(error) };
      }
    },
  });
}
