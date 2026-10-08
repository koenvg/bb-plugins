import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Project } from "../../shared/contract.js";
import { ProjectsSection } from "../../views/manage/projects-section.js";
import { TasksRefreshProvider } from "../../shell/refresh.js";

function ProductionTablePreview() {
  return (
    <TasksRefreshProvider>
      <div className="fixture-table-frame">
        <ProjectsSection />
      </div>
    </TasksRefreshProvider>
  );
}

// Use the same app registration and slot harness as the rendered package tests.
// Every RPC below is local fixture data. No request reaches the BB server.
const app = await loadPluginApp(() => import("../../app.js"));
const isTablePreview = location.pathname.endsWith("/table.html");
const project: Project = {
  id: "01HZZZZZZZZZZZZZZZZZZZZZP1",
  name: "Home Lab",
  prefix: "HOME",
  nextTaskNumber: 7,
  color: "#ab62c0",
  folderId: null,
  linkedBbProjectId: "proj_fixture",
  createdAt: "2026-07-15T00:00:00.000Z",
};
let projects = [
  project,
  {
    ...project,
    id: "01HZZZZZZZZZZZZZZZZZZZZZP2",
    prefix: "WORK",
    color: "blue",
    linkedBbProjectId: null,
  },
];
let failSave = false;
let failInventory = false;
let saveCalls = 0;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const panel = document.getElementById("panel")!;
const evidence = document.getElementById("evidence")!;
if (isTablePreview) {
  document.querySelector(".preview-header h1")!.textContent =
    "Production project table. Fixture data only.";
  document.querySelector(".preview-header p")!.textContent =
    "Actual production name and colour editor and fixture RPCs. Nothing here changes live BB data or the installed plugin.";
  document.title = "Production project table";
}
function showEvidence() {
  evidence.textContent = JSON.stringify(
    {
      fixtureOnly: true,
      saveCalls,
      failNextSave: failSave,
      failNextInventory: failInventory,
      projects,
    },
    null,
    2,
  );
}
const slot = renderSlot(
  isTablePreview ? { component: ProductionTablePreview } : app.navPanels[0]!,
  { subPath: "manage" },
  {
    pluginId: "bbp97-isolated-preview",
    rpc: {
      listProjects: async () => {
        await delay(250);
        if (failInventory) {
          failInventory = false;
          showEvidence();
          throw new Error("Fixture inventory unavailable. Use Retry.");
        }
        return { projects };
      },
      listFolders: () => ({ folders: [] }),
      listPresets: () => ({ presets: [] }),
      listLabels: () => ({ labels: [] }),
      listTasks: () => ({ tasks: [] }),
      sidebarSummary: () => ({ projects: [] }),
      updateProject: async (raw: unknown) => {
        const input = raw as { projectId: string; name: string; color: string };
        saveCalls++;
        showEvidence();
        await delay(700);
        if (failSave) {
          failSave = false;
          showEvidence();
          throw new Error("Fixture save failed. Your draft is kept; try Save again.");
        }
        projects = projects.map((row) =>
          row.id === input.projectId ? { ...row, name: input.name, color: input.color } : row,
        );
        showEvidence();
        await slot.emitRealtime("projects:changed", { projectId: input.projectId });
        const returned = projects.find((row) => row.id === input.projectId);
        if (!returned) throw new Error("Fixture project was removed during Save.");
        return { project: returned };
      },
    },
  },
);
panel.replaceChildren(slot.container);
function control(id: string, action: () => void) {
  document.getElementById(id)!.addEventListener("click", action);
}
control("fail-save", () => {
  failSave = true;
  showEvidence();
});
control("fail-inventory", () => {
  failInventory = true;
  showEvidence();
  void slot.emitRealtime("projects:changed", {});
});
control("refresh", () => {
  void slot.emitRealtime("projects:changed", {});
});
control("remove", () => {
  projects = projects.filter((row) => row.id !== project.id);
  showEvidence();
  void slot.emitRealtime("projects:changed", {});
});
control("empty", () => {
  projects = [];
  showEvidence();
  void slot.emitRealtime("projects:changed", {});
});
control("reset", () => {
  localStorage.clear();
  location.reload();
});
showEvidence();
