import assert from "node:assert/strict";
import test from "node:test";
import { assessSweepWitness } from "./sweep-witness.mjs";

const witness = () => ({
  environmentId: "env_owned",
  targetThreadId: "thr_target",
  controlThreadId: "thr_control",
  targetIdleObservedAtMs: 1000,
  controlDispatchAtMs: 2000,
  controlIdleAtMs: 3000,
  targetTurnCoverageComplete: true,
  targetHadForegroundAfterControlDispatch: false,
  log: {
    msg: "Reaped idle provider sessions",
    time: 1804000,
    sessions: [
      {
        environmentId: "env_owned",
        threadId: "thr_control",
        providerId: "pi-subagents",
        idleForMs: 1801000,
      },
    ],
  },
  targetObservation: {
    atMs: 1804001,
    parentIdentityUnchanged: true,
    childIdentityUnchanged: true,
    samePendingNativeItem: true,
  },
});

test("elapsed time and predicted cadence without a release log are not sweep proof", () => {
  const w = witness();
  w.log = null;
  assert.equal(assessSweepWitness(w).proved, false);
});

test("a receipt must identify the eligible owned control and unchanged protected target", () => {
  const cases = [
    (w) => {
      w.controlThreadId = w.targetThreadId;
    },
    (w) => {
      w.log.sessions[0].threadId = "thr_other";
    },
    (w) => {
      w.log.sessions[0].environmentId = "env_other";
    },
    (w) => {
      w.log.sessions[0].providerId = "pi";
    },
    (w) => {
      w.log.sessions[0].idleForMs = 1799999;
    },
    (w) => {
      w.controlDispatchAtMs = 999;
    },
    (w) => {
      w.targetHadForegroundAfterControlDispatch = true;
    },
    (w) => {
      w.targetTurnCoverageComplete = false;
    },
    (w) => {
      w.targetObservation.parentIdentityUnchanged = false;
    },
    (w) => {
      w.targetObservation.childIdentityUnchanged = false;
    },
    (w) => {
      w.targetObservation.samePendingNativeItem = false;
    },
    (w) => {
      w.targetObservation.atMs = w.log.time - 1;
    },
    (w) => {
      w.log.sessions.push({ ...w.log.sessions[0], threadId: w.targetThreadId });
    },
  ];
  for (const change of cases) {
    const w = witness();
    change(w);
    assert.equal(assessSweepWitness(w).proved, false);
  }
});

test("eligible control release with complete causal coverage is a sweep witness", () => {
  assert.equal(assessSweepWitness(witness()).proved, true);
});

test("malformed or unavailable sweep evidence fails closed", () => {
  for (const w of [null, {}, { log: { msg: "Reaped idle provider sessions", sessions: [] } }]) {
    assert.equal(assessSweepWitness(w).proved, false);
  }
});
