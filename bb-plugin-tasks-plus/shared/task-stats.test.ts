import { describe, expect, it } from "vitest";
import { aggregateTaskStats, type StatsTaskInput } from "./task-stats.js";

const projects = [
  { id: "a", name: "Alpha", color: "blue" },
  { id: "b", name: "Beta", color: "green" },
];

function task(
  id: string,
  milliseconds: number,
  extra: Partial<StatsTaskInput> = {},
): StatsTaskInput {
  return {
    id,
    key: `A-${id}`,
    title: id,
    projectId: "a",
    priority: "none",
    status: "done",
    transitions: [
      { id: 1, fromStatus: "todo", toStatus: "in_progress", changedAt: new Date(0).toISOString() },
      {
        id: 2,
        fromStatus: "in_progress",
        toStatus: "done",
        changedAt: new Date(milliseconds).toISOString(),
      },
    ],
    ...extra,
  };
}

describe("task statistics", () => {
  it.each([
    [[], { count: 0, medianMs: null, averageMs: null }],
    [[0], { count: 1, medianMs: 0, averageMs: 0 }],
    [[12], { count: 1, medianMs: 12, averageMs: 12 }],
    [[2, 10, 3], { count: 3, medianMs: 3, averageMs: 5 }],
    [[1, 3, 7, 13], { count: 4, medianMs: 5, averageMs: 6 }],
  ])("computes literal measures for %j", (values, expected) => {
    expect(
      aggregateTaskStats(
        values.map((value, index) => task(`${index}`, value)),
        projects,
      ).summary,
    ).toEqual(expected);
  });

  it("partitions by calculator eligibility and disclosure never changes aggregates", () => {
    const interrupted = task("interrupted", 100, {
      transitions: [
        {
          id: 1,
          fromStatus: "todo",
          toStatus: "in_progress",
          changedAt: new Date(0).toISOString(),
        },
        {
          id: 2,
          fromStatus: "in_progress",
          toStatus: "todo",
          changedAt: new Date(20).toISOString(),
        },
        { id: 3, fromStatus: "todo", toStatus: "done", changedAt: new Date(100).toISOString() },
      ],
    });
    const inputs = [
      task("counted", 10),
      interrupted,
      task("canceled", 200, { status: "canceled" }),
      task("unfinished", 30, { status: "in_review" }),
      task("missing", 0, { transitions: [] }),
    ];
    const hidden = aggregateTaskStats(inputs, projects);
    const shown = aggregateTaskStats(inputs, projects, true);
    expect(hidden).toMatchObject({
      summary: { count: 1, medianMs: 10, averageMs: 10 },
      interrupted: { count: 1 },
      canceledCount: 1,
      unavailableCompletedCount: 1,
    });
    expect(hidden.interrupted.tasks).toBeUndefined();
    expect(shown.interrupted.tasks).toEqual([
      {
        id: "interrupted",
        key: "A-interrupted",
        title: "interrupted",
        projectId: "a",
        priority: "none",
        milliseconds: 100,
      },
    ]);
    expect({ ...shown, interrupted: hidden.interrupted }).toEqual(hidden);
    expect(hidden.slowest.map((row) => row.id)).toEqual(["counted"]);
  });

  it("returns only compact project metadata even when callers pass full projects", () => {
    const fullProjects = projects.map((project) => ({
      ...project,
      prefix: "PRIVATE",
      nextTaskNumber: 123,
    }));
    expect(aggregateTaskStats([task("one", 4)], fullProjects).byProject).toEqual([
      { id: "a", name: "Alpha", color: "blue", count: 1, medianMs: 4, averageMs: 4 },
      { id: "b", name: "Beta", color: "green", count: 0, medianMs: null, averageMs: null },
    ]);
  });

  it("uses current project and priority, retains empty priorities, and ranks five with ID ties", () => {
    const result = aggregateTaskStats(
      [
        task("f", 8),
        task("e", 8),
        task("d", 8),
        task("c", 8),
        task("b", 8),
        task("a", 8, { projectId: "b", priority: "urgent" }),
        task("g", 0, { priority: "high" }),
      ],
      projects,
    );
    expect(result.summary).toEqual({ count: 7, medianMs: 8, averageMs: 48 / 7 });
    expect(result.slowest.map((row) => row.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.byProject).toEqual([
      { ...projects[0], count: 6, medianMs: 8, averageMs: 40 / 6 },
      { ...projects[1], count: 1, medianMs: 8, averageMs: 8 },
    ]);
    expect(result.byPriority).toEqual([
      { priority: "urgent", count: 1, medianMs: 8, averageMs: 8 },
      { priority: "high", count: 1, medianMs: 0, averageMs: 0 },
      { priority: "medium", count: 0, medianMs: null, averageMs: null },
      { priority: "low", count: 0, medianMs: null, averageMs: null },
      { priority: "none", count: 5, medianMs: 8, averageMs: 8 },
    ]);
  });
});
