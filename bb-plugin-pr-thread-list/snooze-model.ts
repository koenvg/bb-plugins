import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { needsAttention } from "./row-cues";

export interface SnoozeControls {
  snoozed: ReadonlyMap<string, number>;
  snooze: (threadId: string, wakeAt: number) => Promise<unknown>;
  wake: (threadId: string) => Promise<unknown>;
}

export interface SnoozePreset {
  id: "tomorrow" | "next-week";
  label: string;
  wakeAt: number;
}

const WAKE_HOUR = 9;
const MONDAY = 1;

const morning = (now: Date, daysAhead: number) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead, WAKE_HOUR).getTime();

export function snoozePresets(now: Date): SnoozePreset[] {
  const tomorrow = morning(now, 1);
  const nextWeek = morning(now, (MONDAY - now.getDay() + 7) % 7 || 7);
  const presets: SnoozePreset[] = [{ id: "tomorrow", label: "Tomorrow", wakeAt: tomorrow }];
  if (nextWeek !== tomorrow) presets.push({ id: "next-week", label: "Next week", wakeAt: nextWeek });
  return presets;
}

export function wakeLabel(wakeAt: number): string {
  const date = new Date(wakeAt);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  return `${weekday} ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export const wakeTitle = (wakeAt: number) =>
  `Snoozed until ${new Date(wakeAt).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", hourCycle: "h23" })}`;

export const canSnooze = (thread: PluginSidebarThread) => !thread.isArchived && !needsAttention(thread);

export function activeSnoozes(threads: readonly PluginSidebarThread[], snoozes: Readonly<Record<string, number>>,
  now: number): Map<string, number> {
  const active = new Map<string, number>();
  for (const thread of threads) {
    const wakeAt = snoozes[thread.id];
    if (wakeAt !== undefined && wakeAt > now && canSnooze(thread)) active.set(thread.id, wakeAt);
  }
  return active;
}

export const snoozesToEnd = (threads: readonly PluginSidebarThread[], snoozes: Readonly<Record<string, number>>) =>
  threads.filter((thread) => snoozes[thread.id] !== undefined && needsAttention(thread)).map((thread) => thread.id);
