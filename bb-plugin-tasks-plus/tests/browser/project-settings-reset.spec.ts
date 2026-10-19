import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { querySnapshotStorageKey } from "../../shell/query-snapshot";

const snapshotKeys = ["projects", "folders", "sidebar-summary"].map(querySnapshotStorageKey);
const unrelated = {
  "another-tool:draft": "keep this draft",
  "bb-tasks:view-preferences": "keep these preferences",
  [querySnapshotStorageKey("another-preview")]: "keep this snapshot",
};

test.beforeAll(() => {
  execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url)),
      "build",
      "--config",
      fileURLToPath(
        new URL("../../scripts/project-settings-preview/bundle.config.mjs", import.meta.url),
      ),
    ],
    { stdio: "pipe" },
  );
});

for (const route of ["table.html", "index.html"]) {
  test(`Reset preserves unrelated storage and restores fixtures on ${route}`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.assign(window, { storageAtStartup: { ...localStorage } });
    });
    await page.goto(`/project-settings-preview/${route}`);
    const evidence = page.locator("#evidence");
    await expect(evidence).toContainText('"fixtureOnly": true');
    const original = JSON.parse((await evidence.textContent())!);
    if (route === "index.html")
      await page.getByRole("tab", { name: "Projects", exact: true }).click();

    const name = page.getByRole("textbox", { name: "Project name for HOME", exact: true });
    await expect(name).toBeEnabled();
    await name.fill("Changed fixture");
    await page.getByRole("button", { name: "Save HOME", exact: true }).click();
    await expect(evidence).toContainText('"name": "Changed fixture"');
    await expect(name).toBeEnabled();
    await page.getByRole("button", { name: "Remove first fixture project", exact: true }).click();
    await expect(name).toHaveCount(0);
    for (const label of [
      "Fail next save",
      "Fail next task count",
      "Fail next deletion",
      "Fail post-delete refresh",
      "Overlap stale inventory on next delete",
      "Toggle zero task count",
      "Toggle light/dark",
      "Fail next inventory refresh",
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
    }
    await expect(page.locator("html")).toHaveClass("light");

    await page.evaluate(
      ({ keys, unrelated, staleProjects }) => {
        for (const [key, value] of Object.entries(unrelated)) localStorage.setItem(key, value);
        for (const key of keys) localStorage.setItem(key, JSON.stringify(staleProjects));
      },
      {
        keys: snapshotKeys,
        unrelated,
        staleProjects: [{ ...original.projects[0], name: "Stale cache" }],
      },
    );
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "Reset preview", exact: true }).click(),
    ]);
    const storageAtStartup = await page.evaluate(
      () => (window as unknown as { storageAtStartup: Record<string, string> }).storageAtStartup,
    );
    expect(storageAtStartup).toEqual(unrelated);
    await expect(evidence).toContainText('"fixtureOnly": true');
    expect(JSON.parse((await evidence.textContent())!)).toEqual(original);
    await expect(page.locator("html")).not.toHaveClass("light");
    if (route === "index.html") {
      await expect(page.getByRole("tab", { name: "Labels", exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await page.getByRole("tab", { name: "Projects", exact: true }).click();
    }
    await expect(name).toHaveValue("Home Lab");
    await expect(
      page.getByRole("textbox", { name: "Project name for WORK", exact: true }),
    ).toHaveValue("Home Lab");
    await expect(page.getByRole("button", { name: "Save HOME", exact: true })).toBeDisabled();
    await expect
      .poll(() =>
        page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), snapshotKeys[0]),
      )
      .toEqual(original.projects);
    await page.reload();
    await expect(evidence).toContainText('"fixtureOnly": true');
    expect(JSON.parse((await evidence.textContent())!)).toEqual(original);
    expect(await page.evaluate(() => ({ ...localStorage }))).toMatchObject(unrelated);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(
      "Stale cache",
    );
  });
}
