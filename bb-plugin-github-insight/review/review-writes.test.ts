import { describe, expect, it } from "vitest";
import type { DraftStore } from "./draft-store";
import { createReviewWrites } from "./review-writes";

const target = { ref: { owner: "collibra", repo: "frontend", number: 25259 }, hostId: "host-1", openOnBb: true };

describe("review writes", () => {
  it("reports a posted reply as posted when its draft cannot be deleted", async () => {
    const warnings: string[] = [];
    const writes = createReviewWrites({
      resolvePr: async () => ({ kind: "pr" as const, target }),
      replyToThread: async () => ({ data: {} }),
      setThreadResolved: async () => ({ data: {} }),
      drafts: { delete: () => Promise.reject(new Error("disk full")) } as unknown as DraftStore,
      publish: () => {},
      now: () => 1,
      warn: (message) => warnings.push(message),
    });

    const result = await writes.reply({ threadId: "thr_1", reviewThreadId: "PRRT_a", body: "Done", resolve: false });

    expect(result).toEqual({ kind: "posted", pendingReviewUrl: null, resolveError: null });
    expect(warnings).toEqual(["Posted a reply to PRRT_a, but could not delete its draft: Error: disk full"]);
  });
});
