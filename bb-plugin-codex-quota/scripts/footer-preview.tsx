import {
  loadPluginApp,
  mountPluginContentScripts,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { createRoot } from "react-dom/client";
import { footerFixture } from "../src/footer/footer-fixture.test-support.js";
import { accountsFixture } from "../src/machines/machines.test-support.js";

const now = Date.parse("2026-10-01T12:00:00Z");
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args: [] | [string | number]) {
    super(args.length ? args[0] : now);
  }
  static now() {
    return now;
  }
} as DateConstructor;

const scenario = new URLSearchParams(location.search).get("state") ?? "fresh";
const data = accountsFixture(now);
data.machines = [data.machines[0]!];
data.accounts[0]!.machines = [data.machines[0]!.id];
const account = data.accounts[0]!;
switch (scenario) {
  case "fresh":
    break;
  case "aged":
    account.quota.snapshot!.observedAt = new Date(now - 300_000).toISOString();
    break;
  case "expired":
    account.quota.snapshot!.observedAt = new Date(now - 86_400_000).toISOString();
    break;
  case "network":
    account.quota = { ...account.quota, state: "stale", reason: "network" };
    break;
  case "auth":
    account.identity = "unknown";
    account.quota = { state: "unavailable", reason: "auth-required", snapshot: null };
    break;
  case "credentials":
    account.identity = "unknown";
    account.quota = { state: "unavailable", reason: "credential-store-failed", snapshot: null };
    break;
  case "offline":
    data.machines[0]!.status = "disconnected";
    account.quota = { state: "unavailable", reason: "host-offline", snapshot: null };
    break;
  default:
    throw new Error("Unknown synthetic footer scenario");
}

document.title = "Codex quota footer fixture";
document.body.setAttribute("data-bb-plugin", "codex-quota");
document.body.style.cssText = "background:var(--background);color:var(--foreground)";
const { sidebar, button } = footerFixture();
sidebar.style.cssText = "position:fixed;left:16px;bottom:16px;width:240px";
button.style.cssText =
  "display:flex;align-items:center;min-height:40px;background:var(--muted);color:var(--foreground);border:1px solid var(--border);border-radius:6px";
const app = await loadPluginApp(() => import("../src/plugin/app.js"));
const iconContainer = document.createElement("span");
button.querySelector("svg")!.replaceWith(iconContainer);
const icon = createRoot(iconContainer);
const Battery = app.icons[0]!.component;
icon.render(<Battery className="size-5" />);
const options = { rpc: { machineAccounts: async () => data } };
const scripts = await mountPluginContentScripts(app, { pluginId: "codex-quota" });
const owners = ["quota-refresh", "quota-footer"].map((id) => {
  const owner = renderSlot(
    app.appOverlays.find((slot) => slot.id === id)!,
    {},
    options,
  );
  document.getElementById("root")!.append(owner.container);
  return owner;
});
window.addEventListener(
  "pagehide",
  () => {
    for (const owner of owners.reverse()) owner.lifecycle.unmount();
    icon.unmount();
    void scripts.lifecycle.dispose();
  },
  { once: true },
);
