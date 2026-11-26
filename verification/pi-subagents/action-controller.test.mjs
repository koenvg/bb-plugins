import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { controlAction } from "./action-controller.mjs";

const flush = async () => {
  await Array.fromAsync(
    Array.from({ length: 12 }, (_, index) => index),
    async () => {
      await Promise.resolve();
    },
  );
};
function clock() {
  let time = 0;
  let next = 0;
  const timers = new Map();
  return {
    now: () => time,
    jumpWithoutTimers: (to) => {
      time = to;
    },
    later: (fn, ms) => {
      const id = ++next;
      timers.set(id, { at: time + ms, fn });
      return id;
    },
    cancel: (id) => timers.delete(id),
    async advance(to) {
      {
        const runStep = async () => {
          const due = [...timers.entries()]
            .filter(([, t]) => t.at <= to)
            .sort((a, b) => a[1].at - b[1].at)[0];
          if (!due) return { kind: "break" };
          time = due[1].at;
          timers.delete(due[0]);
          due[1].fn();
          await flush();
        };
        for await (const stepResult of (async function* () {
          while (true) yield runStep();
        })()) {
          if (stepResult?.kind === "break") break;
        }
      }
      time = to;
      await flush();
    },
  };
}
const normal = {
  threadId: "thr_owned",
  nativeSettlement: "completed",
  parentResponse: "completed",
};

test("stops on the reserved deadline even when dispatch has not acknowledged", async () => {
  const c = clock();
  const calls = [];
  let acknowledge;
  const result = controlAction({
    threadId: "thr_owned",
    limitMs: 100,
    stopReserveMs: 20,
    clock: c,
    dispatch: () =>
      (() => {
        const { promise, resolve } = Promise.withResolvers();
        acknowledge = resolve;
        return promise;
      })(),
    completion: Promise.withResolvers().promise,
    acceptCompletion: () => true,
    stop: () =>
      Promise.try(() => {
        calls.push(c.now());
      }),
    verifyAbsence: () => Promise.resolve(true),
  });
  await c.advance(80);
  assert.deepEqual(calls, [80]);
  acknowledge();
  const r = await result;
  assert.equal(r.outcome, "deadline-stop");
  assert.equal(r.timelyCleanup, true);
});

test("child output without normal settlement and parent response is not successful completion", async () => {
  const c = clock();
  const r = await controlAction({
    threadId: "thr_owned",
    limitMs: 100,
    stopReserveMs: 20,
    clock: c,
    dispatch: async () => {},
    completion: Promise.resolve({ threadId: "thr_owned", finalOutput: "captured" }),
    acceptCompletion: (receipt) =>
      receipt.threadId === normal.threadId &&
      receipt.nativeSettlement === normal.nativeSettlement &&
      receipt.parentResponse === normal.parentResponse,
    stop: async () => {},
    verifyAbsence: () => Promise.resolve(true),
  });
  assert.equal(r.outcome, "failed");
  assert.equal(r.timelyCleanup, true);
});

test("a stuck cleanup is aborted at the action limit and is never reported timely", async () => {
  const c = clock();
  let cleanupSignal;
  const result = controlAction({
    threadId: "thr_owned",
    limitMs: 100,
    stopReserveMs: 20,
    clock: c,
    dispatch: async () => {},
    completion: Promise.withResolvers().promise,
    acceptCompletion: () => true,
    stop: async ({ signal }) => {
      cleanupSignal = signal;
      await Promise.withResolvers().promise;
    },
    verifyAbsence: () => Promise.resolve(true),
  });
  await c.advance(100);
  assert.equal(cleanupSignal?.aborted, true);
  const r = await result;
  assert.equal(r.cleanup, "deadline-exceeded");
  assert.equal(r.timelyCleanup, false);
});

test("invalid thread scope or deadline is rejected before dispatch or stop", async () => {
  await Array.fromAsync(
    [{ threadId: "foreign thread" }, { limitMs: 0 }, { stopReserveMs: 100 }, { limitMs: Infinity }],
    async (overrides) => {
      let called = false;
      await assert.rejects(
        controlAction({
          threadId: "thr_owned",
          limitMs: 100,
          stopReserveMs: 20,
          clock: clock(),
          dispatch: () =>
            Promise.try(() => {
              called = true;
            }),
          completion: Promise.resolve(normal),
          acceptCompletion: () => true,
          stop: () =>
            Promise.try(() => {
              called = true;
            }),
          verifyAbsence: () => Promise.resolve(true),
          ...overrides,
        }),
        /scope|deadline/,
      );
      assert.equal(called, false);
    },
  );
});

test("valid normal completion stops once, verifies absence and cancels later timers", async () => {
  const c = clock();
  let stops = 0;
  const r = await controlAction({
    threadId: "thr_owned",
    limitMs: 100,
    stopReserveMs: 20,
    clock: c,
    dispatch: async () => {},
    completion: Promise.resolve(normal),
    acceptCompletion: (receipt) => receipt === normal,
    stop: (input) =>
      Promise.try(({ threadId }) => {
        assert.equal(threadId, "thr_owned");
        stops++;
      }, input),
    verifyAbsence: () => Promise.resolve(true),
  });
  await c.advance(200);
  assert.equal(stops, 1);
  assert.equal(r.passed, true);
});

