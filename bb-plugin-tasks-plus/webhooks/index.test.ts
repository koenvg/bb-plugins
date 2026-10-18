import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebhooks } from "./index";

const task = {
  projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  key: "TEST-1",
  title: "Created",
  createdAt: "2026-06-01T00:00:00.000Z",
};
const closes: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closes.splice(0)) await close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function service(settings?: Record<string, string>) {
  const { bb, harness } = createFakePluginHost({ settings });
  closes.push(() => harness.dispose());
  const define = vi.spyOn(bb.settings, "define");
  const webhooks = await createWebhooks(bb);
  bb.onDispose(webhooks.dispose);
  return { webhooks, harness, bb, settings: define.mock.results[0]!.value };
}

function stalledFetch() {
  const signals: AbortSignal[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url, options: RequestInit) => {
      signals.push(options.signal!);
      return new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener(
          "abort",
          () => reject(new Error("private url and authorization")),
          { once: true },
        );
      });
    }),
  );
  return signals;
}

describe("webhook owner public boundary", () => {
  it("never awaits settings or a stalled request in publish, bounds concurrency and pending count, and aborts without draining", async () => {
    vi.useFakeTimers();
    const signals = stalledFetch();
    const { webhooks, harness, settings } = await service();
    const endpoint = await webhooks.create(
      { kind: "global" },
      JSON.stringify({ url: "https://example.test/private" }),
    );
    const reads = vi
      .spyOn(settings, "get")
      .mockRejectedValue(new Error("no settings reads during publish"));
    for (let i = 0; i < 129; i++) webhooks.taskCreated(task, "TEST");
    expect(signals.length).toBe(4);
    expect(reads.mock.calls.length).toBe(0);
    expect(harness.logEntries.map((r) => r.message)).toEqual([
      `Webhook ${endpoint.id} attempts=0 code=queue_full`,
    ]);
    const outcome = webhooks.test(endpoint.id);
    await expect(outcome).resolves.toEqual({
      endpoint,
      outcome: { code: "queue_full", attempts: 0 },
    });
    webhooks.dispose();
    expect(signals.map((s) => s.aborted)).toEqual([true, true, true, true]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(signals.length).toBe(4);
    await expect(webhooks.test(endpoint.id)).resolves.toEqual({
      endpoint,
      outcome: { code: "disposed", attempts: 0 },
    });
  });

  it("times out stalled requests with bounded retry attempts", async () => {
    vi.useFakeTimers();
    const signals = stalledFetch();
    const { webhooks, harness } = await service();
    const endpoint = await webhooks.create(
      { kind: "global" },
      JSON.stringify({ url: "https://example.test/private", authorization: "Bearer hidden" }),
    );
    const outcome = webhooks.test(endpoint.id);
    await vi.advanceTimersByTimeAsync(6400);
    await expect(outcome).resolves.toEqual({ endpoint, outcome: { code: "timeout", attempts: 3 } });
    expect(signals.map((s) => s.aborted)).toEqual([true, true, true]);
    expect(harness.logEntries.map((r) => r.message)).toEqual([
      `Webhook ${endpoint.id} attempts=3 code=timeout`,
    ]);
  });

  it("bounds queue bytes and total residence even while all workers stall", async () => {
    vi.useFakeTimers();
    const signals = stalledFetch();
    const { webhooks, harness } = await service();
    const endpoint = await webhooks.create(
      { kind: "global" },
      JSON.stringify({ url: "https://example.test/private" }),
    );
    for (let i = 0; i < 128; i++)
      webhooks.taskCreated({ ...task, title: "x".repeat(16_000) }, "TEST");
    expect(signals.length).toBe(4);
    expect(
      harness.logEntries.some(
        (r) => r.message === `Webhook ${endpoint.id} attempts=0 code=queue_full`,
      ),
    ).toBe(true);
    const pending = webhooks.test(endpoint.id);
    await vi.advanceTimersByTimeAsync(8000);
    await expect(pending).resolves.toEqual({ endpoint, outcome: { code: "expired", attempts: 1 } });
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(
      harness.logEntries.some(
        (r) => r.message === `Webhook ${endpoint.id} attempts=1 code=expired`,
      ),
    ).toBe(true);
  });

  it("settles queued and active tests immediately on disposal and rejects later mutations safely", async () => {
    vi.useFakeTimers();
    const signals = stalledFetch();
    const { webhooks } = await service();
    const endpoint = await webhooks.create(
      { kind: "global" },
      JSON.stringify({ url: "https://example.test/private" }),
    );
    const pending = Array.from({ length: 6 }, () => webhooks.test(endpoint.id));
    webhooks.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(await Promise.all(pending)).toEqual(
      Array.from({ length: 6 }, (_, i) => ({
        endpoint,
        outcome: { code: "disposed", attempts: i < 4 ? 1 : 0 },
      })),
    );
    expect(signals.map((s) => s.aborted)).toEqual([true, true, true, true]);
    await expect(webhooks.create({ kind: "global" }, "private")).rejects.toThrow(
      "Webhook service disposed",
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects endpoint count overflow and unsafe persisted documents", async () => {
    const { webhooks } = await service();
    for (let i = 0; i < 32; i++)
      await webhooks.create({ kind: "global" }, '{"url":"https://example.test"}');
    await expect(
      webhooks.create({ kind: "global" }, '{"url":"https://example.test"}'),
    ).rejects.toThrow("Webhook configuration limit exceeded");
    expect(webhooks.list().length).toBe(32);
  });

  it.each([
    { version: 2, endpoints: [] },
    {
      version: 1,
      endpoints: [{ id: "private", scope: { kind: "global" }, url: "https://example.test" }],
    },
    {
      version: 1,
      endpoints: [
        {
          id: `wh_${"a".repeat(32)}`,
          scope: { kind: "tracker", projectId: "private" },
          url: "https://example.test",
        },
      ],
    },
    {
      version: 1,
      endpoints: [
        {
          id: `wh_${"a".repeat(32)}`,
          scope: { kind: "global" },
          url: "https://private@example.test",
        },
      ],
    },
    {
      version: 1,
      endpoints: Array.from({ length: 2 }, () => ({
        id: `wh_${"a".repeat(32)}`,
        scope: { kind: "global" },
        url: "https://example.test",
      })),
    },
  ])("fails closed on invalid stored shape", async (document) => {
    const { webhooks, harness } = await service({ taskWebhooks: JSON.stringify(document) });
    expect(() => webhooks.list()).toThrow("Invalid stored webhook configuration");
    webhooks.taskCreated(task, "TEST");
    expect(harness.logEntries.map((r) => r.message)).toEqual([
      "Invalid stored webhook configuration",
    ]);
  });

  it("keeps snapshots and mutation recovery safe when settings storage fails", async () => {
    const { webhooks, settings } = await service();
    const first = await webhooks.create({ kind: "global" }, '{"url":"https://example.test"}');
    const write = vi
      .spyOn(settings, "experimental_set")
      .mockRejectedValueOnce(new Error("private settings error"));
    await expect(webhooks.delete(first.id)).rejects.toThrow("Webhook configuration unavailable");
    expect(webhooks.list()).toEqual([first]);
    write.mockRestore();
    expect(await webhooks.delete(first.id)).toEqual(first);
    expect(webhooks.list()).toEqual([]);
  });

  it("rejects the aggregate secret-document size limit before persistence", async () => {
    const { webhooks } = await service();
    const json = JSON.stringify({
      url: "https://example.test/" + "x".repeat(1800),
      authorization: "x".repeat(4000),
    });
    for (let i = 0; i < 11; i++) await webhooks.create({ kind: "global" }, json);
    await expect(webhooks.create({ kind: "global" }, json)).rejects.toThrow(
      "Webhook configuration limit exceeded",
    );
    expect(webhooks.list().length).toBe(11);
  });
});
