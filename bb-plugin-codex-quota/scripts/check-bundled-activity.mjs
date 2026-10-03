import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Actual self-contained host artifact, synthetic isolated Pi auth only. All network is stubbed.
const agentDir = mkdtempSync(join(tmpdir(), "codex-activity-"));
const previousDir = process.env.PI_CODING_AGENT_DIR;
const previousFetch = globalThis.fetch;
const previousNow = Date.now;
let now = previousNow();
const writeAuth = token => writeFileSync(join(agentDir, "auth.json"), JSON.stringify({ "openai-codex": {
  type: "oauth", access: token, refresh: "synthetic-refresh", expires: now + 3_600_000,
} }), { mode: 0o600 });
try {
  process.env.PI_CODING_AGENT_DIR = agentDir;
  Date.now = () => now;
  writeAuth("synthetic-account-a");
  let calls = 0; let fail = false; let switchDuringRead = false;
  globalThis.fetch = async (url, init) => {
    assert.equal(init.method, "GET");
    if (url === "https://chatgpt.com/backend-api/wham/usage") return new Response(JSON.stringify({ rate_limit: { primary_window: { used_percent: 20 } } }));
    assert.equal(url, "https://chatgpt.com/backend-api/wham/profiles/me");
    assert.equal(init.redirect, "error"); calls++;
    if (switchDuringRead) writeAuth("synthetic-account-b");
    return fail ? new Response("synthetic-private-error", { status: 500 }) : new Response(JSON.stringify({ email: "synthetic-private@example.invalid", stats: {
      lifetime_tokens: 123, peak_daily_tokens: 42, daily_usage_buckets: [{ start_date: "2026-04-20", tokens: 12 }],
    } }));
  };
  const { default: entry } = await import("../dist/host.js");
  const context = () => ({ signal: new AbortController().signal });
  const activity = await entry.handlers.activity({}, context());
  assert.equal(activity.state, "fresh"); assert.equal(activity.snapshot.summary.lifetimeTokens, 123);
  assert.equal(activity.snapshot.summary.currentStreakDays, null);
  assert(!JSON.stringify(activity).includes("synthetic-private"));
  const observedAt = activity.snapshot.observedAt;
  await entry.handlers.activity({}, context()); assert.equal(calls, 1);
  now += 300_000; fail = true;
  const stale = await entry.handlers.activity({ refresh: true }, context());
  assert.equal(stale.state, "stale"); assert.equal(stale.reason, "service"); assert.equal(stale.snapshot.observedAt, observedAt);
  assert.equal((await entry.handlers.quota({}, context())).state, "fresh");
  now += 30_000; fail = false; switchDuringRead = true;
  const changed = await entry.handlers.activity({ refresh: true }, context());
  assert.equal(changed.snapshot, null); assert.equal(changed.reason, "identity-changed");
  await entry.dispose?.();
  assert.equal((await entry.handlers.activity({}, context())).snapshot, null);
  console.log("Bundled activity normalization/cache/account-race/disposal + quota failure isolation passed, synthetic only.");
} finally {
  if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
  globalThis.fetch = previousFetch; Date.now = previousNow;
  rmSync(agentDir, { recursive: true, force: true });
}
