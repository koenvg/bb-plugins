import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { PR_TAB } from "./pr-panel-navigation";
import { GITHUB_COMMANDS } from "./ui/commands";
import { ComposerBanner } from "./ui/composer-banner";
import { hideHostPrStrip } from "./ui/hide-host-pr-strip";
import { usePrBadge } from "./ui/pr-sidebar-badge";
import { PrPanel } from "./ui/pr-panel";
import { PullRequestsPanel } from "./ui/pull-requests-panel";
import { PANEL_PATH } from "./ui/pull-requests-routes";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "pull-requests",
    title: "Pull Requests",
    icon: "GitPullRequest",
    path: PANEL_PATH,
    component: PullRequestsPanel,
    experimental_useBadge: usePrBadge,
  });
  app.slots.experimental_tab({
    ...PR_TAB,
    icon: "GitPullRequest",
    title: "PR",
    layout: "flush",
    component: PrPanel,
  });
  app.composer.customize({
    id: "pr-insight",
    scopes: ["thread"],
    banners: [{ id: "merge-blockers", component: ComposerBanner }],
  });
  app.contentScripts.register(hideHostPrStrip);
  for (const command of GITHUB_COMMANDS) app.commands.register(command);
});
