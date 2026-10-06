// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LIST_PREFERENCE,
  LIST_PREFERENCE_STORAGE_KEY,
  LIST_PREFERENCE_VERSION,
  listPreferenceScope,
  loadListPreference,
  sanitizeListPreference,
  storeListPreference,
} from "./list-preference.js";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("listPreferenceScope", () => {
  it("maps list surfaces to independent scopes", () => {
    expect(listPreferenceScope(null, false)).toBe("all");
    expect(listPreferenceScope(null, true)).toBe("active");
    expect(listPreferenceScope("01HZZZZZZZZZZZZZZZZZZZZZP1", false)).toBe(
      "project:01HZZZZZZZZZZZZZZZZZZZZZP1",
    );
    expect(listPreferenceScope("01HZZZZZZZZZZZZZZZZZZZZZP1", true)).toBe("active");
  });
});

describe("sanitizeListPreference", () => {
  it("returns defaults for missing or garbage input", () => {
    expect(sanitizeListPreference(undefined)).toEqual({
      filters: { statuses: [], priorities: [], labelNames: [] },
      sort: "manual",
      collapsedStatuses: [],
    });
    expect(sanitizeListPreference(null)).toEqual({
      filters: { statuses: [], priorities: [], labelNames: [] },
      sort: "manual",
      collapsedStatuses: [],
    });
    expect(sanitizeListPreference("nope")).toEqual({
      filters: { statuses: [], priorities: [], labelNames: [] },
      sort: "manual",
      collapsedStatuses: [],
    });
  });

  it("drops invalid statuses, priorities, and sort; keeps label names", () => {
    expect(
      sanitizeListPreference({
        filters: {
          statuses: ["todo", "not-a-status", "todo", "done"],
          priorities: ["high", 3, "high", "telepathic"],
          labelNames: [" Bug ", "", "Bug", "Feature", 12],
        },
        sort: "priority-please",
      }),
    ).toEqual({
      filters: {
        statuses: ["todo", "done"],
        priorities: ["high"],
        labelNames: ["Bug", "Feature"],
      },
      sort: "manual",
      collapsedStatuses: [],
    });
  });

  it("accepts a valid preference and known sort modes", () => {
    expect(
      sanitizeListPreference({
        filters: {
          statuses: ["in_progress"],
          priorities: ["urgent", "none"],
          labelNames: ["infra"],
        },
        sort: "due",
      }),
    ).toEqual({
      filters: {
        statuses: ["in_progress"],
        priorities: ["urgent", "none"],
        labelNames: ["infra"],
      },
      sort: "due",
      collapsedStatuses: [],
    });
  });
});

describe("loadListPreference / storeListPreference", () => {
  it("defaults when storage is empty", () => {
    expect(loadListPreference("all")).toEqual({
      filters: { ...DEFAULT_LIST_PREFERENCE.filters },
      sort: "manual",
      collapsedStatuses: [],
    });
  });

  it("round-trips a preference for one scope without touching another", () => {
    storeListPreference("all", {
      filters: {
        statuses: ["todo"],
        priorities: ["high"],
        labelNames: ["Bug"],
      },
      sort: "priority",
    });
    storeListPreference("project:p1", {
      filters: {
        statuses: ["done"],
        priorities: [],
        labelNames: [],
      },
      sort: "due",
    });

    expect(loadListPreference("all")).toEqual({
      filters: {
        statuses: ["todo"],
        priorities: ["high"],
        labelNames: ["Bug"],
      },
      sort: "priority",
      collapsedStatuses: [],
    });
    expect(loadListPreference("project:p1")).toEqual({
      filters: {
        statuses: ["done"],
        priorities: [],
        labelNames: [],
      },
      sort: "due",
      collapsedStatuses: [],
    });
    expect(loadListPreference("active")).toEqual({
      filters: { statuses: [], priorities: [], labelNames: [] },
      sort: "manual",
      collapsedStatuses: [],
    });

    const stored = JSON.parse(window.localStorage.getItem(LIST_PREFERENCE_STORAGE_KEY)!);
    expect(stored.version).toBe(LIST_PREFERENCE_VERSION);
    expect(Object.keys(stored.scopes).sort()).toEqual(["all", "project:p1"]);
  });

  it("persists an explicit clear (empty filters + manual sort)", () => {
    storeListPreference("all", {
      filters: { statuses: ["todo"], priorities: [], labelNames: [] },
      sort: "priority",
    });
    storeListPreference("all", {
      filters: { statuses: [], priorities: [], labelNames: [] },
      sort: "manual",
    });
    expect(loadListPreference("all")).toEqual({
      filters: { statuses: [], priorities: [], labelNames: [] },
      sort: "manual",
      collapsedStatuses: [],
    });
  });

  it("recovers from corrupt JSON and invalid document shapes", () => {
    window.localStorage.setItem(LIST_PREFERENCE_STORAGE_KEY, "{not-json");
    expect(loadListPreference("all").sort).toBe("manual");

    window.localStorage.setItem(
      LIST_PREFERENCE_STORAGE_KEY,
      JSON.stringify({ version: 1, scopes: "nope" }),
    );
    expect(loadListPreference("all").filters.statuses).toEqual([]);

    window.localStorage.setItem(
      LIST_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        scopes: {
          all: {
            filters: { statuses: ["bogus"], priorities: ["high"] },
            sort: "priority",
          },
        },
      }),
    );
    expect(loadListPreference("all")).toEqual({
      filters: { statuses: [], priorities: ["high"], labelNames: [] },
      sort: "priority",
      collapsedStatuses: [],
    });
  });

  it("best-effort reads scopes from an unknown future version without rewriting it", () => {
    const future = JSON.stringify({
      version: 99,
      scopes: {
        all: {
          filters: { statuses: ["todo"], priorities: [], labelNames: [] },
          sort: "due",
          extraFutureField: true,
        },
      },
    });
    window.localStorage.setItem(LIST_PREFERENCE_STORAGE_KEY, future);
    expect(loadListPreference("all")).toEqual({
      filters: { statuses: ["todo"], priorities: [], labelNames: [] },
      sort: "due",
      collapsedStatuses: [],
    });
    storeListPreference("all", {
      filters: { statuses: ["done"], priorities: [], labelNames: [] },
      sort: "manual",
    });
    expect(window.localStorage.getItem(LIST_PREFERENCE_STORAGE_KEY)).toBe(future);
  });

  it("swallows storage write failures", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is disabled", "SecurityError");
    });
    expect(() =>
      storeListPreference("all", {
        filters: { statuses: ["todo"], priorities: [], labelNames: [] },
        sort: "manual",
      }),
    ).not.toThrow();
  });

  it("swallows storage read failures", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is disabled", "SecurityError");
    });
    expect(loadListPreference("all")).toEqual({
      filters: { statuses: [], priorities: [], labelNames: [] },
      sort: "manual",
      collapsedStatuses: [],
    });
  });
});

