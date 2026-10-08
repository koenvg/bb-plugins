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
  const bar = await page.locator(".recharts-bar-rectangle path").evaluateAll((elements) => {
    const element = elements.find((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 10) };
  });
  let pointer = null;
  if (bar) {
    await page.keyboard.press("ArrowLeft");
    await expect(date).not.toHaveAttribute("datetime", dailyRows[14][0]);
    const fromDate = await date.getAttribute("datetime");
    expect(dailyRows.map((row) => row[0])).toContain(fromDate);
    await page.mouse.move(bar.x, bar.y);
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
  const methodsSince = async (start: number) =>
    (await calls(page)).slice(start).map((call) => call.method);
  if (state === "partial" && suite === "calendar") {
    const start = (await calls(page)).length;
    for (const date of ["2026-08-03", "2026-07-04"]) {
      await click("Previous 30 days");
      await expect(page.locator("table")).toContainText(date);
    }
    await expect(
      page.getByRole("button", { name: "Previous 30 days", exact: true }),
    ).toBeDisabled();
    for (const date of ["2026-08-03", "2026-09-02"]) {
      await click("Next 30 days");
      await expect(page.locator("table")).toContainText(date);
    }
    expect(await methodsSince(start)).toEqual(Array(4).fill("calendarReport"));
  }
  if (state === "retry") {
    const start = (await calls(page)).length;
    await click("Retry chart");
    await chart(page);
    expect(await methodsSince(start)).toEqual(["calendarReport"]);
  }
  if (state === "stale") {
    const start = (await calls(page)).length;
    await click("Refresh chart");
    await expect(page.getByText("Chart is out of date.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh chart", exact: true })).toBeEnabled();
    expect(await methodsSince(start)).toEqual(["calendarReport"]);
    expect((await rows(page))[14][1]).not.toMatch(/^(Unavailable|0)$/);
  }
  if (["latest", "cancel"].includes(state)) {
    await click("Previous 30 days");
    await page.waitForFunction(
      () => window.calendarFixture.calls.filter((c) => c.method === "calendarReport").length === 2,
    );
    if (state === "cancel") await expect(page.locator("table")).toHaveCount(0);
    else await chart(page);
    await page.getByRole("combobox", { name: "Codex host" }).selectOption("host_b");
    if (state === "latest") {
      await expect(page.getByText("outside the retained bounds", { exact: false })).toBeVisible();
      const start = (await calls(page)).length;
      await click("Latest 30 days");
      await chart(page);
      expect((await rows(page))[0][0]).toBe("2026-09-02");
      expect(await methodsSince(start)).toEqual(["calendarReport"]);
    } else {
      await chart(page);
      const before = await rows(page);
      await click("Release pending responses");
      await page.waitForTimeout(200); // Observe delayed obsolete response completion.
      expect(await rows(page)).toEqual(before);
      expect((await calls(page)).at(-1)!.input.hostId).toBe("host_b");
    }
  }
  if (state === "selection") {
    await page.getByRole("combobox", { name: "Codex host" }).selectOption("host_b");
    await expect(page.getByText("Changing host.", { exact: false })).toBeVisible();
    await expect(page.locator("table")).toHaveCount(0);
    await click("Release pending responses");
    await chart(page);
    expect((await calls(page)).at(-1)!.input.hostId).toBe("host_b");
  }
  if (state === "settings") {
    expect(
      (await calls(page)).some((call) =>
        ["historyReadiness", "activity", "historicalImport"].includes(call.method),
      ),
    ).toBe(false);
    await click("Show usage settings");
    await expect(page.getByLabel("Usage collection settings")).toBeVisible();
    expect(
      (await calls(page)).some((call) =>
        ["historyReadiness", "historicalImport"].includes(call.method),
      ),
    ).toBe(false);
    const management = page.locator("summary", { hasText: "Collection and history management" });
    await management.click();
    await page.waitForFunction(() => window.calendarFixture.pending() === 2);
    await management.click();
    await expect(page.getByLabel("History readiness")).toHaveCount(0);
    await page.getByRole("combobox", { name: "Codex host" }).selectOption("host_b");
    await page.waitForFunction(() =>
      window.calendarFixture.calls.some((c) => c.method === "selectHost"),
    );
    await click("Release pending responses");
    await page.waitForTimeout(200);
    expect(await page.locator("body").innerText()).not.toContain(
      "History not configured on this host.",
    );
    await management.click();
    await page.waitForFunction(() => window.calendarFixture.pending() === 2);
    await click("Release pending responses");
    await expect(
      page.getByText("History not configured on this host.", { exact: false }),
    ).toBeVisible();
    const requests = (await calls(page)).filter((call) =>
      ["historyReadiness", "historicalImport"].includes(call.method),
    );
    expect(requests).toHaveLength(4);
    expect(requests.slice(2).every((call) => call.input.hostId === "host_b")).toBe(true);
    await click("Show chart");
    await chart(page);
  }
}
