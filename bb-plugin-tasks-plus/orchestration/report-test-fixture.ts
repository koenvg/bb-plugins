import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { fixture, historicalOwner } from "./dispatch-test-fixture";
import type { WorkerReport } from "./report-contract";
import { registerTasks } from "../server";
// Enable the candidate contract only in this isolated SDK fixture.

export const decodeTool = (result: any) =>
  JSON.parse(typeof result === "string" ? result : result.content[0].text);
export async function reportFixture(
  count = 1,
  attach = true,
  provider = "codex",
  initialize = (bb: Parameters<typeof registerTasks>[0]) =>
    registerTasks(bb, { nativeProviders: [provider] }),
) {
  const f = await fixture(count, initialize);
  const files = new Map<string, string>();
  let notices = 0;
  f.harness.sdk.stub("threads.send", async (args: any) => ({
    ok: true,
    delivery: "queued",
    queuedMessage: {
      id: `qmsg_fixture_notice_${++notices}`,
      threadId: args.threadId,
      content: args.input,
    },
  }));
  f.harness.sdk.stub("threads.storageLocation", async () => ({
    hostId: "host_fixture",
    storageRootPath: "/tmp/report-fixture",
  }));
  f.harness.sdk.stub("files.write", async (input: any) => {
    files.set(input.path, input.content);
    return { outcome: "written", sha256: "fixture", sizeBytes: 64 };
  });
  f.harness.sdk.stub("files.read", async (input: any) => ({
    content: files.get(input.path),
    contentEncoding: "utf8",
    sha256: "fixture",
    sizeBytes: 64,
  }));
  f.harness.sdk.stub("threads.list", async () => [...f.workers.values()]);
  if (attach) {
    historicalOwner(f);
    f.workers.set(
      "thr_worker",
      makeThreadResponse({
        ...f.workers.get("thr_worker")!,
        providerId: provider,
        status: "active",
        createdAt: Date.now(),
      }),
    );
  }
  const nativeContext = { threadId: "thr_worker", projectId: "proj_fixture" };
  const payload = {
    taskId: f.task.id,
    key: "report-1",
    outcome: "completed",
    summary: "Checks pass.",
    resultReferences: [{ kind: "commit" as const, reference: "abc123" }],
    baselineReferences: ["commit:base"],
  };
  const report = async (
    change: Record<string, unknown> = {},
    context = nativeContext,
  ): Promise<WorkerReport> =>
    decodeTool(
      await f.harness.behavior.callAgentTool("tasks_report", { ...payload, ...change }, context),
    );
  const issue = async (taskId = f.task.id, context = nativeContext) => {
    const result = decodeTool(
      await f.harness.behavior.callAgentTool("tasks_report_context", { taskId }, context),
    );
    return { ...result, token: files.get(result.contextFile)! };
  };
  const detach = () =>
    f.harness.behavior.callRpc("taskThreadsDetach", {
      taskId: f.task.id,
      threadId: "thr_worker",
    });
  return { ...f, files, payload, nativeContext, report, issue, detach };
}
