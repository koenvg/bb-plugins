import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

it("reuses two formatters, parses at local midnight, and follows reference dates and New Year", async () => {
  vi.resetModules();
  const Native = Intl.DateTimeFormat;
  const construction = vi
    .spyOn(Intl, "DateTimeFormat")
    .mockImplementation(function (locales, options) {
      return new Native(locales, options);
    });
  const descriptor = Object.getOwnPropertyDescriptor(Native.prototype, "format")!;
  const used: Date[] = [];
  vi.spyOn(Native.prototype as { readonly format: unknown }, "format", "get").mockImplementation(
    function (this: Intl.DateTimeFormat) {
      const format = descriptor.get!.call(this) as (date: Date) => string;
      return (date: Date) => {
        used.push(date);
        return format(date);
      };
    },
  );
  const { formatDueDate } = await import("./lib.js");
  expect(formatDueDate("2026-01-01", new Date(2026, 8, 2))).toBe("Jan 1");
  expect(formatDueDate("2025-12-31", new Date(2026, 8, 2))).toBe("Dec 31, 2025");
  expect(formatDueDate("2027-01-01", new Date(2027, 0, 1))).toBe("Jan 1");
  expect(formatDueDate("2026-01-01", new Date(2027, 0, 1))).toBe("Jan 1, 2026");
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 11, 31, 23, 59));
  expect(formatDueDate("2027-01-01")).toBe("Jan 1, 2027");
  vi.setSystemTime(new Date(2027, 0, 1, 0, 1));
  expect(formatDueDate("2027-01-01")).toBe("Jan 1");
  expect(construction).toHaveBeenCalledTimes(2);
  expect(used).toHaveLength(6);
  expect(used[0]!.getFullYear()).toBe(2026);
  expect(used[0]!.getMonth()).toBe(0);
  expect(used[0]!.getDate()).toBe(1);
  expect(used[0]!.getHours()).toBe(0);
});

it("preserves the invalid-date output instead of crashing a row", async () => {
  const { formatDueDate } = await import("./lib.js");
  expect(formatDueDate("invalid")).toBe("Invalid Date");
});
