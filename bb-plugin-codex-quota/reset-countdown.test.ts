import { describe, expect, it } from "vitest";
import { resetCountdown } from "./reset-countdown.js";

const now = Date.UTC(2026, 8, 27, 12);
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

describe("reset countdown", () => {
  it.each([
    [6 * day + 6 * hour, "6 days, 6 hours left"],
    [day + 2 * hour + 40 * minute, "1 day, 2 hours left"],
    [day, "1 day left"],
    [2 * day, "2 days left"],
    [3 * hour + 15 * minute, "3 hours, 15 minutes left"],
    [hour + minute, "1 hour, 1 minute left"],
    [hour, "1 hour left"],
    [2 * minute + 59_999, "2 minutes left"],
    [minute, "1 minute left"],
    [59_999, "Less than a minute left"],
    [1, "Less than a minute left"],
    [0, "Reset due"],
    [-day, "Reset due"],
  ])("formats %i milliseconds as %s", (duration, label) => {
    expect(resetCountdown(new Date(now + duration).toISOString(), now)).toBe(label);
  });

  it.each([null, "", "not a date"])("treats %s as unknown", (resetAt) => {
    expect(resetCountdown(resetAt, now)).toBe("Reset unknown");
  });

  it("uses elapsed hours across a daylight-saving transition", () => {
    expect(
      resetCountdown("2026-03-29T12:00:00+02:00", Date.parse("2026-03-28T12:00:00+01:00")),
    ).toBe("23 hours left");
  });
});
