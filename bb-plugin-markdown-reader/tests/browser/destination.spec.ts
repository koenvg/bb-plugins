import { test, expect, raster, capture, results } from "./fixture";
import type { Route } from "@playwright/test";

const png = raster(1200, 220, [96, 132, 152]);
for (const source of ["workspace", "host", "thread-storage"] as const) {
  for (const [width, theme] of [
    [1440, "light"],
    [760, "light"],
    [390, "dark"],
  ] as const) {
    test(`destinations ${source}-${width}-${theme}`, async ({ page, pageErrors }, info) => {
      await page.setViewportSize({ width: Math.max(width, 1000), height: 850 });
      const requests: { url: string; headers: Record<string, string> }[] = [];
      const imageRoute = async (route: Route) => {
        requests.push({ url: route.request().url(), headers: route.request().headers() });
        if (route.request().url().includes("escape.png"))
          await route.fulfill({ status: 403, body: "Confined fixture denial" });
        else await route.fulfill({ status: 200, contentType: "image/png", body: png });
      };
      await page.route("**/api/v1/file-previews/**", imageRoute);
      await page.route("https://images.test/**", imageRoute);
      await page.goto(
        `/tests/destination-preview.html?source=${source}&width=${width}&theme=${theme}`,
      );
      await page.getByRole("link", { name: "sibling", exact: true }).waitFor();
      const local = page.getByRole("img", { name: "Local picture", exact: true });
      await local.scrollIntoViewIfNeeded();
      await page.waitForFunction(
        "[...document.images].find(e => e.alt === 'Local picture')?.naturalWidth === 1200",
      );
      expect(
        await local.evaluate((e) => e.clientWidth <= e.closest(".mr-prose")!.clientWidth),
      ).toBe(true);
      await page.getByText("Confined symlink alt", { exact: false }).waitFor();
      await expect(page.getByRole("img", { name: "Confined symlink alt" })).toHaveCount(0);
      await page.getByText("Rejected SVG alt", { exact: true }).waitFor();
      await expect(page.getByRole("link", { name: "script", exact: true })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "escape", exact: true })).toHaveCount(0);
      for (const name of ["sibling", "web"]) {
        await page.getByRole("link", { name, exact: true }).focus();
        await page.keyboard.press("Enter");
      }
      const calls = await page.evaluate<{ method: string; options: { target: object } }[]>(
        "window.destinationFixture.inspection.navigateCalls",
      );
      expect(calls[0].method).toBe("experimental_openFilePreview");
      const expected =
        source === "host"
          ? { kind: "host", hostId: "remote", path: "/notes/next.md" }
          : {
              kind: source,
              path: "reports/next.md",
              ...(source === "workspace" ? { environmentId: "env" } : { threadId: "thread" }),
            };
      expect(calls[0].options.target).toEqual(expected);
      expect(calls[1]).toEqual({ method: "openUrl", url: "https://example.com/guide" });
      await page.getByRole("link", { name: "here", exact: true }).click();
      expect(
        await page
          .getByRole("heading", { name: "Destinations", exact: true })
          .evaluate((e) => e === document.activeElement),
      ).toBe(true);
      await page.locator(".mr-prose sup a").click();
      expect(await page.evaluate("document.activeElement?.tagName")).toBe("LI");
      expect(await page.evaluate("location.hash")).toBe("");
      expect(await page.evaluate("window.destinationFixture.inspection.navigateCalls.length")).toBe(
        2,
      );
      await expect(page.locator("html")).toHaveAttribute("data-fixture-reads", "1");
      const oldSrc = await local.getAttribute("src");
      await page.getByRole("button", { name: "Raw", exact: true }).click();
      expect(await page.getByLabel("Raw Markdown", { exact: true }).textContent()).toBe(
        await page.evaluate("window.destinationFixture.text"),
      );
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-fixture-leases", "1");
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await page.waitForFunction("document.documentElement.dataset.fixtureLeases === '2'");
      await expect(local).not.toHaveAttribute("src", oldSrc!);
      await local.scrollIntoViewIfNeeded();
      await page.waitForFunction(
        "[...document.images].find(e => e.alt === 'Local picture')?.naturalWidth === 1200",
      );
      await page.getByRole("img", { name: "Remote picture", exact: true }).scrollIntoViewIfNeeded();
      await page.waitForFunction(
        "[...document.images].find(e => e.alt === 'Remote picture')?.naturalWidth === 1200",
      );
      expect(requests.every((r) => !("referer" in r.headers))).toBe(true);
      expect(requests.some((r) => r.url === "https://images.test/picture.png")).toBe(true);
      expect(requests.some((r) => r.url.includes("outside") || r.url.includes("active.svg"))).toBe(
        false,
      );
      const screenshot = await capture(page, info, `${source}-${width}-${theme}`);
      await page.evaluate("window.destinationFixture.unmount()");
      await expect(page.locator(".markdown-reader")).toHaveCount(0);
      await results(info, {
        source,
        width,
        theme,
        sourceAwareOpening: true,
        localFragments: true,
        rawExact: true,
        imageSizing: true,
        getDeniedFallback: true,
        sameHashRefresh: true,
        ordinaryRemoteRequest: true,
        unmount: true,
        requests,
        errors: pageErrors,
        screenshot,
      });
    });
  }
}
