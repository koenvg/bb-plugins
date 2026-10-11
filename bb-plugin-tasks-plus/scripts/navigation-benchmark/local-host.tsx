// Harness-only implementation of the documented PluginSdkApp runtime boundary.
// It supplies host integration, never Tasks selection, saves, cache or editor logic.
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  BbContext,
  BbNavigate,
  ExperimentalAppPanel,
  PluginNavPanelRegistration,
  PluginRealtimeConnectionState,
  PluginSdkApp,
} from "@get-bb/plugin-sdk/app";
import type { PluginRpcClient, PluginRpcContract } from "@get-bb/plugin-sdk";
import { Icon } from "../../components/ui/icon.js";

const Scope = React.createContext<object | null>(null);
type RuntimeGlobal = typeof globalThis & {
  __bbPluginRuntime?: { react: typeof React; pluginSdkApp: Partial<PluginSdkApp> };
};
export interface LocalHostOptions {
  panel: PluginNavPanelRegistration;
  rpc(method: string, input: unknown): Promise<unknown>;
  context?: BbContext;
}
export function createLocalHost(options: LocalHostOptions) {
  const global = globalThis as RuntimeGlobal;
  const previous = global.__bbPluginRuntime;
  let disposed = false;
  let root: Root | null = null;
  const identity = {};
  const channels = new Map<string, Set<(payload: unknown) => void>>();
  const rpcCalls: Array<{ method: string; input: unknown }> = [];
  const navigateCalls: Array<{ method: "toPluginPanel"; path: string; options: { subPath: string; replace: boolean } }> = [];
  const fixedTabOpenCalls: Parameters<ExperimentalAppPanel["openFixedTab"]>[0][] = [];
  const context = Object.freeze({ projectId: null, threadId: null, ...options.context });
  const settings = Object.freeze({ values: undefined, isLoading: false });
  const live = () => { if (disposed) throw new Error("Owned host disposed"); };
  const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  function store<T>(initial: T) {
    let snapshot = initial;
    const listeners = new Set<() => void>();
    return {
      get: () => snapshot,
      subscribe(listener: () => void) { live(); listeners.add(listener); return () => { listeners.delete(listener); }; },
      set(next: T) {
        live(); if (Object.is(snapshot, next)) return; snapshot = next;
        const recipients = [...listeners]; // Changes during delivery affect the next event.
        for (const listener of recipients) listener();
      },
      clear() { listeners.clear(); },
    };
  }
  const route = store("all");
  const ticket = store(true);
  const routePublications: string[] = [];
  const acceptedRoutes: string[] = [];
  let routeTask: ReturnType<typeof setTimeout> | undefined;
  // One native task per accepted route; the real commit guard includes microtasks.
  const scheduleRoute = () => {
    if (routeTask !== undefined || !acceptedRoutes.length) return;
    routeTask = setTimeout(() => {
      routeTask = undefined;
      if (disposed) return;
      const next = acceptedRoutes.shift()!;
      routePublications.push(next);
      route.set(next);
      scheduleRoute();
    }, 0);
  };
  const acceptRoute = (subPath: string) => { live(); acceptedRoutes.push(subPath); scheduleRoute(); };
  const connection = store<PluginRealtimeConnectionState>("connected");
  const rpcClient = {
    async call(method: string, input?: unknown) {
      live();
      const normalized = input === undefined ? null : copy(input);
      rpcCalls.push({ method, input: normalized });
      const result = await options.rpc(method, normalized);
      live(); // Revoke publication rights from responses after disposal.
      return copy(result);
    },
  } as PluginRpcClient;
  const blockedNavigation = new Map<PropertyKey, () => never>();
  const navigate = new Proxy({
    toPluginPanel(path: string, navigation?: { subPath?: string; replace?: boolean }) {
      live();
      if (path !== options.panel.path || typeof (navigation?.subPath ?? "") !== "string") throw new Error("Owned host blocks non-Tasks navigation");
      const subPath = navigation?.subPath ?? "";
      navigateCalls.push({ method: "toPluginPanel", path, options: { subPath, replace: navigation?.replace ?? false } });
      acceptRoute(subPath);
    },
  }, { get(target, name) {
    if (name in target) return Reflect.get(target, name);
    if (!blockedNavigation.has(name)) blockedNavigation.set(name, () => { throw new Error(`Owned host blocks navigation ${String(name)}`); });
    return blockedNavigation.get(name);
  } }) as BbNavigate;
  const panel: ExperimentalAppPanel = {
    openFixedTab(input) {
      live();
      const eligible = options.panel.fixedTabs?.find(tab => tab.id === input.tab.id && tab.panelId === input.tab.panelId);
      if (input.surface.kind !== "current" || !eligible || input.target !== undefined) throw new Error("Owned host blocks unsupported fixed tab");
      fixedTabOpenCalls.push(input);
      ticket.set(true);
      return true;
    },
  };
  function useOwner() {
    const owner = React.useContext(Scope);
    live();
    if (owner !== identity) throw new Error("SDK hook outside owned host context");
  }
  const supported = {
    useRpc<Contract extends PluginRpcContract>() { useOwner(); return rpcClient as PluginRpcClient<Contract>; },
    useBbNavigate() { useOwner(); return navigate; },
    useBbContext() { useOwner(); return context; },
    useSettings() { useOwner(); return settings; },
    experimental_usePluginId() { useOwner(); return "tasks-plus"; },
    experimental_useAppPanel() { useOwner(); return panel; },
    useRealtime(channel: string, handler: (payload: unknown) => void) {
      useOwner();
      const current = React.useRef(handler);
      React.useEffect(() => { current.current = handler; });
      React.useEffect(() => {
        const listener = (payload: unknown) => current.current(payload);
        const listeners = channels.get(channel) ?? new Set();
        channels.set(channel, listeners);
        listeners.add(listener);
        return () => { listeners.delete(listener); if (!listeners.size) channels.delete(channel); };
      }, [channel]);
    },
    useRealtimeConnectionState() {
      useOwner();
      return React.useSyncExternalStore(connection.subscribe, connection.get, connection.get);
    },
    experimental_Icon(props: React.ComponentProps<PluginSdkApp["experimental_Icon"]>) {
      useOwner();
      if (props.name !== "Bot") throw new Error("Owned host blocks unsupported SDK glyph");
      return <Icon {...props} name="Bot" />;
    },
  } satisfies Partial<PluginSdkApp>;
  const runtime = new Proxy(supported, { get(target, name) {
    if (name in target) return Reflect.get(target, name);
    throw new Error(`Owned host blocks unsupported SDK operation ${String(name)}`);
  } });
  const installed = { react: React, pluginSdkApp: runtime };
  global.__bbPluginRuntime = installed;
  function dispose() {
    if (disposed) return;
    if (routeTask !== undefined) clearTimeout(routeTask);
    routeTask = undefined; acceptedRoutes.length = 0;
    root?.unmount();
    root = null;
    disposed = true;
    channels.clear(); route.clear(); ticket.clear(); connection.clear();
    if (global.__bbPluginRuntime === installed) global.__bbPluginRuntime = previous;
  }
  return {
    inspection: { routePublications, rpcCalls, navigateCalls, experimental_fixedTabOpenCalls: fixedTabOpenCalls },
    behavior: {
      async emitRealtime(channel: string, payload: unknown) {
        live();
        const normalized = payload === undefined ? null : copy(payload);
        const recipients = [...(channels.get(channel) ?? [])];
        for (const listener of recipients) listener(normalized);
      },
      setRealtimeConnectionState: connection.set,
      setTicketVisible: ticket.set,
    },
    lifecycle: {
      mount(container: HTMLElement, Component: React.ComponentType<{ subPath: string; ticketVisible: boolean }>, subPath = "all") {
        live();
        if (root) throw new Error("Owned host already mounted");
        route.set(subPath);
        function Frame() {
          const subPath = React.useSyncExternalStore(route.subscribe, route.get, route.get);
          const ticketVisible = React.useSyncExternalStore(ticket.subscribe, ticket.get, ticket.get);
          return <Scope.Provider value={identity}><Component subPath={subPath} ticketVisible={ticketVisible} /></Scope.Provider>;
        }
        root = createRoot(container);
        root.render(<Frame />);
      },
      rerender: acceptRoute,
      unmount: dispose,
    },
    dispose,
  };
}
