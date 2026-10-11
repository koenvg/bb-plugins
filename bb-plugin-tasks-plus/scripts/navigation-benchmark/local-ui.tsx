// Actual Tasks/native Ticket UI on a harness-only production host adapter.
import * as React from "react";
import { createRoot } from "react-dom/client";
import { collectPluginAppRegistrations } from "@get-bb/plugin-sdk/internal/plugin-app-collector";
import { createLocalHost } from "./local-host.js";
import { footerFixture } from "../../../bb-plugin-codex-quota/src/footer/footer-fixture.test-support.js";
import { mountFooterAdapter } from "../../../bb-plugin-codex-quota/src/footer/footer-adapter.js";
import { QuotaBadge } from "../../../bb-plugin-codex-quota/src/quota/quota-view.js";
// @ts-expect-error Existing benchmark helper has no declaration file.
import { installQualificationObservers } from "./qualification.mjs";
// @ts-expect-error Existing benchmark helper has no declaration file.
import { createProbe, readNativeTicket } from "./probe.mjs";
// @ts-expect-error Local Node/browser helper.
import { readFullTicket, qualifiesContent } from "./local-identity.mjs";

declare global { interface Window { lab: any } }
if (process.env.NODE_ENV !== "production" || typeof React.act !== "undefined") throw new Error("Production React is required");
const fixture = await fetch("/fixture.json").then(response => response.json());
const qualification = installQualificationObservers(window, Object.fromEntries(fixture.tasks.map((task: any) => [task.key, task.revision])));
// Capture real definePluginApp registrations before installing the owned host runtime.
const app = collectPluginAppRegistrations((await import("../../app.js")).default);
const panel = app.navPanels[0]!;
const Page = panel.component;
const Ticket = panel.fixedTabs![0]!.component;
function NativeHost({ subPath, ticketVisible }: { subPath: string; ticketVisible: boolean }) {
  return <div className="lab-workspace"><section className="lab-list"><Page subPath={subPath} /></section><section hidden={!ticketVisible} className="lab-ticket"><header>Ticket</header><Ticket subPath={subPath} /></section></div>;
}
let slot: ReturnType<typeof createLocalHost>;
slot = createLocalHost({ panel, async rpc(method, input) {
  const response = await fetch(`/api/v1/plugins/tasks-plus/rpc/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const body = await response.json();
  if (!body.ok) throw new Error(body.error);
  for (const signal of body.signals) await slot.behavior.emitRealtime(signal.channel, signal.payload);
  return body.result;
} });
const container = document.createElement("div");
document.body.append(container);
slot.lifecycle.mount(container, NativeHost);
const sidebar = footerFixture();
sidebar.sidebar.classList.add("lab-sidebar");
const adapter = mountFooterAdapter(document, "codex-quota");
const badgeRoots = adapter.getSnapshot().map(target => {
  const root = createRoot(target.container);
  root.render(<QuotaBadge view={{ state: "unavailable", reason: "auth-required", snapshot: null }} hostName="Owned lab host" now={Date.now()} descriptionId={target.descriptionId} />);
  return { root, dispose: target.commit() };
});
adapter.setNavigationReady(true);
const read = () => {
  const state = readFullTicket(document, readNativeTicket);
  const task = fixture.tasks.find((task: any) => task.key === state.detailKey);
  return { ...state, rendered: Boolean(task && qualifiesContent(state, task)) };
};
window.lab = {
  fixture, qualification, slot, read, probe: null,
  production: { buildMode: process.env.NODE_ENV, reactVersion: React.version, actType: typeof React.act, renderer: "react-dom/client.createRoot", sdkTestingRenderer: false, routeScheduling: "FIFO accepted routes: one setTimeout native task per route after commit microtasks; revoked on disposal" },
  startProbe(mode = "latency", timeoutMs = 5000) { this.probe?.dispose(); this.probe = createProbe({ window, mode, read, timeoutMs }); },
  async invalidate(key: string) {
    qualification.ledger.invalidate("owned-invalidation", "tasks:changed");
    await slot.behavior.emitRealtime("tasks:changed", { taskId: fixture.tasks.find((task: any) => task.key === key).id });
  },
  dispose() {
    this.probe?.dispose(); qualification.dispose(); slot.dispose(); container.remove();
    for (const badge of badgeRoots) { badge.root.unmount(); badge.dispose(); }
    adapter.dispose(); sidebar.sidebar.remove();
  },
};
