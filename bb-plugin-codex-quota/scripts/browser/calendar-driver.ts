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
  await expect(page.locator('.ts-chart[role="img"]')).toBeVisible();
  await page.waitForFunction(() => {
    const container = document.querySelector(".ts-chart-host")!.getBoundingClientRect();
    const surface = document.querySelector(".ts-chart")!.getBoundingClientRect();
    return container.width > 250 && Math.abs(container.width - surface.width) < 1;
  });
}
async function tooltipFacts(page: Page, metric: Metric, row: string[], fromDate?: string | null) {
  const definitions = await page
    .locator(".calendar-tooltip dl > div")
    .evaluateAll((elements) =>
      elements.map((e) => [
        e.querySelector("dt")!.textContent!,
        e.querySelector("dd")!.textContent!,
      ]),
    );
  const lines = await page
    .locator(
      '.calendar-tooltip [role="tooltip"] > div:not([aria-label="Tokens by model and speed"]) p',
    )
    .allTextContents();
  const date = await page.locator(".calendar-tooltip time").getAttribute("datetime");
  verifyTooltip(row, metric, date, definitions, lines, fromDate);
  return {
    row,
    tooltip: await page.locator(".calendar-tooltip").textContent(),
    lines,
    definitions,
    ...(fromDate === undefined ? {} : { fromDate }),
  };
}
export async function pointAtDate(
  page: Page,
  index: number,
  position: "top" | "baseline" = "baseline",
) {
  const point = await page.locator(".ts-chart").evaluate(
    (surface, { index, position }) => {
      const bounds = surface.getBoundingClientRect();
      const grid = surface.querySelector<SVGLineElement>("[data-ts-key^='y-grid:']")!;
      const left = grid.x1.baseVal.value;
      const right = grid.x2.baseVal.value;
      const lines = Array.from(
        surface.querySelectorAll<SVGLineElement>("[data-ts-key^='y-grid:']"),
      );
      const top = Math.min(...lines.map((line) => line.y1.baseVal.value));
      const baseline = Math.max(...lines.map((line) => line.y1.baseVal.value));
      const plotWidth = right - left;
      const step = plotWidth / 30.2;
      return {
        x: bounds.left + left + step * (index + 0.6),
        y: bounds.top + (position === "top" ? top + 2 : baseline - 2),
      };
    },
    { index, position },
  );
  const viewport = page.viewportSize()!;
  expect(point.x).toBeGreaterThan(0);
  expect(point.x).toBeLessThan(viewport.width);
  expect(point.y).toBeGreaterThan(0);
  expect(point.y).toBeLessThan(viewport.height);
  await page.mouse.move(point.x, point.y);
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
  const surface = page.locator('.ts-chart[role="img"]');
  await page.mouse.move(0, 0);
  await surface.focus();
  await renderedInputFrames(page);
  await page.keyboard.press("Home");
  const date = page.locator(".calendar-tooltip time");
  await expect(date).toHaveAttribute("datetime", dailyRows[0][0]);
  for (let step = 0; step < 14; step++) {
    await renderedInputFrames(page);
    await page.keyboard.press("ArrowRight");
    await expect(date).toHaveAttribute("datetime", dailyRows[step + 1][0]);
  }
  const keyboard = await tooltipFacts(page, metric, dailyRows[14]);
  await renderedInputFrames(page);
  await page.keyboard.press("ArrowLeft");
  await expect(date).toHaveAttribute("datetime", dailyRows[13][0]);
  const fromDate = await date.getAttribute("datetime");
  await renderedInputFrames(page);
  await pointAtDate(page, 14);
  await expect(date).toHaveAttribute("datetime", dailyRows[14][0]);
  const pointer = await tooltipFacts(page, metric, dailyRows[14], fromDate);
  return { ...keyboard, pointer };
}
export async function axFacts(page: Page, dailyRows: string[][], metric: Metric) {
  const session = await page.context().newCDPSession(page);
  try {
    const result = await session.send("Accessibility.getFullAXTree");
    const headers =
      metric === "tokens"
        ? await page.locator('table[aria-label="Daily recorded usage"] thead th').allTextContents()
        : [];
    return accessibleFacts(result.nodes as AxNode[], dailyRows, metric, "UTC", headers.slice(11));
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
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("1.2 thousand");
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
