import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { RUN_LIMITS } from "./run-contract";
import { fingerprint } from "./run-scope";
import { refuse } from "./run-provenance";
import { resolutionDecisionSchema, type ResolutionDecision } from "./recovery-contract";

export async function readRecoveryDecision(
  bb: BbPluginApi,
  decision: ResolutionDecision,
  requestId: string,
) {
  const rows = await bb.sdk.threads.events.list({
    threadId: decision.coordinatorThreadId,
    types: ["client/turn/requested"],
    order: "desc",
    limit: "100",
    signal: AbortSignal.timeout(1500),
  });
  const event = rows[0];
  if (
    !event ||
    event.type !== "client/turn/requested" ||
    event.threadId !== decision.coordinatorThreadId ||
    (requestId !== "latest" && event.data.requestId !== requestId) ||
    Date.now() - event.createdAt > RUN_LIMITS.invocationAgeMs ||
    event.createdAt > Date.now() + 1000
  )
    refuse("recovery_decision_stale", "Use the latest fresh BB-recorded resolution decision.");
  const data = event.data;
  // Approved temporary boundary only. BB user/null attribution is not human proof.
  if (
    data.initiator !== "user" ||
    data.senderThreadId !== null ||
    data.retryOfRequestId ||
    (data.inputGroups && data.inputGroups.length !== 1) ||
    data.input.length !== 1 ||
    data.input[0]?.type !== "text" ||
    data.input[0].visibility === "agent-only" ||
    data.input[0].mentions.length
  )
    refuse(
      "recovery_decision_required",
      "Resolution requires one explicit unmixed BB-recorded user/null decision. See BBP-51.",
    );
  const match = /^\/tasks-orchestrate-resolve\s+(\{[\s\S]*\})$/.exec(data.input[0].text);
  let recorded: ResolutionDecision | null = null;
  try {
    recorded = resolutionDecisionSchema.parse(JSON.parse(match?.[1] ?? ""));
  } catch {
    /* refuse below */
  }
  if (!recorded || fingerprint(recorded) !== fingerprint(decision))
    refuse(
      "recovery_decision_mismatch",
      "The exact recorded decision must match task/role/run/coordinator/claim/association/reconciliation and acknowledge delayed-creation duplicate risk.",
    );
  return `${event.threadId}:${data.requestId}:${event.seq}`;
}
