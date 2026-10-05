import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { makeQueueEntry } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";
import { reportFixture } from "./report-test-fixture";
import { createReportStore } from "./report-store";
import { createReportIntents } from "./report-intents";
import { createRunStore } from "./run-store";
import { expectNoAgentInput } from "./dispatch-test-fixture";

describe("historical receipt retention without replay", () => {
  it("exposes record storage and historical receipt reads without delivery transitions", async () => {
    const f = await reportFixture(1, true, "pi", plugin);
    const reports = createReportStore(f.bb.storage.database());
    for (const method of ["reserveDelivery", "rejectDelivery", "finishDelivery"])
      expect(reports).not.toHaveProperty(method);
    expect(Object.keys(createReportIntents(f.bb.storage.database()))).toEqual(["get", "forReceipt"]);
    expectNoAgentInput(f.harness);
  });
  it.each(["pending", "queued", "failed", "ambiguous", "sent"])("retains %s delivery, provenance and intent through all retries and reload", async state => {
    const f = await reportFixture(1, true, "pi", plugin);
    const comment = f.store.tasks.createComment({ taskId: f.task.id, kind: "agent", body: "Historical report", authorName: "Fixture", threadId: "thr_worker", notifiedCount: 0 });
    const claims = f.store.tasks.listTaskThreads(f.task.id);
    const original = createReportStore(f.bb.storage.database()).save({
      ...f.payload, question: null, outcome: "completed", id: "00000000-0000-4000-8000-000000000001", taskKey: f.task.key,
      threadId: "thr_worker", bbProjectId: "proj_fixture", projectId: f.task.projectId,
      associationId: claims[0]!.id, claimId: null, runId: f.input.runId,
      coordinatorThreadId: "thr_coordinator", role: "implementation", commentId: comment.id, createdAt: "2026-10-01T12:00:00.000Z",
      delivery: { id: "historical-delivery", state: state as any, reason: "Historical evidence", reference: "qmsg_historical", attemptedAt: "2026-10-01T12:00:00.000Z" },
    });
    const intents = createReportIntents(f.bb.storage.database());
    // Seed retained historical state directly. Production exposes no intent write API.
    f.bb.storage.database().prepare(
      "INSERT INTO orchestration_report_intents(report_id,generation,body_hash,receipt_id,phase) VALUES(?,?,?,?,'queued')",
    ).run(original.id, createRunStore(f.bb.storage.database()).getRun(f.input.runId)!.generation!, createHash("sha256").update("Historical notice").digest("hex"), "qmsg_historical");
    const intent = intents.get(original.id);
    const issued = await f.issue();
    expect(await f.report()).toEqual(original);
    expect(await f.harness.behavior.callRpc("reportWorker", { ...f.payload, contextToken: issued.token })).toEqual(original);
    const cli = await f.harness.behavior.runCli(["report", f.task.key, "--key", f.payload.key, "--outcome", f.payload.outcome, "--summary", f.payload.summary, "--result", JSON.stringify(f.payload.resultReferences[0]), "--baseline", f.payload.baselineReferences[0], "--context-file", issued.contextFile, "--machine", issued.hostId, "--json"], { threadId: "thr_worker" });
    expect(JSON.parse(cli.stdout!)).toEqual(original);
    const entry = makeQueueEntry({ id: "qmsg_historical", threadId: "thr_coordinator" });
    await f.harness.behavior.emitThreadEvent("message.dispatched", { entry });
    await f.harness.behavior.emitThreadEvent("message.cancelled", { entry });
    expect(intents.get(original.id)).toEqual(intent);
    expect(f.store.tasks.listComments(f.task.id)).toHaveLength(1);
    const loaded = await f.harness.lifecycle.reload(plugin);
    try {
      expect(await loaded.harness.behavior.callRpc("readWorkerReport", { reportId: original.id })).toEqual(original);
      expect(createReportIntents(loaded.bb.storage.database()).get(original.id)).toEqual(intent);
      expectNoAgentInput(loaded.harness);
    } finally { await loaded.harness.lifecycle.dispose(); }
    expectNoAgentInput(f.harness);
  });
});
