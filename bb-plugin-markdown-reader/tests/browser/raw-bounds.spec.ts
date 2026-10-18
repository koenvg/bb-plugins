import { test, expect, capture } from "./fixture";

declare global {
  interface Window {
    revealSelectionLines: (start: number, end: number) => void;
  }
}

const source =
  "\uFEFF# Dense\r\n" + "\n".repeat(30_000) + "  alpha **one**\r\n\r\n  beta `two`\r\n";

test("newline-dense Raw keeps bounded DOM, exact text, inclusive reveal and repeated focus", async ({
  page,
}, info) => {
  await page.goto("/tests/selection-preview.html?document=dense");
  await page.getByRole("heading", { name: "Dense", exact: true }).waitFor();
  const rawButton = page.getByRole("button", { name: "Raw", exact: true });
  await rawButton.focus();
  await page.keyboard.press("Enter");
  const raw = page.getByLabel("Raw Markdown");
  expect(await raw.textContent()).toBe(source);
  expect(await raw.locator("*").count()).toBeLessThanOrEqual(132);
  await page.evaluate(() => window.revealSelectionLines(30_002, 30_003));
  const first = raw.locator('[data-source-line="30002"]');
  await expect(first).toBeFocused();
  expect(await raw.locator('[data-highlighted="true"]').allTextContents()).toEqual([
    "  alpha **one**\r\n",
    "\r\n",
  ]);
  const bounds = await first.evaluate((element) => {
    const target = element.getBoundingClientRect();
    const panel = element.closest(".markdown-reader")!;
    const reader = panel.getBoundingClientRect();
    const toolbar = panel.querySelector(".mr-toolbar")!.getBoundingClientRect();
    return { visible: target.top >= toolbar.bottom && target.bottom <= reader.bottom };
  });
  expect(bounds).toEqual({ visible: true });
  await rawButton.focus();
  await page.evaluate(() => window.revealSelectionLines(30_002, 30_003));
  await expect(first).toBeFocused();
  expect(await raw.textContent()).toBe(source);
  expect(await raw.locator("*").count()).toBeLessThanOrEqual(132);
  expect(
    await page.evaluate(() => window.selectionFixture.inspection.rpcCalls.map((c) => c.method)),
  ).toEqual(["read_document"]);
  await capture(page, info, "dense-raw-range");
});
