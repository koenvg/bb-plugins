import { cliCommand, PluginCliError, type BbPluginApi } from "@get-bb/plugin-sdk";
import type { Reporter } from "./report";
import { reportInputSchema } from "./report-contract";
import { resolveStatusEpicId } from "./status-store";

export function reportCommands(bb: BbPluginApi, reporter: Reporter) {
  return {
    report: cliCommand({
      summary: "Record an explicit worker outcome using a native-issued context file",
      description:
        "CLI thread IDs are caller-supplied and are not reporting authority. First use the native tasks_report_context tool. No automatic task status update or delivery retry.",
      positionals: [{ name: "task", required: true, description: "Task key or ULID" }],
      options: {
        key: {
          type: "string",
          required: true,
          description: "Stable worker retry key, at most 128 characters",
        },
        outcome: {
          type: "enum",
          values: ["completed", "review_ready", "blocked", "failed", "needs_decision"],
          required: true,
          description: "Explicit outcome, never idle activity",
        },
        summary: {
          type: "string",
          required: true,
          description: "Summary, at most 2000 characters",
        },
        question: {
          type: "string",
          description: "Explicit question required for needs_decision, at most 2000 characters",
        },
        result: {
          type: "string",
          repeatable: true,
          description:
            'Typed JSON result {"kind":"commit|branch|patch|artifact|evidence|url","reference":"..."}, at most 16',
        },
        baseline: {
          type: "string",
          repeatable: true,
          description: "Reported baseline reference, at most 16 of 1024 characters",
        },
        "context-file": {
          type: "string",
          required: true,
          description:
            "Private native-tool-issued .tasks-report-context-<uuid> file. Never print/attach its contents",
        },
        machine: {
          type: "string",
          required: true,
          description: "Exact host ID returned by tasks_report_context",
        },
        json: {
          type: "boolean",
          description: "Emit the bounded report, never its context token",
        },
      },
      async run(input) {
        const taskId = resolveStatusEpicId(bb.storage.database(), input.positionals.task);
        if (!taskId)
          throw new PluginCliError("Task not found", {
            code: "task_not_found",
          });
        const path = input.options["context-file"];
        if (path.length > 1024 || !/^\/.*\/\.tasks-report-context-[a-f0-9-]{36}$/.test(path))
          throw new PluginCliError("Use the private file returned by the native context tool", {
            code: "report_context_invalid",
          });
        const file = await bb.sdk.files.read({
          hostId: input.options.machine,
          path,
        });
        if (file.contentEncoding !== "utf8" || file.content.length !== 64)
          throw new PluginCliError("Invalid native context file", {
            code: "report_context_invalid",
          });
        let results: unknown[];
        try {
          results = (input.options.result ?? []).map((result) => JSON.parse(result));
        } catch {
          throw new PluginCliError("Each --result must be typed JSON", {
            code: "report_input_invalid",
          });
        }
        const request = reportInputSchema.parse({
          taskId,
          contextToken: file.content,
          key: input.options.key,
          outcome: input.options.outcome,
          summary: input.options.summary,
          question: input.options.question ?? null,
          resultReferences: results,
          baselineReferences: input.options.baseline ?? [],
        });
        const report = await reporter.reportWorker(request);
        return {
          exitCode: 0,
          stdout: input.options.json
            ? JSON.stringify(report)
            : `report:${report.id} ${report.outcome}, comment:${report.commentId}, delivery ${report.delivery.state}. Task status unchanged.`,
        };
      },
    }),
    "report-context": cliCommand({
      summary: "Explain native report-context issuance; CLI minting is refused",
      description:
        "Use native tasks_report_context with your task ID. Environment thread IDs and supplied IDs cannot prove worker origin.",
      run() {
        throw new PluginCliError(
          "CLI cannot issue a worker report context. Use the native tasks_report_context tool.",
          { code: "report_origin_unverified" },
        );
      },
    }),
    "report-show": cliCommand({
      summary: "Read one immutable worker report and its current delivery state",
      positionals: [{ name: "report", required: true, description: "Stable report ID" }],
      options: { json: { type: "boolean", description: "Emit bounded JSON" } },
      run(input) {
        const report = reporter.reports.get(input.positionals.report.replace(/^report:/, ""));
        if (!report)
          throw new PluginCliError("Report not found", {
            code: "report_not_found",
          });
        return {
          exitCode: 0,
          stdout: input.options.json
            ? JSON.stringify(report)
            : `report:${report.id}\n${report.taskKey} @thread:${report.threadId} ${report.outcome}\n${report.summary}\nComment ${report.commentId}. Delivery ${report.delivery.state}.`,
        };
      },
    }),
  };
}
