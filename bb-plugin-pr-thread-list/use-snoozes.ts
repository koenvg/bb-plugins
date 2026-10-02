import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRpc, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { SNOOZES_CHANGED_CHANNEL, type rpcContract } from "./contract";
import { useLiveRpc } from "./live-rpc";
import { activeSnoozes, snoozesToEnd, type SnoozeControls } from "./snooze-model";

const NONE: Readonly<Record<string, number>> = {};

export function useSnoozes(threads: readonly PluginSidebarThread[], now: number): SnoozeControls & { ready: boolean; values: Readonly<Record<string, number>> } {
  const rpc = useRpc<typeof rpcContract>();
  const read = useCallback(() => rpc.call("listSnoozes", {}), [rpc]);
  const [result, reload, status] = useLiveRpc(SNOOZES_CHANGED_CHANNEL, read);
  const snoozes = result?.snoozes ?? NONE;
  const wake = useCallback((threadId: string) => rpc.call("wake", { threadId }).then(reload), [rpc, reload]);
  const snooze = useCallback((threadId: string, wakeAt: number) => rpc.call("snooze", { threadId, wakeAt }).then(reload),
    [rpc, reload]);
  const snoozed = useMemo(() => activeSnoozes(threads, snoozes, now), [threads, snoozes, now]);
  const ending = useRef(new Set<string>());
  useEffect(() => {
    for (const id of ending.current) if (snoozes[id] === undefined) ending.current.delete(id);
    for (const id of snoozesToEnd(threads, snoozes)) {
      if (ending.current.has(id)) continue;
      ending.current.add(id);
      void wake(id).catch(() => ending.current.delete(id));
    }
  }, [threads, snoozes, wake]);
  return useMemo(() => ({ snoozed, snooze, wake, ready: status === "ready", values: snoozes }),
    [snoozed, snooze, wake, status, snoozes]);
}
