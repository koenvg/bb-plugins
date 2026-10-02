import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ComposerBanner } from "./ui/composer-banner";
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
});
