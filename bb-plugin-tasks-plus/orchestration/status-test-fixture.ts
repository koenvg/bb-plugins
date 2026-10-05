// Disposable Tasks/BB SDK fixture. No production tasks or provider activation.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { afterEach, vi } from "vitest";
import { createStore } from "../api";
import { registerTasksCli } from "../cli";
import { registerOrchestrationStatus } from "./index";
import { orchestrationStatusContract } from "./status-contract";
import type { CoordinationSnapshot } from "./status-contract";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (disposers.length) await disposers.pop()?.();
});

export function setup() {
  const get = vi.fn<BbPluginApi["sdk"]["threads"]["get"]>(async ({ threadId }) => {
    if (threadId === "thr_missing")
      throw Object.assign(new Error("gone"), { code: "thread_not_found" });
    if (threadId === "thr_unknown") throw new Error("offline");
    return makeThreadResponse({
      id: threadId,
      status: threadId === "thr_failed" ? "error" : "idle",
      deletedAt: threadId === "thr_deleted" ? Date.now() : null,
    });
  });
  const list = vi.fn<BbPluginApi["sdk"]["threads"]["interactions"]["list"]>(async () => []);
  const spawn = vi.fn();
  const send = vi.fn();
  const { bb, harness } = createFakePluginHost({
    pluginId: "status-test",
    sdk: { threads: { get, spawn, send, interactions: { list } } },
  });
  disposers.push(() => harness.dispose());
  const store = createStore(bb);
  const coordination: CoordinationSnapshot = {};
  registerOrchestrationStatus(bb, store, {
    readCoordination: () => coordination,
  });
  registerTasksCli(
    bb,
    store,
    { name: "Tasks", version: "test" },
    { readCoordination: () => coordination },
  );
  const project = store.tasks.createProject({
    name: "Disposable status fixture",
    prefix: "STAT",
    color: "blue",
  });
  const epic = store.tasks.createTask({
    projectId: project.id,
    title: "Disposable epic",
    status: "in_progress",
  });
  const child = (title: string, status: "todo" | "in_progress" | "done" = "todo") =>
    store.tasks.createTask({
      projectId: project.id,
      parentTaskId: epic.id,
      title,
      status,
    });
  const attach = (taskId: string, threadId: string) =>
    store.tasks.upsertTaskThread({
      taskId,
      threadId,
      title: "Worker",
      presetName: "Attached",
      liveStatus: "idle",
    });
  const read = async () =>
    orchestrationStatusContract.orchestrateStatus.output.parse(
      await harness.callRpc("orchestrateStatus", { epicId: epic.id }),
    );
  return {
    bb,
    harness,
    store,
    epic,
    project,
    child,
    attach,
    read,
    get,
    list,
    spawn,
    send,
    coordination,
  };
}
