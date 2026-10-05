// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createBrowsePreference } from "./browse-preference.js";

const PROJECT_ID = "01HZZZZZZZZZZZZZZZZZZZZZP1";
const KEY = "tasks-plus:browse-preference";
const openPreference = () => createBrowsePreference(KEY, () => window.localStorage);

describe("browse scope preference", () => {
  it("distinguishes first use from explicit All and restores the last choice after reload", () => {
    const preference = openPreference();
    expect(preference.load()).toBeNull();
    preference.store({ kind: "project", projectId: PROJECT_ID });
    expect(openPreference().load()).toEqual({
      kind: "project",
      projectId: PROJECT_ID,
    });
    preference.store({ kind: "all" });
    expect(openPreference().load()).toEqual({ kind: "all" });
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({
      version: 1,
      scope: { kind: "all" },
    });
  });
  it.each([
    null,
    "not json",
    "null",
    "[]",
    "{}",
    JSON.stringify({ version: 0, scope: { kind: "all" } }),
    JSON.stringify({
      version: 1,
      scope: { kind: "project", projectId: "garbage" },
    }),
    JSON.stringify({ version: 1, scope: { kind: "project", projectId: 42 } }),
    JSON.stringify({ version: 1, scope: { kind: "active" } }),
  ])("ignores invalid storage %s and accepts a new choice", (raw) => {
    if (raw !== null) window.localStorage.setItem(KEY, raw);
    const preference = openPreference();
    expect(preference.load()).toBeNull();
    preference.store({ kind: "project", projectId: PROJECT_ID });
    expect(preference.load()).toEqual({
      kind: "project",
      projectId: PROJECT_ID,
    });
  });

  it.each(["access", "read", "write"])(
    "keeps a session choice when storage blocks %s",
    (failure) => {
      window.localStorage.setItem(KEY, JSON.stringify({ version: 1, scope: { kind: "all" } }));
      const preference = createBrowsePreference(KEY, () => {
        if (failure === "access") throw new Error("blocked access");
        return {
          getItem: (key) => {
            if (failure === "read") throw new Error("blocked read");
            return window.localStorage.getItem(key);
          },
          setItem: () => {
            throw new Error("blocked write");
          },
        };
      });
      preference.store({ kind: "project", projectId: PROJECT_ID });
      expect(preference.load()).toEqual({
        kind: "project",
        projectId: PROJECT_ID,
      });
      preference.store({ kind: "all" });
      expect(preference.load()).toEqual({ kind: "all" });
    },
  );

  it("does not read or overwrite a future version, even when it arrives after loading", () => {
    const preference = openPreference();
    preference.store({ kind: "project", projectId: PROJECT_ID });
    const future = JSON.stringify({
      version: 2,
      scope: { kind: "all" },
      extra: "keep",
    });
    window.localStorage.setItem(KEY, future);
    expect(preference.load()).toBeNull();
    preference.store({ kind: "project", projectId: PROJECT_ID });
    expect(preference.load()).toEqual({
      kind: "project",
      projectId: PROJECT_ID,
    });
    expect(window.localStorage.getItem(KEY)).toBe(future);
    expect(openPreference().load()).toBeNull();
  });

  it("reads another tab's choice without sharing another plugin's scope", () => {
    const first = openPreference();
    const second = openPreference();
    first.store({ kind: "project", projectId: PROJECT_ID });
    expect(second.load()).toEqual({ kind: "project", projectId: PROJECT_ID });
    second.store({ kind: "all" });
    expect(first.load()).toEqual({ kind: "all" });
    expect(
      createBrowsePreference("another-plugin:browse-preference", () => window.localStorage).load(),
    ).toBeNull();
  });
});
