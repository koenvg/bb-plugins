// @vitest-environment jsdom
import { expect, it } from "vitest";
import { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";

it("uses the host badge for rail and list navigation without a duplicate DOM overlay", async () => {
  const app = await loadPluginApp(() => import("../app"));
  expect(
    app.navPanels.find((panel) => panel.id === "pull-requests")?.experimental_useBadge,
  ).toBeTypeOf("function");
  expect(app.appOverlays.some((overlay) => overlay.id === "pr-rail-badge")).toBe(false);
});
