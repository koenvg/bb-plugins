import { describe, expect, it } from "vitest";
import { reportFixture, decodeTool } from "./report-test-fixture";
import { createReportStore } from "./report-store";
import { REPORT_LIMITS } from "./report-contract";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";

describe("native reporting capability boundary", () => {
  it("leaves native issuance/new reports disabled on the actual default plugin until the installed-origin gate passes", async () => {
    const { fixture } = await import("./dispatch-test-fixture");
    const f = await fixture();
    const { historicalOwner } = await import("./dispatch-test-fixture");
    historicalOwner(f);
    f.workers.set(
      "thr_worker",
      makeThreadResponse({
        ...f.workers.get("thr_worker")!,
        providerId: "codex",
      }),
    );
    const native = { threadId: "thr_worker", projectId: "proj_fixture" };
    await expect(
      f.harness.behavior.callAgentTool(
        "tasks_report_context",
        { taskId: f.task.id },
        native,
      ),
    ).rejects.toThrow(/outside the verified/);
    await expect(
      f.harness.behavior.callAgentTool(
        "tasks_report",
        {
          taskId: f.task.id,
          key: "blocked-gate",
          outcome: "completed",
          summary: "Not installed-verified",
        },
        native,
      ),
    ).rejects.toThrow(/outside the verified/);
    expect(f.harness.sdk.callsTo("files.write")).toHaveLength(0);
    expect(
      createReportStore(f.bb.storage.database()).latest(f.task.id),
    ).toBeNull();
  });
  it("stores only a hash and immutable native origin; token never appears in tool/report/comment output", async () => {
    const f = await reportFixture();
    const issued = await f.issue();
    const rows = f.bb.storage
      .database()
      .prepare("SELECT * FROM orchestration_report_contexts")
      .all();
    expect(JSON.stringify(rows)).not.toContain(issued.token);
    expect(JSON.parse((rows[0] as any).origin_json)).toMatchObject({
      taskId: f.task.id,
      threadId: "thr_worker",
      runId: f.input.runId,
    });
    expect(issued.contextFile).toMatch(/\.tasks-report-context-[a-f0-9-]{36}$/);
    const write = f.harness.sdk.callsTo("files.write")[0]![0] as any;
    expect(write).toMatchObject({
      mode: 0o600,
      rootPath: "/tmp/report-fixture",
      hostId: "host_fixture",
    });
    const report = await f.harness.behavior.callRpc("reportWorker", {
      ...f.payload,
      contextToken: issued.token,
    });
    expect(JSON.stringify(report)).not.toContain(issued.token);
    expect(JSON.stringify(f.store.tasks.listComments(f.task.id))).not.toContain(
      issued.token,
    );
    expect(JSON.stringify(f.harness.logEntries)).not.toContain(issued.token);
  });
  it("CLI and RPC cannot mint or report from a supplied thread ID", async () => {
    const f = await reportFixture();
    const denied = await f.harness.behavior.runCli(
      ["report-context", "--json"],
      { threadId: "thr_worker", projectId: "proj_fixture" },
    );
    expect(denied.exitCode).toBe(1);
    const cli = await f.harness.behavior.runCli(
      [
        "report",
        f.task.key,
        "--key",
        "fake",
        "--outcome",
        "completed",
        "--summary",
        "Fake",
        "--json",
      ],
      { threadId: "thr_worker" },
    );
    expect(cli.exitCode).toBe(1);
    await expect(
      f.harness.behavior.callRpc("reportWorker", {
        ...f.payload,
        threadId: "thr_worker",
      }),
    ).rejects.toThrow();
    await expect(
      f.harness.behavior.callRpc("reportWorker", {
        ...f.payload,
        contextToken: "a".repeat(64),
      }),
    ).rejects.toThrow(/Unknown report context/);
    await expect(
      f.harness.behavior.callAgentTool(
        "tasks_report_context",
        { taskId: f.task.id, threadId: "thr_worker" },
        { threadId: "thr_wrong", projectId: "proj_fixture" },
      ),
    ).rejects.toThrow();
    expect(
      createReportStore(f.bb.storage.database()).latest(f.task.id),
    ).toBeNull();
  });
  it("CLI/RPC use native-issued origin, not overridden environment identity", async () => {
    const f = await reportFixture();
    const issued = await f.issue();
    const cli = await f.harness.behavior.runCli(
      [
        "report",
        f.task.key,
        "--key",
        "cli-1",
        "--outcome",
        "review_ready",
        "--summary",
        "Ready",
        "--context-file",
        issued.contextFile,
        "--machine",
        issued.hostId,
        "--result",
        '{"kind":"evidence","reference":"artifact:tests"}',
        "--baseline",
        "commit:base",
        "--json",
      ],
      { threadId: "thr_wrong", projectId: "proj_other" },
    );
    expect(cli.exitCode).toBe(0);
    expect(JSON.parse(cli.stdout)).toMatchObject({
      threadId: "thr_worker",
      outcome: "review_ready",
    });
    expect(cli.stdout).not.toContain(issued.token);
    expect(
      await f.harness.behavior.runCli([
        "report-show",
        JSON.parse(cli.stdout).id,
        "--json",
      ]),
    ).toMatchObject({ exitCode: 0 });
  });
  it("rejects wrong-task token replay, arbitrary thread fields and new writes after detachment", async () => {
    const f = await reportFixture(2);
    const issued = await f.issue();
    await expect(
      f.harness.behavior.callRpc("reportWorker", {
        ...f.payload,
        taskId: f.tasks[1]!.id,
        contextToken: issued.token,
      }),
    ).rejects.toThrow(/another task/);
    await expect(
      f.harness.behavior.callRpc("reportWorker", {
        ...f.payload,
        contextToken: issued.token,
        threadId: "thr_other",
      }),
    ).rejects.toThrow();
    const report = await f.harness.behavior.callRpc("reportWorker", {
      ...f.payload,
      contextToken: issued.token,
    });
    await f.detach();
    expect(
      await f.harness.behavior.callRpc("reportWorker", {
        ...f.payload,
        contextToken: issued.token,
      }),
    ).toEqual(report);
    await expect(
      f.harness.behavior.callRpc("reportWorker", {
        ...f.payload,
        contextToken: issued.token,
        key: "after-detach",
      }),
    ).rejects.toThrow(/claim|context|worker/i);
    await expect(
      f.harness.behavior.callRpc("reportWorker", {
        ...f.payload,
        contextToken: issued.token,
        summary: "changed",
      }),
    ).rejects.toThrow(/immutable payload/);
  });
  it("expires new writes, retains exact recorded retries and bounds issuance", async () => {
    const f = await reportFixture();
    const issued = await f.issue();
    const report = await f.harness.behavior.callRpc("reportWorker", {
      ...f.payload,
      contextToken: issued.token,
    });
    f.bb.storage
      .database()
      .prepare("UPDATE orchestration_report_contexts SET expires_at=0")
      .run();
    expect(
      await f.harness.behavior.callRpc("reportWorker", {
        ...f.payload,
        contextToken: issued.token,
      }),
    ).toEqual(report);
    await expect(
      f.harness.behavior.callRpc("reportWorker", {
        ...f.payload,
        key: "expired",
        contextToken: issued.token,
      }),
    ).rejects.toThrow(/expired/);
    for (let i = 0; i < REPORT_LIMITS.contextsPerWorker; i++) await f.issue();
    await expect(f.issue()).rejects.toThrow(/eight/);
  });
  it("revokes a context if private file writing fails", async () => {
    const f = await reportFixture();
    f.harness.sdk.stub("files.write", async () => {
      throw new Error("fixture failure");
    });
    await expect(f.issue()).rejects.toThrow(
      /private native report context file/,
    );
    expect(
      f.bb.storage
        .database()
        .prepare("SELECT * FROM orchestration_report_contexts")
        .all(),
    ).toHaveLength(0);
  });
  it("rejects native project/worker spoof, unsupported provider and version", async () => {
    const f = await reportFixture();
    await expect(
      f.issue(f.task.id, { threadId: "thr_worker", projectId: "proj_other" }),
    ).rejects.toThrow(/project/);
    f.workers.set(
      "thr_wrong",
      makeThreadResponse({
        id: "thr_wrong",
        providerId: "codex",
        projectId: "proj_fixture",
      }),
    );
    await expect(
      f.issue(f.task.id, { threadId: "thr_wrong", projectId: "proj_fixture" }),
    ).rejects.toThrow(/worker|context/i);
    f.workers.set(
      "thr_worker",
      makeThreadResponse({ ...f.workers.get("thr_worker")!, providerId: "pi" }),
    );
    await expect(f.issue()).rejects.toThrow(/supported|transport/);
    f.workers.set(
      "thr_worker",
      makeThreadResponse({
        ...f.workers.get("thr_worker")!,
        providerId: "codex",
      }),
    );
    f.harness.sdk.stub("system.version", async () => ({
      currentVersion: "0.45.0",
    }));
    await expect(f.issue()).rejects.toThrow(/supported|transport/);
    expect(
      f.bb.storage
        .database()
        .prepare("SELECT * FROM orchestration_report_contexts")
        .all(),
    ).toHaveLength(0);
  });
  it("never returns the token in native tool results", async () => {
    const f = await reportFixture();
    const output = await f.harness.behavior.callAgentTool(
      "tasks_report_context",
      { taskId: f.task.id },
      f.nativeContext,
    );
    const decoded = decodeTool(output);
    expect(Object.keys(decoded).sort()).toEqual(["contextFile", "hostId"]);
    expect(JSON.stringify(output)).not.toMatch(/\b[a-f0-9]{64}\b/);
  });
});
