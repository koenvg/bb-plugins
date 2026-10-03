import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "../server";
import { createStore } from "../api";
import { runRpcContract } from "./run-contract";
import { createRunStore } from "./run-store";

const disposals: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposals.splice(0)) await dispose();
});
async function setup() {
  let sequence = 0;
  let coordinatorProject = "proj_fixture";
  let request: any;
  const requests: any[] = [];
  let decisions: any[] = [];
  let validationGate = Promise.resolve();
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks-plus",
    sdk: {
      system: { version: async () => ({ currentVersion: "0.44.0" }) },
      threads: {
        get: async ({ threadId }) =>
          makeThreadResponse({
            id: threadId,
            projectId: coordinatorProject,
            providerId: "pi",
          }),
        events: {
          list: async ({ types }) => {
            if (types?.[0] === "system/interaction/lifecycle") {
              await validationGate;
              return decisions;
            }
            return [...requests].reverse();
          },
        },
      },
    },
  });
  disposals.push(() => harness.lifecycle.dispose());
  await plugin(bb);
  const store = createStore(bb);
  const project = store.tasks.createProject({
    name: "Disposable",
    prefix: "FIX",
    color: "blue",
    linkedBbProjectId: "proj_fixture",
  });
  const epic = store.tasks.createTask({
    projectId: project.id,
    title: "Epic",
    description: "Acceptance and linked specification",
  });
  const task = store.tasks.createTask({
    projectId: project.id,
    parentTaskId: epic.id,
    title: "Existing scope",
    description: "Implement approved scope",
  });
  const preset = store.tasks.createPreset({
    name: "Fixture execution",
    providerId: "pi",
    modelId: "fixture-model",
    reasoningLevel: "high",
    serviceTier: null,
    permissionMode: "full",
    environmentKind: "project-default",
    baseBranch: null,
    machineId: null,
    instructions: "No publication or production actions.",
  });
  const config = {
    epic: epic.key,
    tasks: [task.key],
    preset: preset.id,
    baselineReferences: ["commit:fixture-base"],
  };
  const invoke = (
    body: unknown = { action: "begin", config },
    overrides: Record<string, unknown> = {},
  ) => {
    sequence++;
    request = {
      id: `event${sequence}`,
      threadId: "thr_coordinator",
      seq: sequence,
      createdAt: Date.now(),
      scope: { kind: "thread" },
      type: "client/turn/requested",
      data: {
        requestId: `request${sequence}`,
        initiator: "user",
        senderThreadId: null,
        input: [
          {
            type: "text",
            text: `/skill:bb-orchestrator ${JSON.stringify(body)}`,
            mentions: [],
          },
        ],
        ...overrides,
      },
    };
    requests.push(request);
    return request;
  };
  const cli = (action: string, requestId = request.data.requestId) =>
    harness.behavior.runCli(
      ["orchestrate", action, "--request", requestId, "--json"],
      { threadId: "thr_coordinator" },
    );
  async function approve(
    promise: ReturnType<typeof cli>,
    override?: (value: any) => any,
    record = true,
    useInitial = false,
  ) {
    await vi.waitFor(() =>
      expect(harness.inspection.pendingInteractions).toHaveLength(1),
    );
    const form = harness.inspection.pendingInteractions[0]!;
    const preview = useInitial
      ? (form.payload as any).initial
      : runRpcContract.orchestratePreview.output.parse(
          await harness.behavior.callRpc("orchestratePreview", {
            coordinatorThreadId: "thr_coordinator",
            config,
          }),
        );
    const value = override
      ? override({ approved: true, proposal: preview.proposal })
      : { approved: true, proposal: preview.proposal };
    const description = await form.describeSubmission!(value);
    if (record)
      decisions = [
        {
          id: `decision${sequence}`,
          threadId: "thr_coordinator",
          seq: 100 + sequence,
          createdAt: Date.now(),
          scope: { kind: "thread" },
          type: "system/interaction/lifecycle",
          data: {
            interaction: {
              id: form.id,
              status: "resolved",
              origin: {
                kind: "plugin",
                pluginId: "tasks-plus",
                rendererId: "orchestrator-run",
              },
              resolution: { kind: "plugin_submitted", description },
            },
          },
        },
      ];
    harness.behavior.submitInteraction(form.id, value);
    await promise;
    const payload = form.payload as {
      invocationReference: string;
      action: string;
    };
    const requestId = payload.invocationReference.split(":")[1]!;
    const result = JSON.parse((await cli(payload.action, requestId)).stdout!);
    expect(result.outcome).not.toBe("pending");
    return result;
  }
  const noWorkers = () => {
    for (const operation of [
      "threads.spawn",
      "threads.send",
      "threads.stop",
      "experimental_hooks.recheck",
    ])
      expect(harness.inspection.sdk.callsTo(operation)).toHaveLength(0);
  };
  return {
    bb,
    harness,
    store,
    epic,
    task,
    preset,
    config,
    invoke,
    cli,
    approve,
    noWorkers,
    getRequest: () => request,
    holdDecisionValidation: () => {
      let release!: () => void;
      validationGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
    moveCoordinator: (projectId: string) => {
      coordinatorProject = projectId;
    },
  };
}

