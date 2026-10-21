import { test, expect, jsonEvidence } from "./fixtures.js";
import { chart, pointAtDate, rows } from "./calendar-driver.js";

for (const [state, expectedModels] of [
  ["model-transition", ["B$3.00", "C$6.00"]],
  ["model-replacement", ["B$9.00"]],
] as const)
  test(`visible cost tooltip keeps current model dollars during ${state}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") errors.push(message.text());
    });
    await page.goto(`/saved.html?state=${state}`);
    await chart(page);
    await page.getByRole("img").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Estimated cost", exact: true }).click();
    const before = await rows(page);
    expect(before[14].slice(-1)).toEqual(["$6.00 · 2 of 2 records priced · pricing available"]);
    await pointAtDate(page, 14);
    const models = page.getByRole("list", { name: "Captured cost by model", exact: true });
    await expect(models.getByRole("listitem")).toHaveText(["A$6.00"]);
    const beforeTooltip = await page.getByRole("tooltip").textContent();
    try {
      await page.evaluate(() => {
        const fixture = (window as unknown as { savedFixture: { release(name: string): void } })
          .savedFixture;
        fixture.release("live");
      });
      await expect(page.getByLabel("Captured cost subtotal")).toHaveText("$9.00");
      await expect(models.getByRole("listitem")).toHaveText(expectedModels);
      await expect(page.getByRole("tooltip").locator("time")).toHaveAttribute(
        "datetime",
        before[14][0],
      );
      const commits = await page.evaluate(() =>
        (
          window as unknown as {
            savedFixture: { tooltipCommits: { subtotal: string | null; models: string[] }[] };
          }
        ).savedFixture.tooltipCommits.filter((commit) => commit.subtotal === "$9.00"),
      );
      expect(commits.at(-1)?.models).toEqual(expectedModels);
      for (const commit of commits) expect(commit.models).toEqual(expectedModels);
      expect(errors, "No thrown renders or console errors during replacement").toEqual([]);
    } finally {
      await jsonEvidence(info, "projection-transition.json", {
        boundary: "machineReportSnapshot and held machineReports RPC responses",
        before,
        beforeTooltip,
        after: await rows(page),
        errors,
        tooltipCommits: await page.evaluate(
          () =>
            (window as unknown as { savedFixture: { tooltipCommits: unknown[] } }).savedFixture
              .tooltipCommits,
        ),
        events: await page.evaluate(
          () => (window as unknown as { savedFixture: { events: unknown[] } }).savedFixture.events,
        ),
      });
    }
  });

test("token tooltip survives live model replacement before switching to Estimated cost", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") errors.push(message.text());
  });
  await page.goto("/saved.html?state=model-transition");
  await chart(page);
  await page.getByRole("img").scrollIntoViewIfNeeded();
  await pointAtDate(page, 14);
  await expect(page.getByRole("tooltip").getByRole("listitem")).toHaveText(["A1.2 thousand"]);
  const beforeTooltip = await page.getByRole("tooltip").textContent();
  try {
    await page.evaluate(() => {
      (window as unknown as { savedFixture: { release(name: string): void } }).savedFixture.release(
        "live",
      );
    });
    await expect(page.getByLabel("Recorded token subtotal")).toHaveText("1.8 thousand");
    await expect(page.getByRole("tooltip").getByRole("listitem")).toHaveText(["B900", "C900"]);
    await page.getByRole("button", { name: "Estimated cost", exact: true }).click();
    await expect(page.getByLabel("Captured cost subtotal")).toHaveText("$9.00");
    await pointAtDate(page, 14);
    const models = page.getByRole("list", { name: "Captured cost by model", exact: true });
    await expect(models.getByRole("listitem")).toHaveText(["B$3.00", "C$6.00"]);
    const commits = await page.evaluate(() =>
      (
        window as unknown as {
          savedFixture: { tooltipCommits: { subtotal: string | null; models: string[] }[] };
        }
      ).savedFixture.tooltipCommits.filter((commit) => commit.subtotal === "$9.00"),
    );
    expect(commits.at(-1)?.models).toEqual(["B$3.00", "C$6.00"]);
    for (const commit of commits) {
      if (commit.models.length) expect(commit.models).toEqual(["B$3.00", "C$6.00"]);
    }
    expect(errors, "No thrown renders or console errors during the metric switch").toEqual([]);
  } finally {
    await jsonEvidence(info, "tokens-to-cost.json", {
      beforeTooltip,
      after: await rows(page),
      errors,
      tooltipCommits: await page.evaluate(
        () =>
          (window as unknown as { savedFixture: { tooltipCommits: unknown[] } }).savedFixture
            .tooltipCommits,
      ),
    });
  }
});

test("range navigation removes a pinned tooltip whose date is no longer current", async ({
  page,
}, info) => {
  await page.goto("/calendar.html?state=model-costs");
  await chart(page);
  await page.getByRole("button", { name: "Estimated cost", exact: true }).click();
  await page.getByRole("img").focus();
  await page.keyboard.press("Home");
  const oldDate = (await rows(page))[0][0];
  await expect(page.getByRole("tooltip").locator("time")).toHaveAttribute("datetime", oldDate);
  await page.keyboard.press("Enter");
  await expect(page.locator(".calendar-tooltip")).toHaveAttribute("data-sticky", "true");
  await page.getByRole("button", { name: "Previous 30 days" }).focus();
  await page.keyboard.press("Enter");
  await chart(page);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const current = await rows(page);
  expect(oldDate).toBe("2026-09-02");
  expect(current[0][0]).toBe("2026-08-03");
  await jsonEvidence(info, "removed-date.json", {
    oldDate,
    currentDates: current.map((row) => row[0]),
  });
});
