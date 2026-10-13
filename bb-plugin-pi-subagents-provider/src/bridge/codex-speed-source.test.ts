import {
  createAssistantMessageEventStream,
  normalizeContext,
  type Model,
  type Provider,
  type StreamOptions,
} from "@earendil-works/pi-ai";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { zstdDecompressSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CODEX_SPEED_SOURCE } from "./codex-speed-source.js";

let speed: typeof import("@koenvg/pi-openai-codex-speed");
let directory: string;
beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "bb-generated-speed-"));
  const path = join(directory, "speed.mjs");
  writeFileSync(
    path,
    CODEX_SPEED_SOURCE + "\nexport const { CapabilitySource, SpeedController } = __bbCodexSpeed;\n",
  );
  // The temporary generated module exists only at runtime, outside Vite's import analysis.
  speed = await import(/* @vite-ignore */ path);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const model: Model<"openai-codex-responses"> = {
  id: "gpt-5.5",
  name: "GPT-5.5",
  provider: "openai-codex",
  api: "openai-codex-responses",
  baseUrl: "https://chatgpt.com/backend-api",
  reasoning: true,
  input: ["text"],
  contextWindow: 100000,
  maxTokens: 4096,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const priorityPayload = { model: "gpt-5.5", service_tier: "priority" };

function fixture() {
  let now = 0;
  let account = "fixture-account";
  let discoveries = 0;
  let discover = async () =>
    Response.json({ models: [{ slug: "gpt-5.5", service_tiers: [{ id: "priority" }] }] });
  const token = () =>
    `fixture.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: account } })).toString("base64url")}.signature`;
  const source = new speed.CapabilitySource(
    {
      isUsingOAuth: () => true,
      getApiKeyAndHeaders: async () => ({ ok: true, apiKey: token() }),
    },
    async () => {
      discoveries++;
      return discover();
    },
    () => now,
  );
  const controller = new speed.SpeedController(source);
  let captured: StreamOptions | undefined;
  const stream: Provider["stream"] = (_model, _context, options) => {
    captured = options;
    return createAssistantMessageEventStream();
  };
  const native = controller.decorate({
    id: "openai-codex",
    name: "Codex",
    auth: {},
    getModels: () => [model],
    stream,
    streamSimple: stream,
  });
  const dispatched: unknown[] = [];
  return {
    controller,
    token,
    advance: (value: number) => {
      now = value;
    },
    account: (value: string) => {
      account = value;
    },
    discovery: (value: typeof discover) => {
      discover = value;
    },
    discoveries: () => discoveries,
    dispatched,
    async payload(onPayload?: StreamOptions["onPayload"], requestToken = token()) {
      native.streamSimple(model, normalizeContext({ messages: [] }), {
        apiKey: requestToken,
        onPayload,
      });
      const options = captured!;
      const result = await options.onPayload!.call(options, { model: "gpt-5.5" }, model);
      dispatched.push(result);
      return result;
    },
  };
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("generated speed controller at the native payload boundary", () => {
  it("renews expired successful evidence for a mid-turn continuation", async () => {
    const f = fixture();
    await f.controller.select(model, "fast");
    f.controller.beginTurn();
    expect(await f.payload()).toEqual(priorityPayload);
    f.advance(300001);
    expect(await f.payload()).toEqual(priorityPayload);
    expect(f.discoveries()).toBe(2);
    expect(f.dispatched).toEqual([priorityPayload, priorityPayload]);
  });

  it("reuses fresh evidence and renews at the exact between-turn expiry", async () => {
    const f = fixture();
    await f.controller.select(model, "fast");
    f.controller.beginTurn();
    f.advance(299999);
    expect(await f.payload()).toEqual(priorityPayload);
    expect(f.discoveries()).toBe(1);
    f.controller.endTurn();
    f.advance(300000);
    await f.controller.select(model, "fast");
    f.controller.beginTurn();
    expect(await f.payload()).toEqual(priorityPayload);
    expect(f.discoveries()).toBe(2);
  });

  it("renews after an awaited payload callback crosses expiry", async () => {
    const f = fixture();
    await f.controller.select(model, "fast");
    f.controller.beginTurn();
    const entered = gate();
    const release = gate();
    const request = f.payload(async () => {
      entered.release();
      await release.promise;
      return { model: "gpt-5.5", marker: "instrumented", service_tier: "unconfirmed" };
    });
    await entered.promise;
    f.advance(300001);
    release.release();
    expect(await request).toEqual({
      model: "gpt-5.5",
      marker: "instrumented",
      service_tier: "priority",
    });
    expect(f.discoveries()).toBe(2);
  });

  it("coalesces concurrent expired requests into one renewal", async () => {
    const f = fixture();
    await f.controller.select(model, "fast");
    f.advance(300001);
    const entered = gate();
    const release = gate();
    f.discovery(async () => {
      entered.release();
      await release.promise;
      return Response.json({ models: [{ slug: "gpt-5.5", service_tiers: [{ id: "priority" }] }] });
    });
    const first = f.payload();
    await entered.promise;
    const second = f.payload();
    release.release();
    expect(await Promise.all([first, second])).toEqual([priorityPayload, priorityPayload]);
    expect(f.discoveries()).toBe(2);
    expect(f.dispatched).toEqual([priorityPayload, priorityPayload]);
  });

  it("keeps failed renewal sticky until explicit refresh and dispatches no failed request", async () => {
    const f = fixture();
    await f.controller.select(model, "fast");
    expect(await f.payload()).toEqual(priorityPayload);
    f.advance(300001);
    f.discovery(async () => {
      throw new Error("private discovery failure");
    });
    await expect(f.payload()).rejects.toMatchObject({ category: "discovery-failed" });
    f.advance(900001);
    f.discovery(async () =>
      Response.json({ models: [{ slug: "gpt-5.5", service_tiers: [{ id: "priority" }] }] }),
    );
    expect(await f.controller.capabilities(model)).toEqual({
      tiers: [{ id: "default", name: "Default", description: "Standard provider behavior." }],
      error: "discovery-failed",
    });
    await expect(f.controller.select(model, "fast")).rejects.toMatchObject({
      category: "discovery-failed",
    });
    await expect(f.payload()).rejects.toMatchObject({ category: "unavailable" });
    expect(f.discoveries()).toBe(2);
    expect(f.dispatched).toEqual([priorityPayload]);
    expect(await f.controller.refresh(model)).toEqual({
      tiers: [
        { id: "default", name: "Default", description: "Standard provider behavior." },
        {
          id: "fast",
          name: "Fast",
          description: "Priority processing. Account usage limits apply.",
        },
      ],
    });
    expect(await f.payload()).toEqual(priorityPayload);
    expect(f.discoveries()).toBe(3);
    expect(f.dispatched).toEqual([priorityPayload, priorityPayload]);
  });

  it("blocks revoked Fast after renewal but permits Default without discovery", async () => {
    const f = fixture();
    await f.controller.select(model, "fast");
    expect(await f.payload()).toEqual(priorityPayload);
    f.advance(300001);
    f.discovery(async () => Response.json({ models: [{ slug: "gpt-5.5", service_tiers: [] }] }));
    await expect(f.payload()).rejects.toMatchObject({ category: "unavailable" });
    expect(f.dispatched).toEqual([priorityPayload]);
    expect(f.discoveries()).toBe(2);
    await f.controller.select(model, "default");
    f.advance(900001);
    f.discovery(async () => {
      throw new Error("must not discover for Default");
    });
    expect(await f.payload(() => ({ model: "gpt-5.5", service_tier: "priority" }), "")).toEqual({
      model: "gpt-5.5",
    });
    expect(f.discoveries()).toBe(2);
    expect(f.dispatched).toEqual([priorityPayload, { model: "gpt-5.5" }]);
  });

  it("rejects an account change during renewal before dispatch", async () => {
    const f = fixture();
    await f.controller.select(model, "fast");
    expect(await f.payload()).toEqual(priorityPayload);
    f.advance(300001);
    f.discovery(async () => {
      f.account("different-account");
      return Response.json({ models: [{ slug: "gpt-5.5", service_tiers: [{ id: "priority" }] }] });
    });
    await expect(f.payload()).rejects.toMatchObject({ category: "account-changed" });
    expect(f.discoveries()).toBe(2);
    expect(f.dispatched).toEqual([priorityPayload]);
  });

  it("rejects renewal invalidated while discovery is pending", async () => {
    const f = fixture();
    await f.controller.select(model, "fast");
    expect(await f.payload()).toEqual(priorityPayload);
    f.advance(300001);
    const entered = gate();
    const release = gate();
    f.discovery(async () => {
      entered.release();
      await release.promise;
      return Response.json({ models: [{ slug: "gpt-5.5", service_tiers: [{ id: "priority" }] }] });
    });
    const request = f.payload();
    await entered.promise;
    f.controller.restore("fast");
    release.release();
    await expect(request).rejects.toMatchObject({ category: "account-changed" });
    expect(f.discoveries()).toBe(2);
    expect(f.dispatched).toEqual([priorityPayload]);
  });

  it("does not retry when renewal itself takes the full evidence lifetime", async () => {
    const f = fixture();
    await f.controller.select(model, "fast");
    expect(await f.payload()).toEqual(priorityPayload);
    f.advance(300001);
    f.discovery(async () => {
      f.advance(600001);
      return Response.json({ models: [{ slug: "gpt-5.5", service_tiers: [{ id: "priority" }] }] });
    });
    await expect(f.payload()).rejects.toMatchObject({ category: "expired" });
    expect(f.discoveries()).toBe(2);
    expect(f.dispatched).toEqual([priorityPayload]);
  });

  it("retains final payload model validation after successful renewal", async () => {
    const f = fixture();
    await f.controller.select(model, "fast");
    expect(await f.payload()).toEqual(priorityPayload);
    f.advance(300001);
    await expect(f.payload(() => ({ model: "different-model" }))).rejects.toMatchObject({
      category: "unavailable",
    });
    expect(f.discoveries()).toBe(2);
    expect(f.dispatched).toEqual([priorityPayload]);
  });

  it("does not retry a native server refusal or dispatch after failed expiry renewal", async () => {
    const f = fixture();
    await f.controller.select(model, "fast");
    f.advance(300001);
    const native = f.controller.decorate(
      builtinProviders().find((provider) => provider.id === "openai-codex")!,
    );
    const requests: unknown[] = [];
    const request = () =>
      native
        .streamSimple(model, normalizeContext({ messages: [] }), {
          apiKey: f.token(),
          transport: "sse",
          maxRetries: 2,
          onPayload: () => ({ model: "gpt-5.5", marker: "native" }),
          fetch: async (_url, init) => {
            const body = init?.body;
            requests.push(
              JSON.parse(
                typeof body === "string" ? body : zstdDecompressSync(body as Uint8Array).toString(),
              ),
            );
            return Response.json({ error: { message: "Fast tier refused" } }, { status: 429 });
          },
        })
        .result();
    const refused = await request();
    expect({ stopReason: refused.stopReason, errorMessage: refused.errorMessage }).toEqual({
      stopReason: "error",
      errorMessage: "You have hit your ChatGPT usage limit.",
    });
    expect(requests).toEqual([{ model: "gpt-5.5", marker: "native", service_tier: "priority" }]);
    f.advance(600002);
    f.discovery(async () => {
      throw new Error("private discovery failure");
    });
    const failed = await request();
    expect({ stopReason: failed.stopReason, errorMessage: failed.errorMessage }).toEqual({
      stopReason: "error",
      errorMessage:
        "Speed: discovery-failed. Select Default in the BB speed selector or use /speed refresh.",
    });
    expect(requests).toEqual([{ model: "gpt-5.5", marker: "native", service_tier: "priority" }]);
    expect(f.discoveries()).toBe(3);
  });
});
