import type { ReportStore } from "./report-store";
import type {
  CoordinationReader,
  TaskCoordinationData,
} from "./status-contract";
import { STATUS_LIMITS } from "./status-contract";

export function withReportCoordination(
  base: CoordinationReader,
  reports: ReportStore,
): CoordinationReader {
  return (epicId, taskIds) => {
    const snapshot = base(epicId, taskIds);
    const tasks = new Map<string, TaskCoordinationData>(snapshot.tasks);
    for (const taskId of taskIds) {
      const latest = reports.latest(taskId);
      const questions = reports.decisions(
        taskId,
        STATUS_LIMITS.decisionsPerWorker,
      );
      const deliveries = reports.deliveries(
        taskId,
        STATUS_LIMITS.resultsPerReport,
      );
      tasks.set(taskId, {
        ...tasks.get(taskId),
        latestOutcome: latest
          ? {
              state: "present",
              value: {
                id: latest.id,
                commentId: latest.commentId,
                threadId: latest.threadId,
                outcome: latest.outcome,
                createdAt: latest.createdAt,
                summary: latest.summary,
                resultReferences: latest.resultReferences.map(
                  (result) => `${result.kind}:${result.reference}`,
                ),
                baselineReferences: latest.baselineReferences,
                delivery: latest.delivery,
                runId: latest.runId,
                claimId: latest.claimId,
                associationId: latest.associationId,
              },
            }
          : { state: "absent" },
        reportedDecisions: {
          state: "present",
          value: questions.items.map((report) => ({
            id: report.id,
            taskId: report.taskId,
            threadId: report.threadId,
            kind: "report",
            state: "pending",
            createdAt: report.createdAt,
            question: report.question!,
          })),
        },
        reportedDecisionTotal: questions.total,
        reportDeliveries: {
          state: "present",
          value: {
            items: deliveries.items.map((report) => ({
              reportId: report.id,
              threadId: report.threadId,
              delivery: report.delivery,
            })),
            total: deliveries.total,
          },
        },
      });
    }
    // Reports alone never establish artifact handoff readiness or epic acceptance.
    return { ...snapshot, tasks };
  };
}
