import type { Locator } from "@playwright/test";
import { test, expect } from "./fixture.js";

const label =
  "delegate reviewing captured conversation attribution and repeated labels across narrow Subagents panels without changing the original source text";

async function ellipsis(locator: Locator) {
  await expect(locator).toHaveCSS("text-overflow", "ellipsis");
  await expect(locator).toHaveCSS("white-space", "nowrap");
  await expect(locator).toHaveCSS("overflow-x", "hidden");
  expect(await locator.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
}

async function paintedReference(locator: Locator, text: string) {
  await expect(locator).toHaveText(text);
  await expect(locator).toBeVisible();
  const facts = await locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    let unclipped =
      rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const bounds = parent.getBoundingClientRect();
      const css = getComputedStyle(parent);
      if (css.overflowX !== "visible")
        unclipped &&= rect.left >= bounds.left && rect.right <= bounds.right;
      if (css.overflowY !== "visible")
        unclipped &&= rect.top >= bounds.top && rect.bottom <= bounds.bottom;
    }
    const previous = node.previousElementSibling?.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      unclipped,
      hit: hit === node || node.contains(hit),
      separated: !previous || previous.right <= rect.left,
      color: style.color,
      opacity: style.opacity,
      visibility: style.visibility,
    };
  });
  expect(facts.width).toBeGreaterThan(4);
  expect(facts.height).toBeGreaterThan(8);
  expect(facts.unclipped, "Reference fits viewport and every clipping ancestor").toBe(true);
  expect(facts.hit, "Reference is painted above other elements").toBe(true);
  expect(facts.separated, "Truncated label does not overlap reference").toBe(true);
  expect(facts.color).not.toBe("rgba(0, 0, 0, 0)");
  expect(facts.opacity).toBe("1");
  expect(facts.visibility).toBe("visible");
}

