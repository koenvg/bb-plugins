// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COLOR_PALETTE, ColorSwatchPicker } from "./shared.js";

afterEach(cleanup);

describe("ColorSwatchPicker keyboard navigation", () => {
  it.each(["steelblue", "#aBbCcD"])("has one entry stop without changing %s", (value) => {
    const onChange = vi.fn();
    const view = render(<ColorSwatchPicker value={value} onChange={onChange} />);
    const radios = view.getAllByRole("radio");
    const entry = radios.filter((radio) => radio.tabIndex === 0);
    expect(entry).toHaveLength(1);
    expect(entry[0]!.getAttribute("aria-label")).toBe(value === "steelblue" ? "Blue" : "Indigo");
    entry[0]!.focus();
    expect(radios.filter((radio) => radio.getAttribute("aria-checked") === "true")).toHaveLength(
      value === "steelblue" ? 1 : 0,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("wraps in palette order with all four arrows and distinguishes navigation from activation", () => {
    const onChange = vi.fn();
    const onParentKeyDown = vi.fn();
    function Fixture() {
      const [value, setValue] = useState("slateblue");
      return (
        <div onKeyDown={onParentKeyDown}>
          <ColorSwatchPicker
            value={value}
            onChange={(color, interaction) => {
              setValue(color);
              onChange(color, interaction);
            }}
          />
        </div>
      );
    }
    const view = render(<Fixture />);
    view.getByRole("radio", { name: "Indigo" }).focus();
    for (const [key, label, value] of [
      ["ArrowLeft", "Gray", "slategray"],
      ["ArrowRight", "Indigo", "slateblue"],
      ["ArrowUp", "Gray", "slategray"],
      ["ArrowDown", "Indigo", "slateblue"],
      ...COLOR_PALETTE.slice(1).map((swatch) => ["ArrowRight", swatch.label, swatch.value]),
    ]) {
      expect(fireEvent.keyDown(document.activeElement!, { key })).toBe(false);
      const radio = view.getByRole("radio", { name: label });
      expect(document.activeElement).toBe(radio);
      expect(radio.tabIndex).toBe(0);
      expect(radio.getAttribute("aria-checked")).toBe("true");
      expect(onChange).toHaveBeenLastCalledWith(value, "navigate");
      expect(view.getAllByRole("radio").filter((button) => button.tabIndex === 0)).toEqual([radio]);
    }
    expect(onParentKeyDown).not.toHaveBeenCalled();
    const gray = view.getByRole("radio", { name: "Gray" });
    // Space keeps native button activation; only arrows cancel the key event.
    expect(fireEvent.keyDown(gray, { key: " " })).toBe(true);
    expect(gray).toHaveProperty("type", "button");
    fireEvent.click(gray);
    expect(onChange).toHaveBeenLastCalledWith("slategray", "activate");
    expect(fireEvent.keyDown(gray, { key: "Tab" })).toBe(true);
  });

  it("does not navigate a disabled fieldset", () => {
    const onChange = vi.fn();
    const view = render(
      <fieldset disabled>
        <ColorSwatchPicker value="steelblue" onChange={onChange} />
      </fieldset>,
    );
    fireEvent.keyDown(view.getByRole("radio", { name: "Blue" }), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
