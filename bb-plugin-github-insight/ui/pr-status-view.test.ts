import { describe, expect, it } from "vitest";
import type { PrInsight } from "../core/overview";
import { prStatusView } from "./pr-status-view";

const base: PrInsight = {
  pr: { number: 1, title: "Status", state: "open", url: "https://github.com/o/r/pull/1", headOid: "abc" },
  mergeAction: { kind: "none" }, blockers: [], checks: [], reviewers: [], mergeQueue: null,
};
const failed = { code: "checks_failed", text: "2 checks failed" } as const;
const conflict = { code: "conflicts", text: "Merge conflicts" } as const;

describe("PR status presentation", () => {
  it.each([
    ["draft", "Draft"], ["open", "Open"], ["closed", "Closed"], ["merged", "Pull request merged"],
  ] as const)("keeps %s visible without blockers or an action", (state, label) => {
    const status = prStatusView({ ...base, pr: { ...base.pr, state } });
    expect(status.lifecycle.text).toBe(label);
    expect(status.detail).toBeNull();
    expect(status.action).toBeNull();
  });

  it("keeps Draft beside blockers without duplicate Draft text or source mutation", () => {
    const insight: PrInsight = { ...base, pr: { ...base.pr, state: "draft" }, blockers: [failed, { code: "draft", text: "Draft" }, conflict] };
    const before = structuredClone(insight);
    const status = prStatusView(insight);
    expect(status.lifecycle.text).toBe("Draft");
    expect(status.detail?.text).toBe("2 checks failed · Merge conflicts");
    expect(status.blockers).toEqual(insight.blockers);
    expect(insight).toEqual(before);
  });

  it.each(["draft", "closed", "merged"] as const)("rejects contradictory actions for %s", (state) => {
    for (const mergeAction of [{ kind: "merge", method: "SQUASH" }, { kind: "enqueue" }] as const) {
      const status = prStatusView({ ...base, pr: { ...base.pr, state }, mergeAction });
      expect(status.action).toBeNull();
      expect(status.detail).toBeNull();
    }
  });

  it.each(["closed", "merged"] as const)("suppresses obsolete blockers and queue detail for %s", (state) => {
    const status = prStatusView({ ...base, pr: { ...base.pr, state }, blockers: [failed], mergeAction: { kind: "queued" }, mergeQueue: { position: 3, state: "failed" } });
    expect(status.detail).toBeNull();
    expect(status.blockers).toEqual([]);
    expect(status.action).toBeNull();
  });

  it.each(["merge", "enqueue"] as const)("offers only a valid open %s action", (kind) => {
    const action = kind === "merge" ? { kind, method: "SQUASH" as const } : { kind };
    const status = prStatusView({ ...base, mergeAction: action });
    expect(status.lifecycle.text).toBe("Open");
    expect(status.detail?.text).toBe(kind === "merge" ? "Ready to merge" : "Ready to enqueue");
    expect(status.action).toEqual(action);
    expect(prStatusView({ ...base, mergeAction: action, blockers: [failed] }).action).toBeNull();
  });

  it.each([
    ["queued", "In merge queue (#3)", "text-muted-foreground"],
    ["awaiting_checks", "Merge queue checks running (#3)", "text-attention"],
    ["merging", "Merging", "text-success"],
    ["failed", "Merge queue failed", "text-destructive"],
  ] as const)("shows %s queue detail without blockers or an action", (state, text, tone) => {
    const status = prStatusView({ ...base, mergeQueue: { position: 3, state }, blockers: [failed], mergeAction: { kind: "enqueue" } });
    expect(status.lifecycle.text).toBe("Open");
    expect(status.detail).toMatchObject({ kind: "queue", text, iconClassName: tone });
    expect(status.blockers).toEqual([]);
    expect(status.action).toBeNull();
  });
});