for (const size of [
  { name: "wide", width: 1280, path: "/", narrow: false },
  { name: "360px panel in wide viewport", width: 1280, path: "/?layout=panel", narrow: true },
  { name: "375px viewport", width: 375, path: "/", narrow: true },
]) {
  test(`repeated labels keep captured identity at ${size.name}`, async ({ page }, info) => {
    await page.setViewportSize({ width: size.width, height: 900 });
    await page.goto(size.path);
    const agents = page.getByRole("tab", { name: "Agents", exact: true });
    const overview = page.getByRole("tabpanel", { name: "Agents", exact: true });
    const betaRow = overview.getByRole("button", {
      name: /Review beta captured attribution.*Entry 3/,
    });
    const alphaRow = overview.getByRole("button", {
      name: /Review alpha captured attribution.*Entry 4/,
    });
    await expect(agents).toHaveAttribute("aria-selected", "true");
    await expect(agents).toHaveAccessibleDescription(
      "4 observed entries in available history. Not an active-worker count.",
    );
    await expect(agents.locator(".pi-subagents-tab-count")).toHaveText("4");
    await expect(overview.getByRole("button")).toHaveCount(4);
    await expect(
      page.getByText("Read-only · Captured observations, not a live feed.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "2 entries omitted by the capture budget." }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({
        hasText:
          "Available history is bounded to the newest 64 extension-state events. Older observations may be absent.",
      }),
    ).toBeVisible();
    if (size.path.includes("panel"))
      expect(
        await page.locator("#root").evaluate((node) => node.getBoundingClientRect().width),
      ).toBe(360);

    for (const [row, entry] of [
      [betaRow, "Entry 3"],
      [alphaRow, "Entry 4"],
    ] as const) {
      await expect(row.locator(".pi-subagents-label")).toHaveText(label);
      await expect(row.locator(".pi-subagents-label")).toHaveAttribute("title", label);
      await paintedReference(row.locator(".pi-subagents-reference"), entry);
      if (size.narrow) {
        await ellipsis(row.locator(".pi-subagents-label"));
        await ellipsis(row.locator(".pi-subagents-purpose"));
      }
    }
    if (size.narrow) await page.screenshot({ path: info.outputPath("narrow-overview.png") });

    await betaRow.click();
    let betaTab = page.getByRole("tab", { name: label, exact: true });
    await expect(betaTab).toHaveAttribute("aria-selected", "true");
    await agents.click();
    await page.keyboard.press("Tab");
    await page.keyboard.press("End");
    await expect(alphaRow).toBeFocused();
    await page.keyboard.press("Enter");
    const alphaTab = page.getByRole("tab", { name: `${label} Entry 4`, exact: true });
    betaTab = page.getByRole("tab", { name: `${label} Entry 3`, exact: true });
    await expect(page.getByRole("tab")).toHaveCount(3);
    await expect(alphaTab).toBeFocused();
    await expect(alphaTab).toHaveAttribute("aria-selected", "true");
    await paintedReference(alphaTab.locator(".pi-subagents-tab-reference"), "4");
    await expect(alphaTab.locator(".pi-subagents-tab-label")).toHaveText(label);
    await ellipsis(alphaTab.locator(".pi-subagents-tab-label"));

    const alphaPanel = page.getByRole("tabpanel", { name: `${label} Entry 4`, exact: true });
    await expect(alphaPanel.getByRole("heading", { name: label, exact: true })).toBeVisible();
    await alphaPanel.locator(".pi-subagents-task > summary").click();
    await expect(alphaPanel.locator(".pi-subagents-task .pi-subagents-prose")).toBeVisible();
    expect(await alphaPanel.locator(".pi-subagents-task .pi-subagents-prose").textContent()).toBe(
      "Review alpha captured attribution and confirm that the repeated label selects only the intended conversation.\n\nKeep alpha task line two exactly as captured.",
    );
    await alphaPanel.locator(".pi-subagents-conversation > summary").click();
    await expect(
      alphaPanel.getByText("ALPHA transcript sentinel. Attribution belongs to alpha.", {
        exact: true,
      }),
    ).toBeVisible();
    await alphaPanel.locator(".pi-subagents-capture > summary").click();
    await expect(
      alphaPanel.getByText("Run captured-alpha-run · background · subagent", { exact: true }),
    ).toBeVisible();
    await expect(
      alphaPanel.getByText("1 transcript entries omitted.", { exact: true }),
    ).toBeVisible();
    await alphaPanel.getByRole("button", { name: "Final output", exact: true }).click();
    await expect(alphaPanel.getByRole("region", { name: "Final output" })).toBeFocused();
    await expect(alphaPanel.locator(".pi-subagents-output .pi-subagents-prose")).toHaveText(
      "ALPHA final-output sentinel. Only the alpha review is complete.",
    );

    await alphaTab.click();
    await page.keyboard.press("ArrowLeft");
    await expect(betaTab).toBeFocused();
    await expect(betaTab).toHaveAttribute("aria-selected", "true");
    await paintedReference(betaTab.locator(".pi-subagents-tab-reference"), "3");
    await expect(betaTab.locator(".pi-subagents-tab-label")).toHaveText(label);
    await ellipsis(betaTab.locator(".pi-subagents-tab-label"));
    const betaPanel = page.getByRole("tabpanel", { name: `${label} Entry 3`, exact: true });
    await betaPanel.locator(".pi-subagents-task > summary").click();
    await expect(betaPanel.locator(".pi-subagents-task .pi-subagents-prose")).toBeVisible();
    expect(await betaPanel.locator(".pi-subagents-task .pi-subagents-prose").textContent()).toBe(
      "Review beta captured attribution and confirm that the repeated label selects only the intended conversation.\n\nKeep beta task line two exactly as captured.",
    );
    await betaPanel.locator(".pi-subagents-conversation > summary").click();
    await expect(
      betaPanel.getByText("BETA transcript sentinel. Attribution belongs to beta.", {
        exact: true,
      }),
    ).toBeVisible();
    await betaPanel.locator(".pi-subagents-capture > summary").click();
    await expect(
      betaPanel.getByText("Run captured-beta-run · background · subagent", { exact: true }),
    ).toBeVisible();
    await expect(
      betaPanel.getByText("3 transcript entries omitted.", { exact: true }),
    ).toBeVisible();
    await betaPanel.getByRole("button", { name: "Final output", exact: true }).click();
    await expect(betaPanel.getByRole("region", { name: "Final output" })).toBeFocused();
    await expect(betaPanel.locator(".pi-subagents-output .pi-subagents-prose")).toHaveText(
      "BETA final-output sentinel. Only the beta review is complete.",
    );

    const retainedPanelId = await betaPanel.getAttribute("id");
    await betaTab.click();
    await page.keyboard.press("ArrowRight");
    await expect(alphaTab).toBeFocused();
    await expect(alphaPanel).toBeVisible();
    if (size.narrow) await page.screenshot({ path: info.outputPath("narrow-selected-alpha.png") });
    const closedPanelId = await alphaPanel.getAttribute("id");
    const closeAlpha = page.getByRole("button", {
      name: `Close ${label} Entry 4 tab`,
      exact: true,
    });
    await expect(closeAlpha).toHaveAttribute("title", "Close view only. Does not stop the run.");
    await closeAlpha.click();
    await expect(page.locator(`[id="${closedPanelId}"]`)).toHaveCount(0);
    await expect(page.locator(`[id="${retainedPanelId}"]`)).toBeVisible();
    const remainingTab = page.getByRole("tab", { name: label, exact: true });
    const remainingPanel = page.getByRole("tabpanel", { name: label, exact: true });
    await expect(remainingTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab")).toHaveCount(2);
    await expect(remainingPanel.locator(".pi-subagents-output .pi-subagents-prose")).toHaveText(
      "BETA final-output sentinel. Only the beta review is complete.",
    );
    await expect(
      remainingPanel.getByText("Run captured-beta-run · background · subagent", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Close ${label} tab`, exact: true }),
    ).toBeAttached();
    await agents.click();
    await expect(overview).toBeVisible();
    await expect(agents.locator(".pi-subagents-tab-count")).toHaveText("4");
    await expect(overview.getByRole("button")).toHaveCount(4);
    await expect(betaRow).toHaveAttribute("data-open", "true");
    await expect(alphaRow).toHaveAttribute("data-open", "false");
    await expect(betaRow.getByLabel("Execution state: complete")).toBeVisible();
    await expect(alphaRow.getByLabel("Execution state: complete")).toBeVisible();
    await alphaRow.click();
    await expect(page.getByRole("tab")).toHaveCount(3);
    await expect(alphaTab).toHaveAttribute("aria-selected", "true");
    await expect(alphaPanel.locator(".pi-subagents-output .pi-subagents-prose")).toHaveText(
      "ALPHA final-output sentinel. Only the alpha review is complete.",
    );
  });
}
