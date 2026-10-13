// Qualified navigation only. The lifecycle owner captures partial state before disposal.
import { stopLocalTrace } from "./local-lifecycle.mjs";

export async function measureLocalNavigation({
  page,
  cdp,
  fixture,
  phase,
  evidence,
  write,
  provenance,
}) {
  const mode = phase === "profile" ? "profile" : "latency";
  const { warmup, movements, traceEvents } = evidence;
  await page.evaluate((mode) => window.lab.startProbe(mode), mode);
  evidence.stage = "warmup";
  let fromKey = "BENCH-1";
  async function move(key, classification) {
    const attempt = (evidence.activeMovement = { key, fromKey, classification });
    try {
      await page.evaluate(() => window.lab.qualification.settle());
      const before = await page.evaluate(
        (key) => window.lab.qualification.ledger.inspect(key),
        key,
      );
      attempt.before = before;
      if (classification === "observed") classification = before.classification;
      attempt.classification = classification;
      if (classification === "warm" && !before.current)
        throw new Error("Unqualified destination " + key);
      const n = await page.evaluate(() => window.lab.probe.samples.length);
      await page.locator(`[data-task-key="${fromKey}"] [data-nav-item]`).focus();
      await page.evaluate(
        ({ key, fromKey, classification }) => {
          const task = window.lab.fixture.tasks.find((t) => t.key === key);
          window.lab.probe.arm({
            key,
            fromKey,
            title: task.title,
            marker: task.marker,
            classification,
          });
        },
        { key, fromKey, classification },
      );
      await page.keyboard.press(
        Number(key.split("-")[1]) > Number(fromKey.split("-")[1]) ? "ArrowDown" : "ArrowUp",
      );
      await page.waitForFunction((n) => window.lab.probe.samples.length > n, n, { timeout: 10000 });
      await page.evaluate(() => window.lab.qualification.settle());
      const result = await page.evaluate(
        (before) => ({
          sample: window.lab.probe.samples.at(-1),
          qualification: window.lab.qualification.ledger.qualify(before),
          identity: window.lab.read(),
        }),
        before,
      );
      attempt.result = result;
      if (
        result.sample.status !== "presented" ||
        !result.identity.rendered ||
        result.identity.detailKey !== key
      )
        throw new Error("Movement failed " + JSON.stringify(result));
      if (classification === "warm" && result.qualification.classification !== "warm")
        throw new Error("Movement invalidated");
      fromKey = key;
      evidence.activeMovement = null;
      return result;
    } catch (error) {
      attempt.error = error.stack ?? String(error);
      throw error;
    }
  }
  for (const key of fixture.movements.slice(0, 18)) warmup.push(await move(key, "observed"));
  // Persist the excluded interval before startProbe destroys/replaces its observers.
  const warmupRaw = await page.evaluate(() => {
    window.lab.probe.dispose();
    return window.lab.probe.export();
  });
  await write("warmup.json", warmup);
  await write("warmup-raw.json", warmupRaw);
  await page.evaluate((mode) => window.lab.startProbe(mode), mode);
  evidence.stage = "measured";
  if (phase === "profile") {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    evidence.profilerRunning = true;
    cdp.on("Tracing.dataCollected", (event) => traceEvents.push(...event.value));
    await cdp.send("Tracing.start", {
      categories: "devtools.timeline,blink.user_timing,v8",
      transferMode: "ReportEvents",
    });
    evidence.tracingRunning = true;
  }
  for (const key of fixture.movements) movements.push(await move(key, "warm"));
  if (phase === "profile") {
    evidence.profilerRunning = false;
    const profile = (await cdp.send("Profiler.stop")).profile;
    evidence.cpuProfile = profile;
    await write("cpu-profile.json", profile);
    await stopLocalTrace(cdp, evidence);
    await write("timeline.json", { traceEvents });
  }
  const raw = await page.evaluate(() => {
    window.lab.probe.dispose();
    return window.lab.probe.export();
  });
  const qualification = await page.evaluate(() => window.lab.qualification.ledger.export());
  await write("movements.json", movements);
  await write("qualification.json", qualification);
  await write("raw.json", { ...raw, provenance });
  evidence.raw = raw;
  evidence.stage = "cases";
  return move;
}
