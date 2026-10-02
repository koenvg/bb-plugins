import { useEffect } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { receivePrPanel } from "../pr-panel-navigation";

export function usePrPanelNavigation(threadId: string): void {
  const navigate = useBbNavigate();
  useEffect(() => {
    let disposed = false;
    let dispose: (() => void) | undefined;
    // Parent host effects reset the compact drawer on thread changes. Open after
    // they finish, otherwise that reset hides a successfully selected PR tab.
    queueMicrotask(() => {
      if (!disposed) dispose = receivePrPanel(threadId, () => navigate.openThreadPanel({ actionId: "pr" }));
    });
    return () => { disposed = true; dispose?.(); };
  }, [threadId, navigate]);
}
