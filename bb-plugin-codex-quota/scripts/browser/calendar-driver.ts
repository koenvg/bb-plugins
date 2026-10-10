import type { Page } from "@playwright/test";
import { expect } from "./fixtures.js";
import { accessibleFacts, verifyTooltip, type Metric, type AxNode } from "./proof.js";

export type Call = {
  method: string;
  input: {
    hostId?: string;
    query?: { group: string; scope: unknown; comparison?: unknown; includeUncertain?: boolean };
  };
};
declare global {
  interface Window {
    calendarFixture: { calls: Call[]; errors: string[]; pending(): number };
  }
}
export const calls = (page: Page): Promise<Call[]> =>
  page.evaluate(() => window.calendarFixture.calls);
export const rows = (page: Page): Promise<string[][]> =>
  page
    .locator('table[aria-label="Daily recorded usage"] tbody tr')
    .evaluateAll((elements) =>
      elements.map((row) => Array.from(row.children, (cell) => cell.textContent ?? "")),
    );
export async function chart(page: Page) {
  await expect(page.locator('.recharts-surface[role="application"]')).toBeVisible();
  await page.waitForFunction(() => {
    const container = document
      .querySelector(".recharts-responsive-container")!
      .getBoundingClientRect();
    const surface = document.querySelector(".recharts-surface")!.getBoundingClientRect();
    return container.width > 250 && Math.abs(container.width - surface.width) < 1;
  });
}
async function tooltipFacts(page: Page, metric: Metric, row: string[], fromDate?: string | null) {
  const definitions = await page
    .locator(".recharts-tooltip-wrapper dl > div")
    .evaluateAll((elements) =>
      elements.map((e) => [
        e.querySelector("dt")!.textContent!,
        e.querySelector("dd")!.textContent!,
      ]),
    );
  const lines = await page
    .locator('.recharts-tooltip-wrapper [role="tooltip"] > div p')
    .allTextContents();
  const date = await page.locator(".recharts-tooltip-wrapper time").getAttribute("datetime");
  verifyTooltip(row, metric, date, definitions, lines, fromDate);
  return {
    row,
    tooltip: await page.locator(".recharts-tooltip-wrapper").textContent(),
    lines,
    definitions,
    ...(fromDate === undefined ? {} : { fromDate }),
  };
}
async function renderedInputFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}
export async function tooltip(page: Page, metric: Metric, dailyRows: string[][]) {
  const surface = page.locator('.recharts-surface[role="application"]');
  // Clear pointer selection in the chart margin, then drain its queued frame before keyboard input.
  await surface.hover({ position: { x: 1, y: 1 } });
  await renderedInputFrames(page);
  await page.mouse.move(0, 0);
  await surface.focus();
  await page.keyboard.press("ArrowRight");
  // A retained tooltip can already match the target date before this input is rendered.
  await renderedInputFrames(page);
  const date = page.locator(".recharts-tooltip-wrapper time");
  await expect(date).toHaveAttribute("datetime", /2026-/);
  for (let step = 0; step < 30; step++) {
    const currentDate = await date.getAttribute("datetime");
    const index = dailyRows.findIndex((row) => row[0] === currentDate);
    expect(index).toBeGreaterThanOrEqual(0);
    if (index === 14) break;
    await page.keyboard.press(index > 14 ? "ArrowLeft" : "ArrowRight");
    await expect(date).not.toHaveAttribute("datetime", currentDate!);
  }
  await expect(date).toHaveAttribute("datetime", dailyRows[14][0]);
  const keyboard = await tooltipFacts(page, metric, dailyRows[14]);
  const bar = page.locator(".recharts-bar-rectangle path").filter({ visible: true }).first();
  let pointer = null;
  if (await bar.count()) {
    await page.keyboard.press("ArrowLeft");
    await expect(date).not.toHaveAttribute("datetime", dailyRows[14][0]);
    const fromDate = await date.getAttribute("datetime");
    expect(dailyRows.map((row) => row[0])).toContain(fromDate);
    // Status banners can move the chart during keyboard input. Resolve its current position.
    // Locator.hover can auto-scroll SVG paths out of view in Chromium. Use real pointer input
    // at the current visible bar instead, without changing the viewport for this proof.
    // Metric changes can detach the path between reads. Wait for visible geometry.
    let box: Awaited<ReturnType<typeof bar.boundingBox>> = null;
    await expect
      .poll(async () => (box = await bar.boundingBox()), { timeout: 5_000 })
      .not.toBeNull();
    const readyBox = box!;
    const point = { x: readyBox.x + readyBox.width / 2, y: readyBox.y + readyBox.height / 2 };
    const viewport = page.viewportSize()!;
    expect(point.x).toBeGreaterThan(0);
    expect(point.x).toBeLessThan(viewport.width);
    expect(point.y).toBeGreaterThan(0);
    expect(point.y).toBeLessThan(viewport.height);
    await page.mouse.move(point.x, point.y);
    await expect(date).toHaveAttribute("datetime", dailyRows[14][0]);
    pointer = await tooltipFacts(page, metric, dailyRows[14], fromDate);
  }
  return { ...keyboard, pointer };
}
export async function axFacts(page: Page, dailyRows: string[][], metric: Metric) {
  const session = await page.context().newCDPSession(page);
  try {
    const result = await session.send("Accessibility.getFullAXTree");
    return accessibleFacts(result.nodes as AxNode[], dailyRows, metric);
  } finally {
    await session.detach();
  }
}
export async function interactions(page: Page, state: string, suite: string) {
  const click = (name: string) => page.getByRole("button", { name, exact: true }).click();
  const daily = page.locator('table[aria-label="Daily recorded usage"]');
  const chartReads = async () =>
    (await calls(page)).filter(
      (call) => call.method === "machineReports" && call.input.query!.group === "workspace",
    ).length;
  if (state === "partial" && suite === "calendar") {
    const start = await chartReads();
    for (const date of ["2026-08-03", "2026-07-04"]) {
      await click("Previous 30 days");
      await expect(daily).toContainText(date);
    }
    await expect(
      page.getByRole("button", { name: "Previous 30 days", exact: true }),
    ).toBeDisabled();
    for (const date of ["2026-08-03", "2026-09-02"]) {
      await click("Next 30 days");
      await expect(daily).toContainText(date);
    }
    expect(await chartReads()).toBe(start + 4);
  }
  if (state === "retry") {
    const start = await chartReads();
    await click("Retry chart");
    await chart(page);
    expect(await chartReads()).toBe(start + 1);
  }
  if (state === "stale") {
    const start = await chartReads();
    await click("Refresh chart");
    await expect(
      page.getByText("Recorded values are out of date.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry chart", exact: true })).toBeEnabled();
    expect(await chartReads()).toBe(start + 1);
    expect((await rows(page))[14][1]).not.toMatch(/^(Unavailable|0)$/);
  }
  if (["latest", "cancel"].includes(state)) {
    const start = await chartReads();
    await click("Previous 30 days");
    await expect.poll(chartReads).toBe(start + 1);
    await expect(daily).toHaveCount(0);
    if (state === "latest")
      await expect(
        page.getByText("No usable recorded history for this range.", { exact: false }),
      ).toBeVisible();
    else await page.waitForFunction(() => window.calendarFixture.pending() > 0);
    await click("Latest");
    await chart(page);
    expect((await rows(page))[0][0]).toBe("2026-09-02");
    expect(await chartReads()).toBe(start + 2);
    if (state === "cancel") {
      const before = await rows(page);
      await click("Release pending responses");
      await page.waitForTimeout(200); // Observe delayed obsolete response completion.
      expect(await rows(page)).toEqual(before);
    }
  }
  if (state === "offline") {
    await expect(
      page.getByText("Last-known summaries retained for Host B", { exact: false }),
    ).toBeVisible();
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("1.2K");
    expect((await calls(page)).some((call) => call.method === "selectHost")).toBe(false);
  }
  if (state === "settings") {
    const managementReads = () =>
      calls(page).then((items) =>
        items.filter((call) => ["historyReadiness", "historicalImport"].includes(call.method)),
      );
    expect(await managementReads()).toHaveLength(0);
    await click("Show usage settings");
    await expect(page.getByLabel("Usage collection settings")).toBeVisible();
    expect(await managementReads()).toHaveLength(0);
    await page.locator("summary", { hasText: "Machine status and collection settings" }).click();
    expect(await managementReads()).toHaveLength(0);
    const management = page.getByRole("button", { name: "Manage history", exact: true });
    await management.nth(0).click();
    await page.waitForFunction(() => window.calendarFixture.pending() === 2);
    await management.nth(0).click();
    await expect(page.getByLabel("History readiness")).toHaveCount(0);
    await management.nth(1).click();
    await page.waitForFunction(() => window.calendarFixture.pending() === 4);
    await click("Release pending responses");
    await expect(
      page.getByText("History not configured on this host.", { exact: false }),
    ).toBeVisible();
    const requests = await managementReads();
    expect(requests).toHaveLength(4);
    expect(requests.slice(0, 2).every((call) => call.input.hostId === "host_a")).toBe(true);
    expect(requests.slice(2).every((call) => call.input.hostId === "host_b")).toBe(true);
    await click("Show chart");
    await chart(page);
  }
}
