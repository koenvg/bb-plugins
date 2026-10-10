import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Project } from "../../shared/contract.js";
import { makeTask } from "../../test-fixtures.js";
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
let deleteCalls = 0;
let failCount = false;
let failDelete = false;
let zeroTasks = false;
let failAfterDelete = false;
let postDeleteFailure = false;
let overlapNextDelete = false;
let overlapSnapshot: Project[] | null = null;
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
      deleteCalls,
      failNextCount: failCount,
      failNextDelete: failDelete,
      failAfterDelete,
      postDeleteFailure,
      overlapNextDelete,
      zeroTasks,
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
        const stale = overlapSnapshot;
        overlapSnapshot = null;
        await delay(stale ? 1400 : 250);
        if (postDeleteFailure)
          throw new Error(
            "Fixture post-delete inventory unavailable. Allow inventory reads, then use Retry.",
          );
        if (failInventory) {
          failInventory = false;
          showEvidence();
          throw new Error("Fixture inventory unavailable. Use Retry.");
        }
        return { projects: stale ?? projects };
      },
      listFolders: () => ({ folders: [] }),
      listPresets: () => ({ presets: [] }),
      listLabels: () => ({ labels: [] }),
      listTasks: async (raw: unknown) => {
        const input = raw as { projectId?: string; cursor?: string };
        if (!input.projectId) return { tasks: [] };
        await delay(350);
        if (failCount) {
          failCount = false;
          showEvidence();
          throw new Error("Fixture task count unavailable. Use Retry task count.");
        }
        if (zeroTasks) return { tasks: [] };
        const tasks = Array.from({ length: 42 }, (_, index) =>
          makeTask({
            id: `fixture-task-${index}`,
            projectId: input.projectId,
            number: index + 1,
            key: `HOME-${index + 1}`,
            status: index % 2 === 0 ? "done" : "todo",
            parentTaskId: index > 0 ? "fixture-task-0" : null,
          }),
        );
        const start = input.cursor ? Number(input.cursor) : 0;
        return { tasks: tasks.slice(start, start + 21), nextCursor: start === 0 ? "21" : null };
      },
      deleteProject: async (raw: unknown) => {
        const input = raw as { projectId: string; force: boolean };
        deleteCalls++;
        showEvidence();
        if (overlapNextDelete) {
          overlapNextDelete = false;
          overlapSnapshot = projects.map((row) => ({ ...row }));
          void slot.emitRealtime("projects:changed", {});
        }
        await delay(900);
        if (failDelete) {
          failDelete = false;
          showEvidence();
          throw new Error("Fixture deletion failed. Your confirmation is kept; try again.");
        }
        if (!input.force) throw new Error("Fixture requires forced deletion.");
        const deleted = projects.some((row) => row.id === input.projectId);
        projects = projects.filter((row) => row.id !== input.projectId);
        if (failAfterDelete) {
          failAfterDelete = false;
          postDeleteFailure = true;
        }
        showEvidence();
        await slot.emitRealtime("projects:changed", { projectId: input.projectId });
        return { ok: true, deleted };
      },
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
control("fail-post-delete", () => {
  failAfterDelete = true;
  showEvidence();
});
control("allow-inventory", () => {
  postDeleteFailure = false;
  showEvidence();
});
control("overlap-delete", () => {
  overlapNextDelete = true;
  showEvidence();
});
control("fail-count", () => {
  failCount = true;
  showEvidence();
});
control("fail-delete", () => {
  failDelete = true;
  showEvidence();
});
control("zero-tasks", () => {
  zeroTasks = !zeroTasks;
  showEvidence();
});
control("theme", () => {
  document.documentElement.classList.toggle("light");
});
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
