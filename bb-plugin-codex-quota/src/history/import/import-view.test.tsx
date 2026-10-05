// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ImportPanel } from "./import-view.js";
import { importUnavailable, type ImportView } from "./import-contract.js";
afterEach(cleanup);
type Input = import("../history-contract.js").HistoryRequest & {
  command: import("./import-contract.js").ImportCommand;
};
function show(element: Parameters<typeof render>[0]) {
  const result = render(element);
  (result.container.querySelector("details") as HTMLDetailsElement).open = true;
  return result;
}
const configured: ImportView = {
  reason: "ok",
  configuration: {
    bbRoot: "/source",
    ordinaryRoots: [],
    workspaces: ["/work"],
  },
  generation: null,
};
const stopped: ImportView = {
  ...configured,
  generation: {
    id: "00000000-0000-4000-8000-000000000022",
    state: "stopped",
    startAt: "2026-07-01T00:00:00.000Z",
    endAt: "2026-10-01T00:00:00.000Z",
    workspaces: ["/work"],
    candidates: 1,
    finished: 0,
    bytes: 0,
    records: 0,
    replayed: 0,
    omissions: 1,
    coverage: "partial",
    diagnostics: ["workspace-unverified"],
  },
};
it("mount and disclosure read status only; resume/start/cancel require activation", async () => {
  const call = vi.fn(async (_input: Input) => stopped);
  render(<ImportPanel selection={{ hostId: "host-a", generation: 1 }} call={call} />);
  await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
  expect(call.mock.calls[0][0].command).toEqual({ action: "status" });
  fireEvent.click(screen.getByText(`Historical import`, { selector: "summary" }));
  expect(call).toHaveBeenCalledTimes(1);
  expect((screen.getByRole("button", { name: `Start import` }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: `Resume import` }));
  await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
  expect(call.mock.calls[1][0].command).toEqual({ action: "resume" });
  expect(screen.getByText(/Already committed host records remain/)).toBeTruthy();
});
it("host selection immediately hides old roots/progress and cancels queued dispatch", async () => {
  const call = vi.fn(async (_input: Input) => configured);
  const f = show(<ImportPanel selection={{ hostId: "host-a", generation: 1 }} call={call} />);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: `Start import`,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: `Start import` }));
    f.rerender(
      <ImportPanel
        selection={{ hostId: "host-b", generation: 2 }}
        selectionPending
        selectionRevision={1}
        call={call}
      />,
    );
  });
  await act(async () => {});
  expect(call).toHaveBeenCalledTimes(1);
  expect(
    (
      screen.getByRole("textbox", {
        name: "BB Pi source root",
      }) as HTMLInputElement
    ).value,
  ).toBe("");
  expect(
    (screen.getByRole("button", { name: `Cancel import` }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
it("drops old in-flight results and requires explicit resume after remount", async () => {
  let release!: (v: ImportView) => void;
  const call = vi.fn(async (_input: Input) => new Promise<ImportView>((r) => (release = r)));
  const f = render(<ImportPanel selection={{ hostId: "host-a", generation: 1 }} call={call} />);
  await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
  f.rerender(
    <ImportPanel selection={{ hostId: "host-b", generation: 2 }} selectionPending call={call} />,
  );
  await act(async () => release(stopped));
  expect(screen.queryByText(/Frozen UTC range/)).toBeNull();
  f.unmount();
  const fresh = vi.fn(async (_input: Input) => stopped);
  render(<ImportPanel selection={{ hostId: "host-a", generation: 1 }} call={fresh} />);
  await waitFor(() => expect(fresh).toHaveBeenCalledTimes(1));
  expect(fresh.mock.calls[0][0].command.action).toBe("status");
});
it(`saves bounded explicit configuration without starting import`, async () => {
  const call = vi.fn(async (input: Input) =>
    input.command.action === "status" ? importUnavailable("not-configured") : configured,
  );
  show(<ImportPanel selection={{ hostId: "host-a", generation: 1 }} call={call} />);
  await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByRole("textbox", { name: "BB Pi source root" }), {
    target: { value: "/custom" },
  });
  fireEvent.change(
    screen.getByRole("textbox", {
      name: "Known workspace paths, one per line",
    }),
    { target: { value: "/work" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Save import sources" }));
  await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
  expect(call.mock.calls[1][0].command).toEqual({
    action: "configure",
    configuration: {
      bbRoot: "/custom",
      ordinaryRoots: [],
      workspaces: ["/work"],
    },
  });
});
