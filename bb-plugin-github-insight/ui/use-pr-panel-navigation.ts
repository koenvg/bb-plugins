import { useEffect } from "react";
import { experimental_useAppPanel, type ExperimentalPanelController } from "@get-bb/plugin-sdk/app";
import { receivePrPanel } from "../pr-panel-navigation";
import { postIntent } from "./command-intents";

export function openPrOverview(panel: ExperimentalPanelController, threadId: string): boolean {
  const opened = panel.openTab({
    tab: { id: "pr", context: { kind: "thread" }, availability: "action" },
  });
  if (opened) postIntent(threadId, "pr", "show-overview");
  return opened;
}

export function usePrPanelNavigation(threadId: string): void {
  const panel = experimental_useAppPanel();
  useEffect(() => {
    let disposed = false;
    let dispose: (() => void) | undefined;
    // Parent host effects reset the compact drawer on thread changes. Open after
    // they finish, otherwise that reset hides a successfully selected PR tab.
    queueMicrotask(() => {
      if (!disposed) dispose = receivePrPanel(threadId, () => openPrOverview(panel, threadId));
    });
    return () => {
      disposed = true;
      dispose?.();
    };
  }, [threadId, panel]);
}
