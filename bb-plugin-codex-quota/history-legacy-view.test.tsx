// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HistoryReadinessPanel } from "./history-view.js";
import type { HistoryReadiness, CollectorRequest } from "./history-contract.js";
afterEach(cleanup);
const token = "00000000-0000-4000-8000-000000000001";
function view(
  enabled = false,
  phase: "required" | "awaiting-confirmation" | "ingesting" = "awaiting-confirmation",
  challenge = token,
): HistoryReadiness {
  return {
    state: "available",
    reason: "ok",
    storage: "compatible",
    collector: "compatible-v1",
    writer: "unconfirmed",
    collection: {
      enabled,
      firstObservedAt: "2026-10-01T00:00:00.000Z",
      pauseCount: 1,
      backlog: false,
      invalidRecords: 0,
      unconfirmedEvents: 0,
      conflictingEntries: 0,
      workspaces: [],
      truncated: false,
    },
    health: {
      state: "maintenance",
      detailFrom: "2026-08-17T12:00:00.000Z",
      compactFrom: "2026-06-22T00:00:00.000Z",
      pending: true,
      legacyLogsPending: true,
      recoveryGaps: [],
      legacyRetirement: {
        phase,
        ...(phase === "awaiting-confirmation"
          ? { token: challenge, expiresAt: "2026-10-01T12:15:00.000Z" }
          : {}),
      },
    },
  };
}
it("requires paused capture and an explicit unchecked stop acknowledgment", async () => {
  const control = vi.fn(async (_input: CollectorRequest) => view(false, "ingesting"));
  render(
    <HistoryReadinessPanel
      selection={{ hostId: "host_a", generation: 1 }}
      read={async () => view()}
      control={control}
    />,
  );
  const retire = await screen.findByRole("button", { name: "Retire stopped legacy logs" });
  expect((retire as HTMLButtonElement).disabled).toBe(true);
  const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  fireEvent.click(checkbox);
  fireEvent.click(retire);
  await waitFor(() => expect(control).toHaveBeenCalledOnce());
  expect(control.mock.calls[0][0]).toEqual({
    hostId: "host_a",
    generation: 1,
    action: "retire-legacy",
    confirmation: { token, legacyWritersStopped: true },
  });
});
it("disables preparation and acknowledgment while capture is enabled", async () => {
  render(
    <HistoryReadinessPanel
      selection={{ hostId: "host_a", generation: 1 }}
      read={async () => view(true)}
      control={async () => view()}
    />,
  );
  expect(
    (
      (await screen.findByRole("button", {
        name: "Prepare legacy stop proof",
      })) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
});
it("clears acknowledgment when a readiness check returns a different challenge", async () => {
  let challenge = token;
  render(
    <HistoryReadinessPanel
      selection={{ hostId: "host_a", generation: 1 }}
      read={async () => view(false, "awaiting-confirmation", challenge)}
      control={async () => view()}
    />,
  );
  fireEvent.click(await screen.findByRole("checkbox"));
  expect(
    (screen.getByRole("button", { name: "Retire stopped legacy logs" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  challenge = "00000000-0000-4000-8000-000000000002";
  fireEvent.click(screen.getByRole("button", { name: "Check readiness" }));
  await waitFor(() =>
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false),
  );
  expect(
    (screen.getByRole("button", { name: "Retire stopped legacy logs" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it("cancels queued retirement before dispatch when selection becomes pending", async () => {
  const control = vi.fn(async () => view());
  const page = render(
    <HistoryReadinessPanel
      selection={{ hostId: "host_a", generation: 1 }}
      read={async () => view()}
      control={control}
    />,
  );
  fireEvent.click(await screen.findByRole("checkbox"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Retire stopped legacy logs" }));
    page.rerender(
      <HistoryReadinessPanel
        selection={{ hostId: "host_a", generation: 1 }}
        selectionPending
        read={async () => view()}
        control={control}
      />,
    );
  });
  expect(control).not.toHaveBeenCalled();
});
