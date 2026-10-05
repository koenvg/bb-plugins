import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { BbPluginApi, PluginAgentToolContext } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { publishCommentsChanged, type TasksApiStore } from "../api";
import { idSchema } from "../shared/contract";
import { createReportStore } from "./report-store";
import { createReportCapabilities } from "./report-capabilities";
import { createReportContext } from "./report-context";
import {
  nativeReportInputSchema,
  reportInputSchema,
  reportRpcContract,
  type ReportPayload,
  type ReportOrigin,
  type WorkerReport,
} from "./report-contract";
import type { RunController } from "./run";
import { refuse } from "./run-provenance";
import { fingerprint } from "./run-scope";

export interface ReporterOptions {
  /** Native-origin storage allowlist. Production uses verified Pi/BB 0.44.0. No option enables notification delivery. */
  nativeProviders?: readonly string[];
}
export function createReporter(
  bb: BbPluginApi,
  store: TasksApiStore,
  runs: RunController,
  options: ReporterOptions = {},
) {
  const reports = createReportStore(bb.storage.database());
  const capabilities = createReportCapabilities(bb.storage.database());
  const context = createReportContext(bb, store);
  const originFor = (
    taskId: string,
    threadId: string,
    current: ReturnType<typeof context.local>,
  ): ReportOrigin => ({
    taskId,
    threadId,
    bbProjectId: current.project.linkedBbProjectId!,
    associationId: current.associationId,
    claimId: current.claimId,
    runId: current.runId,
  });
  function retry(
    payload: ReportPayload,
    threadId: string,
  ): WorkerReport | null {
    const existing = reports.retry(threadId, payload.key);
    if (!existing) return null;
    const original = nativeReportInputSchema.parse(
      Object.fromEntries(
        Object.keys(payload).map((key) => [
          key,
          existing[key as keyof WorkerReport],
        ]),
      ),
    );
    if (fingerprint(original) !== fingerprint(payload))
      refuse(
        "report_retry_conflict",
        "This worker/report key already has a different immutable payload. Do not reuse its identity.",
      );
    return existing;
  }
  async function record(
    payload: ReportPayload,
    origin: ReportOrigin,
    expiresAt = Infinity,
  ): Promise<WorkerReport> {
    if (payload.taskId !== origin.taskId)
      refuse(
        "report_context_invalid",
        "Report context belongs to another task.",
      );
    const previous = retry(payload, origin.threadId);
    if (previous) return previous;
    if (expiresAt <= Date.now())
      refuse("report_context_invalid", "Report context is expired.");
    const observed = await context.observe(payload.taskId, origin.threadId);
    const saved = store.transaction(() => {
      const duplicate = retry(payload, origin.threadId);
      if (duplicate) return { report: duplicate, created: false };
      if (expiresAt <= Date.now())
        refuse(
          "report_context_invalid",
          "Report context expired during validation.",
        );
      const current = context.local(payload.taskId, origin.threadId, observed);
      if (
        fingerprint(originFor(payload.taskId, origin.threadId, current)) !==
        fingerprint(origin)
      )
        refuse(
          "report_context_conflict",
          "Original report context changed. Issue a new native context; do not retag the old one.",
        );
      const id = randomUUID();
      const body = [
        `Worker report report:${id}`,
        `Task ${current.task.key} / ${payload.taskId}. Origin @thread:${origin.threadId}. Outcome ${payload.outcome}.`,
        payload.summary,
        ...(payload.question ? [`Question: ${payload.question}`] : []),
        `Result references: ${JSON.stringify(payload.resultReferences)}`,
        `Baseline references: ${JSON.stringify(payload.baselineReferences)}`,
        "Task status is unchanged. This report does not prove artifact readiness or epic acceptance.",
      ].join("\n\n");
      const comment = store.tasks.createComment({
        taskId: payload.taskId,
        kind: "agent",
        authorName: `Worker report (${origin.threadId})`,
        threadId: origin.threadId,
        body,
        notifiedCount: 0,
      });
      const report = reports.save({
        ...payload,
        ...origin,
        id,
        taskKey: current.task.key,
        projectId: current.task.projectId,
        coordinatorThreadId: current.coordinatorThreadId,
        role: current.role,
        commentId: comment.id,
        createdAt: new Date().toISOString(),
        delivery: {
          id: `report-delivery:${id}`,
          state: "suppressed",
          reason: "Manual-first release: agent notification is deferred. Report and non-notifying comment stored.",
          reference: null,
          attemptedAt: null,
        },
      });
      return { report, created: true };
    });
    if (!saved.created) return saved.report;
    publishCommentsChanged(bb, payload.taskId);
    return saved.report;
  }
  async function verifiedNativeOrigin(
    taskId: string,
    native: PluginAgentToolContext,
  ) {
    if (!options.nativeProviders?.length)
      refuse(
        "report_transport_unverified",
        "Native origin verification is incomplete. Context issuance and new native reports are disabled. CLI identity is not a bypass.",
      );
    const observed = await context.observe(taskId, native.threadId);
    const version = await bb.sdk.system.version({ signal: native.signal });
    // Reporting transport support is separate from run/coordinator activation.
    if (
      !options.nativeProviders?.includes(observed.thread.providerId) ||
      version.currentVersion !== "0.44.0"
    )
      refuse(
        "report_transport_unverified",
        "This provider/BB version is outside the verified native reporting transport contract. Do not use CLI origin as a bypass.",
      );
    if (observed.thread.projectId !== native.projectId)
      refuse(
        "report_wrong_worker",
        "Native tool project and worker context disagree.",
      );
    const origin = store.transaction(() =>
      originFor(
        taskId,
        native.threadId,
        context.local(taskId, native.threadId, observed),
      ),
    );
    return { origin, observed };
  }
  async function nativeReport(
    input: ReportPayload,
    native: PluginAgentToolContext,
  ) {
    const payload = nativeReportInputSchema.parse(input);
    // Host-provided identity, not CLI env, RPC input or editable metadata. A
    // recorded retry can retain provenance after detachment without a new send.
    const previous = retry(payload, native.threadId);
    if (previous) {
      if (previous.bbProjectId !== native.projectId)
        refuse(
          "report_context_conflict",
          "Recorded report and native project disagree.",
        );
      return previous;
    }
    return record(
      payload,
      (await verifiedNativeOrigin(payload.taskId, native)).origin,
    );
  }
  async function issueContext(taskId: string, native: PluginAgentToolContext) {
    const { origin, observed } = await verifiedNativeOrigin(taskId, native);
    const location = await bb.sdk.threads.storageLocation({
      threadId: native.threadId,
    });
    const token = store.transaction(() => {
      const current = originFor(
        taskId,
        native.threadId,
        context.local(taskId, native.threadId, observed),
      );
      if (fingerprint(current) !== fingerprint(origin))
        refuse(
          "report_context_conflict",
          "Worker context changed during issuance.",
        );
      return capabilities.issue(origin);
    });
    const path = join(
      location.storageRootPath,
      `.tasks-report-context-${randomUUID()}`,
    );
    try {
      const result = await bb.sdk.files.write({
        hostId: location.hostId,
        rootPath: location.storageRootPath,
        path,
        content: token,
        mode: 0o600,
      });
      if (result.outcome !== "written")
        throw new Error("Context file was not written");
      // Return only the private file location. Tokens never enter tool results,
      // plugin logs, task comments, metadata or attached verification evidence.
      return { contextFile: path, hostId: location.hostId };
    } catch {
      capabilities.revoke(token);
      refuse(
        "report_context_write_failed",
        "Could not write the private native report context file. No context token returned.",
      );
    }
  }
  async function reportWorker(raw: unknown) {
    const { contextToken, ...payload } = reportInputSchema.parse(raw);
    const { origin, expiresAt } = capabilities.read(contextToken);
    return record(payload, origin, expiresAt);
  }
  return {
    reports,
    reportWorker,
    register() {
      bb.rpc.register(reportRpcContract, {
        reportWorker,
        readWorkerReport: ({ reportId }) => reports.get(reportId),
      });
      bb.agents.registerTool({
        name: "tasks_report",
        description:
          "Record an explicit bounded task outcome from this native worker. Task status stays unchanged. Report retries return the existing report/comment.",
        parameters: nativeReportInputSchema,
        execute: async (input, native) =>
          JSON.stringify(await nativeReport(input, native)),
      });
      bb.agents.registerTool({
        name: "tasks_report_context",
        description:
          "Issue a scoped report capability as a private file for CLI/RPC use. Uses this native worker identity, not supplied thread metadata. Do not attach, print or log the file contents.",
        parameters: z.object({ taskId: idSchema }).strict(),
        execute: async ({ taskId }, native) =>
          JSON.stringify(await issueContext(taskId, native)),
      });
      bb.agents.configure((native) => ({
        tools: options.nativeProviders?.includes(native.provider.id)
          ? ["tasks_report", "tasks_report_context"]
          : [],
        skills: [],
      }));
    },
  };
}
export type Reporter = ReturnType<typeof createReporter>;
