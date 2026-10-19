import { test, expect } from "@playwright/test";
import { origin } from "./fixture-origin";
import { writeFile } from "node:fs/promises";
import { readingReport } from "../preview-document";
import { reportMeasures, sentinelMeasures } from "./report-measures";

for (const scenario of [
  { width: 390, theme: "light" },
  { width: 390, theme: "dark" },
  { width: 1280, theme: "light" },
  { width: 1280, theme: "dark" },
  { width: 1280, theme: "custom" },
  { width: 1280, theme: "light", documentWidth: 390 },
]) {
  test(`reading report ${scenario.width}px ${scenario.theme} document ${scenario.documentWidth || "auto"}`, async ({
    page,
    context,
  }, testInfo) => {
    const errors: string[] = [];
    const external: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== origin) {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    await page.setViewportSize({ width: scenario.width, height: 900 });
    await page.goto(
      `/tests/preview.html?report&theme=${scenario.theme}&documentWidth=${scenario.documentWidth || "auto"}`,
    );
    const sentinels = await page.evaluate(sentinelMeasures);
    expect(sentinels.map(({ tag, font, padding }) => [tag, font, padding])).toEqual([
      ["H2", "14px", "0px"],
      ["P", "12px", "0px"],
      ["CODE", "11px", "0px"],
      ["H2", "14px", "0px"],
      ["PRE", "12px", "0px"],
      ["CODE", "11px", "0px"],
      ["TD", "12px", "2px"],
    ]);
    for (const sentinel of sentinels)
      expect(sentinel).toMatchObject({
        background: "rgba(0, 0, 0, 0)",
        weight: "400",
        decoration: "none",
      });
    await page.getByLabel("Task draft").fill("Unfinished report draft");
    await page.evaluate(() => scrollTo(0, 80));
    const taskScroll = await page.evaluate(() => scrollY);
    const trigger = page.getByRole("button", { name: readingReport.fileName, exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: readingReport.fileName });
    const prose = dialog.locator(".mr-prose");
    await expect(
      dialog.getByRole("heading", { level: 1, name: "Technical reading report" }),
    ).toBeVisible();
    await expect(dialog.getByRole("heading", { level: 2, name: "Findings" })).toBeVisible();
    const originalProse = await prose.elementHandle();
    const text = await prose.textContent();
    const code = dialog.locator("pre").first();
    expect(await code.textContent()).toBe(
      '// Keep source text and whitespace.\r\n\tconst ready: boolean = true;  \r\nconst text = "' +
        "long-code-".repeat(25) +
        '";\n',
    );
    expect(await dialog.locator(".token.comment").textContent()).toBe(
      "// Keep source text and whitespace.",
    );
    expect(await dialog.locator(".token.boolean").allTextContents()).toEqual(["true", "true"]);
    await expect(dialog.getByRole("table")).toHaveCount(1);
    const measures = await page.evaluate(reportMeasures);
    const compact = scenario.width === 390 || scenario.documentWidth === 390;
    expect(measures.viewport).toBe(scenario.width);
    expect(measures.pageWidth).toBe(measures.pageClientWidth);
    expect(measures.prose.width).toBeLessThanOrEqual(720);
    expect(measures.prose.scrollWidth).toBe(measures.prose.width);
    expect(measures.prose.font).toBe(compact ? "15px" : "16px");
    expect(measures.prose.lineHeight).toBe(compact ? "27px" : "28px");
    if (scenario.documentWidth) expect(measures.documentWidth).toBe(390);
    if (!compact) expect(measures.prose.width).toBe(720);
    expect(measures.headings.map((heading) => heading.tag)).toEqual([
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "H2",
      "H2",
    ]);
    expect(measures.headings.slice(0, 6).map((heading) => heading.font)).toEqual([
      compact ? "30px" : "34px",
      compact ? "20px" : "21px",
      "18px",
      "16px",
      "15px",
      "14px",
    ]);
    expect(measures.headings[1]).toMatchObject({ above: "46px", below: "14px" });
    expect(measures.body.overflow).toBe("auto");
    expect(measures.body.scrollHeight).toBeGreaterThan(measures.body.height);
    expect(measures.code[0]!.scrollWidth).toBeGreaterThan(measures.code[0]!.width);
    expect(measures.code[0]!.overflow).toBe("auto");
    expect(measures.tables[0]!.scrollWidth).toBeGreaterThan(measures.tables[0]!.width);
    expect(measures.tables[0]!.overflow).toBe("auto");
    expect(measures.controls.map((control) => control.name)).toEqual([
      "Preview",
      "Raw",
      "Download",
      "Close",
    ]);
    expect(measures.controls.every((control) => control.inside)).toBe(true);
    expect(measures.codeFont).toBe('"Courier New", monospace');
    expect(measures.codeSize).toBe("13px");
    expect(Number.parseFloat(measures.codeLineHeight)).toBeCloseTo(24.7);
    expect(measures.bodyContrast.ratio).toBeGreaterThanOrEqual(4.5);
    expect(measures.tokens.length).toBeGreaterThan(10);
    for (const token of measures.tokens)
      expect(token.ratio, `${token.class} ${token.text}`).toBeGreaterThanOrEqual(4.5);
    expect(await page.evaluate(sentinelMeasures)).toEqual(sentinels);
    await page.screenshot({ path: testInfo.outputPath("overlay-top.png"), fullPage: false });

    const themes: Record<string, ReturnType<typeof reportMeasures>> = {};
    for (const theme of ["light", "dark", "custom"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              getComputedStyle(
                document.querySelector(".attachment-preview")!.closest(".bg-background")!,
              ).backgroundColor === getComputedStyle(document.body).backgroundColor,
          ),
        )
        .toBe(true);
      expect(await prose.evaluate((element, original) => element === original, originalProse)).toBe(
        true,
      );
      expect(await prose.textContent()).toBe(text);
      expect(await page.locator("html").getAttribute("data-reads")).toBe("1");
      await expect(dialog.getByRole("button", { name: "Preview", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      themes[theme] = await page.evaluate(reportMeasures);
      expect(themes[theme]!.bodyContrast.ratio).toBeGreaterThanOrEqual(4.5);
      for (const token of themes[theme]!.tokens) expect(token.ratio).toBeGreaterThanOrEqual(4.5);
      expect(await page.evaluate(sentinelMeasures)).toEqual(sentinels);
      expect(
        await page.evaluate(() =>
          Array.from(document.querySelectorAll(".fixture-editor .token, .fixture-chat .token")).map(
            (element) => getComputedStyle(element).color === getComputedStyle(document.body).color,
          ),
        ),
      ).toEqual([true, true]);
    }
    expect(themes.light!.bodyContrast.foreground).not.toEqual(themes.dark!.bodyContrast.foreground);
    expect(themes.custom!.bodyContrast.color).toBe("rgb(48, 51, 78)");
    expect(themes.custom!.radius).toBe("12px");
    await dialog.getByRole("button", { name: "Raw", exact: true }).click();
    const raw = dialog.getByLabel("Raw Markdown");
    const originalRaw = await raw.elementHandle();
    for (const theme of ["dark", "light", "custom", scenario.theme]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              getComputedStyle(
                document.querySelector(".attachment-preview")!.closest(".bg-background")!,
              ).backgroundColor === getComputedStyle(document.body).backgroundColor,
          ),
        )
        .toBe(true);
      expect(await raw.textContent()).toBe(readingReport.source);
      expect(await raw.evaluate((element, original) => element === original, originalRaw)).toBe(
        true,
      );
      await expect(dialog.getByRole("button", { name: "Raw", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(await page.locator("html").getAttribute("data-reads")).toBe("1");
    }
    await dialog.getByRole("button", { name: "Preview", exact: true }).click();
    expect(await prose.textContent()).toBe(text);
    await page.keyboard.press("Tab");
    const table = dialog.getByRole("region", { name: "Markdown table", exact: true });
    await table.focus();
    await expect(table).toBeFocused();
    expect(await table.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe("2px");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await code.focus();
    await expect(code).toBeFocused();
    expect(await code.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe("2px");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath("overlay-code-focus.png"), fullPage: false });
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
    await page.keyboard.press("s");
    await page.keyboard.press("]");
    await writeFile(
      testInfo.outputPath("reading-measures.json"),
      JSON.stringify(
        {
          fixtureOnly: true,
          scenario,
          measures,
          themes,
          sentinels,
          reads: await page.locator("html").getAttribute("data-reads"),
        },
        null,
        2,
      ) + "\n",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page.getByLabel("Task draft")).toHaveValue("Unfinished report draft");
    await expect(page.getByLabel("Task shortcut count")).toHaveText("0");
    expect(await page.evaluate(() => scrollY)).toBe(taskScroll);
    expect(await page.evaluate(sentinelMeasures)).toEqual(sentinels);
    expect(await page.locator("html").getAttribute("data-reads")).toBe("1");
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
}
