// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SpeedTotals } from "./speed-totals.js";

afterEach(cleanup);

it("keeps compact speed values readable with exact accessible counts", () => {
  render(<SpeedTotals tokens={{ normal: 1_234_567, fast: 5_000, ultrafast: 0 }} />);
  expect(screen.getByLabelText("Normal tokens").textContent).toBe("1.23M");
  expect(screen.getByLabelText("Normal tokens").getAttribute("aria-description")).toBe(
    "1,234,567 recorded tokens",
  );
  expect(screen.getByLabelText("Fast tokens", { exact: true }).textContent).toBe("5K");
  expect(
    screen.getByLabelText("Fast tokens", { exact: true }).getAttribute("aria-description"),
  ).toBe("5,000 recorded tokens");
  expect(screen.getByLabelText("Ultrafast tokens").textContent).toBe("0");
  expect(
    screen.getByRole("group", { name: "Recorded tokens by speed" }).querySelectorAll("dt"),
  ).toHaveLength(3);
});

it("keeps the three labels during loading without claiming zero", () => {
  render(<SpeedTotals tokens={null} />);
  for (const label of ["Normal", "Fast", "Ultrafast"]) {
    const value = screen.getByLabelText(`${label} tokens`, { exact: true });
    expect(value.textContent).toBe("—");
    expect(value.hasAttribute("aria-description")).toBe(false);
  }
});
