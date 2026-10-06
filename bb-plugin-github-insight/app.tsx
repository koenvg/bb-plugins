import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { GITHUB_COMMANDS } from "./ui/commands";
import { ComposerBanner } from "./ui/composer-banner";
import { hideHostPrStrip } from "./ui/hide-host-pr-strip";
import { PrSidebarBadge } from "./ui/pr-sidebar-badge";
import { PrTab } from "./ui/pr-tab";
import { PullRequestsPanel } from "./ui/pull-requests-panel";
import { PANEL_PATH } from "./ui/pull-requests-routes";
import { ReviewTab } from "./ui/review-tab";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "pull-requests",
    title: "Pull Requests",
    icon: "GitPullRequest",
    path: PANEL_PATH,
    component: PullRequestsPanel,
    experimental_sidebarAccessory: PrSidebarBadge,
  });
  app.slots.threadPanelAction({
    id: "pr",
    title: "PR",
    layout: "padded",
    component: PrTab,
  });
  app.slots.threadPanelAction({
    id: "review",
    title: "Review",
    layout: "flush",
    component: ReviewTab,
  });
  app.composer.customize({
    id: "pr-insight",
    scopes: ["thread"],
    banners: [{ id: "merge-blockers", component: ComposerBanner }],
  });
  app.contentScripts.register(hideHostPrStrip);
  for (const command of GITHUB_COMMANDS) app.commands.register(command);
});
