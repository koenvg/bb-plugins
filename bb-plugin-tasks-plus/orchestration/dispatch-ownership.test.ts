import { describe, expect, it } from "vitest";
import {
  makeThreadResponse,
  makeMessageDispatchHookContext,
} from "@get-bb/plugin-sdk/testing";
import { fixture } from "./dispatch-test-fixture";

describe("ownership and public commands", () => {
  it.each(["same", "different"])(
    "refuses a second task claim for one adopted thread across %s coordinators",
    async (coordinator) => {
      const f = await fixture(2);
      const thread = makeThreadResponse({
        id: "thr_shared",
        projectId: "proj_fixture",
        status: "idle",
      });
      f.workers.set(thread.id, thread);
      for (const task of f.tasks)
        await f.harness.behavior.callRpc("taskThreadsAttach", {
          taskId: task.id,
          threadId: thread.id,
        });
      const association = f.store.tasks.getTaskThreadByThreadId(
        f.task.id,
        thread.id,
      )!;
      const adopted = (await f.harness.behavior.callRpc("orchestrateAdopt", {
        ...f.input,
        associationId: association.id,
      })) as any;
      let input = f.input;
      if (coordinator === "different") {
        f.workers.set(
          "thr_other_coordinator",
          makeThreadResponse({
            id: "thr_other_coordinator",
            projectId: "proj_fixture",
            providerId: "pi",
          }),
        );
        const run = await f.approveRun("thr_other_coordinator");
        input = {
          ...input,
          runId: run.id,
          coordinatorThreadId: run.coordinatorThreadId,
        };
      }
      const second = f.tasks[1]!;
      const selected = f.store.tasks.getTaskThreadByThreadId(
        second.id,
        thread.id,
      )!;
      await expect(
        f.harness.behavior.callRpc("orchestrateAdopt", {
          ...input,
          taskId: second.id,
          associationId: selected.id,
        }),
      ).rejects.toThrow(/live orchestration claim/i);
      expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(1);
      expect(f.store.tasks.listTaskThreads(second.id)).toHaveLength(1);
      const status = (await f.harness.behavior.callRpc("orchestrateStatus", {
        epicId: f.epic.id,
      })) as any;
      expect(
        status.status.subtasks.find((task: any) => task.id === second.id)
          .ownership.owners,
      ).toHaveLength(0);
      expect(adopted.claim.threadId).toBe(thread.id);
      expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(0);
      expect(f.harness.inspection.sdk.callsTo("threads.send")).toHaveLength(0);
    },
  );
  it.each(["same", "different", "historical"])(
    "preserves original owner authority when a later run uses a %s coordinator",
    async (coordinator) => {
      const f = await fixture();
      const original = await f.dispatch();
      if (coordinator === "same") await f.pause();
      const coordinatorThreadId =
        coordinator === "same" ? "thr_coordinator" : "thr_other_coordinator";
      if (coordinator !== "same")
        f.workers.set(
          coordinatorThreadId,
          makeThreadResponse({
            id: coordinatorThreadId,
            projectId: "proj_fixture",
            providerId: "pi",
          }),
        );
      const run = await f.approveRun(coordinatorThreadId);
      const reused = (await f.harness.behavior.callRpc("orchestrateDispatch", {
        ...f.input,
        runId: run.id,
        coordinatorThreadId,
      })) as any;
      expect(reused).toMatchObject({
        outcome: "resolution_needed",
        threadId: original.threadId,
        claim: {
          id: original.claim!.id,
          runId: original.claim!.runId,
          coordinatorThreadId: original.claim!.coordinatorThreadId,
          releasedAt: null,
        },
      });
      if (coordinator === "historical") {
        f.workers.set(
          "thr_third_coordinator",
          makeThreadResponse({
            id: "thr_third_coordinator",
            projectId: "proj_fixture",
            providerId: "pi",
          }),
        );
        await f.approveRun("thr_third_coordinator");
      }
      const context = makeMessageDispatchHookContext({
        thread: f.workers.get(original.threadId!)!,
        origin: null,
        originPluginId: null,
        senderThreadId: coordinatorThreadId,
        requestedExecution: {
          providerId: "pi",
          model: "fixture",
          reasoningLevel: "high",
          permissionMode: "auto",
          serviceTier: null,
        },
      });
      expect(
        (await f.harness.registrations.hooks["message.dispatch"]!(context))
          .action,
      ).toBe("reject");
      expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
      expect(f.harness.inspection.sdk.callsTo("threads.send")).toHaveLength(0);
    },
  );
  it("shares authoritative state between CLI and RPC", async () => {
    const f = await fixture();
    const output = await f.harness.behavior.runCli(
      [
        "orchestrate",
        "dispatch",
        f.task.key.toLowerCase(),
        "--run",
        f.input.runId,
        "--json",
      ],
      { threadId: "thr_coordinator" },
    );
    expect(output.exitCode).toBe(0);
    expect(JSON.parse(output.stdout!).outcome).toBe("created");
    const rpc = (await f.harness.behavior.callRpc("orchestrateStatus", {
      epicId: f.epic.id,
    })) as any;
    const cli = JSON.parse(
      (
        await f.harness.behavior.runCli([
          "orchestrate",
          "status",
          f.epic.key,
          "--json",
        ])
      ).stdout!,
    );
    expect(cli.status.run).toEqual(rpc.status.run);
    expect(cli.status.subtasks[0].ownership.owners[0].threadId).toBe(
      "thr_worker",
    );
    expect(cli.status.subtasks[0].latestOutcome.state).toBe("unknown");
    expect(cli.status.acceptance.state).toBe("unknown");
    expect(f.harness.inspection.pendingInteractions).toHaveLength(0);
  });
  it.each(["in_progress", "todo", "backlog"] as const)(
    "does not mistake prior work on %s for untouched work",
    async (status) => {
      const f = await fixture();
      f.store.tasks.updateTask(f.task.id, { status });
      if (status !== "in_progress")
        f.store.tasks.createComment({
          taskId: f.task.id,
          kind: "agent",
          authorName: "Worker",
          threadId: "thr_prior",
          presetName: null,
          body: "Prior result",
          notifiedCount: 0,
        });
      expect((await f.dispatch()).outcome).toBe("resolution_needed");
      expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(0);
    },
  );
  it.each([1, 2])(
    "requires adoption with %s legacy candidates and keeps other attachments",
    async (count) => {
      const f = await fixture();
      for (let i = 0; i < count; i++) {
        const thread = makeThreadResponse({
          id: `thr_legacy${i}`,
          projectId: "proj_fixture",
          status: "idle",
        });
        f.workers.set(thread.id, thread);
        await f.harness.behavior.callRpc("taskThreadsAttach", {
          taskId: f.task.id,
          threadId: thread.id,
        });
      }
      const resolution = await f.dispatch();
      expect(resolution.outcome).toBe("resolution_needed");
      expect(resolution.candidates).toHaveLength(count);
      const adopted = (await f.harness.behavior.callRpc("orchestrateAdopt", {
        ...f.input,
        associationId: resolution.candidates[0]!.associationId,
      })) as any;
      expect(adopted.outcome).toBe("adopted");
      expect((await f.dispatch()).threadId).toBe(
        resolution.candidates[0]!.threadId,
      );
      expect(f.store.tasks.listTaskThreads(f.task.id)).toHaveLength(count);
      expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(0);
      expect(f.harness.inspection.sdk.callsTo("threads.send")).toHaveLength(0);
      await f.harness.behavior.callRpc("taskThreadsDetach", {
        taskId: f.task.id,
        threadId: resolution.candidates[0]!.threadId,
      });
      expect((await f.dispatch()).outcome).toBe("resolution_needed");
    },
  );
  it.each(["missing", "error", "deleted", "stopped"])(
    "never replaces a %s owner",
    async (mode) => {
      const f = await fixture();
      await f.dispatch();
      if (mode === "missing") f.workers.delete("thr_worker");
      if (mode === "error")
        f.workers.set(
          "thr_worker",
          makeThreadResponse({
            id: "thr_worker",
            projectId: "proj_fixture",
            status: "error",
          }),
        );
      if (mode === "deleted")
        f.workers.set(
          "thr_worker",
          makeThreadResponse({
            id: "thr_worker",
            projectId: "proj_fixture",
            deletedAt: Date.now(),
          }),
        );
      if (mode === "stopped")
        f.setInterruptions([
          {
            type: "system/thread/interrupted",
            data: { reason: "manual-stop" },
          },
        ]);
      expect((await f.dispatch()).outcome).toBe("resolution_needed");
      expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(1);
    },
  );
  it("keeps missing and detached ownership visible in compact status", async () => {
    const f = await fixture();
    await f.dispatch();
    await f.harness.behavior.callRpc("taskThreadsDetach", {
      taskId: f.task.id,
      threadId: "thr_worker",
    });
    const status = (await f.harness.behavior.callRpc("orchestrateStatus", {
      epicId: f.epic.id,
    })) as any;
    expect(status.status.subtasks[0].ownership.state).toBe("resolution_needed");
    expect((await f.dispatch()).outcome).toBe("resolution_needed");
  });
});
