import { type PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import { boundedValue } from "../subagents-contract.js";
import { useSubagentsHistory } from "./use-subagents-history.js";
import { SubagentsView } from "./subagents-view.js";

function parseTarget(params: unknown): { rowId?: string | null; overview?: boolean } {
  if (params === null || params === undefined) return {};
  if (!boundedValue(params, 2048) || typeof params !== "object" || Array.isArray(params))
    return { rowId: null };
  const value = params as Record<string, unknown>;
  if (Object.keys(value).length === 0) return {};
  if (Object.keys(value).length === 1 && value.overview === true) return { overview: true };
  if (
    Object.keys(value).length !== 1 ||
    typeof value.rowId !== "string" ||
    !value.rowId.trim() ||
    value.rowId.length > 1800
  )
    return { rowId: null };
  return { rowId: value.rowId };
}

export function SubagentsPanel({ threadId, params }: PluginThreadPanelProps) {
  const current = useSubagentsHistory(threadId);
  const target = parseTarget(params);
  return (
    <SubagentsView
      key={threadId}
      state={current.state}
      loading={current.loading}
      error={current.error}
      warning={current.warning}
      target={target.rowId}
      overview={target.overview}
    />
  );
}
