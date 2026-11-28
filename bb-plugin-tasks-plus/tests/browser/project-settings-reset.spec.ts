import { fail as missingValue } from "node:assert/strict";
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
    const original = JSON.parse(
      (await evidence.textContent()) ?? missingValue("Expected a non-null value"),
    );
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
    await Array.fromAsync(
      [
        "Fail next save",
        "Fail next task count",
        "Fail next deletion",
        "Fail post-delete refresh",
        "Overlap stale inventory on next delete",
        "Toggle zero task count",
        "Toggle light/dark",
        "Fail next inventory refresh",
      ],
      async (label) => {
        await page.getByRole("button", { name: label, exact: true }).click();
      },
    );
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
    expect(
      JSON.parse((await evidence.textContent()) ?? missingValue("Expected a non-null value")),
    ).toEqual(original);
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
    expect(
      JSON.parse((await evidence.textContent()) ?? missingValue("Expected a non-null value")),
    ).toEqual(original);
    expect(await page.evaluate(() => ({ ...localStorage }))).toMatchObject(unrelated);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(
      "Stale cache",
    );
  });
}

test("project deletion stays locked through count retry and while deletion is pending", async ({
  page,
}) => {
  await page.goto("/project-settings-preview/table.html");
  const open = page.getByRole("button", { name: "Delete HOME", exact: true });
  await expect(open).toBeEnabled();
  await page.getByRole("button", { name: "Fail next task count", exact: true }).click();
  await page.getByRole("button", { name: "Fail next deletion", exact: true }).click();
  await open.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  const prefix = dialog.getByRole("textbox", { name: "Type HOME to confirm" });
  const submit = dialog.getByRole("button", { name: "Delete project and tasks" });
  await prefix.fill("HOME");
  await expect(dialog.getByRole("alert")).toContainText("Could not count tasks");
  await expect(submit).toBeDisabled();
  await dialog.getByRole("button", { name: "Retry task count" }).click();
  await expect(submit).toBeDisabled();
  await expect(dialog).toContainText("Delete this project and all 42 tasks?");
  await expect(submit).toBeEnabled();
  await expect(page.locator("#evidence")).toContainText('"deleteCalls": 0');

  await submit.click();
  await expect(dialog.getByRole("button", { name: "Deleting…" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("Could not delete HOME");
  await expect(prefix).toHaveValue("HOME");
  await expect(page.locator("#evidence")).toContainText('"deleteCalls": 1');
  await submit.click();
  await expect(dialog).toBeHidden();
  await expect(open).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete WORK", exact: true })).toBeEnabled();
  await expect(page.locator("#evidence")).toContainText('"deleteCalls": 2');
});

test("keeps a deleted project hidden while its inventory refresh fails", async ({ page }) => {
  await page.goto("/project-settings-preview/table.html");
  const table = page.getByRole("table", { name: "Projects", exact: true });
  const home = table.getByRole("textbox", { name: "Project name for HOME" });
  const work = table.getByRole("textbox", { name: "Project name for WORK" });
  await expect(home).toBeEnabled();
  await work.fill("Keep this draft");
  await page.getByRole("button", { name: "Fail post-delete refresh", exact: true }).click();
  await table.getByRole("button", { name: "Delete HOME", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Type HOME to confirm" }).fill("HOME");
  await dialog.getByRole("button", { name: "Delete project and tasks" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("Fixture post-delete inventory unavailable");
  await expect(home).toHaveCount(0);
  await expect(work).toHaveValue("Keep this draft");

  await page.getByRole("button", { name: "Allow inventory reads", exact: true }).click();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(table).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(home).toHaveCount(0);
  await expect(work).toHaveValue("Keep this draft");
  await expect(page.locator("#evidence")).toContainText('"deleteCalls": 1');
});
