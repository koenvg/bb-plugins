import type { SpeedEvidence } from "./usage-speed.js";

export type TokenClasses = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
};
/** Internal usage facts. Pi's existing scalar ownership proof remains separate. */
export type RecordedUsageFact = {
  eventId: string;
  occurredAt: string;
  workspace: string;
  model: string | null;
  totalTokens: number;
  classes: TokenClasses | null;
  capturedCost: number | null;
  speed: SpeedEvidence;
  source:
    | { kind: "pi"; sessionId: string; entryId: string | null; responseId: string | null }
    | {
        kind: "codex-native";
        responseId: string;
        providerThreadId: string;
        rootSessionId: string | null;
      };
};
