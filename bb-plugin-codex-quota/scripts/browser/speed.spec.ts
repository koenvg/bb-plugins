import { test, expect, viewport, capture, noOverflow, jsonEvidence, sizes } from "./fixtures.js";
import type { Page } from "@playwright/test";

async function totals(page: Page, expected: number[]) {
  const group = page.getByRole("group", { name: "Recorded tokens by speed" });
  await expect(group).toBeVisible();
  await expect(group.locator("dt")).toHaveText(["Normal", "Fast", "Ultrafast"]);
  for (const [index, label] of ["Normal", "Fast", "Ultrafast"].entries()) {
    const value = group.getByLabel(`${label} tokens`, { exact: true });
    await expect(value).toHaveText(expected[index].toLocaleString("en-US"));
    await expect(value).toHaveAccessibleDescription(
      `${expected[index].toLocaleString("en-US")} recorded tokens`,
    );
  }
  await expect(
    page.getByText("Missing or unknown speed counts as Normal. The graph calls this Default.", {
      exact: true,
    }),
  ).toBeVisible();
  await noOverflow(page);
}

for (const width of sizes) {
  test(`speed backend totals and controls ${width}px`, async ({ page }, info) => {
    await viewport(page, width);
    await page.goto("/speed.html");
    // Two independent machines keep both copies of the public backend report.
    await totals(page, [300, 360, 240]);
    const calls = await page.evaluate(() => (window as any).speedFixture.calls.length);
    await page.getByRole("button", { name: "Estimated cost", exact: true }).click();
    await totals(page, [300, 360, 240]);
    expect(await page.evaluate(() => (window as any).speedFixture.calls.length)).toBe(calls);
    await page.getByRole("button", { name: "Workspaces", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Top 10 workspaces" })).toBeVisible();
    await page.getByRole("button", { name: "Threads", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Top 10 threads" })).toBeVisible();
    await totals(page, [300, 360, 240]);
    await capture(page, info, `speed-all-${width}`);
    await page.getByRole("button", { name: "Previous 30 days", exact: true }).click();
    await totals(page, [0, 0, 0]);
    await page.getByRole("button", { name: "Next 30 days", exact: true }).click();
    await totals(page, [300, 360, 240]);
    await page.getByRole("button", { name: "Host fixture", exact: true }).click();
    await totals(page, [150, 180, 120]);
    await page.getByRole("combobox", { name: "Report metric" }).selectOption("cost");
    await totals(page, [150, 180, 120]);
    await capture(page, info, `speed-host-${width}`);
    await page.getByRole("button", { name: "Previous 30 days", exact: true }).click();
    await totals(page, [0, 0, 0]);
    await page.getByRole("button", { name: "Next 30 days", exact: true }).click();
    await totals(page, [150, 180, 120]);
    await jsonEvidence(
      info,
      "backend-reports.json",
      await page.evaluate(() => (window as any).speedFixture),
    );
  });

  test(`speed loading reserves group space ${width}px`, async ({ page }, info) => {
    await viewport(page, width);
    await page.goto("/speed.html?state=loading");
    const group = page.getByRole("group", { name: "Recorded tokens by speed" });
    await expect(group.getByLabel("Normal tokens", { exact: true })).toHaveText("—");
    const before = await group.boundingBox();
    await capture(page, info, `speed-loading-${width}`);
    await page.getByRole("button", { name: "Release loading" }).click();
    await totals(page, [300, 360, 240]);
    const after = await group.boundingBox();
    expect(after?.y).toBe(before?.y);
    expect(after?.height).toBe(before?.height);
    await jsonEvidence(info, "loading-layout.json", { before, after });
  });

  test(`speed host retry ${width}px`, async ({ page }, info) => {
    await viewport(page, width);
    await page.goto("/speed.html?state=retry&scope=host");
    await expect(page.getByText("Selected host is offline.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reconnect fixture", exact: true }).click();
    await page.getByRole("button", { name: "Retry chart", exact: true }).click();
    await totals(page, [150, 180, 120]);
    await capture(page, info, `speed-retry-${width}`);
  });

  test(`speed offline summaries ${width}px`, async ({ page }, info) => {
    await viewport(page, width);
    await page.goto("/speed.html?state=offline");
    await totals(page, [300, 360, 240]);
    await expect(page.getByText(/Last-known summaries retained for Host B/)).toBeVisible();
    await capture(page, info, `speed-offline-${width}`);
  });
}
