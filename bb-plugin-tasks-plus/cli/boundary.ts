import type { PluginCliContext } from "@get-bb/plugin-sdk";
import {
  tasksRpcContract,
  ULID_PATTERN,
  type Project,
  type Folder,
  type Task,
  type Preset,
  type Label,
} from "../shared/contract";
import { CliError, type TasksDomain } from "./common";

const TASK_KEY_PATTERN = /^([A-Z][A-Z0-9]{0,9})-(\d+)$/;
const BB_PROJECT_ID_PATTERN = /^proj_[A-Za-z0-9_-]+$/;

function normalizePrefix(value: string): string {
  return value.trim().toUpperCase();
}

async function listProjects(domain: TasksDomain): Promise<Project[]> {
  return tasksRpcContract.listProjects.output.parse(
    await domain.listProjects(tasksRpcContract.listProjects.input.parse({})),
  ).projects;
}

function bbProjectIdHint(address: string, projects: readonly Project[]): string {
  const linked = projects.filter((project) => project.linkedBbProjectId === address);
  const first = linked[0];
  if (linked.length === 1 && first) {
    return `${address} is a bb project id; its tracker project is ${first.prefix} — re-run with --project ${first.prefix}`;
  }
  return `${address} is a bb project id, but --project takes a tracker project prefix or id; run bb tasks project list`;
}

async function resolveProject(domain: TasksDomain, address: string): Promise<Project> {
  const normalized = address.trim().toUpperCase();
  const projects = await listProjects(domain);
  const project = projects.find(
    (candidate) => candidate.id === normalized || candidate.prefix === normalized,
  );
  if (!project) {
    const trimmed = address.trim();
    throw new CliError(`project not found: ${address}`, {
      code: "project_not_found",
      ...(BB_PROJECT_ID_PATTERN.test(trimmed) ? { hint: bbProjectIdHint(trimmed, projects) } : {}),
    });
  }
  return project;
}

async function defaultProject(
  domain: TasksDomain,
  ctx: PluginCliContext,
  required: boolean,
): Promise<Project | undefined> {
  if (!ctx.projectId) {
    if (required) {
      throw new CliError("missing --project and no BB project context is available", {
        code: "missing_required",
      });
    }
    return undefined;
  }
  const matches = (await listProjects(domain)).filter(
    (project) => project.linkedBbProjectId === ctx.projectId,
  );
  if (matches.length === 0) {
    throw new CliError(
      `no tracker project is linked to BB project ${ctx.projectId}; pass --project or link one with bb tasks project update`,
      { code: "project_not_linked" },
    );
  }
  if (matches.length > 1) {
    throw new CliError(
      `multiple tracker projects are linked to BB project ${ctx.projectId}; pass --project explicitly`,
      { code: "project_ambiguous" },
    );
  }
  return matches[0];
}

async function selectedProject(
  domain: TasksDomain,
  ctx: PluginCliContext,
  address: string | undefined,
  required: boolean,
): Promise<Project | undefined> {
  return address ? resolveProject(domain, address) : defaultProject(domain, ctx, required);
}

async function requiredProject(
  domain: TasksDomain,
  ctx: PluginCliContext,
  address: string | undefined,
): Promise<Project> {
  if (address) return resolveProject(domain, address);
  const linked = ctx.projectId
    ? (await listProjects(domain)).filter((project) => project.linkedBbProjectId === ctx.projectId)
    : [];
  const suggestion = linked.length === 1 ? linked[0] : undefined;
  throw new CliError("missing required option --project", {
    code: "missing_required",
    hint: suggestion
      ? `this thread's bb project ${ctx.projectId} is linked to tracker project ${suggestion.prefix}; re-run with --project ${suggestion.prefix}`
      : "pass a tracker project prefix or id; run bb tasks project list to see them",
  });
}

