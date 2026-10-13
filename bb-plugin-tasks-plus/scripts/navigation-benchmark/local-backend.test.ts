import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { createLocalBackend } from "./local-backend.js";
const backends: ReturnType<typeof createLocalBackend>[] = [];
afterEach(async () => {
  while (backends.length) await backends.pop()!.dispose();
});
function setup() {
  const backend = createLocalBackend("bbp60-navigation-lab");
  backends.push(backend);
  return backend;
}
describe("owned local SDK backend", () => {
  it("uses native schema-validated tasks and labels without comment fixtures", async () => {
    const backend = setup();
    expect(existsSync(backend.databasePath)).toBe(true);
    const task = await backend.call("getTaskByKey", { taskKey: "BENCH-1" });
    expect(task).toMatchObject({
      task: {
        key: "BENCH-1",
        title: backend.fixture.tasks[0].title,
        labelIds: [expect.any(String)],
      },
    });
    expect(backend.fixture).not.toHaveProperty("activity");
    const descriptionTask = await backend.call("getTaskByKey", { taskKey: "BENCH-100" });
    expect(descriptionTask).toMatchObject({
      task: {
        id: backend.fixture.tasks[99].id,
        description: backend.fixture.tasks[99].description,
      },
    });
    expect(await backend.call("listAttachments", { taskId: backend.fixture.tasks[99].id })).toEqual(
      {
        attachments: [],
      },
    );
  });
  it("rejects malformed inputs, removed RPCs, mutations, dispatch and unstubbed SDK access", async () => {
    const backend = setup();
    await expect(backend.call("getTaskByKey", { taskKey: 42 })).rejects.toThrow();
    await expect(
      backend.call("createComment", {
        taskId: backend.fixture.tasks[0].id,
        body: "blocked",
        notify: true,
      }),
    ).rejects.toThrow("Unknown RPC");
    await expect(
      backend.call("getTaskActivity", { taskId: backend.fixture.tasks[0].id }),
    ).rejects.toThrow("Unknown RPC");
    await expect(
      backend.call("createTask", { projectId: "00000000000000000000000001", title: "blocked" }),
    ).rejects.toThrow("blocks");
    await expect(backend.call("dispatchTask", {})).rejects.toThrow();
    expect(() => backend.bb.sdk.hosts.list()).toThrow("not stubbed");
    expect(backend.harness.realtimeSignals).toHaveLength(0);
  });
  it("keeps failed reads/saves explicit and disposes the owned SQLite directory", async () => {
    const backend = setup();
    backend.control({ failRead: "BENCH-1", failSave: true });
    await expect(backend.call("getTaskByKey", { taskKey: "BENCH-1" })).rejects.toThrow(
      "failed-read",
    );
    await expect(
      backend.call("updateTask", { taskId: backend.fixture.tasks[0].id, title: "draft" }),
    ).rejects.toThrow("failed-save");
    backend.control({ failRead: null, failSave: false });
    expect(await backend.call("getTaskByKey", { taskKey: "BENCH-1" })).toMatchObject({
      task: { title: backend.fixture.tasks[0].title },
    });
    const directory = dirname(backend.databasePath);
    await backend.dispose();
    backends.pop();
    expect(existsSync(directory)).toBe(false);
  });
});
