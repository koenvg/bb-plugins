// @vitest-environment jsdom
import { Profiler } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CalendarChart } from "./calendar-tanstack.js";
import { chartData } from "./calendar-chart-data.js";
import { calendarSnapshot } from "./calendar-test-support.js";

afterEach(cleanup);

it("removes the retained date from a continuously mounted chart when the current range excludes it", async () => {
  const commits: (string | null)[] = [];
  const draw = (startDate: string) => {
    const view = calendarSnapshot({
      startDate,
      timezone: "UTC",
      group: "workspace",
      scope: { kind: "host" },
    });
    const data = chartData(view.days, "tokens");
    return (
      <Profiler
        id="tooltip-date"
        onRender={() =>
          commits.push(
            document.querySelector('[role="tooltip"] time')?.getAttribute("datetime") ?? null,
          )
        }
      >
        <CalendarChart
          data={data}
          visibleModels={data.models}
          metric="tokens"
          includeUncertain={false}
        />
      </Profiler>
    );
  };
  const page = render(draw("2026-09-02"));
  const chart = screen.getByRole("img", { name: "Daily usage chart: Tokens" });
  fireEvent.focus(chart);
  fireEvent.keyDown(chart, { key: "Home" });
  const tooltip = await screen.findByRole("tooltip", { hidden: true });
  expect(tooltip.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-02");
  commits.length = 0;
  page.rerender(draw("2026-08-03"));
  expect(screen.getByRole("img", { name: "Daily usage chart: Tokens" })).toBe(chart);
  expect(commits[0]).toBeNull();
  expect(commits).not.toContain("2026-09-02");
  fireEvent.keyDown(chart, { key: "Home" });
  const currentTooltip = await screen.findByRole("tooltip", { hidden: true });
  expect(currentTooltip.querySelector("time")?.getAttribute("datetime")).toBe("2026-08-03");
});
