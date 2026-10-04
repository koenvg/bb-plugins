// @vitest-environment jsdom
import * as Tooltip from "@radix-ui/react-tooltip";
import { act, cleanup, render, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { mountFooterAdapter } from "./footer-adapter.js";
import { footerFixture } from "./footer-fixture.test-support.js";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

// Matches BB's native SidebarMenuButton tooltip composition, not a mocked trigger.
function nativeFooter(open: boolean) {
  return <Tooltip.Provider>
    <Tooltip.Root open={open}>
      <Tooltip.Trigger asChild>
        <button data-sidebar="menu-button" aria-label="Codex quota"><svg aria-hidden="true" /></button>
      </Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content>Codex quota</Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  </Tooltip.Provider>;
}

it("keeps quota details described through native tooltip open/close and removes only its own reference on disposal", async () => {
  const { sidebar, item } = footerFixture();
  const view = render(nativeFooter(false), { container: item });
  const button = within(sidebar).getByRole("button", { name: "Codex quota" });
  const adapter = mountFooterAdapter(document, "codex-quota");
  dispose = adapter.dispose;
  const target = adapter.getSnapshot()[0]!;
  const status = "My Mac; 7 days; fresh; 72% remaining; observed 30 September 2026";
  // The portal renderer supplies this description; only its DOM contract matters here.
  target.container.append(Object.assign(document.createElement("span"), { id: target.descriptionId, textContent: status }));
  const references = () => (button.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  const expectQuotaDescription = () => expect(within(sidebar).getByRole("button", { name: "Codex quota", description: /My Mac; 7 days; fresh; 72% remaining; observed/ })).toBe(button);
  expectQuotaDescription();

  view.rerender(nativeFooter(true));
  const tooltipId = (await within(document.body).findByRole("tooltip")).id;
  await waitFor(() => expect(references()).toEqual([tooltipId, target.descriptionId]));
  expectQuotaDescription();

  view.rerender(nativeFooter(false));
  await waitFor(() => expect(references()).toEqual([target.descriptionId]));
  expectQuotaDescription();

  // Do not resurrect a removed tooltip ID or lose another host-owned reference.
  button.setAttribute("aria-describedby", "host-current-description");
  await waitFor(() => expect(references()).toEqual(["host-current-description", target.descriptionId]));
  expectQuotaDescription();
  const writes = vi.spyOn(button, "setAttribute");
  await act(async () => { sidebar.append(document.createElement("div")); });
  expect(writes.mock.calls.filter(([name]) => name === "aria-describedby")).toEqual([]);
  writes.mockRestore();

  // Dispose while the tooltip is open so cleanup must preserve its live ID.
  view.rerender(nativeFooter(true));
  await waitFor(() => expect(references()).toEqual([tooltipId, target.descriptionId]));
  adapter.dispose();
  expect(references()).toEqual([tooltipId]);
  expect(within(document.body).getByRole("tooltip").id).toBe(tooltipId);
  expect(document.getElementById(target.descriptionId)).toBeNull();
  await act(async () => { view.rerender(nativeFooter(false)); });
  expect(button.hasAttribute("aria-describedby")).toBe(false);
});
