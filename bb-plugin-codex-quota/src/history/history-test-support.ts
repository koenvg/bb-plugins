import { fireEvent, waitFor, within } from "@testing-library/react";

export async function setHistoryManagementOpen(container: HTMLElement, open = true) {
  const summary = within(container).getByText("Machine status and collection settings");
  const details = summary.closest("details")!;
  if (details.open !== open) fireEvent.click(summary);
  if (open) {
    const buttons = await waitFor(() =>
      within(details).getAllByRole("button", { name: "Manage history" }),
    );
    if (!buttons.some((button) => button.getAttribute("aria-expanded") === "true"))
      fireEvent.click(buttons[0]!);
  }
  await waitFor(() => {
    const mounted = !!within(container).queryByRole("region", { name: "History readiness" });
    if (mounted !== open) throw new Error("Waiting for native management disclosure toggle");
  });
}
