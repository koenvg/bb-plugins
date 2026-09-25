import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { definePluginApp, useRpc, useSdk } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server.js";
import { QuotaSelectionStore, type QuotaApi } from "./selection-store.js";
import { QuotaBadge, QuotaDashboard } from "./quota-view.js";

const shared = new QuotaSelectionStore();
type HostOption = { id: string; name: string; status: "connected" | "disconnected" | "unknown" };
let cachedHosts: HostOption[] = [];

function useQuota() {
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const apiRef = useRef<QuotaApi | null>(null);
  apiRef.current ??= {
    selection: () => rpcRef.current.call("selection", null),
    selectHost: (input) => rpcRef.current.call("selectHost", input),
    read: (input) => rpcRef.current.call("read", input),
  };
  const api = apiRef.current;
  const state = useSyncExternalStore(shared.subscribe, shared.getSnapshot);
  useLayoutEffect(() => {
    let mounted = true;
    const sync = () => { void shared.connect(api).then(() => { if (mounted) void shared.refresh(api); }); };
    sync();
    const timer = window.setInterval(() => shared.tick(), 1000);
    window.addEventListener("focus", sync);
    return () => { mounted = false; window.clearInterval(timer); window.removeEventListener("focus", sync); };
  }, [api]);
  return { state, api };
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
  const hostId = state.selection.hostId;
  const selected = hosts.find((host) => host.id === hostId);
  const options = hostId && !selected ? [...hosts, { id: hostId, name: "Selected host", status: "unknown" as const }] : hosts;
  return <QuotaDashboard view={state.view} now={state.now} loading={state.loading} ready={state.ready} hosts={options}
    selectedHostId={hostId}
    onHostChange={(id) => { void shared.selectHost(api, id); }}
    onRefresh={() => { void shared.refresh(api, true); }} />;
}

function SidebarQuotaBadge() {
  const { state } = useQuota();
  const hosts = useHostOptions();
  const hostName = hosts.find((host) => host.id === state.selection.hostId)?.name ?? (state.selection.hostId ? "Selected host" : null);
  return <QuotaBadge view={state.view} hostName={hostName} now={state.now} loading={state.loading} ready={state.ready} />;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "quota",
    title: "Codex Quota",
    icon: "Gauge",
    path: "quota",
    component: QuotaPage,
    experimental_sidebarAccessory: SidebarQuotaBadge,
  });
});
