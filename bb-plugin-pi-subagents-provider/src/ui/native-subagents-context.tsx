import { useEffect } from "react";
import { useBbNavigate, useComposer } from "@get-bb/plugin-sdk/app";
import { bindNativeSubagents } from "./native-composer-navigation.js";
import { useSubagentsHistory } from "./use-subagents-history.js";

/** Bare SDK receiver only. It adds no DOM or layout to the native composer. */
export function NativeSubagentsContext() {
  const composer = useComposer();
  const threadId = composer.scope.kind === "thread" ? composer.scope.threadId : undefined;
  const providerId = composer.selection?.providerId;
  const current = useSubagentsHistory(providerId === "pi-subagents" ? threadId : undefined);
  const navigate = useBbNavigate();
  useEffect(() => {
    if (!threadId) return;
    return bindNativeSubagents({
      threadId,
      providerId,
      rows:
        !current.loading && !current.error && current.state?.availability === "available"
          ? current.state.rows
          : [],
      open: (rowId) =>
        navigate.openThreadPanel({
          actionId: "subagents",
          params: rowId === null ? { overview: true } : { rowId },
        }),
    });
  }, [threadId, providerId, current.state, current.loading, current.error, navigate]);
  return null;
}
