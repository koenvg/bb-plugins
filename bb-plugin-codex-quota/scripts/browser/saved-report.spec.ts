import { test, expect, sizes, viewport, noOverflow, capture, jsonEvidence } from "./fixtures.js";
import { chart } from "./calendar-driver.js";
import type { Page } from "@playwright/test";

type Receipt = { event: string; query?: { group: string; startDate: string } };
type Fixture = {
  events: Receipt[];
  errors: string[];
  release(name: string): void;
};
const receipts = (page: Page) =>
  page.evaluate(() => (window as unknown as { savedFixture: Fixture }).savedFixture.events);
const release = (page: Page, name: string) =>
  page.evaluate(
    (name) => (window as unknown as { savedFixture: Fixture }).savedFixture.release(name),
    name,
  );
for (const width of sizes) {
  test(`saved opening ${width} shows literal totals before held work and revalidates`, async ({
    page,
  }, info) => {
    await viewport(page, width);
    await page.goto("/saved.html");
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("1.2 thousand");
    await expect(page.getByLabel("Recorded token subtotal")).toHaveAttribute(
      "title",
      "1,200 tokens",
    );
    await expect(page.getByLabel("Captured cost subtotal")).toHaveText("$6.00");
    await expect(page.getByText(/Last-known summaries retained/)).toBeVisible();
    await expect(page.getByText("Refreshing recorded usage…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous 30 days" })).toBeEnabled();
    const held = await receipts(page);
    expect(
      held.filter((row) => row.event === "live-request").map((row) => row.query?.group),
    ).toEqual(["workspace", "thread"]);
    expect(
      held
        .filter((row) => row.event.endsWith("response"))
        .map((row) => [row.event, row.query?.group]),
    ).toEqual([["saved-response", "workspace"]]);
    expect(held.filter((row) => row.event === "preparation-request")).toHaveLength(1);
    await noOverflow(page);
    await capture(page, info, "saved-before-held-work");
    const panelBefore = await page
      .getByRole("region", { name: "All-machine recorded usage" })
      .boundingBox();
    expect(panelBefore?.width).toBe(width === 375 ? 335 : 960);
    await chart(page);
    const chartBefore = await page.locator(".ts-chart-host").boundingBox();
    await page.getByRole("button", { name: "Estimated cost", exact: true }).click();
    expect(await receipts(page)).toEqual(held);
    await page.getByRole("button", { name: "Previous 30 days" }).click();
    await expect(page.getByText("2026-08-03 – 2026-09-01", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("1.2 thousand");
    await release(page, "live");
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("1.8 thousand");
    await expect(page.getByLabel("Recorded token subtotal")).toHaveAttribute(
      "title",
      "1,800 tokens",
    );
    await expect(page.getByLabel("Captured cost subtotal")).toHaveText("$9.00");
    await expect(page.getByText(/Last-known summaries retained/)).toHaveCount(0);
    await chart(page);
    const chartAfter = await page.locator(".ts-chart-host").boundingBox();
    expect(chartAfter).toEqual(chartBefore);
    const refreshed = await receipts(page);
    expect(refreshed.some((row) => row.event === "preparation-response")).toBe(false);
    expect(
      refreshed.some((row) => row.event === "saved-response" && row.query?.group === "thread"),
    ).toBe(false);
    await release(page, "threads");
    await release(page, "preparation");
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("1.8 thousand");
    await page.getByRole("button", { name: "Latest", exact: true }).click();
    await expect(page.getByText("2026-09-02 – 2026-10-01", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("1.8 thousand");
    await page.reload();
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("1.2 thousand");
    await expect(page.getByText(/Last-known summaries retained/)).toBeVisible();
    await release(page, "live");
    await release(page, "threads");
    await release(page, "preparation");
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("1.8 thousand");
    await noOverflow(page);
    const panelAfter = await page
      .getByRole("region", { name: "All-machine recorded usage" })
      .boundingBox();
    expect(panelAfter?.x).toBe(panelBefore?.x);
    expect(panelAfter?.width).toBe(panelBefore?.width);
    await capture(page, info, "live-after-reopen");
    await jsonEvidence(info, "request-order.json", {
      synthetic: true,
      held,
      refreshed,
      final: await receipts(page),
      chartBefore,
      chartAfter,
      panelBefore,
      panelAfter,
    });
    expect(
      await page.evaluate(
        () => (window as unknown as { savedFixture: Fixture }).savedFixture.errors,
      ),
    ).toEqual([]);
  });

  test(`saved opening ${width} cold live progresses independently of a held snapshot`, async ({
    page,
  }, info) => {
    await viewport(page, width);
    await page.goto("/saved.html?state=cold");
    await expect(page.getByText("Loading recorded usage…")).toBeVisible();
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("—");
    const held = await receipts(page);
    expect(
      held.filter((row) => row.event === "live-request").map((row) => row.query?.group),
    ).toEqual(["workspace", "thread"]);
    expect(held.filter((row) => row.event === "saved-response")).toEqual([]);
    await release(page, "live");
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("1.8 thousand");
    await expect(page.getByLabel("Captured cost subtotal")).toHaveText("$9.00");
    const beforeSaved = await receipts(page);
    expect(beforeSaved.some((row) => row.event === "saved-response")).toBe(false);
    expect(beforeSaved.some((row) => row.event === "preparation-response")).toBe(false);
    await release(page, "saved");
    await release(page, "threads");
    await expect
      .poll(
        async () => (await receipts(page)).filter((row) => row.event === "saved-response").length,
      )
      .toBe(2);
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("1.8 thousand");
    await expect(page.getByLabel("Captured cost subtotal")).toHaveText("$9.00");
    await expect(page.getByText(/Last-known summaries retained/)).toHaveCount(0);
    await noOverflow(page);
    await capture(page, info, "cold-live-before-snapshot");
    await jsonEvidence(info, "request-order.json", {
      synthetic: true,
      held,
      beforeSaved,
      final: await receipts(page),
    });
    expect(
      await page.evaluate(
        () => (window as unknown as { savedFixture: Fixture }).savedFixture.errors,
      ),
    ).toEqual([]);
  });
}
