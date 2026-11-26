import { describe, expect, it, vi } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { createQuotaHostEntry } from "../plugin/host.js";
import { quotaFixture } from "../machines/machines.test-support.js";
import { z } from "zod";
import { fetchNormalizedQuota } from "./feasibility.js";

const legacyWindow = z.strictObject({
  id: z.string(),
  name: z.string(),
  remainingPercent: z.number(),
  resetAt: z.string().datetime().nullable(),
});
const legacySnapshot = z.strictObject({
  observedAt: z.string().datetime(),
  plan: z.string().nullable(),
  general: z.array(legacyWindow),
  additional: z.array(z.strictObject({ name: z.string(), windows: z.array(legacyWindow) })),
  bindingWindowId: z.string().nullable(),
  bindingRemainingPercent: z.number().nullable(),
  bankedResets: z.number().nullable(),
});
const legacyQuota = z.strictObject({
  state: z.literal("fresh"),
  reason: z.literal("ok"),
  snapshot: legacySnapshot,
});
const legacyObservation = z.strictObject({
  proof: z.string().regex(/^[a-f0-9]{64}$/),
  quota: legacyQuota,
  activity: z.unknown(),
});

const now = Date.UTC(2026, 9, 1, 12);
const token = (account: string, suffix: string, user = "shared-user") =>
  `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: account, chatgpt_user_id: user } })).toString("base64url")}.${suffix}`;
describe("host account observations", () => {
  it("serves old strict quota and observation clients while sharing the paid-credit reading with the dashboard", async () => {
    const upstream = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            rate_limit: { primary_window: { used_percent: 37 } },
            rate_limit_reset_credits: { available_count: 2 },
            credits: { has_credits: false, unlimited: false, balance: "0.00" },
          }),
        ),
    );
    const host = experimental_createHostEntryHarness(
      createQuotaHostEntry({
        auth: async () => ({
          status: "ok",
          identity: "account",
          token: token("account", "signature"),
        }),
        read: (access, signal) => fetchNormalizedQuota(access, signal, upstream, now),
        now: () => now,
      }),
    );
    try {
      const request = { challenge: "c".repeat(64), refresh: false, includeActivity: false };
      const quota = legacyQuota.parse(await host.experimental_call("quota", {}));
      expect(quota.snapshot).toMatchObject({ bindingRemainingPercent: 63, bankedResets: 2 });
      const old = legacyObservation.parse(
        await host.experimental_call("accountObservation", request),
      );
      expect(old.quota).toEqual(quota);
      await expect(host.experimental_call("accountObservationV2", request)).resolves.toMatchObject({
        proof: old.proof,
        quota: { snapshot: { ...quota.snapshot, credits: { kind: "balance", balance: "0.00" } } },
      });
      expect(upstream).toHaveBeenCalledTimes(1);
    } finally {
      await host.experimental_dispose();
    }
  });
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
