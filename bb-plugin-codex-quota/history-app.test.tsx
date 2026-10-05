// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeHostResponse } from "@get-bb/plugin-sdk/testing";
import { readFileSync, writeFileSync } from "node:fs";

const app = await loadPluginApp(() => import("./app.js"));
afterEach(cleanup);

describe("readiness in the existing quota panel", () => {
  it("keeps one quota owner and the official link while history is unconfigured", async () => {
    const now = Date.now();
    let quotaReads = 0;
    let historyReads = 0;
    const options = {
      sdk: {
        hosts: {
          list: async () => [makeHostResponse({ id: "host_synthetic", name: "Synthetic Mac" })],
        },
      },
      rpc: {
        selection: async () => ({ hostId: "host_synthetic", generation: 1 }),
        read: async () => {
          quotaReads++;
          return {
            state: "fresh",
            reason: "ok",
            snapshot: {
              observedAt: new Date(now).toISOString(),
              plan: null,
              bankedResets: null,
              general: [
                {
                  id: "primary_window",
                  name: "Primary",
                  remainingPercent: 42,
                  resetAt: new Date(now + 7_800_000).toISOString(),
                },
              ],
              additional: [],
              bindingWindowId: "primary_window",
              bindingRemainingPercent: 42,
            },
          };
        },
        historyReadiness: async () => {
          historyReads++;
          return {
            state: "not-configured",
            reason: "not-configured",
            storage: "unconfigured",
            collector: "missing",
            writer: "unconfirmed",
          };
        },
      },
    };
    const owner = renderSlot(
      app.appOverlays.find((item) => item.id === "quota-refresh")!,
      {},
      options,
    );
    const page = renderSlot(app.settingsSections[0]!, {}, options);
    const queries = within(page.container);
    await queries.findByText("History not configured on this host.");
    await queries.findByText("42% remaining");
    expect(quotaReads).toBe(1);
    expect(historyReads).toBe(1);
    fireEvent.click(queries.getByRole("button", { name: "Check readiness" }));
    await waitFor(() => expect(historyReads).toBe(2));
    expect(quotaReads).toBe(1);
    await queries.findByText("History not configured on this host.");
    expect(queries.getByRole("link", { name: /Open Codex Usage/ })).toBeTruthy();
    expect(
      page.inspection.rpcCalls.every((call) =>
        call.method === "historicalImport"
          ? (call.input as { command?: { action?: string } })?.command?.action === "status"
          : !/install|import|activity/i.test(call.method),
      ),
    ).toBe(true);
    if (process.env.BBP17_PREVIEW_FILE) {
      // Optional local synthetic preview of the actual rendered React panel with built utility CSS.
      const css = readFileSync("dist/app.css", "utf8");
      const preview = page.container.cloneNode(true) as HTMLElement;
      const selectedValue = (
        queries.getByRole("combobox", { name: "Codex host" }) as HTMLSelectElement
      ).value;
      for (const option of Array.from(preview.querySelectorAll("select option")))
        option.toggleAttribute("selected", (option as HTMLOptionElement).value === selectedValue);
      writeFileSync(
        process.env.BBP17_PREVIEW_FILE,
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BBP-17 synthetic React preview</title><style>${css}\n:root{--background:#171717;--foreground:#eee;--border:#444;--muted-foreground:#bbb;--primary:#9dc2ff;--accent:#333;--ring:#9dc2ff;--destructive:#f88;--radius-md:.375rem}*{box-sizing:border-box}h1,h2,h3,p{margin:0}ul{margin:0;padding:0;list-style:none}button,select{font:inherit;color:inherit;background:transparent;border-style:solid}body{margin:0;font:14px system-ui;background:var(--background);color:var(--foreground)}.evidence{padding:12px;color:#e4bf78}</style><p class="evidence">Synthetic React preview. Not installed acceptance.</p><div data-bb-plugin="codex-quota">${preview.innerHTML}</div></html>`,
      );
    }
    page.lifecycle.unmount();
    owner.lifecycle.unmount();
  });
  it.each([false, true])(
    "invalidates readiness during a held host switch, switch back = %s",
    async (switchBack) => {
      let selected = { hostId: "host_a", generation: 1 };
      const historyInputs: { hostId: string; generation: number }[] = [];
      const selections: ((value: typeof selected) => void)[] = [];
      let finishOld!: (value: unknown) => void;
      let finishQuota!: (value: unknown) => void;
      let quotaReads = 0;
      const missing = {
        state: "not-configured",
        reason: "not-configured",
        storage: "unconfigured",
        collector: "missing",
        writer: "unconfirmed",
      };
      const options = {
        sdk: {
          hosts: {
            list: async () => [
              makeHostResponse({ id: "host_a", name: "Host A" }),
              makeHostResponse({ id: "host_b", name: "Host B" }),
            ],
          },
        },
        rpc: {
          selection: async () => selected,
          selectHost: async () =>
            new Promise<typeof selected>((resolve) =>
              selections.push((value) => {
                selected = value;
                resolve(value);
              }),
            ),
          read: async () =>
            ++quotaReads === 1
              ? { state: "unavailable", reason: "auth-required", snapshot: null }
              : new Promise((resolve) => {
                  finishQuota = resolve;
                }),
          historyReadiness: async (input: unknown) => {
            historyInputs.push(input as { hostId: string; generation: number });
            return historyInputs.length === 2
              ? new Promise((resolve) => {
                  finishOld = resolve;
                })
              : missing;
          },
        },
      };
      const owner = renderSlot(
        app.appOverlays.find((item) => item.id === "quota-refresh")!,
        {},
        options,
      );
      const page = renderSlot(app.settingsSections[0]!, {}, options);
      const queries = within(page.container);
      await queries.findByText("History not configured on this host.");
      await queries.findByRole("option", { name: "Host B" });
      fireEvent.click(queries.getByRole("button", { name: "Check readiness" }));
      await waitFor(() => expect(historyInputs).toHaveLength(2));
      fireEvent.change(queries.getByRole("combobox", { name: "Codex host" }), {
        target: { value: "host_b" },
      });
      await waitFor(() => expect(selections).toHaveLength(1));
      expect(
        queries.getByText("Changing selected host. History readiness is pending."),
      ).toBeTruthy();
      expect(
        (queries.getByRole("button", { name: "Check readiness" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      await act(async () => {
        finishOld({
          ...missing,
          state: "unavailable",
          reason: "collector-incompatible",
          collector: "incompatible",
        });
      });
      expect(queries.queryByText(/Collector is incompatible/)).toBeNull();
      expect(queries.queryByText(/Collector: missing/)).toBeNull();
      fireEvent.click(queries.getByRole("button", { name: "Check readiness" }));
      expect(historyInputs).toHaveLength(2);
      if (switchBack) {
        fireEvent.change(queries.getByRole("combobox", { name: "Codex host" }), {
          target: { value: "host_a" },
        });
        await waitFor(() => expect(selections).toHaveLength(2));
        await act(async () => {
          selections[0]!({ hostId: "host_b", generation: 2 });
        });
        expect(historyInputs).toHaveLength(2);
        expect(
          queries.getByText("Changing selected host. History readiness is pending."),
        ).toBeTruthy();
        await act(async () => {
          selections[1]!({ hostId: "host_a", generation: 1 });
        });
      } else {
        await act(async () => {
          selections[0]!({ hostId: "host_b", generation: 2 });
        });
      }
      // History becomes usable while quota is still waiting for its separate auth/read result.
      await queries.findByText("History not configured on this host.");
      expect(historyInputs).toHaveLength(3);
      expect(historyInputs[2]?.hostId).toBe(switchBack ? "host_a" : "host_b");
      expect(quotaReads).toBe(2);
      expect(
        (queries.getByRole("button", { name: "Check readiness" }) as HTMLButtonElement).disabled,
      ).toBe(false);
      await act(async () => {
        finishQuota({ state: "unavailable", reason: "auth-required", snapshot: null });
      });
      page.lifecycle.unmount();
      owner.lifecycle.unmount();
    },
  );
});
