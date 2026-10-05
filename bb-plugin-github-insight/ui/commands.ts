import type { PluginCommandContext, PluginCommandRegistration } from "@get-bb/plugin-sdk/app";
import { postIntent, type CommandTab, type IntentOf } from "./command-intents";
import { canMerge, hasPr } from "./pr-availability";

type ThreadCheck = (threadId: string) => boolean;

function availableWhen(check: ThreadCheck) {
  return (context: PluginCommandContext) => context.threadId !== null && check(context.threadId);
}

function openTabCommand(id: string, title: string, tab: CommandTab): PluginCommandRegistration {
  return {
    id,
    title,
    isAvailable: availableWhen(hasPr),
    run: (context) => {
      if (context.threadId !== null) context.openPanel({ actionId: tab });
    },
  };
}

function intentCommand<Tab extends CommandTab>(
  id: string,
  title: string,
  tab: Tab,
  intent: IntentOf<Tab>,
  check: ThreadCheck = hasPr,
): PluginCommandRegistration {
  return {
    id,
    title,
    isAvailable: availableWhen(check),
    run: (context) => {
      const { threadId } = context;
      if (threadId !== null && context.openPanel({ actionId: tab }))
        postIntent(threadId, tab, intent);
    },
  };
}

export const GITHUB_COMMANDS: readonly PluginCommandRegistration[] = [
  {
    id: "merge-pr",
    title: "GitHub: Merge PR",
    isAvailable: availableWhen(canMerge),
    run: ({ threadId }) => {
      if (threadId !== null) postIntent(threadId, "merge", "merge");
    },
  },
  openTabCommand("open-pr-tab", "GitHub: Open PR tab", "pr"),
  openTabCommand("open-review-tab", "GitHub: Open Review tab", "review"),
  intentCommand("submit-review", "GitHub: Submit review", "review", "submit"),
  intentCommand("refresh-pr", "GitHub: Refresh PR", "pr", "refresh"),
  intentCommand("open-pr-on-github", "GitHub: Open PR on GitHub", "pr", "open-on-github"),
];
