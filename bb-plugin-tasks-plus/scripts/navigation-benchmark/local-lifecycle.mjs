// Navigation lab evidence and exact handle ownership. No retry or resource discovery.
import { mkdir, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { summarize } from "./report.mjs";

const errorText = (error) => error?.stack ?? String(error);

export async function runLocalHarness({ output, phase, execute }) {
  output = resolve(output);
  await mkdir(output, { mode: 0o700 }); // Never merge or overwrite a run.
  const ledger = {
    owner: "tasks-navigation-local-harness",
    run: randomUUID(),
    output,
    phase,
    processPid: process.pid,
    server: null,
    browser: null,
    database: null,
    cleanup: {},
    captures: {},
    status: "running",
  };
  const resources = {};
  const evidence = {
    warmup: [],
    movements: [],
    activeMovement: null,
    stage: "setup",
    traceEvents: [],
    profilerRunning: false,
    tracingRunning: false,
    provenance: null,
    consoleErrors: [],
    requests: [],
    blocked: [],
  };
  const errors = [];
  const saveLedger = async () => {
    // A failed write cannot truncate the last ownership record or commit completion.
    const pending = join(output, `.ownership-ledger-${randomUUID()}.json`);
    await writeFile(pending, JSON.stringify(ledger, null, 2) + "\n", { flag: "wx" });
    await rename(pending, join(output, "ownership-ledger.json"));
    // On failure retain the exact pending file. Do not retry or delete evidence.
  };
  const write = async (name, value) => {
    try {
      await writeFile(
        join(output, name),
        typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n",
        { flag: "wx" },
      );
      ledger.captures[name] = { status: "saved" };
    } catch (error) {
      ledger.captures[name] = { status: "failed", error: errorText(error) };
      throw error;
    }
  };
  // Each capture is independent, including failed writes. Missing browser state is explicit.
  const capture = async (
    name,
    read,
    available = true,
    reason = "Not acquired or no longer available",
  ) => {
    if (!available) {
      ledger.captures[name] = { status: "unavailable", reason };
      return;
    }
    try {
      const value = await read();
      if (value === undefined) {
        ledger.captures[name] = { status: "unavailable", reason: "Lab evidence not initialized" };
        return;
      }
      await write(name, value);
    } catch (error) {
      ledger.captures[name] = { status: "failed", error: errorText(error) };
      errors.push(error);
    }
  };
  let original;
  try {
    await saveLedger();
    await execute({ output, ledger, resources, evidence, write, saveLedger });
  } catch (error) {
    original = error;
    ledger.originalFailure = errorText(error);
    const { page, cdp } = resources;
    const livePage = Boolean(page && !page.isClosed());
    await capture("partial-movements.json", () => ({
      stage: evidence.stage,
      warmup: evidence.warmup,
      movements: evidence.movements,
      activeMovement: evidence.activeMovement,
    }));
    await capture(
      "partial-raw.json",
      () =>
        page.evaluate(() => {
          const probe = window.lab?.probe;
          if (!probe) return undefined;
          probe.dispose(); // Flush queued observations and finish an interrupted sample before export.
          return probe.export();
        }),
      livePage,
    );
    await capture(
      "partial-qualification.json",
      () => page.evaluate(() => window.lab?.qualification.ledger.export()),
      livePage,
    );
    if (!livePage)
      ledger.captures["failed-ui.png"] = { status: "unavailable", reason: "No live page" };
    else {
      try {
        await page.screenshot({ path: join(output, "failed-ui.png") });
        ledger.captures["failed-ui.png"] = { status: "saved" };
      } catch (error) {
        ledger.captures["failed-ui.png"] = { status: "failed", error: errorText(error) };
        errors.push(error);
      }
    }
    await capture(
      "failed-dom.json",
      () =>
        page.evaluate(() => ({
          state: window.lab?.read?.(),
          qualification: window.lab?.qualification.ledger.export(),
          fixtureTask: window.lab?.fixture.tasks[0],
          navigation: window.lab?.slot?.inspection.navigateCalls,
          order: [...document.querySelectorAll("[data-task-key]")].map((row) =>
            row.getAttribute("data-task-key"),
          ),
          detailHtml: document.querySelector("[data-detail-key]")?.outerHTML,
          descriptionText: document.querySelector(".bb-tasks-editor[data-variant=doc] .tiptap")
            ?.textContent,
        })),
      livePage,
    );
    // Stop each active profile once. Retain the collected timeline even if stopping fails.
    await capture(
      "partial-cpu-profile.json",
      async () => {
        if (evidence.cpuProfile) return evidence.cpuProfile;
        evidence.profilerRunning = false;
        return (await cdp.send("Profiler.stop")).profile;
      },
      Boolean(evidence.cpuProfile || (cdp && evidence.profilerRunning)),
      "Profiler was not running or already stopped; see successful profile artifact if saved",
    );
    if (cdp && evidence.tracingRunning) {
      await capture("partial-trace-stop.json", async () => {
        await stopLocalTrace(cdp, evidence);
        return { status: "stopped" };
      });
    }
    await capture(
      "partial-timeline.json",
      () => ({ traceEvents: evidence.traceEvents }),
      phase === "profile",
    );
  } finally {
    await capture("browser-evidence.json", () => ({
      consoleErrors: evidence.consoleErrors,
      requests: evidence.requests,
      blocked: evidence.blocked,
    }));
    await capture("rpc-calls.json", () => resources.backend.calls, Boolean(resources.backend));
    const { page, cdp, context, browser, browserServer, server, backend } = resources;
    const closures = [
      ["ui", page && !page.isClosed(), () => page.evaluate(() => window.lab?.dispose())],
      ["cdp", cdp, () => cdp.detach()],
      ["context", context, () => context.close()],
      ["browser", browser, () => browser.close()],
      ["browserServer", browserServer, () => browserServer.close()],
      [
        "endpoint",
        server,
        () =>
          new Promise((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ],
      ["database", backend, () => backend.dispose()],
    ];
    for (const [name, acquired, close] of closures) {
      if (!acquired) {
        ledger.cleanup[name] = { status: "not-acquired-or-already-closed" };
        continue;
      }
      try {
        await close();
        ledger.cleanup[name] = { status: "closed" };
      } catch (error) {
        ledger.cleanup[name] = { status: "failed", error: errorText(error) };
        errors.push(error);
      }
    }
    ledger.cleanup.contextClosed = ledger.cleanup.context.status === "closed";
    ledger.cleanup.browserClosed =
      ledger.cleanup.browser.status === "closed" &&
      ledger.cleanup.browserServer.status === "closed";
    ledger.cleanup.endpointClosed = ledger.cleanup.endpoint.status === "closed";
    ledger.cleanup.databaseClosed = ledger.cleanup.database.status === "closed";
    // result.json prepares evidence; only the final ownership ledger commits it.
    // Keep the warm summary in that same commit, never in a standalone ranking file.
    if (!original && !errors.length) {
      try {
        if (phase === "latency" && evidence.raw) ledger.summary = summarize(evidence.raw);
        await write("result.json", {
          status: "prepared",
          run: ledger.run,
          completionArtifact: "ownership-ledger.json",
          phase,
          provenance: evidence.provenance,
        });
      } catch (error) {
        ledger.terminalError = errorText(error);
        errors.push(error);
      }
    }
    ledger.status = original || errors.length ? "failed" : "completed";
    const publishFailure = async (name) => {
      ledger.status = "failed";
      delete ledger.summary;
      await capture(name, () => ({
        status: "BLOCKED",
        error: ledger.originalFailure ?? errorText(errors[0]),
        sourceCommit: ledger.sourceCommit,
        dirtyState: ledger.dirtyState,
        provenance: evidence.provenance,
        ledger: structuredClone(ledger),
        outcomes: { cleanup: ledger.cleanup, captures: { ...ledger.captures } },
      }));
    };
    const alreadyFailed = ledger.status === "failed";
    if (alreadyFailed) await publishFailure("failure.json");
    try {
      await saveLedger(); // Includes the actual result/failure publication outcome.
    } catch (error) {
      errors.push(error);
      ledger.persistence = { status: "failed", error: errorText(error) };
      // An earlier failure artifact is immutable. Add late persistence evidence separately.
      await publishFailure(alreadyFailed ? "terminal-failure.json" : "failure.json");
    }
  }
  if (original) throw original;
  if (errors.length) throw new AggregateError(errors, "Local harness cleanup or evidence failed");
  return ledger;
}

export async function stopLocalTrace(cdp, evidence) {
  evidence.tracingRunning = false;
  let timer, complete;
  const ended = new Promise((resolve, reject) => {
    complete = resolve;
    cdp.once("Tracing.tracingComplete", complete);
    timer = setTimeout(
      () => reject(new Error("Trace completion unavailable after 10 seconds")),
      10000,
    );
  });
  // Observe the timeout even if the command itself rejects.
  ended.catch(() => {});
  try {
    await cdp.send("Tracing.end");
    await ended;
  } finally {
    clearTimeout(timer);
    cdp.off("Tracing.tracingComplete", complete);
  }
}
