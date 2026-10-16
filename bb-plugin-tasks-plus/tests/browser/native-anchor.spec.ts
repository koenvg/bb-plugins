import { test, expect } from "@playwright/test";

test("native external anchor modifiers reach a browser-owned page", async ({ page, context }) => {
  await page.goto("/tests/preview.html");
  await page.evaluate(() => {
    const anchor = document.createElement("a");
    anchor.href = "http://localhost:4193/tests/native-destination.html";
    anchor.textContent = "Native diagnostic";
    document.body.append(anchor);
  });
  const opened = context.waitForEvent("page", { timeout: 5000 });
  await page
    .getByRole("link", { name: "Native diagnostic" })
    .click({ modifiers: ["ControlOrMeta"] });
  const popup = await opened;
  await expect(popup).toHaveURL("http://localhost:4193/tests/native-destination.html");
  await expect(popup.getByText("Native destination fixture", { exact: true })).toBeVisible();
  await popup.close();
});
