import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import { setup } from "./status-test-fixture";

describe("compact status limits and readonly store bounds", () => {
  it("returns a complete-list size error for 101 subtasks without external lookups", async () => {
    const f = setup();
    for (let i = 0; i < 101; i++) f.child(String(i));
    expect(await f.read()).toMatchObject({
      ok: false,
      error: { code: "epic_status_size_limit", counts: { subtasks: 101 } },
    });
    expect(f.get).not.toHaveBeenCalled();
  });

  it("caps auxiliary workers and attachments with truthful totals", async () => {
    const f = setup();
    const task = f.child("Auxiliary overflow");
    for (let i = 0; i < 12; i++) {
      f.attach(task.id, `thr_worker${i}`);
      f.store.tasks.createAttachment({
        taskId: task.id,
        fileName: "large.txt".repeat(1000),
        mime: "text/plain",
        sizeBytes: 0,
        blobPath: `attachments/${i}`,
        isImage: false,
      });
    }
    const result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.status.subtasks[0]?.workers).toMatchObject({
      total: 12,
      omitted: 7,
    });
    expect(result.status.subtasks[0]?.attachments).toMatchObject({
      total: 12,
      omitted: 7,
    });
    expect(f.get).toHaveBeenCalledTimes(5);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(
      128 * 1024,
    );
  });
  it("supports 100 subtasks and bounds distinct external lookups and concurrency", async () => {
    const f = setup();
    let active = 0;
    let maximum = 0;
    f.get.mockImplementation(async ({ threadId }) => {
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return makeThreadResponse({ id: threadId, status: "idle" });
    });
    for (let i = 0; i < 100; i++) {
      const task = f.child(`Task ${i}`);
      f.attach(task.id, `thr_worker${i}`);
      f.attach(task.id, `thr_second${i}`);
    }
    const result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.status.subtasks).toHaveLength(100);
    expect(result.status.external).toEqual({
      observedWorkers: 100,
      omittedWorkers: 100,
    });
    expect(f.get).toHaveBeenCalledTimes(100);
    expect(maximum).toBeLessThanOrEqual(4);
    expect(
      result.status.subtasks.some(
        (t) => t.nativeDecisions.unobservedWorkers > 0,
      ),
    ).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(
      128 * 1024,
    );
  });
  it("reduces auxiliary payloads before returning a complete required-state byte error", async () => {
    const f = setup();
    const tasks = Array.from({ length: 100 }, (_, i) => f.child(`Task ${i}`));
    f.coordination.tasks = new Map(
      tasks.map((task) => [
        task.id,
        {
          latestOutcome: {
            state: "present",
            value: {
              id: `report-${task.id}`,
              commentId: "comment",
              threadId: "thr_reporter",
              outcome: "completed" as const,
              createdAt: "2026-10-03T00:00:00.000Z",
              summary: "😀".repeat(10000),
              resultReferences: Array(12).fill(
                "https://example.com/" + "x".repeat(900),
              ),
            },
          },
        },
      ]),
    );
    const result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.status.subtasks).toHaveLength(100);
    expect(result.status.auxiliaryReduced).toBe(true);
    expect(result.status.subtasks[0]?.latestOutcome).toMatchObject({
      state: "present",
      value: {
        summary: { omittedCharacters: 10000 },
        resultReferences: { total: 12, omitted: 12, items: [] },
      },
    });
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(
      128 * 1024,
    );
    f.coordination.run = {
      state: "present",
      value: {
        id: "huge-required-run",
        coordinatorThreadId: "thr_coordinator",
        phase: "active",
        approvedTaskIds: Array.from(
          { length: 6000 },
          (_, i) => `required-task-${i.toString().padStart(25, "0")}`,
        ),
        scopeState: "current",
        baselineReferences: [],
      },
    };
    expect(await f.read()).toMatchObject({
      ok: false,
      error: {
        code: "epic_status_size_limit",
        counts: { subtasks: 100 },
        requiredBytes: expect.any(Number),
      },
    });
    expect(f.get).not.toHaveBeenCalled();
  });
  it("rejects oversized complete dependency state before resolving external activity", async () => {
    const f = setup();
    const consumer = f.child("Consumer");
    f.attach(consumer.id, "thr_idle");
    f.store.transaction(() => {
      for (let i = 0; i < 2100; i++) {
        const blocker = f.store.tasks.createTask({
          projectId: f.project.id,
          title: `Outside epic ${i}`,
        });
        f.store.tasks.addTaskDependency(blocker.id, consumer.id);
      }
    });
    expect(await f.read()).toMatchObject({
      ok: false,
      error: {
        code: "epic_status_size_limit",
        counts: { subtasks: 1, dependencies: 2100 },
        requiredBytes: expect.any(Number),
      },
    });
    expect(f.get).not.toHaveBeenCalled();
  });

  it("times out unavailable activity and cancels the SDK lookup without writing stale observations", async () => {
    const f = setup();
    const association = f.attach(
      f.child("Hung external lookup").id,
      "thr_hung",
    );
    let aborted = false;
    f.get.mockImplementation(({ signal }) => {
      signal?.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise<ReturnType<typeof makeThreadResponse>>(() => {});
    });
    vi.useFakeTimers();
    try {
      const resultPromise = f.read();
      await vi.advanceTimersByTimeAsync(2001);
      const result = await resultPromise;
      if (!result.ok) throw new Error(result.error.message);
      expect(
        result.status.subtasks[0]?.workers.items[0]?.activity,
      ).toMatchObject({
        state: "stale",
        value: "unknown",
        observedAt: null,
        cachedAt: association.updatedAt,
      });
      expect(aborted).toBe(true);
      expect(f.store.tasks.getTaskThread(association.id)).toEqual(association);
    } finally {
      vi.useRealTimers();
    }
  });
});