async function resolveFolder(domain: TasksDomain, address: string): Promise<Folder> {
  const folders = tasksRpcContract.listFolders.output.parse(
    await domain.listFolders(tasksRpcContract.listFolders.input.parse(null)),
  ).folders;
  const normalizedId = address.trim().toUpperCase();
  const byId = folders.find((folder) => folder.id === normalizedId);
  if (byId) return byId;
  const byName = folders.filter(
    (folder) => folder.name.toLowerCase() === address.trim().toLowerCase(),
  );
  if (byName.length === 0) {
    throw new CliError(`folder not found: ${address}`, {
      code: "folder_not_found",
    });
  }
  if (byName.length > 1) {
    throw new CliError(`folder name is ambiguous; use its id: ${address}`, {
      code: "folder_ambiguous",
    });
  }
  return byName[0]!;
}

async function resolveTask(domain: TasksDomain, address: string): Promise<Task> {
  const normalized = address.trim().toUpperCase();
  if (ULID_PATTERN.test(normalized)) {
    const result = tasksRpcContract.getTask.output.parse(
      await domain.getTask(tasksRpcContract.getTask.input.parse({ taskId: normalized })),
    );
    if (!result.task) throw taskNotFound(address);
    return result.task;
  }
  if (!TASK_KEY_PATTERN.test(normalized)) throw taskNotFound(address);
  const result = tasksRpcContract.getTaskByKey.output.parse(
    await domain.getTaskByKey(tasksRpcContract.getTaskByKey.input.parse({ taskKey: normalized })),
  );
  if (!result.task) throw taskNotFound(address);
  return result.task;
}

async function resolveTaskIds(
  domain: TasksDomain,
  addresses: readonly string[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const address of addresses) {
    ids.push((await resolveTask(domain, address)).id);
  }
  return ids;
}

function taskNotFound(address: string): CliError {
  return new CliError(`task not found: ${address}`, { code: "task_not_found" });
}

function resolvePreset(presets: readonly Preset[], address: string): Preset {
  const normalized = address.trim().toLowerCase();
  const matches = presets.filter(
    (preset) => preset.id.toLowerCase() === normalized || preset.name.toLowerCase() === normalized,
  );
  if (matches.length === 0) {
    throw new CliError(`preset not found: ${address}`, {
      code: "preset_not_found",
    });
  }
  if (matches.length > 1) {
    throw new CliError(`preset name is ambiguous; use its id: ${address}`, {
      code: "preset_ambiguous",
    });
  }
  return matches[0]!;
}

async function listPresets(domain: TasksDomain): Promise<Preset[]> {
  return tasksRpcContract.listPresets.output.parse(
    await domain.listPresets(tasksRpcContract.listPresets.input.parse(null)),
  ).presets;
}

async function resolveMachineId(domain: TasksDomain, address: string): Promise<string> {
  const machines = tasksRpcContract.listMachines.output.parse(
    await domain.listMachines(tasksRpcContract.listMachines.input.parse({})),
  ).machines;
  const normalized = address.trim().toLocaleLowerCase();
  const matches = machines.filter(
    (machine) => machine.id === address.trim() || machine.name.toLocaleLowerCase() === normalized,
  );
  if (matches.length === 0) {
    throw new CliError(`machine not found: ${address}`, {
      code: "machine_not_found",
    });
  }
  if (matches.length > 1) {
    throw new CliError(`machine name is ambiguous; use its id: ${address}`, {
      code: "machine_ambiguous",
    });
  }
  return matches[0]!.id;
}

async function projectLabels(domain: TasksDomain, projectId: string): Promise<Label[]> {
  return tasksRpcContract.listLabels.output.parse(
    await domain.listLabels(tasksRpcContract.listLabels.input.parse({ projectId })),
  ).labels;
}

function resolveLabel(labels: readonly Label[], address: string): Label {
  const normalizedId = address.trim().toUpperCase();
  const label = labels.find(
    (candidate) =>
      candidate.id === normalizedId ||
      candidate.name.toLowerCase() === address.trim().toLowerCase(),
  );
  if (!label) {
    throw new CliError(`label not found: ${address}`, {
      code: "label_not_found",
    });
  }
  return label;
}

export {
  normalizePrefix,
  listProjects,
  resolveProject,
  selectedProject,
  requiredProject,
  resolveFolder,
  resolveTask,
  resolveTaskIds,
  listPresets,
  resolvePreset,
  resolveMachineId,
  projectLabels,
  resolveLabel,
};
