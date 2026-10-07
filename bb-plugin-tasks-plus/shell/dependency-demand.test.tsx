// @vitest-environment jsdom
import { fireEvent, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { rpcInput } from "../test-fixtures.js";
import {
  acceptNavigation,
  row,
  setup,
  tasks,
  useWorkspaceTestLifecycle,
} from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();

it("keeps catalog reads out of native Ticket navigation and shares picker demand", async () => {
  let catalogReads = 0;
  const slot = setup("all?task=TSK-1", {
    listTasks: (raw) => {
      const input = rpcInput(raw);
      if (input.parentTaskId) return { tasks: [], nextCursor: null };
      if (Object.keys(input).every((key) => key === "limit" || key === "cursor")) catalogReads += 1;
      return { tasks, nextCursor: null };
    },
  });
  await slot.findByRole("textbox", { name: "Task title" });
  for (const number of [2, 3, 1]) {
    fireEvent.click(row(slot, number));
    await acceptNavigation(slot);
    await waitFor(() =>
      expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe(`Title ${number}`),
    );
  }
  expect(catalogReads).toBe(0);
  fireEvent.click(slot.getByRole("button", { name: "Add blocker" }));
  await slot.findByRole("option", { name: /TSK-2/ });
  expect(catalogReads).toBe(1);
  fireEvent.keyDown(slot.getByRole("combobox"), { key: "Escape" });
  await waitFor(() => expect(slot.queryByRole("combobox")).toBeNull());
  fireEvent.click(slot.getByRole("button", { name: "Add blocked task" }));
  await slot.findByRole("option", { name: /TSK-3/ });
  expect(catalogReads).toBe(1);
});
