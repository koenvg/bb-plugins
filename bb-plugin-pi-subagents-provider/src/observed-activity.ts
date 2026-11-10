type ObservedActivity = Readonly<{
  activityState?: string;
  currentTool?: string;
}>;

export function describeObservedActivity({
  activityState,
  currentTool,
}: ObservedActivity): string | undefined {
  const state = activityState?.trim() ? activityState : undefined;
  const tool = currentTool?.trim();
  const activity = state
    ? `Last observed activity: ${state === "needs_attention" ? "Needs attention" : `"${state}"`}`
    : undefined;
  if (activity && tool) return `${activity} · Reported tool: ${tool}`;
  return activity ?? (tool ? `Last reported tool: ${tool}` : undefined);
}
