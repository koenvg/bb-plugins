import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { definePluginApp, useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server.js";
import { QuotaBattery } from "../quota/quota-view.js";
import { QuotaFooterRuntime } from "../footer/footer-runtime.js";
import type { FooterTarget } from "../footer/footer-adapter.js";
import { HistoryReadinessSection } from "../history/history-view.js";
import {
  MachineAccountsStore,
  footerAllowance,
  type AccountsApi,
} from "../machines/accounts-store.js";
import {
  AccountsOverview,
  AccountsTooltip,
  AccountsActivity,
  accountDetails,
} from "../machines/accounts-view.js";
import { MachineReportPanel } from "../machines/report-view.js";
import type { Machine } from "../machines/machines-contract.js";

const shared = new MachineAccountsStore();
const footer = new QuotaFooterRuntime();
const QUOTA_ICON = "codex-quota-battery";
function useAccountsApi() {
  const rpc = useRpc<typeof rpcContract>();
  const reference = useRef(rpc);
  reference.current = rpc;
  const api = useRef<AccountsApi | null>(null);
  api.current ??= (input) => reference.current.call("machineAccounts", input);
  return api.current;
}
function useAccounts() {
  return useSyncExternalStore(shared.subscribe, shared.getSnapshot);
}
function useAccountsOwner() {
  const api = useAccountsApi();
  useEffect(() => shared.start(api), [api]);
  return useAccounts();
}
function QuotaRefreshOwner() {
  useAccountsOwner();
  useEffect(() => {
    const resume = () => {
      void shared.refresh(false);
    };
    const visible = () => {
      if (document.visibilityState === "visible") resume();
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return null;
}
function MachineManagement({ machines }: { machines: Machine[] }) {
  const rpc = useRpc<typeof rpcContract>();
  const [open, setOpen] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ hostId: string | null; generation: number } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  const revision = useRef(0),
    current = useRef(open);
  current.current = open;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revision.current++;
    };
  }, []);
  const manage = async (id: string) => {
    if (!mounted.current || !details.current?.open) return;
    const request = ++revision.current;
    setSelection(null);
    setFailed(false);
    if (open === id) {
      setOpen(null);
      return;
    }
    setOpen(id);
    try {
      const next = await rpc.call("selectHost", { hostId: id });
      if (mounted.current && details.current?.open && request === revision.current) {
        if (next.hostId !== id) setFailed(true);
        else setSelection(next);
      }
    } catch {
      if (mounted.current && request === revision.current) setFailed(true);
    }
  };
  return (
    <details
      ref={details}
      className="mt-6 border-t border-border pt-4 text-sm"
      onToggle={(event) => {
        if (!event.currentTarget.open) {
          revision.current++;
          setOpen(null);
          setSelection(null);
        }
      }}
    >
      <summary className="min-h-9 cursor-pointer rounded-sm text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
        Machine status and collection settings
      </summary>
      {machines.map((machine) => (
        <section key={machine.id} className="border-b border-border py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm [overflow-wrap:anywhere]">{machine.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{machine.status}</p>
            </div>
            <button
              type="button"
              aria-expanded={open === machine.id}
              disabled={machine.status !== "connected"}
              onClick={() => {
                void manage(machine.id);
              }}
              className="min-h-9 shrink-0 rounded-md border border-border px-3 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
            >
              Manage history
            </button>
          </div>
          {open === machine.id && (
            <div className="mt-3">
              {failed ? (
                <p className="text-xs text-muted-foreground">
                  Machine history could not be opened. Close and try again.
                </p>
              ) : selection ? (
                <HistoryReadinessSection
                  selection={selection}
                  selectionRevision={revision.current}
                  isActive={() =>
                    mounted.current &&
                    details.current?.open === true &&
                    current.current === machine.id &&
                    machine.status === "connected"
                  }
                />
              ) : (
                <p className="text-xs text-muted-foreground">Opening machine history…</p>
              )}
            </div>
          )}
        </section>
      ))}
      <p className="mt-3 text-xs text-muted-foreground">
        Collector changes and transcript imports require explicit actions on their owning machine.
        Offline summaries are not proof of current collection.
      </p>
    </details>
  );
}
function QuotaPage() {
  const state = useAccountsOwner();
  const rpc = useRpc<typeof rpcContract>();
  const reference = useRef(rpc);
  reference.current = rpc;
  const read = useRef((input: Parameters<typeof rpc.call<"machineReports">>[1]) =>
    reference.current.call("machineReports", input),
  );
  const prepare = useRef((input: { refresh: boolean }) =>
    reference.current.call("machinePreparation", { refresh: input.refresh }),
  );
  const machines = state.data?.machines ?? [];
  return (
    <main className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-5 py-5 md:px-8 md:py-6">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Codex</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              All machines ·{" "}
              {state.data
                ? `${machines.filter((machine) => machine.status === "connected").length} of ${machines.length} connected`
                : "Status unknown"}
              {state.data?.truncated ? " · machine list incomplete" : ""}
              {state.failed ? " · account refresh failed" : ""}
            </p>
          </div>
          <button
            className="min-h-9 shrink-0 rounded-md border border-border px-3 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
            disabled={state.loading}
            onClick={() => {
              void shared.refresh(true);
            }}
          >
            Refresh allowance
          </button>
        </header>
        <MachineReportPanel now={state.now} read={read.current} prepare={prepare.current} />
        <AccountsOverview data={state.data} now={state.now} loading={state.loading} />
        <MachineManagement machines={machines} />
      </div>
    </main>
  );
}
function UsageSettings() {
  const state = useAccountsOwner();
  return (
    <section className="min-w-0" aria-label="Usage collection settings">
      <button
        disabled={state.loading}
        className="min-h-9 rounded-md border border-border px-3 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
        onClick={() => {
          void shared.refresh(true);
        }}
      >
        Refresh allowance
      </button>
      <AccountsOverview data={state.data} now={state.now} loading={state.loading} />
      <AccountsActivity
        data={state.data}
        now={state.now}
        loading={state.loading}
        refresh={() => {
          void shared.refresh(true, true);
        }}
      />
      <MachineManagement machines={state.data?.machines ?? []} />
    </section>
  );
}
function SidebarQuotaBadge({ descriptionId }: { descriptionId?: string }) {
  const state = useAccounts();
  const summary = footerAllowance(state.data, state.now, state.owners > 0);
  const detail = accountDetails(state.data, state.now).join(". ");
  const label = `${summary.known ? "Lowest known" : "Lowest"} Codex account allowance; ${summary.label}${summary.known ? "; some accounts unavailable or unverified" : ""}. ${detail}`;
  return (
    <>
      <span
        className="inline-flex min-w-[4ch] whitespace-nowrap items-baseline gap-1.5 text-left text-xs font-semibold tabular-nums text-foreground"
        aria-label={label}
        title={label}
      >
        {summary.label}
        {summary.known && (
          <span className="text-[11px] font-normal text-muted-foreground">known</span>
        )}
      </span>
      {descriptionId && (
        <span id={descriptionId} className="sr-only">
          {label}
        </span>
      )}
    </>
  );
}
function QuotaBatteryIcon({ className }: { className?: string }) {
  const state = useAccounts();
  const summary = footerAllowance(state.data, state.now, state.owners > 0);
  return (
    <QuotaBattery
      view={summary.view}
      now={state.now}
      ready={state.owners > 0}
      className={className}
    />
  );
}
function FooterQuotaBadge({ target }: { target: FooterTarget }) {
  const state = useAccounts();
  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
  const over = useRef(false);
  useLayoutEffect(() => target.commit(), [target]);
  useEffect(() => {
    const button = target.trigger;
    const document = button.ownerDocument,
      window = document.defaultView!;
    let timer: ReturnType<typeof setTimeout> | undefined,
      dismissed = false;
    const show = () => {
      clearTimeout(timer);
      if (dismissed) return;
      const box = button.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(box.left - 8, window.innerWidth - 304)),
        bottom: window.innerHeight - box.top + 8,
      });
    };
    const hide = () => {
      dismissed = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!over.current && document.activeElement !== button) setPosition(null);
      }, 120);
    };
    const dismiss = () => {
      dismissed = true;
      over.current = false;
      clearTimeout(timer);
      setPosition(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    button.addEventListener("mouseenter", show);
    button.addEventListener("mouseleave", hide);
    button.addEventListener("focus", show);
    button.addEventListener("blur", hide);
    button.addEventListener("click", dismiss);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", dismiss);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      clearTimeout(timer);
      button.removeEventListener("mouseenter", show);
      button.removeEventListener("mouseleave", hide);
      button.removeEventListener("focus", show);
      button.removeEventListener("blur", hide);
      button.removeEventListener("click", dismiss);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("scroll", dismiss, true);
    };
  }, [target]);
  return (
    <>
      {createPortal(<SidebarQuotaBadge descriptionId={target.descriptionId} />, target.container)}
      {position &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-[60]"
            style={position}
            onMouseEnter={() => {
              over.current = true;
            }}
            onMouseLeave={() => {
              over.current = false;
              setPosition(null);
            }}
          >
            <AccountsTooltip data={state.data} now={state.now} />
          </div>,
          target.container.ownerDocument.body,
        )}
    </>
  );
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
    id: "quota",
    kind: "action",
    label: "Codex quota",
    icon: QUOTA_ICON,
    onActivate: footer.activate,
  });
  app.slots.experimental_appOverlay({ id: "quota-footer", component: QuotaFooter });
  app.slots.experimental_appOverlay({ id: "quota-refresh", component: QuotaRefreshOwner });
  app.slots.settingsSection({
    id: "usage-settings",
    title: "Usage collection",
    component: UsageSettings,
  });
  app.slots.navPanel({
    id: "quota",
    title: "Codex Quota",
    icon: QUOTA_ICON,
    path: "quota",
    component: QuotaPage,
    experimental_sidebarAccessory: SidebarQuotaBadge,
  });
});
