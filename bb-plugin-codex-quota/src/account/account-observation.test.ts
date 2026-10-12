import { describe, expect, it } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { createQuotaHostEntry } from "../plugin/host.js";
import { quotaFixture } from "../machines/machines.test-support.js";

const now = Date.UTC(2026, 9, 1, 12);
const token = (account: string, suffix: string, user = "shared-user") =>
  `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: account, chatgpt_user_id: user } })).toString("base64url")}.${suffix}`;
describe("host account observations", () => {
  it("correlates the same account across token rotations without exposing tokens or account IDs", async () => {
    let suffix = "first";
    const harness = experimental_createHostEntryHarness(
      createQuotaHostEntry({
        auth: async () => ({
          status: "ok",
          identity: suffix,
          token: token("private-account-id", suffix),
        }),
        read: async () => ({ status: "ok", snapshot: quotaFixture(now).snapshot }),
        now: () => now,
      }),
    );
    try {
      const request = { challenge: "c".repeat(64), refresh: false, includeActivity: false };
      const first = await harness.experimental_call("accountObservation", request);
      suffix = "rotated";
      const rotated = await harness.experimental_call("accountObservation", request);
      expect(first.proof).toMatch(/^[a-f0-9]{64}$/);
      expect(rotated.proof).toBe(first.proof);
      const differentChallenge = await harness.experimental_call("accountObservation", {
        ...request,
        challenge: "d".repeat(64),
      });
      expect(differentChallenge.proof).not.toBe(first.proof);
      expect(JSON.stringify(rotated)).not.toMatch(/private-account-id|header\.|rotated/);
    } finally {
      await harness.experimental_dispose();
    }
  });
  it("discards observations when the active authentication changes during the quota read", async () => {
    let account = "account-a";
    const harness = experimental_createHostEntryHarness(
      createQuotaHostEntry({
        auth: async () => ({ status: "ok", identity: account, token: token(account, "signature") }),
        read: async () => {
          account = "account-b";
          return { status: "ok", snapshot: quotaFixture(now).snapshot };
        },
        now: () => now,
      }),
    );
    try {
      const result = await harness.experimental_call("accountObservation", {
        challenge: "c".repeat(64),
        refresh: false,
        includeActivity: false,
      });
      expect(result).toMatchObject({
        proof: null,
        quota: { state: "unavailable", snapshot: null },
        activity: { state: "unavailable", snapshot: null },
      });
    } finally {
      await harness.experimental_dispose();
    }
  });
  it("leaves identity unverified if the credential has no stable account claim", async () => {
    const harness = experimental_createHostEntryHarness(
      createQuotaHostEntry({
        auth: async () => ({
          status: "ok",
          identity: "private-fingerprint",
          token: "opaque-secret-token",
        }),
        read: async () => ({ status: "ok", snapshot: quotaFixture(now).snapshot }),
        now: () => now,
      }),
    );
    try {
      const result = await harness.experimental_call("accountObservation", {
        challenge: "c".repeat(64),
        refresh: false,
        includeActivity: false,
      });
      expect(result.proof).toBeNull();
      expect(result.quota.state).toBe("fresh");
      expect(JSON.stringify(result)).not.toMatch(/fingerprint|secret-token/);
    } finally {
      await harness.experimental_dispose();
    }
  });
  it("does not correlate different users in the same workspace", async () => {
    const proofs: (string | null)[] = [];
    for (const user of ["member-a", "member-b"]) {
      const harness = experimental_createHostEntryHarness(
        createQuotaHostEntry({
          auth: async () => ({
            status: "ok",
            identity: user,
            token: token("shared-workspace", "signature", user),
          }),
          read: async () => ({ status: "ok", snapshot: quotaFixture(now).snapshot }),
          now: () => now,
        }),
      );
      try {
        proofs.push(
          (
            await harness.experimental_call("accountObservation", {
              challenge: "c".repeat(64),
              refresh: false,
              includeActivity: false,
            })
          ).proof,
        );
      } finally {
        await harness.experimental_dispose();
      }
    }
    expect(proofs.every((proof) => proof !== null)).toBe(true);
    expect(proofs[0]).not.toBe(proofs[1]);
  });
  it("keeps active credential correlation when allowance data is unavailable", async () => {
    const harness = experimental_createHostEntryHarness(
      createQuotaHostEntry({
        auth: async () => ({
          status: "ok",
          identity: "same",
          token: token("account-a", "signature"),
        }),
        read: async () => ({ status: "network", snapshot: null }),
        now: () => now,
      }),
    );
    try {
      const result = await harness.experimental_call("accountObservation", {
        challenge: "c".repeat(64),
        refresh: false,
        includeActivity: false,
      });
      expect(result.proof).toMatch(/^[a-f0-9]{64}$/);
      expect(result.quota.snapshot).toBeNull();
    } finally {
      await harness.experimental_dispose();
    }
  });
});
