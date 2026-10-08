import { test, expect, sizes, viewport, noOverflow, officialLink, capture } from "./fixtures.js";

test("collector desktop and 375px controls", async ({ page }, info) => {
  await page.goto("/collector.html");
  await expect(
    page.getByText("History not configured on this host.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toHaveAttribute("data-collector-actions");
  await capture(page, info, "early-desktop-collapsed");
  const summary = page.getByText("Collection and privacy", { exact: true });
  await summary.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Install collector" }).click();
  await expect(page.getByText("Selected-host workspace totals", { exact: true })).toBeVisible();
  await capture(page, info, "early-desktop-open");
  await viewport(page, 375);
  await capture(page, info, "early-375-open");
  await noOverflow(page);
  await page.getByRole("button", { name: "Pause capture" }).click();
  await expect(page.getByText("Capture paused.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause capture" })).toBeDisabled();
  await page.getByRole("button", { name: "Resume capture" }).click();
  await expect(page.getByText("Capture enabled.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Repair collector" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-collector-actions", "4");
  await page.getByRole("button", { name: "Check readiness" }).click();
  await expect(page.getByText("Selected-host workspace totals", { exact: true })).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-collector-actions", "4");
  await officialLink(page);
  await capture(page, info, "final-375-controls");
  await summary.focus();
  await page.keyboard.press("Space");
  await expect(summary.locator("..")).not.toHaveAttribute("open");
  await capture(page, info, "final-375-collapsed");
  await expect(page.getByRole("link", { name: /Open Codex Usage/ })).toBeVisible();
});

for (const width of sizes) {
  test(`identity ${width} complete and partial navigation`, async ({ page }, info) => {
    await viewport(page, width);
    await page.goto("/identity.html");
    const exact = page.getByRole("button", { name: "Open thread thr_exact", exact: true });
    await expect(exact).toBeVisible();
    await noOverflow(page);
    await exact.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("body")).toHaveAttribute("data-opened-thread", "thr_exact");
    await page.getByRole("button", { name: "Open thread thr_archived", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(page.locator("body")).toHaveAttribute("data-opened-thread", "thr_archived");
    for (const id of ["deleted", "missing"])
      await expect(
        page.getByRole("button", { name: `Open thread thr_${id}`, exact: true }),
      ).toHaveCount(0);
    await officialLink(page);
    await capture(page, info, `final-${width}-complete`);
    await page.getByRole("combobox", { name: "Codex host" }).selectOption("partial-host");
    await expect(page.getByText("Identity discovery: partial.", { exact: false })).toBeVisible();
    await expect(exact).toHaveCount(0);
    await expect(
      page.getByText(
        "Exact totals are not available until discovery and attribution finish. Workspace totals remain available.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Selected-host workspace totals" }),
    ).toBeVisible();
    await noOverflow(page);
    await capture(page, info, `final-${width}-partial`);
    await page.getByRole("combobox", { name: "Codex host" }).selectOption("synthetic-host");
    await expect(exact).toBeVisible();
  });

  test(`import ${width} frozen scope and keyboard resume`, async ({ page }, info) => {
    await viewport(page, width);
    await page.goto("/import.html");
    await page.getByText(`Historical import`, { exact: true }).click();
    await expect(page.getByText("Import stopped.", { exact: false })).toBeVisible();
    await noOverflow(page);
    await page.getByRole("button", { name: `Resume import`, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("body")).toHaveAttribute("data-action", "resume");
    await expect(page.getByRole("button", { name: `Start import`, exact: true })).toBeDisabled();
    await expect(
      page.getByRole("textbox", { name: "BB Pi source root", exact: true }),
    ).toBeDisabled();
    await officialLink(page);
    await capture(page, info, `early-${width}`);
  });

  for (const state of ["healthy", "maintenance", "recovered", "unavailable", "incompatible"]) {
    test(`retention ${width} ${state}`, async ({ page }, info) => {
      await viewport(page, width);
      await page.goto(`/collector.html?state=${state}`);
      await expect(
        page.getByText("History not configured on this host.", { exact: true }),
      ).toBeVisible();
      await expect(page.locator("body")).not.toHaveAttribute("data-collector-actions");
      const privacy = page.getByText("Collection and privacy", { exact: true });
      await privacy.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Install collector" }).click();
      if (!["unavailable", "incompatible"].includes(state)) {
        const health = page.getByText("Storage health and retention", { exact: true });
        await expect(health.locator("..")).not.toHaveAttribute("open");
        await health.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByText(`Storage health: ${state}.`, { exact: false })).toBeVisible();
        await expect(
          page.getByText("Older token classes are unavailable, not zero.", { exact: false }),
        ).toBeVisible();
        if (state === "recovered")
          await expect(page.getByText("Recovery gap:", { exact: false })).toBeVisible();
        await page.getByRole("button", { name: "Pause capture" }).click();
        await expect(page.getByText("Capture paused.", { exact: false })).toBeVisible();
        await expect(page.getByRole("button", { name: "Pause capture" })).toBeDisabled();
        await page.getByRole("button", { name: "Resume capture" }).click();
        await expect(page.getByText("Capture enabled.", { exact: false })).toBeVisible();
      } else {
        await expect(
          page.getByText(
            state === "incompatible"
              ? "History storage is incompatible."
              : "History storage is unavailable on this host.",
            { exact: false },
          ),
        ).toBeVisible();
      }
      await page.getByRole("button", { name: "Check readiness" }).click();
      expect(await page.locator("body").getAttribute("data-collector-actions")).toMatch(/^(1|3)$/);
      await expect(page.getByText("42% remaining", { exact: true })).toBeVisible();
      await officialLink(page);
      await noOverflow(page);
      await capture(page, info, `matrix-${width}-${state}`);
      await privacy.focus();
      await page.keyboard.press("Space");
      await expect(privacy.locator("..")).not.toHaveAttribute("open");
    });
  }

  const phases = [
    "required",
    "awaiting-confirmation",
    "ingesting",
    "retaining",
    "complete",
    "blocked",
  ];
  for (const phase of phases) {
    test(`retention legacy ${width} ${phase}`, async ({ page }, info) => {
      await viewport(page, width);
      await page.goto(`/collector.html?state=maintenance&legacy=${phase}`);
      await page.getByText("Collection and privacy", { exact: true }).click();
      await page.getByRole("button", { name: "Install collector" }).click();
      await page.getByText("Storage health and retention", { exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText(`Legacy retirement: ${phase}.`, { exact: false })).toBeVisible();
      const retire = page.getByRole("button", { name: "Retire stopped legacy logs" });
      if (phase === "awaiting-confirmation") await expect(retire).toBeDisabled();
      else await expect(retire).toHaveCount(0);
      await expect(
        page.getByText("Quiet files, repair and one new event are not stop proof.", {
          exact: false,
        }),
      ).toBeVisible();
      if (phase === "blocked")
        await expect(
          page.getByText(
            "Legacy retirement is incomplete. Check the stop confirmation and storage status. Quota still works.",
            { exact: true },
          ),
        ).toBeVisible();
      if (phase === "required") {
        await page.getByRole("button", { name: "Prepare legacy stop proof" }).click();
        await expect(retire).toBeDisabled();
        const checkbox = page.getByRole("checkbox");
        await checkbox.focus();
        await page.keyboard.press("Space");
        await expect(checkbox).toBeChecked();
        await expect(retire).toBeEnabled();
        await retire.click();
        await expect(
          page.getByText("Legacy retirement: ingesting.", { exact: false }),
        ).toBeVisible();
        await expect(page.locator("body")).toHaveAttribute(
          "data-legacy-confirmation",
          /"legacyWritersStopped":true/,
        );
      }
      await expect(page.getByText("42% remaining", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: /Open Codex Usage/ })).toBeVisible();
      await noOverflow(page);
      await capture(page, info, `legacy-matrix-${width}-${phase}`);
    });
  }

  const combined = [
    ...["healthy", "maintenance", "recovered", "unavailable", "incompatible"].map((state) => ({
      state,
      legacy: "",
      job: "stopped",
    })),
    ...phases.map((legacy) => ({ state: "maintenance", legacy, job: "stopped" })),
    ...["configured", "completed", "canceled"].map((job) => ({
      state: "healthy",
      legacy: "",
      job,
    })),
  ];
  for (const { state, legacy, job } of combined) {
    test(`storage combined ${width} ${state} ${legacy || "none"} ${job}`, async ({
      page,
    }, info) => {
      await viewport(page, width);
      await page.goto(`/collector.html?state=${state}&legacy=${legacy}&job=${job}`);
      await expect(
        page.getByText("History not configured on this host.", { exact: true }),
      ).toBeVisible();
      await expect(page.locator("body")).not.toHaveAttribute("data-collector-actions");
      await page.getByText("Collection and privacy", { exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Install collector" }).click();
      if (!["unavailable", "incompatible"].includes(state)) {
        await page.getByText("Storage health and retention", { exact: true }).focus();
        await page.keyboard.press("Enter");
        if (legacy)
          await expect(
            page.getByText(`Legacy retirement: ${legacy}.`, { exact: false }),
          ).toBeVisible();
        if (legacy === "awaiting-confirmation")
          await expect(
            page.getByRole("button", { name: "Retire stopped legacy logs" }),
          ).toBeDisabled();
      }
      await page.getByText(`Historical import`, { exact: true }).focus();
      await page.keyboard.press("Enter");
      const source = page.getByLabel("BB Pi source root", { exact: true });
      await expect(source).toHaveValue(/synthetic/);
      expect(await page.getByRole("button", { name: "Save import sources" }).isDisabled()).toBe(
        job === "stopped",
      );
      expect(await source.isDisabled()).toBe(job === "stopped");
      if (job === "stopped") {
        const resume = page.getByRole("button", { name: `Resume import` });
        await expect(resume).toBeEnabled();
        await resume.focus();
        expect(await resume.evaluate((e) => e === document.activeElement)).toBe(true);
        await expect(page.getByRole("button", { name: `Cancel import` })).toBeEnabled();
      }
      if (!["unavailable", "incompatible"].includes(state)) {
        await page.getByRole("button", { name: "Open thread thr_synthetic" }).click();
        await expect(page.locator("body")).toHaveAttribute("data-opened-thread", "thr_synthetic");
      }
      await expect(page.getByText("42% remaining", { exact: true })).toBeVisible();
      await officialLink(page);
      await noOverflow(page);
      await capture(page, info, `combined-${width}-${state}-${legacy || "none"}-${job}`);
    });
  }
}
