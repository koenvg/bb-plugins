import { afterEach, describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

const hosts: Array<ReturnType<typeof createFakePluginHost>["harness"]> = [];
afterEach(async () => {
  while (hosts.length) await hosts.pop()!.lifecycle.dispose();
});

async function setup() {
  const host = createFakePluginHost({
    pluginId: "task-board",
    sdk: {
      projects: { list: async () => [
        { id: "proj_one", name: "One", kind: "standard" },
        { id: "proj_two", name: "Two", kind: "standard" },
      ] as never },
      threads: { get: async ({ threadId }: { threadId: string }) =>
        threadId === "thr_one" ? { id: threadId, projectId: "proj_one" } as never : null as never },
    },
  });
  hosts.push(host.harness);
  await plugin(host.bb);
  return host.harness;
}

describe("project task management", () => {
  it("creates tasks per project, updates their fields, and persists through plugin reload", async () => {
    const host = await setup();
    const created = await host.behavior.callRpc("tasks_create", {
      projectId: "proj_one", prompt: "Ship the board\n\nKeep this prompt", priority: "high",
    }) as { id: string; status: string; prompt: string };
    expect(created.id).toMatch(/^TASK-/);
    expect(created.status).toBe("backlog");
    await host.behavior.callRpc("tasks_update", { id: created.id, prompt: "Ship the board v2\n\nKeep this prompt", status: "doing", focus: "focus", labels: ["ui", "bug"] });
    const replacement = await host.lifecycle.reload(plugin);
    hosts.pop(); // reload disposed the original handle
    hosts.push(replacement.harness);
    const one = await replacement.harness.behavior.callRpc("tasks_list", { projectId: "proj_one" }) as { tasks: Array<{ id: string; prompt: string; labels: string[] }> };
    const two = await replacement.harness.behavior.callRpc("tasks_list", { projectId: "proj_two" }) as { tasks: unknown[] };
    expect(one.tasks).toMatchObject([{ id: created.id, prompt: "Ship the board v2\n\nKeep this prompt", labels: ["ui", "bug"] }]);
    expect(two.tasks).toEqual([]);
  });

  it("enforces existing projects, same-project prerequisites, no cycles, and unfinished dependencies", async () => {
    const host = await setup();
    await expect(host.behavior.callRpc("tasks_create", { projectId: "missing", prompt: "No" })).rejects.toThrow();
    const a = await host.behavior.callRpc("tasks_create", { projectId: "proj_one", prompt: "API" }) as { id: string };
    const b = await host.behavior.callRpc("tasks_create", { projectId: "proj_one", prompt: "UI" }) as { id: string };
    const other = await host.behavior.callRpc("tasks_create", { projectId: "proj_two", prompt: "Other" }) as { id: string };
    await expect(host.behavior.callRpc("tasks_update", { id: b.id, dependsOn: [other.id] })).rejects.toThrow();
    await host.behavior.callRpc("tasks_update", { id: b.id, dependsOn: [a.id] });
    await expect(host.behavior.callRpc("tasks_update", { id: a.id, dependsOn: [b.id] })).rejects.toThrow(/cycle/i);
    await expect(host.behavior.callRpc("tasks_update", { id: b.id, status: "doing" })).rejects.toThrow(/prerequisite/i);
    await host.behavior.callRpc("tasks_update", { id: a.id, status: "done" });
    expect(await host.behavior.callRpc("tasks_update", { id: b.id, status: "doing" })).toMatchObject({ status: "doing" });
  });

  it("validates linked threads and clears deleted prerequisites", async () => {
    const host = await setup();
    const a = await host.behavior.callRpc("tasks_create", { projectId: "proj_one", prompt: "First" }) as { id: string };
    const b = await host.behavior.callRpc("tasks_create", { projectId: "proj_one", prompt: "Second" }) as { id: string };
    await expect(host.behavior.callRpc("tasks_update", { id: b.id, threadId: "thr_other" })).rejects.toThrow();
    await host.behavior.callRpc("tasks_update", { id: b.id, dependsOn: [a.id], threadId: "thr_one" });
    const previous = await host.behavior.callRpc("tasks_get", { id: b.id }) as { updatedAt: string };
    await host.behavior.callRpc("tasks_remove", { id: a.id });
    const listed = await host.behavior.callRpc("tasks_list", { projectId: "proj_one" }) as { tasks: Array<{ dependsOn: string[]; threadId: string }> };
    expect(listed.tasks).toMatchObject([{ dependsOn: [], threadId: "thr_one" }]);
    expect(listed.tasks[0]?.updatedAt).not.toBe(previous.updatedAt);
    await expect(host.behavior.callRpc("tasks_update", { id: b.id, expectedUpdatedAt: previous.updatedAt, prompt: "stale" })).rejects.toThrow(/changed elsewhere/i);
  });
  it("exposes a project-scoped CLI with bounded pagination and validates patches", async () => {
    const host = await setup();
    const added = await host.behavior.runCli(["add", "--project", "proj_one", "--prompt", "CLI task", "--priority", "high"]);
    expect(added.exitCode).toBe(0);
    const id = (JSON.parse(added.stdout ?? "{}") as { id: string }).id;
    const listed = await host.behavior.runCli(["list", "--project", "proj_one", "--limit", "1"]);
    expect(JSON.parse(listed.stdout ?? "{}")).toMatchObject({ total: 1, tasks: [{ id, priority: "high" }] });
    expect((await host.behavior.runCli(["update", id, "--patch", '{"status":"done"}'])).exitCode).toBe(0);
    expect((await host.behavior.runCli(["update", id, "--patch", '{"unexpected":1}'])).exitCode).toBe(1);
    const promptOnly = await host.behavior.runCli(["add", "--project", "proj_one", "--prompt", "Just a prompt"]);
    expect(JSON.parse(promptOnly.stdout ?? "{}")).toMatchObject({ prompt: "Just a prompt", priority: "normal" });
    expect((await host.behavior.runCli(["add", "--project", "proj_one", "--title", "Old CLI syntax"])).exitCode).toBe(1);
    expect((await host.behavior.runCli(["update", id, "--patch", '{"title":"Old field"}'])).exitCode).toBe(1);
    expect((await host.behavior.runCli(["list", "--project", "proj_two"])).stdout).toContain('"tasks":[]');
  });
  it("filters before pagination so older Focus work remains visible and counts include every task", async () => {
    const host = await setup();
    const focus = await host.behavior.callRpc("tasks_create", { projectId: "proj_one", prompt: "Old focus needle" }) as { id: string };
    await host.behavior.callRpc("tasks_update", { id: focus.id, status: "doing", focus: "focus" });
    await new Promise((resolve) => setTimeout(resolve, 4));
    for (let index = 0; index < 205; index++) {
      await host.behavior.callRpc("tasks_create", { projectId: "proj_one", prompt: `Backlog ${index}` });
    }
    const board = await host.behavior.callRpc("tasks_list", { projectId: "proj_one", view: "focus", query: "needle", limit: 1, offset: 0 }) as { tasks: Array<{ id: string }>; total: number; counts: Record<string, number> };
    expect(board).toMatchObject({ total: 1, tasks: [{ id: focus.id }], counts: { focus: 1, backlog: 205, "in-flight": 1 } });
    const backlog = await host.behavior.callRpc("tasks_list", { projectId: "proj_one", view: "backlog", limit: 200, offset: 200 }) as { total: number; tasks: unknown[] };
    expect(backlog).toMatchObject({ total: 205 });
    expect(backlog.tasks).toHaveLength(5);
  });

  it("rejects a stale editor revision and keeps the newer task unchanged", async () => {
    const host = await setup();
    const original = await host.behavior.callRpc("tasks_create", { projectId: "proj_one", prompt: "Original" }) as { id: string; updatedAt: string };
    const changed = await host.behavior.callRpc("tasks_update", { id: original.id, status: "doing" }) as { updatedAt: string };
    expect(changed.updatedAt).not.toBe(original.updatedAt);
    await expect(host.behavior.callRpc("tasks_update", { id: original.id, prompt: "My stale draft", expectedUpdatedAt: original.updatedAt })).rejects.toThrow(/changed elsewhere/i);
    expect(await host.behavior.callRpc("tasks_get", { id: original.id })).toMatchObject({ status: "doing", prompt: "Original" });
  });
  it("creates and searches prompt-only tasks without accepting a title", async () => {
    const host = await setup();
    await expect(host.behavior.callRpc("tasks_create", { projectId: "proj_one", prompt: "  \n  " })).rejects.toThrow();
    const created = await host.behavior.callRpc("tasks_create", { projectId: "proj_one", prompt: "Write docs\n\nInclude examples" }) as { id: string; prompt: string; title?: string };
    expect(created).toMatchObject({ prompt: "Write docs\n\nInclude examples" });
    expect(created).not.toHaveProperty("title");
    await expect(host.behavior.callRpc("tasks_create", { projectId: "proj_one", title: "Old field", prompt: "New prompt" })).rejects.toThrow();
    const list = await host.behavior.callRpc("tasks_list", { projectId: "proj_one", query: "examples" }) as { tasks: Array<{ id: string }> };
    expect(list.tasks).toMatchObject([{ id: created.id }]);
    const updated = await host.behavior.callRpc("tasks_update", { id: created.id, prompt: "New work" }) as { prompt: string };
    expect(updated.prompt).toBe("New work");
    await expect(host.behavior.callRpc("tasks_update", { id: created.id, prompt: "   " })).rejects.toThrow();
    expect(await host.behavior.callRpc("tasks_get", { id: created.id })).not.toHaveProperty("title");
  });

  it("migrates an existing title and description into one prompt without losing either", async () => {
    const host = createFakePluginHost({ pluginId: "task-board" });
    hosts.push(host.harness);
    const db = host.bb.storage.database();
    host.bb.storage.migrate(db, [`CREATE TABLE tasks (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL, status TEXT NOT NULL, focus TEXT,
      priority TEXT NOT NULL, labels TEXT NOT NULL, depends_on TEXT NOT NULL,
      thread_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ); CREATE INDEX tasks_project_updated ON tasks(project_id, updated_at DESC)`]);
    db.prepare("INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "TASK-old", "proj_one", "Old title", "Detailed prompt", "backlog", null, "high", "[]", "[]", null,
      "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    );
    db.prepare("INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "TASK-title-only", "proj_one", "Only a title", "", "done", null, "normal", "[]", "[]", null,
      "2026-01-02T00:00:00.000Z", "2026-01-02T00:00:00.000Z",
    );
    await plugin(host.bb);
    expect(await host.harness.behavior.callRpc("tasks_get", { id: "TASK-old" }))
      .toMatchObject({ prompt: "Old title\n\nDetailed prompt", priority: "high" });
    expect((await host.harness.behavior.callRpc("tasks_get", { id: "TASK-old" })) as object).not.toHaveProperty("title");
    expect(await host.harness.behavior.callRpc("tasks_get", { id: "TASK-title-only" }))
      .toMatchObject({ prompt: "Only a title", status: "done" });
  });

});
