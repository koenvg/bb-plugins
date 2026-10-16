// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import * as renderer from "@tanstack/charts/renderer";
import { OutputRateChart } from "./output-rate-chart";
import { projectOutputRates, type RateMode } from "./output-rate";
import { readout, queryReadout, move, leave } from "./chart-test-support";

vi.mock("@tanstack/charts/renderer", { spy: true });
const frame = (offset = 0, mode: RateMode = { window: 30, unit: "tokens" }) =>
  projectOutputRates(
    {
      startedAt: 1500,
      samples: Array.from({ length: 600 }, (_, index) => ({
        second: offset + index,
        rawBytesPerSecond: offset + index === 300 ? 120 : 80,
        smoothBytesPerSecond: offset + index === 300 ? 60 : 40,
      })),
    },
    mode,
  );
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("mounts the real native renderer with exactly 600 observations and exact scene domains", () => {
  const mounted = vi.mocked(renderer.mountChartRenderer);
  const view = render(<OutputRateChart view={frame()} availability="connected" />);
  const host = mounted.mock.results[0]!.value;
  const scene = host.getScene();
  expect(scene.points).toHaveLength(600);
  expect(scene.points[0]).toMatchObject({ x: 0, y: 110, xValue: 0, yValue: 10 });
  expect(scene.points[300]).toMatchObject({ xValue: 300, yValue: 15, y: 70 });
  expect(scene.points[599]).toMatchObject({ x: 960, xValue: 599 });
  expect(scene.scales.y.domain).toEqual([0, 20]);
  expect(scene.chart).toEqual({ x: 0, y: 30, width: 960, height: 160 });
  view.rerender(
    <OutputRateChart view={frame(0, { window: 1, unit: "tokens" })} availability="connected" />,
  );
  expect(mounted).toHaveBeenCalledOnce();
  expect(host.getScene().scales.y.domain).toEqual([0, 36]);
  expect(host.getScene().points[300]).toMatchObject({ xValue: 300, yValue: 30 });
  view.rerender(
    <OutputRateChart view={frame(0, { window: 1, unit: "bytes" })} availability="connected" />,
  );
  expect(host.getScene().scales.y.domain).toEqual([0, 144]);
  expect(host.getScene().points[300]).toMatchObject({ xValue: 300, yValue: 120 });
  view.rerender(<OutputRateChart view={frame()} availability="stale" />);
  expect(host.getScene().points).toHaveLength(0);
});
it("does not reopen after same-task focused leave, Escape, slide, blur or unmount", () => {
  const view = render(<OutputRateChart view={frame()} availability="connected" />);
  const surface = view.getByRole("img");
  act(() => surface.focus());
  move(surface, { clientX: (960 * 300) / 599 });
  expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:05:00.000Z");
  act(() => {
    leave(surface);
    fireEvent.keyDown(document.body, { key: "Escape" });
    view.rerender(<OutputRateChart view={frame(1)} availability="connected" />);
  });
  expect(queryReadout()).toBeNull();
  fireEvent.keyDown(surface, { key: "ArrowLeft" });
  expect(readout().querySelector("time")?.dateTime).toBe("1970-01-01T00:09:59.000Z");
  act(() => {
    fireEvent.blur(surface);
    view.rerender(<OutputRateChart view={frame(2)} availability="stale" />);
  });
  view.rerender(<OutputRateChart view={frame(3)} availability="connected" />);
  expect(queryReadout()).toBeNull();
  view.unmount();
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(queryReadout()).toBeNull();
});
it("ignores zero-width pointer geometry rather than inventing an observation", () => {
  const view = render(<OutputRateChart view={frame()} availability="connected" />);
  const surface = view.getByRole("img");
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 240));
  move(surface, { clientX: 0 });
  expect(queryReadout()).toBeNull();
});
it("keeps the native body target and React readout mounted across sliding snapshots", () => {
  const view = render(<OutputRateChart view={frame()} availability="connected" />);
  act(() => view.getByRole("img").focus());
  const card = readout().querySelector(".live-output-rate-readout");
  expect(card).not.toBeNull();
  view.rerender(<OutputRateChart view={frame(1)} availability="connected" />);
  expect(readout().querySelector(".live-output-rate-readout")).toBe(card);
  expect(card!.isConnected).toBe(true);
  expect(card!.querySelector("time")?.dateTime).toBe("1970-01-01T00:09:59.000Z");
});
