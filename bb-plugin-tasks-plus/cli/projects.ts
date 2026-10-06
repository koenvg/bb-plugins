import { cliCommand, type BbPluginApi } from "@get-bb/plugin-sdk";
import { publishProjectsChanged, type TasksApiStore } from "../api";
import { tasksRpcContract, type Project, type Folder } from "../shared/contract";
import { CliError, JSON_OPTION, guard, groupCommand, type TasksDomain } from "./common";
import { listProjects, normalizePrefix, resolveProject, resolveFolder } from "./boundary";
import { detail, table } from "./format";
import { allocatePrefix } from "./prefix";

const DEFAULT_PROJECT_COLOR = "blue";

function derivePrefix(name: string, projects: readonly Project[]): string {
  let base = name.toUpperCase().replace(/[^A-Z0-9]/gu, "");
  if (!base || !/^[A-Z]/u.test(base)) base = `P${base}`;
  base = base.slice(0, 10);
  const prefix = allocatePrefix(base, new Set(projects.map((project) => project.prefix)));
  if (prefix === null) {
    throw new CliError(`could not derive a unique prefix from ${name}`);
  }
  return prefix;
}

function projectTable(projects: readonly Project[], folders: readonly Folder[]) {
  const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]));
  return table(
    ["PREFIX", "NAME", "FOLDER", "BB PROJECT", "ID"],
    projects.map((project) => [
      project.prefix,
      project.name,
      project.folderId ? (folderNames.get(project.folderId) ?? project.folderId) : "-",
      project.linkedBbProjectId ?? "-",
      project.id,
    ]),
    "No projects.",
  );
}

