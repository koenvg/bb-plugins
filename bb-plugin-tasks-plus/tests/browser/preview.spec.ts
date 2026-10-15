import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const filename = "investigation-with-a-long-filename-and-important-observations.MARKDOWN";
const source =
  "\uFEFF---\r\ntitle: Investigation\r\n---\r\n\r\n# Investigation\r\n\r\nA generic task report. Read the findings without changing the task.\r\n\r\n## Findings\r\n\r\n- [x] Keep downloads unchanged\r\n- [ ] Check the next step\r\n\r\n[external](https://example.org) ![chart](./chart.png)\r\n\r\n| Observation | Value | Notes |\r\n| --- | --- | --- |\r\n| attachment-identity | fulfilled | " +
  "wide-value-".repeat(15) +
  ' |\r\n\r\n```typescript\r\n\tconst text = "' +
  "long-code-".repeat(25) +
  '";  \r\n```\r\n';
for (const width of [1280, 390]) {
  test(`generic real overlay at ${width}px`, async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    const external: string[] = [];
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://127.0.0.1:4193") {
        external.push(url.href);
        return route.abort();
      }
      return route.continue();
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/preview.html?state=delayed");
    await page.getByLabel("Task draft").fill("Unfinished browser draft");
    await page.evaluate(() => scrollTo(0, 80));
    const taskScroll = await page.evaluate(() => scrollY);
    const trigger = page.getByRole("button", { name: filename, exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: filename });
    await expect(dialog.getByRole("status")).toHaveText("Loading Markdown preview…");
    await page.waitForTimeout(300);
    const loadingGeometry = await dialog.evaluate((element) => {
      const panel = element.querySelector(".attachment-preview") || element;
      return {
        panel: panel.getBoundingClientRect().toJSON(),
        toolbar: panel
          .querySelector(".attachment-preview-toolbar")!
          .getBoundingClientRect()
          .toJSON(),
        body: panel.querySelector(".attachment-preview-body")!.getBoundingClientRect().toJSON(),
      };
    });
    await page.evaluate(() => window.dispatchEvent(new Event("fixture-ready")));
    await expect(dialog.getByRole("heading", { name: "Investigation", exact: true })).toBeVisible();
    const readyGeometry = await dialog.evaluate((element) => {
      const panel = element.querySelector(".attachment-preview") || element;
      return {
        panel: panel.getBoundingClientRect().toJSON(),
        toolbar: panel
          .querySelector(".attachment-preview-toolbar")!
          .getBoundingClientRect()
          .toJSON(),
        body: panel.querySelector(".attachment-preview-body")!.getBoundingClientRect().toJSON(),
      };
    });
    expect(readyGeometry).toEqual(loadingGeometry);
    await expect(dialog.getByRole("button", { name: "Preview", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (let index = 0; index < 12; index++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
    await page.keyboard.press("]");
    await page.keyboard.press("s");
    await dialog.getByRole("button", { name: "Raw", exact: true }).click();
    expect(await dialog.getByLabel("Raw source").textContent()).toBe(source);
    await dialog.getByRole("button", { name: "Preview", exact: true }).click();
    await page.keyboard.press("Tab");
    await dialog.getByRole("button", { name: "Preview", exact: true }).focus();
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector(".attachment-preview")!;
      const body = panel.querySelector(".attachment-preview-body")!;
      const prose = panel.querySelector(".md-document-prose")!;
      const code = panel.querySelector("pre")!;
      return {
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        panelWidth: panel.getBoundingClientRect().width,
        proseWidth: prose.getBoundingClientRect().width,
        codeLocal:
          code.scrollWidth > code.clientWidth && getComputedStyle(code).overflowX === "auto",
        fontSize: getComputedStyle(prose).fontSize,
        lineHeight: getComputedStyle(prose).lineHeight,
        bodyOverflow: getComputedStyle(body).overflowY,
        reads: document.documentElement.dataset.reads,
        controlsFit: [
          ...panel.querySelectorAll(
            ".attachment-preview-toolbar button, .attachment-preview-toolbar a",
          ),
        ].every((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            rect.top >= 0 &&
            rect.bottom <= innerHeight
          );
        }),
        focusInside: panel.contains(document.activeElement),
        focusOutline: getComputedStyle(document.activeElement!).outlineWidth,
      };
    });
    expect(geometry.pageOverflow).toBe(false);
    expect(geometry.proseWidth).toBeLessThanOrEqual(720);
    expect(geometry.codeLocal).toBe(true);
    expect(geometry.fontSize).toBe("16px");
    expect(geometry.lineHeight).toBe("28px");
    expect(geometry.reads).toBe("1");
    expect(geometry.controlsFit).toBe(true);
    expect(geometry.focusInside).toBe(true);
    expect(geometry.focusOutline).toBe("2px");
    const phase = process.env.BBP53_CAPTURE_PHASE || "final";
    const directory = "../verification/BBP-53";
    if (phase !== "none") {
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: `${directory}/${phase}-${width}.png`, fullPage: true });
      await writeFile(
        `${directory}/${phase}-${width}.json`,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            fixtureOnly: true,
            geometry,
            loadingGeometry,
            readyGeometry,
          },
          null,
          2,
        ) + "\n",
      );
    }
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page.getByLabel("Task draft")).toHaveValue("Unfinished browser draft");
    expect(await page.evaluate(() => scrollY)).toBe(taskScroll);
    await expect(page.getByLabel("Task shortcut count")).toHaveText("0");
    await trigger.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("fixture-remove")));
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Attach file", exact: true })).toBeFocused();
    await page.keyboard.press("s");
    await expect(page.getByLabel("Task shortcut count")).toHaveText("1");
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
  test(`new listbox owns focus after preview dismissal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/preview.html");
    await page.getByRole("button", { name: filename, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: filename });
    await expect(dialog.getByRole("heading", { name: "Investigation", exact: true })).toBeVisible();
    await page.evaluate(() => {
      const close = [
        ...document.querySelectorAll<HTMLButtonElement>(".attachment-preview button"),
      ].find((element) => element.textContent === "Close")!;
      close.click();
      window.dispatchEvent(new Event("fixture-listbox"));
      document.querySelector<HTMLElement>('[role="listbox"]')!.focus();
    });
    const listbox = page.getByRole("listbox", { name: "Newer choices" });
    await expect(dialog).not.toBeVisible();
    await expect(listbox).toBeFocused();
    await page.waitForTimeout(350);
    await expect(listbox).toBeFocused();
    await page.keyboard.press("s");
    await page.keyboard.press("]");
    await expect(page.getByLabel("Task shortcut count")).toHaveText("0");
  });
  test(`Retry recovers and Download uses local HTTP fixture at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/preview.html?state=recoverable");
    const trigger = page.getByRole("button", { name: filename, exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: filename });
    await expect(dialog.getByRole("status").getByRole("paragraph")).toHaveText(
      "The preview could not load. Try again or use Download.",
    );
    expect(await page.locator("html").getAttribute("data-reads")).toBe("1");
    await dialog.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Investigation", exact: true })).toBeVisible();
    expect(await page.locator("html").getAttribute("data-reads")).toBe("2");
    for (let index = 0; index < 2; index++) {
      await dialog.getByRole("button", { name: "Raw", exact: true }).click();
      expect(await dialog.getByLabel("Raw source").textContent()).toBe(source);
      await dialog.getByRole("button", { name: "Preview", exact: true }).click();
      await expect(
        dialog.getByRole("heading", { name: "Investigation", exact: true }),
      ).toBeVisible();
    }
    expect(await page.locator("html").getAttribute("data-reads")).toBe("2");
    const link = dialog.getByRole("link", { name: "Download", exact: true });
    await expect(link).toHaveAttribute("download", filename);
    const downloadEvent = page.waitForEvent("download");
    await link.click();
    const download = await downloadEvent;
    expect(download.url()).toBe(
      "http://127.0.0.1:4193/api/v1/plugins/tasks-plus/http/attachments/download?attachmentId=fixture-a",
    );
    expect(download.suggestedFilename()).toBe(filename);
    expect(await download.failure()).toBeNull();
    const saved = testInfo.outputPath("fixture-transport-download.MARKDOWN");
    await download.saveAs(saved);
    expect(await readFile(saved)).toEqual(Buffer.from(source, "utf8"));
    await expect(dialog.getByRole("heading", { name: "Investigation", exact: true })).toBeVisible();
    expect(await page.locator("html").getAttribute("data-reads")).toBe("2");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(trigger).toBeFocused();
  });
  for (const mode of ["empty", "error"]) {
    test(`stable ${mode} region at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/tests/preview.html?state=${mode}`);
      await page.getByRole("button", { name: filename, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: filename });
      await expect(dialog.getByRole("status")).toContainText(
        mode === "empty" ? "This file is empty" : "could not load",
      );
      await page.waitForTimeout(300);
      const height = await page
        .locator(".attachment-preview")
        .evaluate((element) => element.getBoundingClientRect().height);
      expect(height).toBe(width === 390 ? 741 : 852);
      for (const name of ["Preview", "Raw", "Close"])
        await expect(dialog.getByRole("button", { name, exact: true })).toBeInViewport();
      await expect(dialog.getByRole("link", { name: "Download" })).toBeInViewport();
      if (mode === "error")
        await expect(dialog.getByRole("button", { name: "Retry" })).toBeVisible();
    });
  }
}

test("local HTTP download rejects missing, unknown, and duplicate attachment identities", async ({
  request,
}) => {
  const saved = await request.get(
    "/api/v1/plugins/tasks-plus/http/attachments/download?attachmentId=fixture-a",
  );
  expect(saved.status()).toBe(200);
  expect(saved.headers()["content-type"]).toBe("application/octet-stream");
  expect(saved.headers()["content-disposition"]).toBe(`attachment; filename="${filename}"`);
  expect(await saved.body()).toEqual(Buffer.from(source, "utf8"));
  for (const query of [
    "",
    "?attachmentId=unknown",
    "?attachmentId=fixture-a&attachmentId=unknown",
  ]) {
    const response = await request.get(
      `/api/v1/plugins/tasks-plus/http/attachments/download${query}`,
    );
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe("");
  }
});
