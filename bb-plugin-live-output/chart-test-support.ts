import { afterEach, beforeEach, vi } from "vitest";
import { fireEvent } from "@testing-library/react";

let restore = () => {};
beforeEach(() => {
  const bounds = {
    left: 0,
    top: 0,
    width: 960,
    height: 240,
    right: 960,
    bottom: 240,
    x: 0,
    y: 0,
    toJSON() {},
  };
  const html = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(bounds);
  const svg = vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue(bounds);
  const width = Object.getOwnPropertyDescriptor(window, "innerWidth")!;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 2400 });
  restore = () => {
    html.mockRestore();
    svg.mockRestore();
    Object.defineProperty(window, "innerWidth", width);
  };
});
afterEach(() => restore());
export function queryReadout() {
  return document.querySelector<HTMLElement>(".live-output-rate-tooltip:not([hidden])");
}
export function readout() {
  const element = queryReadout();
  if (!element) throw new Error("Expected visible native output readout");
  return element;
}
export function move(chart: Element, options: { clientX: number; clientY?: number }) {
  fireEvent(chart, new MouseEvent("pointermove", { bubbles: true, clientY: 110, ...options }));
}
export function leave(chart: Element) {
  fireEvent(chart.parentElement!, new MouseEvent("mouseleave", { bubbles: false }));
}