describe("section preference recovery", () => {
  const legacy = {
    filters: {
      statuses: ["todo", "done"],
      priorities: ["high"],
      labelNames: ["Bug"],
      dependency: "blocked",
    },
    sort: "due",
  };

  it.each(
    [undefined, null, "todo", 7, {}, ["unknown", null, 7]].map((collapsedStatuses) => ({
      collapsedStatuses,
    })),
  )(
    "uses expanded defaults for invalid section field $collapsedStatuses without losing legacy fields",
    ({ collapsedStatuses }) => {
      const raw = { ...legacy, collapsedStatuses };
      expect(sanitizeListPreference(raw)).toEqual({ ...legacy, collapsedStatuses: [] });
      window.localStorage.setItem(
        LIST_PREFERENCE_STORAGE_KEY,
        JSON.stringify({ version: 1, scopes: { all: raw } }),
      );
      expect(loadListPreference("all")).toEqual({ ...legacy, collapsedStatuses: [] });
    },
  );

  it("sanitizes additive version 1 section choices at load and store without changing other scopes", () => {
    const raw = {
      ...legacy,
      collapsedStatuses: ["todo", "unknown", "todo", null, "backlog", "done", "done"],
    };
    const expected = { ...legacy, collapsedStatuses: ["todo", "backlog", "done"] };
    expect(sanitizeListPreference(raw)).toEqual(expected);
    window.localStorage.setItem(
      LIST_PREFERENCE_STORAGE_KEY,
      JSON.stringify({ version: 1, scopes: { all: raw, active: legacy } }),
    );
    expect(loadListPreference("all")).toEqual(expected);
    // Storage input can be malformed even when typed callers normally cannot produce it.
    storeListPreference("all", raw as unknown as Parameters<typeof storeListPreference>[1]);
    expect(loadListPreference("all")).toEqual(expected);
    expect(loadListPreference("active")).toEqual({ ...legacy, collapsedStatuses: [] });
    expect(JSON.parse(window.localStorage.getItem(LIST_PREFERENCE_STORAGE_KEY)!).version).toBe(1);
  });

  it.each(
    [
      undefined,
      null,
      "new-scope-encoding",
      [],
      { all: { ...legacy, collapsedStatuses: ["todo"] } },
    ].map((scopes) => ({ scopes })),
  )("never rewrites a future document with scopes $scopes", ({ scopes }) => {
    const future = JSON.stringify({ version: 99, scopes, newFormat: { preserve: true } });
    window.localStorage.setItem(LIST_PREFERENCE_STORAGE_KEY, future);
    expect(() => loadListPreference("all")).not.toThrow();
    storeListPreference("all", { ...DEFAULT_LIST_PREFERENCE, collapsedStatuses: ["done"] });
    expect(window.localStorage.getItem(LIST_PREFERENCE_STORAGE_KEY)).toBe(future);
  });
});