test("dispatch rejection still performs owned cleanup and cannot pass", async () => {
  let stopped = false;
  const r = await controlAction({
    threadId: "thr_owned",
    limitMs: 100,
    stopReserveMs: 20,
    clock: clock(),
    dispatch: () =>
      Promise.try(() => {
        throw new Error("fixture error");
      }),
    completion: Promise.resolve(normal),
    acceptCompletion: () => true,
    stop: () =>
      Promise.try(() => {
        stopped = true;
      }),
    verifyAbsence: () => Promise.resolve(true),
  });
  assert.equal(stopped, true);
  assert.equal(r.outcome, "failed");
  assert.equal(r.passed, false);
});

test("a failed stop or unproved absence cannot become a cleanup pass", async () => {
  await Array.fromAsync([true, false], async (failStop) => {
    const r = await controlAction({
      threadId: "thr_owned",
      limitMs: 100,
      stopReserveMs: 20,
      clock: clock(),
      dispatch: async () => {},
      completion: Promise.resolve(normal),
      acceptCompletion: () => true,
      stop: () =>
        Promise.try(() => {
          if (failStop) throw new Error("stop unavailable");
        }),
      verifyAbsence: () => Promise.resolve(false),
    });
    assert.equal(r.passed, false);
    assert.equal(r.timelyCleanup, false);
    assert.equal(r.cleanup, failStop ? "failed" : "absence-unproved");
  });
});

test("late completion cannot rewrite an already stopped action", async () => {
  const c = clock();
  let finish;
  let stops = 0;
  const result = controlAction({
    threadId: "thr_owned",
    limitMs: 100,
    stopReserveMs: 20,
    clock: c,
    dispatch: async () => {},
    completion: (() => {
      const { promise, resolve } = Promise.withResolvers();
      finish = resolve;
      return promise;
    })(),
    acceptCompletion: () => true,
    stop: () =>
      Promise.try(() => {
        stops++;
      }),
    verifyAbsence: () => Promise.resolve(true),
  });
  await c.advance(80);
  const r = await result;
  finish(normal);
  await c.advance(200);
  assert.equal(stops, 1);
  assert.equal(r.outcome, "deadline-stop");
  assert.equal(r.passed, false);
});

test("a separate Node controller keeps its deadline while the caller is blocked", async () => {
  const moduleUrl = new URL("./action-controller.mjs", import.meta.url).href;
  const source = `import {controlAction} from ${JSON.stringify(moduleUrl)};
    const result = controlAction({ threadId:'thr_fixture', limitMs:3000, stopReserveMs:2800,
      dispatch:async()=>{}, completion:new Promise(()=>{}), acceptCompletion:()=>true,
      stop:async()=>{}, verifyAbsence:async()=>true });
    console.log('armed'); console.log(JSON.stringify(await result));`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", source], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let blocked = false;
  let errors = "";
  child.stderr.on("data", (chunk) => {
    errors += chunk;
  });
  child.stdout.on("data", (chunk) => {
    output += chunk;
    if (!blocked && output.includes("armed\n")) {
      blocked = true;
      const until = performance.now() + 500;
      while (performance.now() < until) {
        /* Simulate a busy caller, not the watchdog. */
      }
    }
  });
  const code = await (() => {
    const { promise, resolve, reject } = Promise.withResolvers();
    try {
      child.once("error", reject);
      child.once("close", resolve);
    } catch (setupError) {
      reject(setupError);
    }
    return promise;
  })();
  assert.equal(code, 0, errors);
  const r = JSON.parse(output.trim().split("\n").at(-1));
  assert.equal(blocked, true);
  assert.equal(r.outcome, "deadline-stop");
  assert.equal(r.timelyCleanup, true);
  assert.ok(r.elapsedMs < 3000);
});

test("completion failure stops even if the dispatch acknowledgement is still pending", async () => {
  const c = clock();
  let stops = 0;
  const result = controlAction({
    threadId: "thr_owned",
    limitMs: 100,
    stopReserveMs: 20,
    clock: c,
    dispatch: () => Promise.withResolvers().promise,
    completion: Promise.reject(new Error("observer failed")),
    acceptCompletion: () => true,
    stop: () =>
      Promise.try(() => {
        stops++;
      }),
    verifyAbsence: () => Promise.resolve(true),
  });
  await flush();
  assert.equal(stops, 1);
  const result2 = await result;
  assert.equal(result2.outcome, "failed");
});

test("a completion microtask cannot bypass an overdue or exact soft cutoff", async () => {
  await Array.fromAsync(
    [
      [79, "normal-completion"],
      [80, "deadline-stop"],
      [95, "deadline-stop"],
    ],
    async ([at, expected]) => {
      const c = clock();
      let finish;
      let stopReason;
      const result = controlAction({
        threadId: "thr_owned",
        limitMs: 100,
        stopReserveMs: 20,
        clock: c,
        dispatch: async () => {},
        completion: (() => {
          const { promise, resolve } = Promise.withResolvers();
          finish = resolve;
          return promise;
        })(),
        acceptCompletion: () => true,
        stop: (input) =>
          Promise.try(({ reason }) => {
            stopReason = reason;
          }, input),
        verifyAbsence: () => Promise.resolve(true),
      });
      await flush();
      c.jumpWithoutTimers(at);
      finish(normal);
      const r = await result;
      assert.equal(r.outcome, expected);
      assert.equal(stopReason, expected);
      assert.equal(r.passed, at < 80);
      assert.equal(r.elapsedMs, at);
    },
  );
});
