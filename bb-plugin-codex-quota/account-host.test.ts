import { expect, it } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { createQuotaHostEntry } from "./host.js";

it.each(["auth", "quota"])(
  "settles a quota read on disposal during a noncooperative %s call",
  async (phase) => {
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const harness = experimental_createHostEntryHarness(
      createQuotaHostEntry({
        auth: async () => {
          if (phase === "auth") {
            entered();
            await held;
          }
          return { status: "ok", token: "private-token", identity: "private-identity" };
        },
        read: async () => {
          entered();
          await held;
          return { status: "service", snapshot: null };
        },
      }),
    );
    const pending = harness.experimental_call("quota", {});
    await started;
    await harness.experimental_dispose();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        pending,
        new Promise((resolve) => {
          deadline = setTimeout(() => resolve("still waiting"), 50);
        }),
      ]);
      expect(result).toEqual({ state: "unavailable", reason: "selection-changed", snapshot: null });
    } finally {
      clearTimeout(deadline);
      release();
      await pending;
    }
  },
);
