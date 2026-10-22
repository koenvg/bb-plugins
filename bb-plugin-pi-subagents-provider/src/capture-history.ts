import { type Capture } from "./subagents-contract.js";

/** Retain accepted detail and its limits when a newer observation lacks those fields. */
export function retainCapture(
  newer: Capture | undefined,
  older: Capture | undefined,
): Capture | undefined {
  if (!newer) return older;
  if (!older) return newer;
  const hasMessages =
    !!newer.messages?.length ||
    (newer.messages !== undefined && (newer.truncated?.messages ?? 0) > 0);
  return {
    ...older,
    ...newer,
    task: newer.task ?? older.task,
    finalOutput: newer.finalOutput ?? older.finalOutput,
    messages: hasMessages ? newer.messages : older.messages,
    resolvedModel: newer.resolvedModel ?? older.resolvedModel,
    ...(newer.truncated || older.truncated
      ? {
          truncated: {
            task:
              (newer.task !== undefined ? newer.truncated?.task : older.truncated?.task) ?? false,
            finalOutput:
              (newer.finalOutput !== undefined
                ? newer.truncated?.finalOutput
                : older.truncated?.finalOutput) ?? false,
            messages: (hasMessages ? newer.truncated?.messages : older.truncated?.messages) ?? 0,
          },
        }
      : {}),
    ...(newer.status !== "captured"
      ? {
          capturedAt: older.capturedAt,
          attemptedAt: newer.attemptedAt ?? newer.capturedAt,
        }
      : {}),
  };
}
