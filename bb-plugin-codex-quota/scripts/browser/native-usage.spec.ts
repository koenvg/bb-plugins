import { test, expect, viewport, capture, noOverflow, jsonEvidence, sizes } from "./fixtures.js";
import type { Page } from "@playwright/test";
import type { CalendarSnapshot } from "../../src/history/calendar/calendar-contract.js";

async function recorded(page: Page, expected: string) {
  const table = page.getByRole("table", { name: "Daily recorded usage", exact: true });
  await expect(table).toHaveCount(1);
  const row = table.locator("tbody tr").filter({
    has: page.getByRole("rowheader", { name: "2026-09-15", exact: true }),
  });
  await expect(row.locator("td").first()).toHaveText(expected);
  await expect(page.getByRole("group", { name: "Recorded tokens by speed" })).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText(/Fast|Ultrafast|Missing or unknown speed/);
  await noOverflow(page);
}
async function unobserved(page: Page, coverage: string) {
  const days = page
    .getByRole("table", { name: "Daily recorded usage", exact: true })
    .locator("tbody tr");
  await expect(days).toHaveCount(30);
  await expect(days.locator("td:first-of-type")).toHaveText(Array(30).fill("Unavailable"));
  await expect(days.locator("td:nth-of-type(2)")).toHaveText(Array(30).fill(coverage));
  await expect(days.locator("td:nth-of-type(4)")).toHaveText(
    Array(30).fill("0 of 0 accepted records priced; 0 priced active entities; pricing unavailable"),
  );
  await expect(
    page.getByRole("group", { name: "Models", exact: true }).getByRole("button"),
  ).toHaveCount(0);
}

for (const width of sizes) {
  test(`native backend totals and controls ${width}px`, async ({ page }, info) => {
    await viewport(page, width);
    await page.goto("/native-usage.html");
    await recorded(page, "900");
    const calls = await page.evaluate(() => (window as any).nativeUsageFixture.calls.length);
    await page.getByRole("button", { name: "Estimated cost", exact: true }).click();
    await recorded(page, "$0.06");
    expect(await page.evaluate(() => (window as any).nativeUsageFixture.calls.length)).toBe(calls);
    await page.getByRole("button", { name: "Workspaces", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Top 10 workspaces" })).toBeVisible();
    await page.getByRole("button", { name: "Threads", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Top 10 threads" })).toBeVisible();
    await recorded(page, "$0.06");
    await capture(page, info, `native-all-${width}`);
    await page.getByRole("button", { name: "Previous 30 days", exact: true }).click();
    const subtotal = page.getByLabel("Recorded token subtotal", { exact: true });
    await expect(subtotal).toBeVisible();
    await expect(subtotal).toHaveText("Unknown");
    await expect(subtotal).not.toHaveAttribute("title");
    await unobserved(page, "Partial, coverage gaps");
    const reports: CalendarSnapshot[] = await page.evaluate(
      () => (window as any).nativeUsageFixture.reports,
    );
    const previousReports = reports.filter((report) => report.query.startDate === "2026-08-03");
    await jsonEvidence(info, "unobserved-backend-reports.json", previousReports);
    expect(previousReports).toHaveLength(2);
    for (const report of previousReports) {
      expect(report).toMatchObject({
        state: "unknown",
        ranking: [],
        summary: { totalTokens: 0, activeEntities: 0, money: { records: 0, capturedCost: null } },
      });
      expect(report.days).toHaveLength(30);
      for (const day of report.days)
        expect(day).toMatchObject({
          totalTokens: 0,
          activeEntities: 0,
          coverage: { state: "incomplete", zero: false },
          models: { named: [], otherTokens: 0 },
          classes: { state: "unavailable" },
          money: { state: "unavailable", records: 0, capturedCost: null },
        });
    }
    await capture(page, info, `native-unobserved-${width}`);
    await page.getByRole("button", { name: "Next 30 days", exact: true }).click();
    await recorded(page, "$0.06");
    await expect(subtotal).toHaveText("900");
    await expect(subtotal).toHaveAttribute("title", "900 tokens");
    await page.getByRole("button", { name: "Host fixture", exact: true }).click();
    await recorded(page, "450");
    await page.getByRole("combobox", { name: "Report metric" }).selectOption("cost");
    await recorded(page, "$0.03");
    await capture(page, info, `native-host-${width}`);
    await page.getByRole("button", { name: "Previous 30 days", exact: true }).click();
    await unobserved(page, "Partial, coverage gaps");
    await page.getByRole("button", { name: "Next 30 days", exact: true }).click();
    await recorded(page, "$0.03");
    await page.getByRole("combobox", { name: "Report metric" }).selectOption("tokens");
    await recorded(page, "450");
    await jsonEvidence(
      info,
      "backend-reports.json",
      await page.evaluate(() => (window as any).nativeUsageFixture),
    );
  });

  test(`native loading reserves chart space ${width}px`, async ({ page }, info) => {
    await viewport(page, width);
    await page.goto("/native-usage.html?state=loading");
    const panel = page.getByRole("region", { name: "All-machine recorded usage", exact: true });
    await expect(panel).toHaveAttribute("aria-busy", "true");
    const before = await panel.boundingBox();
    await capture(page, info, `native-loading-${width}`);
    await page.getByRole("button", { name: "Release loading" }).click();
    await recorded(page, "900");
    const after = await panel.boundingBox();
    expect(after?.y).toBe(before?.y);
    expect(after!.height).toBeGreaterThanOrEqual(280);
    await jsonEvidence(info, "loading-layout.json", { before, after });
  });

  test(`native host retry ${width}px`, async ({ page }, info) => {
    await viewport(page, width);
    await page.goto("/native-usage.html?state=retry&scope=host");
    await expect(page.getByText("Selected host is offline.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reconnect fixture", exact: true }).click();
    await page.getByRole("button", { name: "Retry chart", exact: true }).click();
    await recorded(page, "450");
    await capture(page, info, `native-retry-${width}`);
  });

  test(`native offline summaries ${width}px`, async ({ page }, info) => {
    await viewport(page, width);
    await page.goto("/native-usage.html?state=offline");
    await recorded(page, "900");
    await expect(page.getByText(/Last-known summaries retained for Host B/)).toBeVisible();
    await capture(page, info, `native-offline-${width}`);
  });
}
