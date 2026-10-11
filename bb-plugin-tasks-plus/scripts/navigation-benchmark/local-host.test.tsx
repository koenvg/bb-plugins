// @vitest-environment jsdom
import { useEffect, useLayoutEffect, useState, useRef } from "react";
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectPluginAppRegistrations } from "@get-bb/plugin-sdk/internal/plugin-app-collector";
import { useBbContext, useBbNavigate, useRealtime, useRealtimeConnectionState, useRpc, experimental_useAppPanel } from "@get-bb/plugin-sdk/app";
import tasksApp from "../../app.js";
import { createLocalHost, type LocalHostOptions } from "./local-host.js";
import { createSafeTaskTransition } from "../../views/detail/safe-transition.js";
import { createTaskEditSession } from "../../views/detail/edit-session.js";
const app = collectPluginAppRegistrations(tasksApp);
const panel = app.navPanels[0]!;
const hosts: ReturnType<typeof createLocalHost>[] = [];
const containers: HTMLElement[] = [];
afterEach(() => { vi.useRealTimers(); while (hosts.length) hosts.pop()!.dispose(); while (containers.length) containers.pop()!.remove(); });
function setup(rpc: LocalHostOptions["rpc"] = async (_method: string, input: unknown) => ({ input })) {
  const host = createLocalHost({ panel, rpc }); hosts.push(host);
  const container = document.createElement("div"); document.body.append(container); containers.push(container);
  return { host, container };
}
describe("production-mounting host boundary without test renderer", () => {
  it("collects actual registrations and preserves component/context/controller identity across route and fixed-tab changes", async () => {
    expect(panel.path).toBe("tasks"); expect(panel.fixedTabs?.[0]?.id).toBe("ticket");
    const { host, container } = setup();
    let created = 0; let destroyed = 0;
    let snapshot: any;
    function Consumer({ subPath, ticketVisible }: { subPath: string; ticketVisible: boolean }) {
      const [mount] = useState(() => ++created);
      const rpc = useRpc(); const context = useBbContext(); const navigate = useBbNavigate(); const controller = experimental_useAppPanel();
      useEffect(() => { return () => { destroyed++; }; }, []);
      snapshot = { rpc, context, navigate, controller, mount, subPath, ticketVisible };
      return <output>{subPath}</output>;
    }
    host.lifecycle.mount(container, Consumer);
    await waitFor(() => expect(snapshot?.subPath).toBe("all"));
    const initial = snapshot;
    snapshot.navigate.toPluginPanel("tasks", { subPath: "all?task=BENCH-1", replace: true });
    await waitFor(() => expect(snapshot.subPath).toBe("all?task=BENCH-1"));
    host.lifecycle.rerender("all?task=BENCH-2");
    host.behavior.setTicketVisible(false);
    await waitFor(() => expect(snapshot.ticketVisible).toBe(false));
    snapshot.controller.openFixedTab({ surface: { kind: "current" }, tab: panel.fixedTabs![0]! });
    await waitFor(() => expect(snapshot.ticketVisible).toBe(true));
    for (const key of ["rpc", "context", "navigate", "controller", "mount"]) expect(snapshot[key]).toBe(initial[key]);
    expect(snapshot.context).toEqual({ projectId: null, threadId: null });
    expect(created).toBe(1); expect(destroyed).toBe(0);
    expect(host.inspection.experimental_fixedTabOpenCalls).toHaveLength(1);
    expect(() => host.lifecycle.mount(container, Consumer)).toThrow("already mounted");
    expect(() => snapshot.navigate.toPluginPanel("other")).toThrow("blocks");
    expect(() => snapshot.navigate.toThread("thr_foreign")).toThrow("blocks");
    expect(() => snapshot.controller.openFixedTab({ surface: { kind: "current" }, tab: { panelId: "tasks", id: "foreign" } })).toThrow("blocks");
    host.dispose(); expect(destroyed).toBe(1); expect(container.textContent).toBe("");
    expect(() => host.lifecycle.rerender("all")).toThrow("disposed");
  });
  it("round-trips RPC, delivers latest realtime handlers and connection state, and revokes response/subscription rights on disposal", async () => {
    let resolve!: (value: unknown) => void;
    const rpcBackend = vi.fn(async (method: string, input: unknown) => method === "pending" ? new Promise(done => { resolve = done; }) : ({ input }));
    const { host, container } = setup(rpcBackend);
    const received: unknown[] = [];
    let snapshot: any;
    function Consumer({ subPath }: { subPath: string; ticketVisible: boolean }) {
      const rpc = useRpc(); const connection = useRealtimeConnectionState();
      useRealtime("tasks:changed", payload => received.push({ subPath, payload }));
      snapshot = { rpc, connection };
      return <output>{connection}</output>;
    }
    host.lifecycle.mount(container, Consumer);
    await waitFor(() => expect(snapshot?.connection).toBe("connected"));
    const input = { nested: { title: "Original" } };
    const result = await snapshot.rpc.call("echo", input);
    expect(result).toEqual({ input }); expect(result.input).not.toBe(input);
    input.nested.title = "Changed";
    expect(host.inspection.rpcCalls[0]!.input).toEqual({ nested: { title: "Original" } });
    host.lifecycle.rerender("all?task=BENCH-2");
    await waitFor(() => expect(container.textContent).toBe("connected"));
    // Wait for normal React effects, not a host-injected act/flush.
    await waitFor(async () => { received.length = 0; await host.behavior.emitRealtime("tasks:changed", { taskId: "owned" }); expect(received).toEqual([{ subPath: "all?task=BENCH-2", payload: { taskId: "owned" } }]); });
    host.behavior.setRealtimeConnectionState("reconnecting");
    await waitFor(() => expect(snapshot.connection).toBe("reconnecting"));
    const pending = snapshot.rpc.call("pending", null); const rejected = expect(pending).rejects.toThrow("disposed");
    const previousCount = received.length;
    host.dispose(); resolve({ late: true }); await rejected;
    await expect(host.behavior.emitRealtime("tasks:changed", {})).rejects.toThrow("disposed");
    expect(received).toHaveLength(previousCount);
    expect(() => host.behavior.setRealtimeConnectionState("connected")).toThrow("disposed");
  });
  it("delivers accepted routes after the actual pending-save transition commit settles", async () => {
    const { host, container } = setup();
    const transition = createSafeTaskTransition();
    const editor = createTaskEditSession("BENCH-1", { save: async () => ({ ok: true }), schedule: () => () => {} });
    transition.register(editor);
    const errors: string[] = []; const accepted: string[] = [];
    let navigate: ReturnType<typeof useBbNavigate>;
    function Consumer({ subPath }: { subPath: string; ticketVisible: boolean }) {
      navigate = useBbNavigate();
      const previous = useRef(subPath);
      useLayoutEffect(() => {
        if (previous.current === subPath) return;
        previous.current = subPath;
        try { void transition.request(() => accepted.push(subPath)); }
        catch (error) { errors.push((error as Error).message); }
      }, [subPath]);
      return <output>{subPath}</output>;
    }
    host.lifecycle.mount(container, Consumer);
    await waitFor(() => expect(container.textContent).toBe("all"));
    editor.stage({ title: "Owned draft" });
    expect(await transition.request(() => navigate!.toPluginPanel("tasks", { subPath: "all?task=BENCH-2" }))).toBe(true);
    await waitFor(() => expect(container.textContent).toBe("all?task=BENCH-2"));
    expect(errors).toEqual([]);
    expect(accepted).toEqual(["all?task=BENCH-2"]);
  });

  it("preserves each accepted route in FIFO order without remounting, and revokes queued delivery on disposal", async () => {
    const { host, container } = setup();
    const visited: string[] = []; let mounts = 0;
    function Consumer({ subPath }: { subPath: string; ticketVisible: boolean }) {
      useState(() => { mounts += 1; return null; });
      useLayoutEffect(() => { visited.push(subPath); }, [subPath]);
      return <output>{subPath}</output>;
    }
    host.lifecycle.mount(container, Consumer);
    await waitFor(() => expect(container.textContent).toBe("all"));
    host.lifecycle.rerender("one"); host.lifecycle.rerender("two"); host.lifecycle.rerender("three");
    await waitFor(() => expect(visited).toEqual(["all", "one", "two", "three"]));
    expect(mounts).toBe(1);
    expect(host.inspection.routePublications).toEqual(["one", "two", "three"]);
    vi.useFakeTimers();
    host.lifecycle.rerender("revoked"); host.dispose(); vi.runAllTimers();
    expect(host.inspection.routePublications).toEqual(["one", "two", "three"]);
    expect(container.textContent).toBe("");
  });

  it("keeps the actual failed-save origin and draft, and delivers the destination only after explicit retry", async () => {
    const { host, container } = setup();
    const transition = createSafeTaskTransition();
    const save = vi.fn().mockResolvedValueOnce({ ok: false, errorMessage: "Owned failure" }).mockResolvedValue({ ok: true });
    const editor = createTaskEditSession("origin-task", { save, schedule: () => () => {} });
    transition.register(editor); const origins: string[] = [];
    transition.onPendingTransition(() => { origins.push(editor.taskId); });
    let navigate: ReturnType<typeof useBbNavigate>;
    function Consumer({ subPath }: { subPath: string; ticketVisible: boolean }) { navigate = useBbNavigate(); return <output>{subPath}</output>; }
    host.lifecycle.mount(container, Consumer);
    await waitFor(() => expect(container.textContent).toBe("all"));
    editor.stage({ title: "Origin draft" });
    expect(await transition.request(() => navigate!.toPluginPanel("tasks", { subPath: "destination" }))).toBe(false);
    expect(container.textContent).toBe("all"); expect(origins).toEqual(["origin-task"]);
    expect(host.inspection.navigateCalls).toEqual([]);
    expect(editor.getSnapshot()).toMatchObject({ pending: true, draft: { title: "Origin draft" }, error: "Owned failure" });
    expect(await transition.retry()).toBe(true);
    await waitFor(() => expect(container.textContent).toBe("destination"));
    expect(save.mock.calls).toEqual([["origin-task", { title: "Origin draft" }], ["origin-task", { title: "Origin draft" }]]);
    expect(host.inspection.routePublications).toEqual(["destination"]);
  });

});