describe("approved run controls through CLI and RPC", () => {
  it.each([48 * 1024, 48 * 1024 + 1])(
    "checks the complete native form at the %i-byte boundary",
    async (bytes) => {
      const f = await setup();
      f.config.baselineReferences = Array.from({ length: 16 }, (_, i) =>
        `${i}:`.padEnd(1024, "x"),
      );
      f.store.tasks.updateTask(f.task.id, { description: "" });
      const event = f.invoke();
      const preview = runRpcContract.orchestratePreview.output.parse(
        await f.harness.behavior.callRpc("orchestratePreview", {
          coordinatorThreadId: "thr_coordinator",
          config: f.config,
        }),
      );
      const payload = {
        invocationReference: `thr_coordinator:${event.data.requestId}:${event.seq}`,
        decisionId: "0".repeat(36),
        action: "begin",
        config: f.config,
        initial: preview,
      };
      const padding = bytes - Buffer.byteLength(JSON.stringify(payload), "utf8");
      expect(padding).toBeGreaterThan(0);
      f.store.tasks.updateTask(f.task.id, { description: "x".repeat(padding) });
      await f.cli("begin");
      const result = JSON.parse((await f.cli("begin")).stdout!);
      if (bytes === 48 * 1024) {
        expect(result.outcome).toBe("pending");
        const form = f.harness.inspection.pendingInteractions[0]!;
        expect(Buffer.byteLength(JSON.stringify(form.payload), "utf8")).toBe(
          bytes,
        );
      } else {
        expect(result.outcome).toBe("cancelled");
        expect(result.error.code).toBe("approval_size_limit");
        expect(f.harness.inspection.pendingInteractions).toHaveLength(0);
        expect(JSON.parse((await f.cli("begin")).stdout!)).toEqual(result);
      }
      expect(
        createRunStore(f.bb.storage.database()).latestForEpic(f.epic.id),
      ).toBeNull();
      f.noWorkers();
    },
  );
  it("refuses a persisted invocation record from a different thread", async () => {
    const f = await setup();
    f.invoke();
    f.getRequest().threadId = "thr_other";
    const result = JSON.parse((await f.cli("begin")).stdout!);
    expect(result.error.code).toBe("invocation_required");
    expect(f.harness.inspection.pendingInteractions).toHaveLength(0);
    f.noWorkers();
  });
  it("returns pending before approval and keeps the native form open after the CLI returns", async () => {
    const f = await setup();
    f.invoke();
    const result = await Promise.race([
      f.cli("begin"),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 150)),
    ]);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!.stdout!).outcome).toBe("pending");
    expect(f.harness.inspection.pendingInteractions).toHaveLength(1);
    f.noWorkers();
  });
  it("approves one run from one durable native decision, and retries reuse it", async () => {
    const f = await setup();
    f.invoke();
    const pending = f.cli("begin");
    await vi.waitFor(() =>
      expect(f.harness.inspection.pendingInteractions).toHaveLength(1),
    );
    expect(JSON.parse((await f.cli("begin")).stdout!).outcome).toBe("pending");
    const result = await f.approve(pending);
    expect(result.run.phase).toBe("active");
    expect(result.run.approvedTaskIds).toEqual([f.task.id]);
    expect(result.run.approvalReference).toContain("decision1");
    expect(result.run.execution.snapshot.providerId).toBe(f.preset.providerId);
    const retry = JSON.parse((await f.cli("begin")).stdout!);
    expect(retry.run.id).toBe(result.run.id);
    expect(f.harness.inspection.pendingInteractions).toHaveLength(0);
    f.noWorkers();
  });
  it("resolves all missing parameters in the same native interaction", async () => {
    const f = await setup();
    f.invoke({ action: "begin" });
    const result = await f.approve(f.cli("begin"));
    expect(result.run.epicId).toBe(f.epic.id);
    f.noWorkers();
  });
  it("accepts the known BBP-51 self-send user/null classification, without a human claim", async () => {
    const f = await setup();
    f.invoke();
    const result = await f.approve(f.cli("begin"));
    expect(result.run.phase).toBe("active");
    expect(result.run).not.toHaveProperty("humanVerified");
  });
  it("rejects a missing persisted native decision", async () => {
    const f = await setup();
    f.invoke();
    const result = await f.approve(f.cli("begin"), undefined, false);
    expect(result.error.code).toBe("decision_unverified");
    expect(
      createRunStore(f.bb.storage.database()).latestForEpic(f.epic.id),
    ).toBeNull();
    f.noWorkers();
  });
  it("rejects tracker scope changes during the approval", async () => {
    const f = await setup();
    f.invoke();
    const promise = f.cli("begin");
    await vi.waitFor(() =>
      expect(f.harness.inspection.pendingInteractions).toHaveLength(1),
    );
    f.store.tasks.updateTask(f.task.id, { description: "Changed scope" });
    const result = await f.approve(promise);
    expect(result.error.code).toBe("decision_mismatch");
    f.noWorkers();
  });
  it("does not infer authority from metadata or ordinary events at startup or reload", async () => {
    const f = await setup();
    expect(f.harness.inspection.pendingInteractions).toHaveLength(0);
    const fresh = await f.harness.lifecycle.reload(plugin);
    expect(fresh.harness.inspection.pendingInteractions).toHaveLength(0);
    expect(
      createRunStore(fresh.bb.storage.database()).latestForEpic(f.epic.id),
    ).toBeNull();
    f.noWorkers();
  });
  it("pauses explicitly, then resumes the same run with a separate native decision", async () => {
    const f = await setup();
    f.invoke();
    const begin = await f.approve(f.cli("begin"));
    f.invoke({ action: "pause", runId: begin.run.id });
    const pause = JSON.parse((await f.cli("pause")).stdout!);
    expect(pause.run.phase).toBe("paused");
    f.invoke({ action: "resume", runId: begin.run.id });
    const resume = await f.approve(f.cli("resume"));
    expect(resume.run.id).toBe(begin.run.id);
    expect(resume.run.phase).toBe("active");
    expect(resume.run.approvalReference).not.toBe(begin.run.approvalReference);
    f.noWorkers();
  });
  it("reload interrupts active authority without changing the stored record or workers", async () => {
    const f = await setup();
    f.invoke();
    const result = await f.approve(f.cli("begin"));
    const before = createRunStore(f.bb.storage.database()).getRun(
      result.run.id,
    );
    const fresh = await f.harness.lifecycle.reload(plugin);
    const output = await fresh.harness.behavior.runCli(
      ["orchestrate", "begin", "--request", "request1", "--json"],
      { threadId: "thr_coordinator" },
    );
    const retry = JSON.parse(output.stdout!);
    expect(retry.run.phase).toBe("interrupted");
    expect(
      createRunStore(fresh.bb.storage.database()).getRun(result.run.id),
    ).toEqual(before);
    f.noWorkers();
  });
  it("scope checks exclude status/comments but detect description/preset changes", async () => {
    const f = await setup();
    f.invoke();
    const result = await f.approve(f.cli("begin"));
    f.store.tasks.updateTask(f.task.id, { status: "done" });
    f.invoke({ action: "resume", runId: result.run.id });
    const resumed = await f.approve(f.cli("resume"));
    expect(resumed.run.fingerprints).toEqual(result.run.fingerprints);
    f.store.tasks.updateTask(f.task.id, {
      description: "New linked-spec reference",
    });
    f.invoke({ action: "resume", runId: result.run.id });
    const changed = await f.approve(f.cli("resume"));
    expect(changed.run.fingerprints).not.toEqual(result.run.fingerprints);
  });
  it.each([
    { initiator: "user", senderThreadId: "thr_other" },
    { inputGroups: [[], []] },
    { retryOfRequestId: "original" },
  ])(
    "rejects mixed, cross-thread or retry provenance %j",
    async (overrides) => {
      const f = await setup();
      f.invoke(undefined, overrides);
      expect(JSON.parse((await f.cli("begin")).stdout!).error.code).toBe(
        "invocation_required",
      );
      expect(f.harness.inspection.pendingInteractions).toHaveLength(0);
      f.noWorkers();
    },
  );
  it("rejects stale input, action mismatch and wrong coordinator", async () => {
    const f = await setup();
    f.invoke();
    f.getRequest().createdAt -= 20 * 60_000;
    expect(JSON.parse((await f.cli("begin")).stdout!).error.code).toBe(
      "stale_invocation",
    );
    f.invoke({ action: "pause", runId: "missing" });
    expect(JSON.parse((await f.cli("begin")).stdout!).error.code).toBe(
      "decision_mismatch",
    );
    expect(JSON.parse((await f.cli("pause")).stdout!).error.code).toBe(
      "run_context_invalid",
    );
  });
  it("preview does not approve restricted operations or create records", async () => {
    const f = await setup();
    await f.harness.behavior.callRpc("orchestratePreview", {
      coordinatorThreadId: "thr_coordinator",
      config: f.config,
    });
    expect(
      createRunStore(f.bb.storage.database()).latestForEpic(f.epic.id),
    ).toBeNull();
    f.invoke({ action: "publish", config: f.config });
    expect(JSON.parse((await f.cli("begin")).stdout!).error.code).toBe(
      "invocation_ambiguous",
    );
    f.noWorkers();
  });
  it.each(["/", "$"])(
    "accepts one exact leading selected-skill mention %s",
    async (trigger) => {
      const f = await setup();
      f.invoke();
      const text = `${trigger}bb-orchestrator ${JSON.stringify({ action: "begin", config: f.config })}`;
      f.getRequest().data.input = [
        {
          type: "text",
          text,
          mentions: [
            {
              start: 0,
              end: 16,
              resource: {
                kind: "command",
                source: "skill",
                name: "bb-orchestrator",
                label: "bb-orchestrator",
                trigger,
                origin: "user",
                argumentHint: null,
              },
            },
          ],
        },
      ];
      expect((await f.approve(f.cli("begin"))).run.phase).toBe("active");
      f.noWorkers();
    },
  );
  it("reuses an older recorded invocation and never opens another form", async () => {
    const f = await setup();
    f.invoke();
    const result = await f.approve(f.cli("begin"));
    f.getRequest().createdAt -= 60 * 60_000;
    const retry = JSON.parse((await f.cli("begin")).stdout!);
    expect(retry.run.id).toBe(result.run.id);
    expect(f.harness.inspection.pendingInteractions).toHaveLength(0);
  });
  it("reserves concurrent invocation processing once and reuses a cancelled decision", async () => {
    const f = await setup();
    f.invoke();
    const first = f.cli("begin");
    const second = f.cli("begin");
    await vi.waitFor(() =>
      expect(f.harness.inspection.pendingInteractions).toHaveLength(1),
    );
    const interaction = f.harness.inspection.pendingInteractions[0]!;
    f.harness.behavior.cancelInteraction(interaction.id);
    const results = await Promise.all([first, second]);
    expect(results.map((r) => JSON.parse(r.stdout!).outcome).sort()).toEqual([
      "pending",
      "pending",
    ]);
    expect(JSON.parse((await f.cli("begin")).stdout!).outcome).toBe(
      "cancelled",
    );
    expect(
      createRunStore(f.bb.storage.database()).latestForEpic(f.epic.id),
    ).toBeNull();
    f.noWorkers();
  });
  it("does not reopen a pending decision after reload", async () => {
    const f = await setup();
    f.invoke();
    const pending = f.cli("begin");
    await vi.waitFor(() =>
      expect(f.harness.inspection.pendingInteractions).toHaveLength(1),
    );
    const fresh = await f.harness.lifecycle.reload(plugin);
    const result = await fresh.harness.behavior.runCli(
      ["orchestrate", "begin", "--request", "request1", "--json"],
      { threadId: "thr_coordinator" },
    );
    expect(JSON.parse(result.stdout!).outcome).toBe("cancelled");
    expect(fresh.harness.inspection.pendingInteractions).toHaveLength(0);
    expect(JSON.parse((await pending).stdout!).outcome).toBe("pending");
    f.noWorkers();
  });
  it("rejects approval after a newer persisted invocation or a changed execution snapshot", async () => {
    const f = await setup();
    f.invoke();
    const old = f.cli("begin");
    await vi.waitFor(() =>
      expect(f.harness.inspection.pendingInteractions).toHaveLength(1),
    );
    f.invoke();
    expect((await f.approve(old)).error.code).toBe("stale_invocation");
    f.invoke();
    const changed = f.cli("begin");
    await vi.waitFor(() =>
      expect(f.harness.inspection.pendingInteractions).toHaveLength(1),
    );
    f.store.tasks.updatePreset(f.preset.id, {
      instructions: "Changed execution instruction",
    });
    expect((await f.approve(changed)).error.code).toBe("decision_mismatch");
    f.noWorkers();
  });
  it("refuses duplicate task references, different projects and oversized complete approval", async () => {
    const f = await setup();
    f.invoke({
      action: "begin",
      config: { ...f.config, tasks: [f.task.id, f.task.key] },
    });
    expect(JSON.parse((await f.cli("begin")).stdout!).error.code).toBe(
      "scope_invalid",
    );
    f.store.tasks.updateProject(f.epic.projectId, {
      linkedBbProjectId: "proj_other",
    });
    f.invoke();
    expect(JSON.parse((await f.cli("begin")).stdout!).error.code).toBe(
      "project_mismatch",
    );
    f.store.tasks.updateProject(f.epic.projectId, {
      linkedBbProjectId: "proj_fixture",
    });
    f.store.tasks.updateTask(f.epic.id, { description: "x".repeat(49 * 1024) });
    f.invoke();
    expect(JSON.parse((await f.cli("begin")).stdout!).error.code).toBe(
      "approval_size_limit",
    );
    expect(f.harness.inspection.pendingInteractions).toHaveLength(0);
    f.noWorkers();
  });
  it("does not accept native approval for another coordinator or a changed baseline selection", async () => {
    const f = await setup();
    f.invoke();
    const mismatch = await f.approve(f.cli("begin"), (value) => ({
      ...value,
      proposal: { ...value.proposal, coordinatorThreadId: "thr_other" },
    }));
    expect(mismatch.error.code).toBe("decision_mismatch");
    f.invoke();
    const begun = await f.approve(f.cli("begin"));
    f.invoke({ action: "resume", runId: begun.run.id });
    const expanded = await f.approve(f.cli("resume"), (value) => ({
      ...value,
      proposal: { ...value.proposal, baselineReferences: ["commit:other"] },
    }));
    expect(expanded.error.code).toBe("decision_mismatch");
    expect(
      createRunStore(f.bb.storage.database()).getRun(begun.run.id)
        ?.baselineReferences,
    ).toEqual(f.config.baselineReferences);
    f.noWorkers();
  });
  it("refuses approval after the coordinator moves to another BB project", async () => {
    const f = await setup();
    f.invoke();
    const pending = f.cli("begin");
    await vi.waitFor(() =>
      expect(f.harness.inspection.pendingInteractions).toHaveLength(1),
    );
    f.moveCoordinator("proj_other");
    expect((await f.approve(pending, undefined, true, true)).error.code).toBe(
      "project_mismatch",
    );
    expect(
      createRunStore(f.bb.storage.database()).latestForEpic(f.epic.id),
    ).toBeNull();
    f.noWorkers();
  });
  it("waits for native validation on the single post-submission result lookup", async () => {
    const f = await setup();
    f.invoke();
    const release = f.holdDecisionValidation();
    const approved = f.approve(f.cli("begin"));
    await vi.waitFor(() =>
      expect(
        f.harness.inspection.sdk
          .callsTo("threads.events.list")
          .some((call) =>
            JSON.stringify(call).includes("system/interaction/lifecycle"),
          ),
      ).toBe(true),
    );
    const lookup = f.cli("begin");
    const completedEarly = await Promise.race([
      lookup.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 30)),
    ]);
    release();
    expect(completedEarly).toBe(false);
    expect(JSON.parse((await lookup).stdout!).outcome).toBe("run");
    expect((await approved).run.phase).toBe("active");
    f.noWorkers();
  });
});
