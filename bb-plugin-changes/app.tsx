import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ChangesTab } from "./ui/changes-tab";

export default definePluginApp((app) => {
  app.slots.experimental_tab({
    context: { kind: "thread" },
    availability: "action",
    icon: "GitCompare",
    id: "changes",
    title: "Changes",
    layout: "flush",
    component: ChangesTab,
  });
});
