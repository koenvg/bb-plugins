import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { definePluginApp, useBbNavigate, useRpc, useSdk } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server.js";
import { QuotaSelectionStore, type QuotaApi } from "./selection-store.js";
import { QuotaBadge, QuotaBattery, QuotaDashboard } from "./quota-view.js";
import { QuotaFooterRuntime } from "./footer-runtime.js";
import type { FooterTarget } from "./footer-adapter.js";
import { AccountActivity } from "./activity-view.js";
import { CalendarReportSection } from "./calendar-panel.js";

import { HistoryReadinessSection } from "./history-view.js";
const shared = new QuotaSelectionStore();
const footer = new QuotaFooterRuntime();
const QUOTA_ICON = "codex-quota-battery";
type HostOption = { id: string; name: string; status: "connected" | "disconnected" | "unknown" };
let cachedHosts: HostOption[] = [];

function useQuotaApi() {
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const apiRef = useRef<QuotaApi | null>(null);
  apiRef.current ??= {
    selection: () => rpcRef.current.call("selection", null),
    selectHost: (input) => rpcRef.current.call("selectHost", input),
    read: (input) => rpcRef.current.call("read", input),
  };
  return apiRef.current;
}

function useQuota() {
  const api = useQuotaApi();
  const state = useSyncExternalStore(shared.subscribe, shared.getSnapshot);
  return { state, api };
}

function QuotaRefreshOwner() {
  const api = useQuotaApi();
  useLayoutEffect(() => {
    const stop = shared.start(api);
    const resume = () => { void shared.resume(); };
    const onVisible = () => { if (document.visibilityState === "visible") resume(); };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [api]);
  return null;
}

function useHostOptions() {
  const sdk = useSdk();
  const [hosts, setHosts] = useState<HostOption[]>(() => cachedHosts);
  useEffect(() => {
    let mounted = true;
    const load = () => { void sdk.hosts.list().then((items) => {
      const next = items.filter((item) => item.type === "persistent" && item.lifecycle.phase === "active")
        .map(({ id, name, status }) => ({ id, name, status }));
      cachedHosts = next;
      if (mounted) setHosts(next);
    }).catch(() => {
      cachedHosts = cachedHosts.map((host) => ({ ...host, status: "unknown" }));
      if (mounted) setHosts(cachedHosts);
    }); };
    load();
    window.addEventListener("focus", load);
    return () => { mounted = false; window.removeEventListener("focus", load); };
  }, [sdk]);
  return hosts;
}

function QuotaPage() {
  const { state, api } = useQuota();
  const hosts = useHostOptions();
  const activityRpc = useRpc<typeof rpcContract>();
  const hostId = state.selection.hostId;
  const selected = hosts.find((host) => host.id === hostId);
  const options = hostId && !selected ? [...hosts, { id: hostId, name: "Selected host", status: "unknown" as const }] : hosts;
  return <QuotaDashboard view={state.view} now={state.now} loading={state.loading} ready={state.ready} hosts={options}
    selectedHostId={hostId}
    history={<details className="mt-8 min-w-0 border-t border-border pt-4 text-sm"><summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">Collection and history management</summary><HistoryReadinessSection selection={state.selection} selectionPending={state.selectionPending} selectionRevision={state.selectionRevision} /></details>}
    onHostChange={(id) => { void shared.selectHost(api, id); }}
    onRefresh={() => { void shared.refresh(api, true); }}>
      <CalendarReportSection selection={state.selection} selectionPending={state.selectionPending} selectionRevision={state.selectionRevision} now={state.now} />
      <AccountActivity selection={state.selection} selectionPending={state.selectionPending} selectionRevision={state.selectionRevision} read={(input) => activityRpc.call("activity", input)} />
    </QuotaDashboard>;
}

function SidebarQuotaBadge({ descriptionId }: { descriptionId?: string }) {
  const { state } = useQuota();
  const hosts = useHostOptions();
  const hostName = hosts.find((host) => host.id === state.selection.hostId)?.name ?? (state.selection.hostId ? "Selected host" : null);
  return <QuotaBadge view={state.view} hostName={hostName} now={state.now} loading={state.loading} ready={state.ready} descriptionId={descriptionId} />;
}

function QuotaBatteryIcon({ className }: { className?: string }) {
  // Icons appear across BB. Existing quota owners handle reads and clock updates.
  const state = useSyncExternalStore(shared.subscribe, shared.getSnapshot);
  return <QuotaBattery view={state.view} now={state.now} loading={state.loading} ready={state.ready && state.hasActiveOwner} className={className} />;
}

function FooterQuotaBadge({ target }: { target: FooterTarget }) {
  useLayoutEffect(() => target.commit(), [target]);
  return createPortal(<SidebarQuotaBadge descriptionId={target.descriptionId} />, target.container);
}

function QuotaFooter() {
  const navigate = useBbNavigate();
  const targets = useSyncExternalStore(footer.subscribe, footer.getSnapshot);
  useLayoutEffect(() => footer.bindNavigation(() => navigate.toPluginPanel("quota")), [navigate]);
  return targets.map((target) => <FooterQuotaBadge key={target.container.id} target={target} />);
}

export default definePluginApp((app) => {
  app.experimental_icons.register({ name: QUOTA_ICON, component: QuotaBatteryIcon });
  app.contentScripts.register({
    id: "quota-footer",
    mount: ({ pluginId, signal }) => footer.mount(pluginId, signal),
  });
  app.experimental_sidebarFooter.register({
    id: "quota", kind: "action", label: "Codex quota", icon: QUOTA_ICON, onActivate: footer.activate,
  });
  app.slots.experimental_appOverlay({ id: "quota-footer", component: QuotaFooter });
  app.slots.experimental_appOverlay({ id: "quota-refresh", component: QuotaRefreshOwner });
  app.slots.navPanel({
    id: "quota",
    title: "Codex Quota",
    icon: QUOTA_ICON,
    path: "quota",
    component: QuotaPage,
    experimental_sidebarAccessory: SidebarQuotaBadge,
  });
});
