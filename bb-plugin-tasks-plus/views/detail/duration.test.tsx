// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskDurationResult } from "../../shared/task-duration.js";
import { TaskDurationStrip } from "./duration.js";

afterEach(cleanup);
const completed = {
  kind: "completed",
  startedAt: "2026-10-19T09:00:00Z",
  completedAt: "2026-10-21T17:00:00Z",
  milliseconds: 201_600_000,
  interrupted: false,
  statisticsEligible: true,
} as const;

describe("task duration strip", () => {
  it.each([
    [0, "<1m", "Less than one minute"],
    [59_999, "<1m", "Less than one minute"],
    [60_000, "1m", "1 minute"],
    [3_660_000, "1h 1m", "1 hour 1 minute"],
    [3_600_000, "1h", "1 hour"],
    [86_400_000, "1d", "1 day"],
    [86_520_000, "1d 2m", "1 day 2 minutes"],
    [205_379_999, "2d 9h", "2 days 9 hours"],
    [201_600_000, "2d 8h", "2 days 8 hours"],
  ])("formats %i elapsed milliseconds as %s", (milliseconds, compact, accessible) => {
    render(<TaskDurationStrip duration={{ ...completed, milliseconds }} pendingStatus={false} />);
    expect(screen.getByText(compact).getAttribute("aria-label")).toBe(accessible);
    expect(screen.getByText(/First start to last done/).textContent).toContain(
      "Includes review time and the reopened period.",
    );
  });

  it("marks interrupted completions without dropping their elapsed value", () => {
    render(
      <TaskDurationStrip
        duration={{ ...completed, interrupted: true, statisticsEligible: false }}
        pendingStatus={false}
      />,
    );
    expect(screen.getByText("2d 8h")).toBeTruthy();
    expect(screen.getByText("Interrupted")).toBeTruthy();
    expect(screen.getByText(/Returned to todo or backlog after starting/).textContent).toContain(
      "Excluded from median and average.",
    );
  });

  it.each<TaskDurationResult>([
    {
      kind: "unfinished",
      startedAt: completed.startedAt,
      interrupted: true,
      statisticsEligible: false,
    },
    {
      kind: "unavailable",
      reason: "missing-completion",
      interrupted: true,
      statisticsEligible: false,
    },
    {
      kind: "excluded",
      reason: "canceled",
      interrupted: true,
      statisticsEligible: false,
    },
  ])("keeps the interruption flag on nonnumeric %j results", (duration) => {
    render(<TaskDurationStrip duration={duration} pendingStatus={false} />);
    expect(screen.getByText("Interrupted")).toBeTruthy();
    expect(screen.queryByText("2d 8h")).not.toBeTruthy();
  });

  it.each<[TaskDurationResult, string, string]>([
    [
      {
        kind: "unfinished",
        startedAt: completed.startedAt,
        interrupted: false,
        statisticsEligible: false,
      },
      "Not completed",
      "Shown when the task is done. No live timer.",
    ],
    [
      { kind: "excluded", reason: "canceled", interrupted: false, statisticsEligible: false },
      "Excluded",
      "Canceled tasks have no duration and are excluded from median and average.",
    ],
    [
      {
        kind: "unavailable",
        reason: "missing-start",
        interrupted: false,
        statisticsEligible: false,
      },
      "Duration unavailable",
      "No recorded first start in status history.",
    ],
    [
      {
        kind: "unavailable",
        reason: "missing-completion",
        interrupted: false,
        statisticsEligible: false,
      },
      "Duration unavailable",
      "Status history is missing the final completion.",
    ],
    [
      {
        kind: "unavailable",
        reason: "invalid-timestamp",
        interrupted: false,
        statisticsEligible: false,
      },
      "Duration unavailable",
      "Status history has invalid or out-of-order timestamps.",
    ],
  ])("renders %j without a numeric duration", (duration, value, reason) => {
    render(<TaskDurationStrip duration={duration} pendingStatus={false} />);
    expect(screen.getByText(value)).toBeTruthy();
    expect(screen.getByText(reason)).toBeTruthy();
    expect(screen.queryByLabelText("2 days 8 hours")).not.toBeTruthy();
  });

  it("hides a previous completed value until the status save is confirmed", () => {
    const view = render(<TaskDurationStrip duration={completed} pendingStatus />);
    expect(screen.getByText("Awaiting status save")).toBeTruthy();
    expect(screen.queryByText("2d 8h")).not.toBeTruthy();
    view.rerender(<TaskDurationStrip duration={completed} pendingStatus={false} />);
    expect(screen.getByText("2d 8h")).toBeTruthy();
  });
});