export function projectCommands(bb: BbPluginApi, store: TasksApiStore, domain: TasksDomain) {
  return {
    project: groupCommand("project", "Create, list, show, or update tracker projects", [
      ["create", "Create a tracker project"],
      ["list", "List tracker projects"],
      ["show", "Show one tracker project"],
      ["update", "Rename, recolor, refile, or relink a project"],
    ]),
    "project create": cliCommand({
      summary: "Create a tracker project",
      options: {
        name: {
          type: "string",
          required: true,
          description: "Human-readable project name",
        },
        prefix: {
          type: "string",
          placeholder: "PREFIX",
          description:
            "Task key prefix: uppercase letters and digits, starts with a letter, at most 10 characters (derived from --name when omitted)",
        },
        folder: {
          type: "string",
          placeholder: "id-or-name",
          description: "Folder that holds the project",
        },
        "link-bb-project": {
          type: "string",
          placeholder: "proj_id",
          aliases: ["bb-project", "link-project"],
          description: "bb project id (proj_...) whose threads track this tracker project",
        },
        color: {
          type: "string",
          default: DEFAULT_PROJECT_COLOR,
          description: "Accent color name",
        },
        json: JSON_OPTION,
      },
      unexpectedPositionalHint: "the project name belongs in --name <name>.",
      run(input) {
        return guard(async () => {
          const name = input.options.name;
          const projects = await listProjects(domain);
          const folderAddress = input.options.folder;
          const folder = folderAddress ? await resolveFolder(domain, folderAddress) : undefined;
          const result = tasksRpcContract.createProject.output.parse(
            await domain.createProject(
              tasksRpcContract.createProject.input.parse({
                name,
                prefix: input.options.prefix
                  ? normalizePrefix(input.options.prefix)
                  : derivePrefix(name, projects),
                color: input.options.color,
                folderId: folder?.id ?? null,
                linkedBbProjectId: input.options["link-bb-project"] ?? null,
              }),
            ),
          );
          return input.options.json
            ? JSON.stringify(result)
            : `Created project ${result.project.prefix}  ${result.project.name}`;
        });
      },
    }),
    "project list": cliCommand({
      summary: "List tracker projects",
      options: { json: JSON_OPTION },
      run(input) {
        return guard(async () => {
          const projects = await listProjects(domain);
          const folders = tasksRpcContract.listFolders.output.parse(
            await domain.listFolders(tasksRpcContract.listFolders.input.parse(null)),
          ).folders;
          return input.options.json
            ? JSON.stringify({ projects })
            : projectTable(projects, folders);
        });
      },
    }),
    "project show": cliCommand({
      summary: "Show one tracker project",
      positionals: [
        {
          name: "prefix-or-id",
          description: "Tracker project prefix such as ABC, or its ULID",
          required: true,
        },
      ],
      options: { json: JSON_OPTION },
      run(input) {
        return guard(async () => {
          const project = await resolveProject(domain, input.positionals["prefix-or-id"]);
          const folder = project.folderId ? await resolveFolder(domain, project.folderId) : null;
          if (input.options.json) {
            return JSON.stringify({ project, folder });
          }
          return detail([
            ["Project", `${project.prefix} — ${project.name}`],
            ["ID", project.id],
            ["Color", project.color],
            ["Folder", folder?.name ?? "-"],
            ["BB project", project.linkedBbProjectId ?? "-"],
            ["Next task", `${project.prefix}-${project.nextTaskNumber}`],
            ["Created", project.createdAt],
          ]);
        });
      },
    }),
    "project update": cliCommand({
      summary: "Rename, recolor, refile, or relink a tracker project",
      positionals: [
        {
          name: "prefix-or-id",
          description: "Tracker project prefix such as ABC, or its ULID",
          required: true,
        },
      ],
      options: {
        name: { type: "string", description: "New project name" },
        color: { type: "string", description: "New accent color name" },
        folder: {
          type: "string",
          placeholder: "id-or-name",
          description: "Folder that holds the project",
        },
        "no-folder": {
          type: "boolean",
          description: "Move the project to the top level",
        },
        "link-bb-project": {
          type: "string",
          placeholder: "proj_id",
          aliases: ["bb-project", "link-project"],
          description: "bb project id (proj_...) to link",
        },
        "unlink-bb-project": {
          type: "boolean",
          description: "Remove the bb project link",
        },
        "rename-prefix": {
          type: "string",
          placeholder: "PREFIX",
          description: "New task key prefix; existing task keys are rewritten",
        },
        json: JSON_OPTION,
      },
      constraints: [
        { kind: "at-most-one", options: ["folder", "no-folder"] },
        {
          kind: "at-most-one",
          options: ["link-bb-project", "unlink-bb-project"],
        },
      ],
      run(input) {
        return guard(async () => {
          const project = await resolveProject(domain, input.positionals["prefix-or-id"]);
          const folderAddress = input.options.folder;
          const folder = folderAddress ? await resolveFolder(domain, folderAddress) : undefined;
          const changes = {
            name: input.options.name,
            color: input.options.color,
            folderId: input.options["no-folder"] ? null : folder?.id,
            linkedBbProjectId: input.options["unlink-bb-project"]
              ? null
              : input.options["link-bb-project"],
          };
          const renamePrefix = input.options["rename-prefix"];
          if (
            renamePrefix === undefined &&
            changes.name === undefined &&
            changes.color === undefined &&
            changes.folderId === undefined &&
            changes.linkedBbProjectId === undefined
          ) {
            throw new CliError("no project changes were provided", {
              code: "no_changes",
            });
          }
          const renameInput =
            renamePrefix === undefined
              ? undefined
              : tasksRpcContract.renameProjectPrefix.input.parse({
                  projectId: project.id,
                  prefix: normalizePrefix(renamePrefix),
                });
          const hasFieldChanges =
            changes.name !== undefined ||
            changes.color !== undefined ||
            changes.folderId !== undefined ||
            changes.linkedBbProjectId !== undefined;
          const updateInput = hasFieldChanges
            ? tasksRpcContract.updateProject.input.parse({
                projectId: project.id,
                ...changes,
              })
            : undefined;
          if (renameInput && store.projectPrefixExists(renameInput.prefix, project.id)) {
            throw new CliError(`Project prefix is already in use: ${renameInput.prefix}`);
          }
          const updated = store.transaction(() =>
            store.tasks.updateProject(project.id, {
              prefix: renameInput?.prefix,
              name: updateInput?.name,
              color: updateInput?.color,
              folderId: updateInput?.folderId,
              linkedBbProjectId: updateInput?.linkedBbProjectId,
            }),
          );
          publishProjectsChanged(bb, updated.id);
          return input.options.json
            ? JSON.stringify({ project: updated })
            : `Updated project ${updated.prefix}  ${updated.name}`;
        });
      },
    }),

    folder: groupCommand("folder", "Create, list, update, or delete project folders", [
      ["create", "Create a folder"],
      ["list", "List folders"],
      ["update", "Rename or move a folder"],
      ["delete", "Delete a folder, keeping its contents"],
    ]),
    "folder create": cliCommand({
      summary: "Create a project folder",
      options: {
        name: {
          type: "string",
          required: true,
          description: "Folder name",
        },
        parent: {
          type: "string",
          placeholder: "id-or-name",
          description: "Parent folder id or name",
        },
        json: JSON_OPTION,
      },
      unexpectedPositionalHint: "the folder name belongs in --name <name>.",
      run(input) {
        return guard(async () => {
          const parentAddress = input.options.parent;
          const parent = parentAddress ? await resolveFolder(domain, parentAddress) : undefined;
          const result = tasksRpcContract.createFolder.output.parse(
            await domain.createFolder(
              tasksRpcContract.createFolder.input.parse({
                name: input.options.name,
                parentFolderId: parent?.id ?? null,
              }),
            ),
          );
          return input.options.json
            ? JSON.stringify(result)
            : `Created folder ${result.folder.name}  ${result.folder.id}`;
        });
      },
    }),
    "folder list": cliCommand({
      summary: "List project folders",
      options: { json: JSON_OPTION },
      run(input) {
        return guard(async () => {
          const result = tasksRpcContract.listFolders.output.parse(
            await domain.listFolders(tasksRpcContract.listFolders.input.parse(null)),
          );
          const names = new Map(result.folders.map((folder) => [folder.id, folder.name]));
          return input.options.json
            ? JSON.stringify(result)
            : table(
                ["NAME", "PARENT", "ID"],
                result.folders.map((folder) => [
                  folder.name,
                  folder.parentFolderId
                    ? (names.get(folder.parentFolderId) ?? folder.parentFolderId)
                    : "-",
                  folder.id,
                ]),
                "No folders.",
              );
        });
      },
    }),
    "folder update": cliCommand({
      summary: "Rename or move a project folder",
      positionals: [
        {
          name: "id-or-name",
          description: "Folder id or its unique name",
          required: true,
        },
      ],
      options: {
        name: { type: "string", description: "New folder name" },
        parent: {
          type: "string",
          placeholder: "id-or-name",
          description: "New parent folder id or name",
        },
        "no-parent": {
          type: "boolean",
          description: "Move the folder to the top level",
        },
        json: JSON_OPTION,
      },
      constraints: [{ kind: "at-most-one", options: ["parent", "no-parent"] }],
      run(input) {
        return guard(async () => {
          const folder = await resolveFolder(domain, input.positionals["id-or-name"]);
          const parentAddress = input.options.parent;
          const noParent = input.options["no-parent"];
          const name = input.options.name;
          if (name === undefined && parentAddress === undefined && !noParent) {
            throw new CliError("no folder changes were provided", {
              code: "no_changes",
            });
          }
          const parent = parentAddress ? await resolveFolder(domain, parentAddress) : null;
          const renameInput =
            name === undefined
              ? undefined
              : tasksRpcContract.renameFolder.input.parse({
                  folderId: folder.id,
                  name,
                });
          const moveInput =
            parentAddress === undefined && !noParent
              ? undefined
              : tasksRpcContract.moveFolder.input.parse({
                  folderId: folder.id,
                  parentFolderId: parent?.id ?? null,
                });
          const updated = store.transaction(() =>
            store.tasks.updateFolder(folder.id, {
              name: renameInput?.name,
              parentFolderId: moveInput?.parentFolderId,
            }),
          );
          publishProjectsChanged(bb, null);
          return input.options.json
            ? JSON.stringify({ folder: updated })
            : `Updated folder ${updated.name}  ${updated.id}`;
        });
      },
    }),
    "folder delete": cliCommand({
      summary: "Delete a folder and unfile its contents",
      description:
        "Deleting a folder moves its projects and subfolders to the top level. No tasks are deleted.",
      positionals: [
        {
          name: "id-or-name",
          description: "Folder id or its unique name",
          required: true,
        },
      ],
      options: { json: JSON_OPTION },
      run(input) {
        return guard(async () => {
          const address = input.positionals["id-or-name"];
          const folder = await resolveFolder(domain, address);
          const result = tasksRpcContract.deleteFolder.output.parse(
            await domain.deleteFolder(
              tasksRpcContract.deleteFolder.input.parse({
                folderId: folder.id,
              }),
            ),
          );
          if (!result.deleted) {
            throw new CliError(`folder not found: ${address} (it was deleted by another client)`, {
              code: "folder_not_found",
            });
          }
          if (input.options.json) {
            return JSON.stringify({ ...result, folder });
          }
          const projectCount = result.movedProjectIds.length;
          const folderCount = result.movedFolderIds.length;
          const moved = [
            projectCount > 0 ? `${projectCount} project${projectCount > 1 ? "s" : ""}` : null,
            folderCount > 0 ? `${folderCount} subfolder${folderCount > 1 ? "s" : ""}` : null,
          ].filter((part) => part !== null);
          return moved.length === 0
            ? `Deleted folder ${folder.name}`
            : `Deleted folder ${folder.name}; ${moved.join(" and ")} moved to the top level. No tasks were deleted.`;
        });
      },
    }),
  };
}
