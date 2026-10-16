import { test, expect } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`enlarged image stays inside attachment focus session at ${width}px`, async ({
    page,
  }, info) => {
    const imageRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url() === "http://localhost:4193/tests/assets/image.png")
        imageRequests.push(request.url());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/preview.html?state=navigation");
    const attachment = page.getByRole("button", {
      name: "investigation-with-a-long-filename-and-important-observations.MARKDOWN",
      exact: true,
    });
    await attachment.click();
    const outer = page.getByRole("dialog", {
      name: "investigation-with-a-long-filename-and-important-observations.MARKDOWN",
    });
    const trigger = outer.getByRole("button", { name: "Enlarge image: Remote chart", exact: true });
    await expect(trigger).toBeEnabled();
    await trigger.focus();
    await page.keyboard.press("Enter");
    const viewer = page.getByRole("dialog", { name: "Image preview: Remote chart", exact: true });
    await expect(viewer).toBeVisible();
    expect(await viewer.evaluate((element) => !!element.closest(".attachment-preview-body"))).toBe(
      true,
    );
    const close = viewer.getByRole("button", { name: "Close image preview" });
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    expect(await viewer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();
    await viewer.getByRole("img").click();
    await expect(viewer).toBeVisible();
    const imageBounds = await viewer.getByRole("img").boundingBox();
    expect(imageBounds!.width).toBeLessThanOrEqual(800);
    expect(imageBounds!.height / imageBounds!.width).toBeCloseTo(0.5, 2);
    expect(imageBounds!.x).toBeGreaterThanOrEqual(0);
    expect(imageBounds!.x + imageBounds!.width).toBeLessThanOrEqual(width);
    await page.mouse.move(imageBounds!.x + 10, imageBounds!.y + 10);
    await page.mouse.down();
    await page.mouse.move(2, 2);
    await page.mouse.up();
    await expect(viewer).toBeVisible();
    await page.mouse.click(2, 2, { button: "right" });
    await expect(viewer).toBeVisible();
    await page.screenshot({ path: info.outputPath(`image-preview-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(outer).toBeVisible();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Space");
    await expect(viewer).toBeVisible();
    await close.click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await viewer.click({ position: { x: -10, y: -10 }, force: true });
    await expect(viewer).toHaveCount(0);
    await expect(outer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(outer).toHaveCount(0);
    await expect(attachment).toBeFocused();
    expect(imageRequests).toEqual(["http://localhost:4193/tests/assets/image.png"]);
    await attachment.click();
    await expect(trigger).toBeEnabled();
    await trigger.click();
    await expect(viewer).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("fixture-remove")));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Attach file", exact: true })).toBeFocused();
  });
}
const filename = "investigation-with-a-long-filename-and-important-observations.MARKDOWN";
for (const width of [1280, 390]) {
  test(`document navigation and credential-free images at ${width}px`, async ({
    page,
    context,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const requests: { url: string; headers: Record<string, string> }[] = [];
    const pendingHeaders: Promise<void>[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/tests/assets/") || request.url().includes("private-image"))
        pendingHeaders.push(
          request.allHeaders().then((headers) => {
            requests.push({ url: request.url(), headers });
          }),
        );
    });
    await context.addCookies([
      {
        name: "fixture-auth",
        value: "must-not-send",
        domain: "localhost",
        path: "/",
        secure: true,
        sameSite: "None",
      },
    ]);
    expect((await context.cookies("http://localhost:4193")).map((cookie) => cookie.name)).toEqual([
      "fixture-auth",
    ]);
    const controlPage = await context.newPage();
    const controlUrl = "http://localhost:4193/tests/assets/cookie-control.png";
    const controlRequest = controlPage.waitForRequest(controlUrl);
    await controlPage.goto(controlUrl);
    const controlHeaders = await (await controlRequest).allHeaders();
    expect(controlHeaders.cookie).toContain("fixture-auth=must-not-send");
    await controlPage.close();
    await context.route("https://example.org/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<title>Native destination fixture</title><p>External guide</p>",
      }),
    );
    await page.addInitScript(() => {
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = create(blob);
        document.documentElement.dataset.createdBlobs = JSON.stringify([
          ...JSON.parse(document.documentElement.dataset.createdBlobs || "[]"),
          url,
        ]);
        return url;
      };
      URL.revokeObjectURL = (url) => {
        document.documentElement.dataset.revokedBlobs = JSON.stringify([
          ...JSON.parse(document.documentElement.dataset.revokedBlobs || "[]"),
          url,
        ]);
        revoke(url);
      };
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/preview.html?state=navigation");
    await page.getByLabel("Task draft").fill("Keep the task draft");
    await page.evaluate(() => scrollTo(0, 80));
    const outerScroll = await page.evaluate(() => scrollY);
    const trigger = page.getByRole("button", { name: filename, exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: filename });
    const image = dialog.getByRole("img", { name: "Remote chart", exact: true });
    await expect(image).toHaveJSProperty("naturalWidth", 800);
    const shape = await image.evaluate((element: HTMLImageElement) => ({
      width: element.width,
      height: element.height,
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
      maxWidth: getComputedStyle(element).maxWidth,
      source: element.src,
    }));
    expect(shape.naturalHeight).toBe(400);
    expect(shape.height / shape.width).toBeCloseTo(0.5, 2);
    expect(shape.width).toBeLessThanOrEqual(720);
    expect(shape.maxWidth).toBe("100%");
    expect(shape.source.startsWith("blob:")).toBe(true);
    for (const name of ["BB private", "CORS chart", "Redirect chart", "Broken chart"])
      await expect(dialog.getByRole("img", { name, exact: true })).toHaveText(
        `${name} (image unavailable)`,
      );
    await expect(dialog.getByRole("img", { name: "Relative chart" })).toHaveText("Relative chart");
    await expect(dialog.getByText("Relative file", { exact: true })).toHaveJSProperty(
      "tagName",
      "SPAN",
    );
    await expect(dialog.getByText("Malformed", { exact: true })).toHaveJSProperty(
      "tagName",
      "SPAN",
    );
    await Promise.all(pendingHeaders);
    expect(requests.map((request) => new URL(request.url).pathname).sort()).toEqual([
      "/tests/assets/broken.png",
      "/tests/assets/cors.png",
      "/tests/assets/image.png",
      "/tests/assets/redirect.png",
    ]);
    for (const request of requests) {
      expect(request.headers.cookie).toBeUndefined();
      expect(request.headers.referer).toBeUndefined();
    }
    const guide = dialog.getByRole("link", { name: "External guide" });
    await expect(guide).toHaveAttribute("href", "https://example.org/guide");
    await expect(guide).not.toHaveAttribute("target");
    await guide.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-url-opens", "1");
    await expect(page.locator("html")).toHaveAttribute(
      "data-opened-url",
      "https://example.org/guide",
    );
    expect(page.url()).toContain("/tests/preview.html?state=navigation");
    const disclosure = dialog.locator("summary");
    await disclosure.focus();
    await page.keyboard.press("Enter");
    const outline = dialog.getByRole("navigation", { name: "Document sections" });
    await expect(outline.getByRole("link", { name: "Café bold code" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`navigation-images-${width}.png`) });
    const target = dialog.getByRole("heading", { name: "Findings", exact: true }).first();
    await dialog
      .getByRole("link", { name: "Local findings", exact: true })
      .click({ modifiers: ["ControlOrMeta"] });
    await expect(target).toBeFocused();
    expect(context.pages().length).toBe(1);
    expect(new URL(page.url()).hash).toBe("");
    expect(await page.evaluate(() => scrollY)).toBe(outerScroll);
    expect(
      await dialog.locator(".attachment-preview-body").evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(100);
    await dialog.locator(".attachment-preview-body").evaluate((element) => {
      element.scrollTop = 0;
    });
    await outline.getByRole("link", { name: "Findings-1", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("heading", { name: "Findings-1", exact: true })).toBeFocused();
    const created: string[] = JSON.parse(
      (await page.locator("html").getAttribute("data-created-blobs")) || "[]",
    );
    expect(created.length).toBe(2);
    await dialog.getByRole("button", { name: "Raw", exact: true }).click();
    await expect(dialog.getByRole("navigation")).toHaveCount(0);
    const revoked: string[] = JSON.parse(
      (await page.locator("html").getAttribute("data-revoked-blobs")) || "[]",
    );
    expect(revoked.sort()).toEqual(created.sort());
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(page.getByLabel("Task draft")).toHaveValue("Keep the task draft");
    await expect(page.getByLabel("Task shortcut count")).toHaveText("0");
    expect(errors).toEqual([]);
    await testInfo.attach("network-and-image-shape", {
      contentType: "application/json",
      body: JSON.stringify({ requests, shape, created, revoked, fixtureOnly: true }),
    });
  });
}
test("BB URL refusal is readable without browser navigation", async ({ page }) => {
  await page.goto("/tests/preview.html?state=navigation&open=fail");
  await page.getByRole("button", { name: filename, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: filename });
  await dialog.getByRole("link", { name: "External guide" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Link could not be opened.");
  await expect(page.locator("html")).toHaveAttribute("data-url-opens", "1");
  expect(page.url()).toContain("/tests/preview.html?state=navigation&open=fail");
});

for (const activation of ["modifier", "middle"])
  test(`production document ${activation} completes native new-tab navigation`, async ({
    page,
    context,
  }) => {
    const destination = "http://localhost:4193/tests/native-destination.html";
    await page.goto("/tests/preview.html?state=navigation");
    await page.getByRole("button", { name: filename, exact: true }).click();
    await page.evaluate(() => {
      for (const type of ["click", "auxclick"])
        document.addEventListener(type, (event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("a")?.textContent === "Native guide"
          )
            document.documentElement.dataset.nativePrevented = String(event.defaultPrevented);
        });
    });
    const guide = page
      .getByRole("dialog", { name: filename })
      .getByRole("link", { name: "Native guide" });
    const opened = context.waitForEvent("page", { timeout: 5000 });
    await guide.click(
      activation === "modifier" ? { modifiers: ["ControlOrMeta"] } : { button: "middle" },
    );
    const popup = await opened;
    await expect(popup).toHaveURL(destination);
    await expect(popup.getByText("Native destination fixture", { exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-native-prevented", "false");
    expect(await page.locator("html").getAttribute("data-url-opens")).toBeNull();
    await popup.close();
  });
