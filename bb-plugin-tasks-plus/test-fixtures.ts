import type { SingleTask } from "./shared/contract.js";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

export function mockPrStatusRpc(
  lookup: (input: { environmentId: string }) => Promise<unknown>,
): BbPluginApi["sdk"]["plugins"]["callRpc"] {
  return async ({ pluginId, method, input, outputSchema }) => {
    if (pluginId !== "bb--github-pr-status" || method !== "pullRequests") {
      throw new Error(`Unexpected plugin RPC ${pluginId}.${method}`);
    }
    const { keys } = z.object({ keys: z.array(z.string()) }).parse(input);
    const results = await Promise.all(
      keys.map(async (environmentId) => [environmentId, await lookup({ environmentId })]),
    );
    return outputSchema.parse(Object.fromEntries(results));
  };
}

export function makeTask(overrides: Partial<SingleTask> = {}): SingleTask {
  return {
    id: "01HZZZZZZZZZZZZZZZZZZZZZT1",
    projectId: "01HZZZZZZZZZZZZZZZZZZZZZP1",
    number: 1,
    key: "TSK-1",
    title: "Test task",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: null,
    parentTaskId: null,
    createdByThreadId: null,
    position: 0,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    labelIds: [],
    duration: {
      kind: "unavailable",
      reason: "missing-start",
      interrupted: false,
      statisticsEligible: false,
    },
    ...overrides,
  };
}

export function makeAttachment(taskId: string, fileName = "a.txt") {
  return {
    id: "01HZZZZZZZZZZZZZZZZZZZZZA1",
    taskId,
    fileName,
    mime: "text/plain",
    sizeBytes: 1,
    isImage: false,
    createdAt: "2026-07-15T00:00:00.000Z",
  };
}

export function rpcInput(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`expected an RPC input object, got ${JSON.stringify(input)}`);
  }
  return Object.fromEntries(Object.entries(input));
}
