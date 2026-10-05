import { readFile } from "node:fs/promises";
import { fixtureDigest } from "./fixture.mjs";

// The caller supplies a page in a dedicated, approved browser. Never connect to,
// acquire, navigate, close or provision a user's browser or tracker here.
export async function runNavigation(
  page,
  { fixture, identities, approvalReference, mode = "latency" } = {},
) {
  if (!approvalReference)
    throw new Error(
      "Operator live approval is required. A reference records approval; it cannot grant it.",
    );
  for (const id of ["tasks", "quota"]) {
    if (
      !identities?.[id]?.sourceCommit ||
      !identities[id].bundle ||
      identities[id].enabled !== true
    )
      throw new Error("Record both enabled plugins and their source/bundle identities.");
  }
  if (!["latency", "profile"].includes(mode)) throw new Error("Unknown mode.");
  if (
    fixture?.tasks?.length !== 100 ||
    fixture.warmKeys?.length !== 10 ||
    fixture.movements?.length !== 36
  )
    throw new Error("Use the owned 100-task fixture.");
  if (!fixture.owner?.startsWith("bbp60-") || fixture.tasks.some((t) => t.owner !== fixture.owner))
    throw new Error("Fixture ownership mismatch.");
  const source = await readFile(new URL("./probe.mjs", import.meta.url), "utf8");
  const requestCounts = {};
  const onRequest = (request) => {
    const url = new URL(request.url());
    if (!url.pathname.includes("/plugins/") && !url.pathname.includes("/plugin-rpc/")) return;
    let method = "unresolved";
    try {
      const body = JSON.parse(request.postData() ?? "null");
      if (typeof body?.method === "string") method = body.method;
    } catch {
      /* Non-JSON requests stay visible as unresolved. */
    }
    const key = `${request.method()} ${url.pathname} ${method}`;
    requestCounts[key] = (requestCounts[key] ?? 0) + 1;
  };
  let probeInstalled = false;
  let moduleInstalled = false;
  let error = null;
  let run = null;
  // Browser configuration is explicit and local to the caller's owned page.
  await page.setViewportSize({ width: 1440, height: 900 });
  let cdp;
  try {
    cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    if (await page.evaluate(() => Boolean(globalThis.bbp60Probe || globalThis.bbp60Module)))
      throw new Error("Existing benchmark resources must be disposed first.");
    await page.addScriptTag({
      type: "module",
      content: source + "\nglobalThis.bbp60Module = { createProbe, readNativeTicket };",
    });
    moduleInstalled = true;
    await page.waitForFunction(() => Boolean(globalThis.bbp60Module));
    // Check row order before using ArrowUp/Down. Do not sort or reconfigure live views.
    const order = await page
      .locator("[data-task-key]")
      .evaluateAll((rows) => rows.map((row) => row.dataset.taskKey));
    const positions = fixture.warmKeys.map((key) => order.indexOf(key));
    if (positions[0] < 0 || positions.some((p, i) => p !== positions[0] + i))
      throw new Error("The ten fixture tasks must be consecutive in the current visible order.");
    await page.evaluate((mode) => {
      globalThis.bbp60Probe = globalThis.bbp60Module.createProbe({ window, mode });
    }, mode);
    probeInstalled = true;
    const first = fixture.tasks.find((t) => t.key === fixture.warmKeys[0]);
    await page.locator(`[data-task-key="${first.key}"] [data-nav-item]`).click();
    await page.waitForFunction((expected) => {
      const s = globalThis.bbp60Module.readNativeTicket(document);
      return (
        s.rowKey === expected.key &&
        s.detailKey === expected.key &&
        s.heading === expected.title &&
        s.marker === expected.marker &&
        s.rendered &&
        s.visible
      );
    }, first);
    let fromKey = first.key;
    async function move(key, classification) {
      const task = fixture.tasks.find((t) => t.key === key);
      const arrow = order.indexOf(key) > order.indexOf(fromKey) ? "ArrowDown" : "ArrowUp";
      await page.locator(`[data-task-key="${fromKey}"] [data-nav-item]`).focus();
      const before = await page.evaluate(() => globalThis.bbp60Probe.samples.length);
      await page.evaluate((sample) => globalThis.bbp60Probe.arm(sample), {
        fromKey,
        key,
        title: task.title,
        marker: task.marker,
        classification,
      });
      await page.keyboard.press(arrow);
      await page.waitForFunction((n) => globalThis.bbp60Probe.samples.length > n, before, {
        timeout: 10000,
      });
      const sample = await page.evaluate(() => globalThis.bbp60Probe.samples.at(-1));
      if (sample.status !== "presented") throw new Error(`Movement failed: ${sample.reason}`);
      fromKey = key;
    }
    // Visit all ten keys and return to the first. Retain warm-up evidence separately.
    const warmupOrder = fixture.movements.slice(0, 18);
    for (const key of warmupOrder) await move(key, "cold");
    const warmup = await page.evaluate(() => {
      globalThis.bbp60Probe.dispose();
      return globalThis.bbp60Probe.export();
    });
    await page.evaluate((mode) => {
      globalThis.bbp60Probe = globalThis.bbp60Module.createProbe({ window, mode });
    }, mode);
    page.on("request", onRequest);
    for (const key of fixture.movements) await move(key, "warm");
    run = { warmup };
  } catch (e) {
    error = e.message;
  } finally {
    try {
      page.off("request", onRequest);
      if (probeInstalled) {
        const evidence = await page.evaluate(() => {
          globalThis.bbp60Probe.dispose();
          const evidence = globalThis.bbp60Probe.export();
          delete globalThis.bbp60Probe;
          delete globalThis.bbp60Module;
          return evidence;
        });
        run = { ...run, ...evidence };
      } else if (moduleInstalled) {
        await page.evaluate(() => {
          delete globalThis.bbp60Module;
        });
      }
    } finally {
      await cdp?.detach();
    }
  }
  return {
    ...run,
    mode,
    error,
    identities,
    approvalReference,
    fixtureOwner: fixture.owner,
    fixtureSha256: fixtureDigest(fixture),
    requestCounts,
    requestCountLimit:
      "HTTP counts only. Unresolved or batched RPC methods need separate transport/trace inspection.",
    cpuThrottlingRate: 1,
    timingMethod:
      "Captured keydown to second rAF after matching row, heading and rendered description.",
    browser: await page.context().browser()?.version(),
    machine: { platform: process.platform, architecture: process.arch },
  };
}
