import { fireEvent, waitFor, within } from "@testing-library/react";

export async function setHistoryManagementOpen(container: HTMLElement, open = true) {
  const summary = within(container).getByText("Collection and history management");
  const details = summary.closest("details")!;
  if (details.open !== open) fireEvent.click(summary);
  await waitFor(() => {
    const mounted = !!within(container).queryByRole("region", { name: "History readiness" });
    if (mounted !== open) throw new Error("Waiting for native management disclosure toggle");
  });
}
