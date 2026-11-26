import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLocalHarness } from "./local-lifecycle.mjs";
import { createProbe } from "./probe.mjs";
import { EventEmitter } from "node:events";
import { measureLocalNavigation } from "./local-measurement.mjs";

async function withOutput(run) {
  const root = await mkdtemp(join(tmpdir(), "bbp198-test-"));
  try {
    await run(join(root, "run"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const json = async (output, name) => JSON.parse(await readFile(join(output, name), "utf8"));

function owned(state, failures = []) {
  const calls = [];
  const close = (name) => () =>
    Promise.try(() => {
      calls.push(name);
      if (failures.includes(name)) throw new Error(`${name} rejected`);
    });
  Object.assign(state.resources, {
    cdp: { detach: close("cdp") },
    context: { close: close("context") },
    browser: { close: close("browser") },
    browserServer: { close: close("browserServer") },
    server: {
      close(closed) {
        calls.push("endpoint");
        closed();
      },
    },
    backend: { calls: [{ method: "getTaskByKey" }], dispose: close("database") },
  });
  state.ledger.browser = { pid: 123, endpoint: "owned-browser" };
  state.ledger.server = { endpoint: "owned-loopback" };
  state.ledger.database = "owned.sqlite";
  return calls;
}

test("rejected detach and context close do not skip owned closures or the durable ledger", async () => {
  await withOutput(async (output) => {
    let calls;
    await assert.rejects(
      runLocalHarness({
        output,
        phase: "preview",
        execute: (state) =>
          Promise.try(() => {
            calls = owned(state, ["cdp", "context"]);
          }),
      }),
      /cleanup or evidence failed/,
    );
    assert.deepEqual(calls, ["cdp", "context", "browser", "browserServer", "endpoint", "database"]);
    const ledger = await json(output, "ownership-ledger.json");
    assert.equal(ledger.status, "failed");
    assert.equal(ledger.cleanup.cdp.status, "failed");
    assert.equal(ledger.cleanup.context.status, "failed");
    for (const name of ["browser", "browserServer", "endpoint", "database"]) {
      assert.equal(ledger.cleanup[name].status, "closed");
    }
    assert.equal(ledger.browser.pid, 123);
    assert.equal(ledger.database, "owned.sqlite");
    await assert.rejects(readFile(join(output, "result.json")), { code: "ENOENT" });
    const result2 = await json(output, "failure.json");
    assert.match(result2.outcomes.cleanup.cdp.error, /cdp rejected/);
  });
});

test("capture/write failures retain the original error and still close every handle", async () => {
  await withOutput(async (output) => {
    const original = new Error("original movement failure");
    let calls;
    await assert.rejects(
      runLocalHarness({
        output,
        phase: "profile",
        execute: async (state) => {
          calls = owned(state, ["cdp", "browserServer", "database"]);
          state.resources.page = {
            isClosed: () => false,
            evaluate: () =>
              Promise.try(() => {
                throw new Error("page unavailable");
              }),
            screenshot: () =>
              Promise.try(() => {
                throw new Error("screenshot unavailable");
              }),
          };
          // The exclusive evidence write must fail rather than replace an existing file.
          await writeFile(join(output, "browser-evidence.json"), "retained");
          throw original;
        },
      }),
      (error) => error === original,
    );
    assert.deepEqual(calls, ["cdp", "context", "browser", "browserServer", "endpoint", "database"]);
    assert.equal(await readFile(join(output, "browser-evidence.json"), "utf8"), "retained");
    const ledger = await json(output, "ownership-ledger.json");
    assert.match(ledger.originalFailure, /original movement failure/);
    assert.equal(ledger.captures["browser-evidence.json"].status, "failed");
    assert.equal(ledger.captures["partial-raw.json"].status, "failed");
    assert.equal(ledger.captures["partial-cpu-profile.json"].status, "unavailable");
    assert.equal(ledger.cleanup.database.status, "failed");
    assert.equal(ledger.cleanup.ui.status, "failed");
  });
});

function navigationPage({ failAt = 4, failure = "identity", closed = false } = {}) {
  let time = 0,
    listener,
    armed,
    movement = 0;
  let identity = { rowKey: "BENCH-1", detailKey: "BENCH-1" };
  const frames = [],
    observations = [];
  const fixture = {
    tasks: [2, 3].map((n) => ({ key: `BENCH-${n}`, title: `title ${n}`, marker: `marker ${n}` })),
    movements: ["BENCH-2", "BENCH-3"],
  };
  const win = {
    innerWidth: 1440,
    innerHeight: 900,
    performance: { now: () => time },
    requestAnimationFrame: (onFrame) => frames.push(onFrame),
    addEventListener: (_, onEvent) => {
      listener = onEvent;
    },
    removeEventListener() {},
    PerformanceObserver: class {
      static supportedEntryTypes = ["longtask", "resource"];
      observe({ type }) {
        this.type = type;
        observations.push(this);
      }
      takeRecords() {
        return [{ name: this.type, startTime: time, duration: 2 }];
      }
      disconnect() {}
    },
  };
  const lab = {
    fixture,
    read: () => identity,
    qualification: {
      settle() {},
      ledger: {
        inspect: (key) => ({ key, classification: "warm", current: true }),
        qualify: (before) => ({ ...before }),
        export: () => ({ requests: ["earlier", "failed"] }),
      },
    },
    startProbe(mode) {
      this.probe?.dispose();
      this.probe = createProbe({ window: win, read: () => identity, mode });
      const arm = this.probe.arm;
      this.probe.arm = (sample) => {
        armed = sample;
        arm(sample);
      };
    },
    dispose() {
      this.probe?.dispose();
    },
  };
  const evaluate = async (fn, arg) => {
    globalThis.window = { lab };
    globalThis.document = { querySelectorAll: () => [], querySelector: () => null };
    try {
      return await fn(arg);
    } finally {
      delete globalThis.window;
      delete globalThis.document;
    }
  };
  const page = {
    isClosed: () => closed && movement === failAt,
    evaluate,
    screenshot: async () => {},
    locator: () => ({ focus: async () => {} }),
    keyboard: {
      press(key) {
        return Promise.try(() => {
          movement++;
          listener({ key, target: {} });
          identity = {
            rowKey: armed.key,
            detailKey: armed.key,
            heading: armed.title,
            marker: armed.marker,
            rendered: true,
            visible: true,
          };
          if (movement === failAt && failure === "timeout") return;
          time += 16;
          frames.shift()();
          if (movement === failAt) identity.detailKey = "wrong";
          time += 16;
          frames.shift()();
        });
      },
    },
    async waitForFunction(fn, arg) {
      if (!(await evaluate(fn, arg))) throw new Error("Driver timeout");
    },
  };
  return { page, fixture };
}

for (const failure of ["identity", "timeout"]) {
  test(`failed ${failure} movement retains excluded warmups, prior/failed samples and partial observations`, async () => {
    await withOutput(async (output) => {
      await assert.rejects(
        runLocalHarness({
          output,
          phase: "profile",
          execute: async (state) => {
            owned(state);
            const { page, fixture } = navigationPage({ failure });
            state.resources.page = page;
            const cdp = (state.resources.cdp = Object.assign(new EventEmitter(), {
              detach: async () => {},
              send(method) {
                return Promise.try(() => {
                  if (method === "Tracing.start")
                    this.emit("Tracing.dataCollected", { value: [{ name: "retained-event" }] });
                  if (method === "Tracing.end") this.emit("Tracing.tracingComplete");
                  if (method === "Profiler.stop") {
                    if (failure === "identity") return { profile: { nodes: [{ id: 1 }] } };
                    throw new Error("Profile unavailable");
                  }
                });
              },
            }));
            await measureLocalNavigation({ page, cdp, fixture, phase: "profile", ...state });
          },
        }),
        failure === "identity" ? /Movement failed/ : /Driver timeout/,
      );
      const result2 = await json(output, "warmup.json");
      assert.equal(result2.length, 2);
      const result3 = await json(output, "warmup-raw.json");
      assert.deepEqual(
        result3.samples.map((s) => s.key),
        ["BENCH-2", "BENCH-3"],
      );
      const raw = await json(output, "partial-raw.json");
      assert.deepEqual(
        raw.samples.map((s) => s.status),
        ["presented", "failed"],
      );
      assert.equal(raw.requests[0].name, "resource");
      assert.equal(raw.longTasks[0].name, "longtask");
      const movements = await json(output, "partial-movements.json");
      assert.equal(movements.stage, "measured");
      assert.equal(movements.movements[0].sample.key, "BENCH-2");
      assert.equal(movements.activeMovement.key, "BENCH-3");
      assert.equal(movements.activeMovement.before.current, true);
      if (failure === "identity")
        assert.equal(movements.activeMovement.result.sample.status, "failed");
      const result4 = await json(output, "partial-qualification.json");
      assert.deepEqual(result4.requests, ["earlier", "failed"]);
      const result5 = await json(output, "partial-timeline.json");
      assert.equal(result5.traceEvents[0].name, "retained-event");
      const ledger = await json(output, "ownership-ledger.json");
      if (failure === "identity") {
        assert.equal(ledger.captures["partial-cpu-profile.json"].status, "saved");
        const result6 = await json(output, "partial-cpu-profile.json");
        assert.deepEqual(result6.nodes, [{ id: 1 }]);
      } else {
        assert.equal(ledger.captures["partial-cpu-profile.json"].status, "failed");
        assert.match(ledger.captures["partial-cpu-profile.json"].error, /Profile unavailable/);
      }
      assert.equal(ledger.cleanup.database.status, "closed");
      await assert.rejects(readFile(join(output, "summary.json")), { code: "ENOENT" });
      await assert.rejects(readFile(join(output, "result.json")), { code: "ENOENT" });
    });
  });
}

test("warmup failure retains earlier and failed samples without starting a measured interval", async () => {
  await withOutput(async (output) => {
    await assert.rejects(
      runLocalHarness({
        output,
        phase: "latency",
        execute: async (state) => {
          owned(state);
          const { page, fixture } = navigationPage({ failAt: 2 });
          state.resources.page = page;
          await measureLocalNavigation({ page, fixture, phase: "latency", ...state });
        },
      }),
      /Movement failed/,
    );
    const partial = await json(output, "partial-movements.json");
    assert.equal(partial.stage, "warmup");
    assert.equal(partial.warmup.length, 1);
    assert.equal(partial.movements.length, 0);
    const result = await json(output, "partial-raw.json");
    assert.deepEqual(
      result.samples.map((s) => s.status),
      ["presented", "failed"],
    );
    await assert.rejects(readFile(join(output, "warmup-raw.json")), { code: "ENOENT" });
  });
});

test("page closure records unavailable captures but preserves driver history and closes remaining resources", async () => {
  await withOutput(async (output) => {
    await assert.rejects(
      runLocalHarness({
        output,
        phase: "latency",
        execute: async (state) => {
          owned(state, ["cdp"]);
          const { page, fixture } = navigationPage({ failAt: 4, closed: true });
          state.resources.page = page;
          await measureLocalNavigation({ page, fixture, phase: "latency", ...state });
        },
      }),
      /Movement failed/,
    );
    const ledger = await json(output, "ownership-ledger.json");
    for (const name of [
      "partial-raw.json",
      "partial-qualification.json",
      "failed-ui.png",
      "failed-dom.json",
    ]) {
      assert.equal(ledger.captures[name].status, "unavailable");
    }
    const result = await json(output, "partial-movements.json");
    assert.equal(result.movements.length, 1);
    const result2 = await json(output, "warmup-raw.json");
    assert.equal(result2.samples.length, 2);
    assert.equal(ledger.cleanup.database.status, "closed");
  });
});

test("failure after a successful measurement never overwrites raw artifacts or ranks an incomplete run", async () => {
  await withOutput(async (output) => {
    await assert.rejects(
      runLocalHarness({
        output,
        phase: "latency",
        execute: async (state) => {
          owned(state);
          const { page, fixture } = navigationPage({ failAt: 99 });
          state.resources.page = page;
          await measureLocalNavigation({ page, fixture, phase: "latency", ...state });
          throw new Error("Later case failed");
        },
      }),
      /Later case failed/,
    );
    const result2 = await json(output, "raw.json");
    assert.deepEqual(
      result2.samples.map((s) => s.status),
      ["presented", "presented"],
    );
    const result3 = await json(output, "movements.json");
    assert.equal(result3.length, 2);
    const result4 = await json(output, "partial-movements.json");
    assert.equal(result4.stage, "cases");
    await assert.rejects(readFile(join(output, "summary.json")), { code: "ENOENT" });
    await assert.rejects(readFile(join(output, "result.json")), { code: "ENOENT" });
  });
});
test("an endpoint close error does not skip database closure or ledger persistence", async () => {
  await withOutput(async (output) => {
    await assert.rejects(
      runLocalHarness({
        output,
        phase: "preview",
        execute: (state) =>
          Promise.try(() => {
            owned(state);
            state.resources.server.close = (closed) => closed(new Error("endpoint rejected"));
          }),
      }),
      /cleanup or evidence failed/,
    );
    const ledger = await json(output, "ownership-ledger.json");
    assert.equal(ledger.cleanup.endpoint.status, "failed");
    assert.equal(ledger.cleanup.database.status, "closed");
    assert.equal(ledger.status, "failed");
  });
});

test("ledger write failure is reported only after all owned closures and prevents completion", async () => {
  await withOutput(async (output) => {
    let calls;
    await assert.rejects(
      runLocalHarness({
        output,
        phase: "preview",
        execute: async (state) => {
          calls = owned(state);
          await rm(join(output, "ownership-ledger.json"));
          await mkdir(join(output, "ownership-ledger.json"));
        },
      }),
      (error) => error.errors.some((cause) => cause.code === "EISDIR"),
    );
    assert.deepEqual(calls, ["cdp", "context", "browser", "browserServer", "endpoint", "database"]);
    const result2 = await json(output, "result.json");
    assert.equal(result2.status, "prepared");
    const result3 = await json(output, "failure.json");
    assert.match(result3.ledger.persistence.error, /EISDIR/);
  });
});
function latencyEvidence(state) {
  state.evidence.raw = {
    mode: "latency",
    samples: Array.from({ length: 30 }, () => ({
      classification: "warm",
      status: "presented",
      key: "BENCH-2",
      rowKey: "BENCH-2",
      detailKey: "BENCH-2",
      latencyMs: 20,
      blankMs: 0,
    })),
  };
}

for (const obstruction of ["result", "ledger"]) {
  test(`late ${obstruction} publication failure retains failure evidence without a committed warm summary`, async () => {
    await withOutput(async (output) => {
      let calls;
      await assert.rejects(
        runLocalHarness({
          output,
          phase: "latency",
          execute: async (state) => {
            calls = owned(state);
            latencyEvidence(state);
            if (obstruction === "ledger") await rm(join(output, "ownership-ledger.json"));
            await mkdir(
              join(output, obstruction === "ledger" ? "ownership-ledger.json" : "result.json"),
            );
          },
        }),
        /cleanup or evidence failed/,
      );
      assert.deepEqual(calls, [
        "cdp",
        "context",
        "browser",
        "browserServer",
        "endpoint",
        "database",
      ]);
      const failure = await json(output, "failure.json");
      assert.equal(failure.status, "BLOCKED");
      assert.equal(failure.ledger.status, "failed");
      assert.equal(failure.ledger.summary, undefined);
      if (obstruction === "result") {
        const ledger = await json(output, "ownership-ledger.json");
        assert.equal(ledger.captures["result.json"].status, "failed");
        assert.equal(ledger.captures["failure.json"].status, "saved");
        assert.equal(ledger.summary, undefined);
      } else {
        assert.match(failure.ledger.persistence.error, /EISDIR/);
        const result2 = await json(output, "result.json");
        assert.equal(result2.status, "prepared");
      }
      await assert.rejects(readFile(join(output, "summary.json")), { code: "ENOENT" });
    });
  });
}

test("successful terminal ledger commits ranking and the actual prepared result outcome", async () => {
  await withOutput(async (output) => {
    const returned = await runLocalHarness({
      output,
      phase: "latency",
      execute: (state) =>
        Promise.try(() => {
          owned(state);
          latencyEvidence(state);
        }),
    });
    const ledger = await json(output, "ownership-ledger.json");
    const result = await json(output, "result.json");
    assert.equal(result.status, "prepared");
    assert.equal(result.completionArtifact, "ownership-ledger.json");
    assert.equal(result.run, ledger.run);
    assert.equal(ledger.status, "completed");
    assert.equal(ledger.captures["result.json"].status, "saved");
    assert.equal(ledger.summary.warm.count, 30);
    assert.deepEqual(ledger, returned);
    await assert.rejects(readFile(join(output, "summary.json")), { code: "ENOENT" });
    await assert.rejects(readFile(join(output, "failure.json")), { code: "ENOENT" });
  });
});
test("late ledger failure preserves the original failure and adds outcomes without overwriting failure evidence", async () => {
  await withOutput(async (output) => {
    const original = new Error("original execution failure");
    await assert.rejects(
      runLocalHarness({
        output,
        phase: "latency",
        execute: async (state) => {
          owned(state);
          await rm(join(output, "ownership-ledger.json"));
          await mkdir(join(output, "ownership-ledger.json"));
          throw original;
        },
      }),
      (error) => error === original,
    );
    const first = await json(output, "failure.json");
    const late = await json(output, "terminal-failure.json");
    assert.match(first.error, /original execution failure/);
    assert.equal(first.ledger.persistence, undefined);
    assert.match(late.error, /original execution failure/);
    assert.match(late.ledger.persistence.error, /EISDIR/);
    assert.equal(late.ledger.captures["failure.json"].status, "saved");
    assert.equal(late.ledger.summary, undefined);
  });
});

test("a successful run writes completion only after exact cleanup and refuses output reuse", async () => {
  await withOutput(async (output) => {
    await runLocalHarness({
      output,
      phase: "preview",
      execute: (state) =>
        Promise.try(() => {
          owned(state);
        }),
    });
    const result2 = await json(output, "result.json");
    assert.equal(result2.status, "prepared");
    const result3 = await json(output, "ownership-ledger.json");
    assert.equal(result3.status, "completed");
    await assert.rejects(runLocalHarness({ output, phase: "preview", execute: async () => {} }), {
      code: "EEXIST",
    });
  });
});
