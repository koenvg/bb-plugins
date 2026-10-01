import { useEffect } from "react";
import { useBbNavigate, type BbNavigate } from "@get-bb/plugin-sdk/app";

export type PanelIntent = "new-task" | "help";

type IntentListener = (intent: PanelIntent) => void;

const navigators: BbNavigate[] = [];
let intentListener: IntentListener | null = null;
let pendingIntent: PanelIntent | null = null;

function currentNavigator(): BbNavigate | undefined {
  return navigators[navigators.length - 1];
}

export function canRunTasksCommand(): boolean {
  return currentNavigator() !== undefined;
}

export function openTasksPanel(subPath: string): void {
  currentNavigator()?.toPluginPanel("tasks", { subPath });
}

export function sendPanelIntent(intent: PanelIntent): void {
  if (intentListener !== null) {
    intentListener(intent);
    return;
  }
  const navigate = currentNavigator();
  if (navigate === undefined) return;
  pendingIntent = intent;
  navigate.toPluginPanel("tasks");
}

export function useCommandNavigator(): void {
  const navigate = useBbNavigate();
  useEffect(() => {
    navigators.push(navigate);
    return () => {
      navigators.splice(navigators.lastIndexOf(navigate), 1);
    };
  }, [navigate]);
}

export function usePanelIntents(listener: IntentListener): void {
  useEffect(() => {
    intentListener = listener;
    if (pendingIntent !== null) {
      const intent = pendingIntent;
      pendingIntent = null;
      listener(intent);
    }
    return () => {
      if (intentListener === listener) intentListener = null;
    };
  }, [listener]);
}
