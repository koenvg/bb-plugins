import { test, expect, sizes, viewport, noOverflow, capture, jsonEvidence } from "./fixtures.js";

const cases = [
  ["fresh", "fresh", "63%", "63%", "verified"],
  ["aged", "stale · Observation at least 5 minutes old", "—", "63%", "verified"],
  ["expired", "unavailable · Observation expired", "—", "Unavailable", "verified"],
  ["network", "stale · Allowance refresh failed", "—", "63%", "verified"],
  ["auth", "unavailable · Pi Codex sign-in required", "—", "Unavailable", "unknown"],
  [
    "credentials",
    "unavailable · Pi Codex sign-in could not be read",
    "—",
    "Unavailable",
    "unknown",
  ],
  ["offline", "unavailable · Machine offline", "—", "Unavailable", "verified"],
] as const;

for (const width of sizes) {
  for (const [scenario, observation, allowance, retained, identity] of cases) {
    test(`footer ${scenario} hover and keyboard at ${width}px`, async ({ page }, info) => {
      await viewport(page, width);
      await page.goto(`/footer.html?state=${scenario}`);
      await expect(page).toHaveTitle("Codex quota footer fixture");
      const button = page.getByRole("button", { name: "Codex quota", exact: true });
      const badge = button.locator("[data-codex-quota-badge] > [title]");
      await expect(badge).toHaveText(allowance);
      const detail = observation.replace(" · ", "; ");
      await expect(button).toHaveAccessibleDescription(new RegExp(`MacBook; ${detail};`));
      if (identity === "unknown") {
        await expect(button).toHaveAccessibleDescription(/account identity unverified/);
      }
      await button.hover();
      const tooltip = page.getByRole("tooltip");
      await expect(tooltip.getByText(observation, { exact: true })).toBeVisible();
      await expect(tooltip.getByText(retained, { exact: true })).toBeVisible();
      if (scenario === "fresh") await expect(tooltip).not.toContainText(/\bok\b|refresh failed/);
      if (retained === "Unavailable") await expect(tooltip).not.toContainText("63%");
      await page.keyboard.press("Escape");
      await expect(tooltip).toHaveCount(0);
      await page.mouse.move(width - 1, 1);
      await page.getByRole("link", { name: "Settings", exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect(button).toBeFocused();
      await expect(tooltip.getByText(observation, { exact: true })).toBeVisible();
      await expect(button).toHaveAccessibleDescription(new RegExp(`MacBook; ${detail};`));
      const layout = await tooltip.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          viewport: { width: innerWidth, height: innerHeight },
          overflowing: Array.from(element.querySelectorAll("p")).some(
            (p) => p.scrollWidth > p.clientWidth,
          ),
        };
      });
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(width);
      expect(layout.top).toBeGreaterThanOrEqual(0);
      expect(layout.bottom).toBeLessThanOrEqual(layout.viewport.height);
      expect(layout.overflowing).toBe(false);
      await noOverflow(page);
      await jsonEvidence(info, "footer-facts.json", {
        scenario,
        observation,
        allowance,
        retained,
        identity,
        layout,
        description: await button.getAttribute("aria-describedby"),
        accessible: await button.ariaSnapshot(),
        tooltip: await tooltip.ariaSnapshot(),
        limits: [
          "Synthetic host/RPC/clock and native DOM fixture. Not installed BB or screen-reader speech acceptance.",
        ],
      });
      await capture(page, info, `footer-${scenario}-${width}`);
    });
  }
}
