// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { rpcInput } from "../../test-fixtures.js";
import { app, PROJECT_ID, project } from "./manage.test-support.js";

afterEach(cleanup);

describe("Manage labels", () => {
  it.each(["button", "Enter"])(
    "keeps the name and color after a rejected create and resets them after retry via %s",
    async (submitWith) => {
      const createCalls: Array<Record<string, unknown>> = [];
      const slot = renderSlot(
        app.navPanels[0]!,
        { subPath: "manage" },
        {
          rpc: {
            listProjects: () => ({ projects: [project] }),
            listFolders: () => ({ folders: [] }),
            listPresets: () => ({ presets: [] }),
            sidebarSummary: () => ({ projects: [] }),
            listTasks: () => ({ tasks: [] }),
            listLabels: () => ({ labels: [] }),
            createLabel: async (raw: unknown) => {
              const input = rpcInput(raw);
              createCalls.push(input);
              if (createCalls.length === 1) throw new Error("Label creation unavailable");
              return { label: { id: "label-new", ...input } };
            },
          },
        },
      );
      const name = await slot.findByPlaceholderText("Label name");
      fireEvent.change(name, { target: { value: "  Release  " } });
      fireEvent.click(slot.getByRole("radio", { name: "Green" }));
      const submit = () => {
        if (submitWith === "Enter") fireEvent.keyDown(name, { key: "Enter" });
        else fireEvent.click(slot.getByRole("button", { name: "Add label" }));
      };

      submit();
      expect((await slot.findByRole("alert")).textContent).toBe("Label creation unavailable");
      expect(name).toHaveProperty("value", "  Release  ");
      expect(slot.getByRole("radio", { name: "Green" }).getAttribute("aria-checked")).toBe("true");
      expect(slot.getByRole("button", { name: "Add label" })).toHaveProperty("disabled", false);

      submit();
      await waitFor(() => expect(name).toHaveProperty("value", ""));
      expect(slot.queryByRole("alert")).toBeNull();
      expect(slot.getByRole("radio", { name: "Indigo" }).getAttribute("aria-checked")).toBe("true");
      expect(createCalls).toEqual([
        { projectId: PROJECT_ID, name: "Release", color: "mediumseagreen" },
        { projectId: PROJECT_ID, name: "Release", color: "mediumseagreen" },
      ]);
    },
  );
});
