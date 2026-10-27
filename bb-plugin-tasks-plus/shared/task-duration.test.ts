import { describe, expect, it } from "vitest";
import type { TaskStatusTransition } from "../db/types.js";
import type { TaskStatus } from "./contract.js";
import { calculateTaskDuration } from "./task-duration.js";

const start = "2026-01-01T00:00:00.000Z";
const end = "2026-01-01T02:00:00.000Z";

function transition(
  id: number,
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
  changedAt = start,
): TaskStatusTransition {
  return { id, taskId: "task", fromStatus, toStatus, changedAt };
}

const started = transition(1, "todo", "in_progress");
const completed = transition(2, "in_progress", "done", end);

const unavailable = (reason: string, interrupted = false) => ({
  kind: "unavailable",
  reason,
  interrupted,
  statisticsEligible: false,
});

describe("calculateTaskDuration", () => {
  it("returns the recorded elapsed interval for completed work", () => {
    expect(calculateTaskDuration({ status: "done", transitions: [started, completed] })).toEqual({
      kind: "completed",
      startedAt: start,
      completedAt: end,
      milliseconds: 7200000,
      interrupted: false,
      statisticsEligible: true,
    });
  });

  it("includes review time and ignores timestamps that are not endpoints", () => {
    expect(
      calculateTaskDuration({
        status: "done",
        transitions: [
          transition(1, "backlog", "todo", "invalid"),
          transition(3, "todo", "in_progress"),
          transition(5, "in_progress", "in_review", "invalid"),
          transition(8, "in_review", "done", end),
        ],
      }),
    ).toEqual({
      kind: "completed",
      startedAt: start,
      completedAt: end,
      milliseconds: 7200000,
      interrupted: false,
      statisticsEligible: true,
    });
  });

  it("includes every reopened interval through the latest completion", () => {
    expect(
      calculateTaskDuration({
        status: "done",
        transitions: [
          started,
          completed,
          transition(3, "done", "in_progress", "2026-01-02T00:00:00.000Z"),
          transition(4, "in_progress", "done", "2026-01-02T01:00:00.000Z"),
          transition(5, "done", "in_review", "2026-01-03T00:00:00.000Z"),
          transition(6, "in_review", "done", "2026-01-03T08:00:00.000Z"),
        ],
      }),
    ).toEqual({
      kind: "completed",
      startedAt: start,
      completedAt: "2026-01-03T08:00:00.000Z",
      milliseconds: 201600000,
      interrupted: false,
      statisticsEligible: true,
    });
  });

  for (const status of ["todo", "backlog"] as const) {
    it(`retains completed duration after interruption into ${status} and restart`, () => {
      expect(
        calculateTaskDuration({
          status: "done",
          transitions: [
            started,
            completed,
            transition(3, "done", status, "2026-01-02T00:00:00.000Z"),
            transition(4, status, "in_progress", "2026-01-07T00:00:00.000Z"),
            transition(5, "in_progress", "done", "2026-01-08T08:00:00.000Z"),
          ],
        }),
      ).toEqual({
        kind: "completed",
        startedAt: start,
        completedAt: "2026-01-08T08:00:00.000Z",
        milliseconds: 633600000,
        interrupted: true,
        statisticsEligible: false,
      });
    });

    it(`keeps interruption when work restarts from ${status} before any completion`, () => {
      expect(
        calculateTaskDuration({
          status: "done",
          transitions: [
            started,
            transition(2, "in_progress", status),
            transition(3, status, "in_progress"),
            transition(4, "in_progress", "done", end),
          ],
        }),
      ).toEqual({
        kind: "completed",
        startedAt: start,
        completedAt: end,
        milliseconds: 7200000,
        interrupted: true,
        statisticsEligible: false,
      });
    });
  }

  for (const [status, interrupted] of [
    ["in_progress", false],
    ["in_review", false],
    ["todo", true],
    ["backlog", true],
  ] as const) {
    it(`returns unfinished ${status} work instead of an earlier completion or live timer`, () => {
      expect(
        calculateTaskDuration({
          status,
          transitions: [started, completed, transition(3, "done", status)],
        }),
      ).toEqual({
        kind: "unfinished",
        startedAt: start,
        interrupted,
        statisticsEligible: false,
      });
    });
  }

  it("keeps an unfinished restart interrupted", () => {
    expect(
      calculateTaskDuration({
        status: "in_progress",
        transitions: [
          started,
          transition(2, "in_progress", "todo"),
          transition(3, "todo", "in_progress"),
        ],
      }),
    ).toEqual({
      kind: "unfinished",
      startedAt: start,
      interrupted: true,
      statisticsEligible: false,
    });
  });

  it.each([false, true])("excludes current cancellation with interruption %s", (interrupted) => {
    const transitions = interrupted
      ? [started, transition(2, "in_progress", "backlog"), transition(3, "backlog", "canceled")]
      : [started, transition(2, "in_progress", "canceled")];
    expect(calculateTaskDuration({ status: "canceled", transitions })).toEqual({
      kind: "excluded",
      reason: "canceled",
      interrupted,
      statisticsEligible: false,
    });
  });

  it("does not permanently exclude historical cancellation", () => {
    expect(
      calculateTaskDuration({
        status: "done",
        transitions: [
          started,
          transition(2, "in_progress", "canceled"),
          transition(3, "canceled", "in_progress"),
          transition(4, "in_progress", "done", end),
        ],
      }),
    ).toEqual({
      kind: "completed",
      startedAt: start,
      completedAt: end,
      milliseconds: 7200000,
      interrupted: false,
      statisticsEligible: true,
    });
  });

  it.each(["backlog", "in_progress", "done"] as const)("reports empty %s history", (status) => {
    expect(calculateTaskDuration({ status, transitions: [] })).toEqual(
      unavailable("missing-start"),
    );
  });

  it("reports missing start rather than inferring it from departure status", () => {
    expect(calculateTaskDuration({ status: "done", transitions: [completed] })).toEqual(
      unavailable("missing-start"),
    );
  });

  it.each(["in_progress", "in_review", "done"] as const)(
    "rejects a prefix departing %s even with a later recorded start",
    (fromStatus) => {
      expect(
        calculateTaskDuration({
          status: "done",
          transitions: [
            transition(1, fromStatus, "todo"),
            transition(2, "todo", "in_progress"),
            transition(3, "in_progress", "done", end),
          ],
        }),
      ).toEqual(unavailable("missing-start"));
    },
  );

  it("reports absent completion", () => {
    expect(calculateTaskDuration({ status: "done", transitions: [started] })).toEqual(
      unavailable("missing-completion"),
    );
  });

  it("does not reuse an old completion when the latest recorded state is reopened", () => {
    expect(
      calculateTaskDuration({
        status: "done",
        transitions: [started, completed, transition(3, "done", "todo")],
      }),
    ).toEqual(unavailable("missing-completion", true));
  });

  it.each([
    ["invalid", end],
    [start, "invalid"],
    [end, start],
  ])("rejects invalid endpoint interval %s to %s", (startedAt, completedAt) => {
    expect(
      calculateTaskDuration({
        status: "done",
        transitions: [
          transition(1, "todo", "in_progress", startedAt),
          transition(2, "in_progress", "done", completedAt),
        ],
      }),
    ).toEqual(unavailable("invalid-timestamp"));
  });

  it("rejects an invalid unfinished start", () => {
    expect(
      calculateTaskDuration({
        status: "in_progress",
        transitions: [transition(1, "todo", "in_progress", "invalid")],
      }),
    ).toEqual(unavailable("invalid-timestamp"));
  });

  it("accepts equal endpoints, consumes supplied order and leaves frozen rows unchanged", () => {
    const transitions = Object.freeze([
      Object.freeze(transition(1, "todo", "in_progress")),
      Object.freeze(transition(4, "in_progress", "done", end)),
      Object.freeze(transition(9, "done", "in_review", "invalid")),
      Object.freeze(transition(12, "in_review", "done")),
    ]);
    expect(calculateTaskDuration({ status: "done", transitions })).toEqual({
      kind: "completed",
      startedAt: start,
      completedAt: start,
      milliseconds: 0,
      interrupted: false,
      statisticsEligible: true,
    });
    expect(transitions.map((row) => row.id)).toEqual([1, 4, 9, 12]);
  });
});
