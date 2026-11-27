import {
  test,
  expect,
  viewport,
  noOverflow,
  officialLink,
  capture,
  jsonEvidence,
} from "./fixtures.js";

test("activity early desktop and 375px preview", async ({ page }, info) => {
  await page.goto("/activity.html");
  const summary = page.locator("summary", { hasText: "Account details and activity" });
  await expect(summary.locator("..")).not.toHaveAttribute("open");
  await expect(
    page.getByText("History not configured on this host.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toHaveAttribute("data-activity-calls");
  await capture(page, info, "early-desktop-collapsed");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Lifetime tokens", { exact: true })).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-activity-calls", "1");
  await capture(page, info, "early-desktop-open");
  await viewport(page, 375);
  await capture(page, info, "early-375-open");
  await noOverflow(page);
  const metrics = await page.evaluate(() => {
    const region = document.querySelector('section[aria-label="Account-wide daily token table"]');
    if (!region) {
      throw new Error("Missing account-wide daily token table");
    }
    return {
      width: innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      tableWidth: region.clientWidth,
      tableScrollWidth: region.scrollWidth,
    };
  });
  expect(metrics.pageWidth).toBe(375);
  await jsonEvidence(info, "early-layout.json", metrics);
  await page.getByRole("combobox", { name: "Account activity period" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("region", { name: "Account-wide daily token table" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => {
    const section = document.querySelector('section[aria-label="Account-wide daily token table"]');
    return section !== null && section.scrollTop > 0;
  });
  await page.getByRole("combobox", { name: "Account activity period" }).selectOption("weekly");
  await expect(page.getByText("weekly activity unknown.", { exact: true })).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-activity-calls", "1");
  await summary.focus();
  await page.keyboard.press("Space");
  await expect(summary.locator("..")).not.toHaveAttribute("open");
  // Original poll-stop regression window.
  await page.waitForTimeout(1100);
  await expect(page.locator("body")).toHaveAttribute("data-activity-calls", "1");
  await expect(page.getByText("Lifetime tokens", { exact: true })).not.toBeVisible();
  await officialLink(page);
  await capture(page, info, "375-keyboard-collapsed");
});
