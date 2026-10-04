import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { packagedCollectorAsset, readCollectorCompatibility } from "./collector-compatibility.js";
const roots: string[] = [];
async function fixture() { const root = await mkdtemp(join(tmpdir(), "bbp17-collector-")); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("self-contained collector compatibility", () => {
  it("rejects unsafe configuration and missing/incompatible loader support", async () => {
    for (const path of ["relative", "/x\u0000", "/x\n", "/" + "x".repeat(16_384)]) expect(() => packagedCollectorAsset(path)).toThrow();
    expect(await readCollectorCompatibility("/tmp", "/tmp", false)).toBe("incompatible");
  });
  it("checks only the bounded plugin-owned asset and does not follow extension symlinks", async () => {
    const root = await fixture(); const agent = join(root, "agent"); const extension = join(agent, "extensions/bb-codex-usage");
    await mkdir(extension, { recursive: true });
    const asset = join(extension, "index.js");
    await writeFile(asset, packagedCollectorAsset(root));
    expect(await readCollectorCompatibility(agent, root, true)).toBe("compatible-v1");
    await writeFile(asset, "x".repeat(64 * 1024 + 1));
    expect(await readCollectorCompatibility(agent, root, true)).toBe("incompatible");
    await rm(asset); await symlink(join(root, "private"), asset);
    expect(await readCollectorCompatibility(agent, root, true)).toBe("incompatible");
  });
  it("loads actual capture handlers but stays inert without explicit compatible control metadata", async () => {
    const root = await fixture();
    const handlers = new Map<string, (event?: unknown, context?: unknown) => Promise<void>>();
    const module = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(packagedCollectorAsset(root)).toString("base64")}`);
    module.default({ on: (event: string, handler: (event?: unknown, context?: unknown) => Promise<void>) => handlers.set(event, handler) });
    expect(handlers.has("message_end")).toBe(true);
    const context = { cwd: "/synthetic/workspace", sessionManager: { getSessionId: () => "session-fixture", getSessionFile: () => "/isolated/provider-session.jsonl" } };
    const message = { role: "assistant", provider: "openai-codex", model: "synthetic", timestamp: Date.UTC(2026, 9, 3),
      usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { total: 0 } }, content: "SENTINEL-private-prompt", toolArgs: "SENTINEL-credential" };
    await handlers.get("message_end")!({ message }, context); await handlers.get("session_shutdown")!();
    expect(await readdir(root)).toEqual([]);
    await mkdir(join(root, "history"));
    await writeFile(join(root, "history/collector-control-v1.json"), JSON.stringify({ protocol: 2, revision: "00000000-0000-4000-8000-000000000001", enabled: true }));
    await handlers.get("message_end")!({ message }, context); await handlers.get("session_shutdown")!();
    const text = await readFile(join(root, `history/events-v1-${new Date().toISOString().slice(0,10)}.jsonl`), "utf8");
    const event = JSON.parse(text.trim());
    expect(event).toMatchObject({ version: 1, provider: "openai-codex", workspace: context.cwd, sessionId: "session-fixture", totalTokens: 3, capturedCost: null });
    expect(text).not.toContain("SENTINEL"); expect(text).not.toContain("content"); expect(text).not.toContain("toolArgs");
    await handlers.get("message_end")!({ message: { ...message, provider: "another-provider" } }, context);
    await handlers.get("session_shutdown")!();
    expect(await readFile(join(root, `history/events-v1-${new Date().toISOString().slice(0,10)}.jsonl`), "utf8")).toBe(text);
    await writeFile(join(root, "history/collector-control-v1.json"), JSON.stringify({ protocol: 2, revision: "00000000-0000-4000-8000-000000000001", enabled: false }));
    await handlers.get("message_end")!({ message }, context); await handlers.get("session_shutdown")!();
    expect(await readFile(join(root, `history/events-v1-${new Date().toISOString().slice(0,10)}.jsonl`), "utf8")).toBe(text);
    await writeFile(join(root, "history/collector-control-v1.json"), JSON.stringify({ protocol: 99, enabled: true }));
    await handlers.get("message_end")!({ message }, context); await handlers.get("session_shutdown")!();
    expect(await readFile(join(root, `history/events-v1-${new Date().toISOString().slice(0,10)}.jsonl`), "utf8")).toBe(text);
  });
});
