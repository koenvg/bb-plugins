import { cliCommand } from "@get-bb/plugin-sdk";
import {
  tasksRpcContract,
  presetReasoningLevelSchema,
  PRESET_PERMISSION_MODES,
  type Preset,
} from "../shared/contract";
import { JSON_OPTION, CliError, guard, groupCommand, type TasksDomain } from "./common";
import { listPresets, resolvePreset, resolveMachineId } from "./boundary";
import { detail, table } from "./format";

const PRESET_ENVIRONMENTS = ["project-default", "worktree"] as const;

function presetEnvironmentLabel(preset: Preset): string {
  return preset.environmentKind === "new-worktree" ? "worktree" : "project-default";
}

function presetEnvironmentKind(
  value: (typeof PRESET_ENVIRONMENTS)[number] | undefined,
  fallback: Preset["environmentKind"],
): Preset["environmentKind"] {
  if (value === undefined) return fallback;
  return value === "worktree" ? "new-worktree" : "project-default";
}

function presetServiceTier(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === "none" ? null : value;
}

function validatePresetTargetOptions(input: {
  environmentKind: Preset["environmentKind"];
  baseBranch: string | undefined;
  machine: string | undefined;
}): void {
  if (input.environmentKind === "new-worktree") return;
  if (input.baseBranch !== undefined) {
    throw new CliError("--base-branch requires --environment worktree");
  }
  if (input.machine !== undefined) {
    throw new CliError("--machine requires --environment worktree");
  }
}

export function presetCommands(domain: TasksDomain) {
  return {
    preset: groupCommand("preset", "List, show, create, update, or delete dispatch presets", [
      ["list", "List dispatch presets"],
      ["show", "Show one preset"],
      ["create", "Create a preset"],
      ["update", "Update a preset"],
      ["delete", "Delete a preset"],
    ]),
    "preset list": cliCommand({
      summary: "List dispatch presets",
      options: { json: JSON_OPTION },
      run(input) {
        return guard(async () => {
          const presets = await listPresets(domain);
          return input.options.json
            ? JSON.stringify({ presets })
            : table(
                [
                  "NAME",
                  "PROVIDER",
                  "MODEL",
                  "REASONING",
                  "SERVICE TIER",
                  "PERMISSION",
                  "ENVIRONMENT",
                  "BASE BRANCH",
                  "MACHINE",
                  "BUILTIN",
                  "ID",
                ],
                presets.map((preset) => [
                  preset.name,
                  preset.providerId,
                  preset.modelId,
                  preset.reasoningLevel,
                  preset.serviceTier ?? "-",
                  preset.permissionMode,
                  presetEnvironmentLabel(preset),
                  preset.baseBranch ?? "-",
                  preset.machineId ?? "-",
                  preset.builtin ? "yes" : "no",
                  preset.id,
                ]),
                "No presets.",
              );
        });
      },
    }),
    "preset show": cliCommand({
      summary: "Show one dispatch preset",
      positionals: [
        {
          name: "name-or-id",
          description: "Preset name (case-insensitive) or its ULID",
          required: true,
        },
      ],
      options: { json: JSON_OPTION },
      run(input) {
        return guard(async () => {
          const preset = resolvePreset(await listPresets(domain), input.positionals["name-or-id"]);
          return input.options.json
            ? JSON.stringify({ preset })
            : detail([
                ["Name", preset.name],
                ["Provider", preset.providerId],
                ["Model", preset.modelId],
                ["Reasoning", preset.reasoningLevel],
                ["Service tier", preset.serviceTier ?? "-"],
                ["Permission", preset.permissionMode],
                ["Environment", presetEnvironmentLabel(preset)],
                ["Base branch", preset.baseBranch ?? "-"],
                ["Machine", preset.machineId ?? "-"],
                ["Instructions", preset.instructions || "-"],
                ["Built in", preset.builtin ? "yes" : "no"],
                ["ID", preset.id],
              ]);
        });
      },
    }),
    "preset create": cliCommand({
      summary: "Create a dispatch preset",
      options: {
        name: {
          type: "string",
          required: true,
          description: "Preset name shown in dispatch menus",
        },
        provider: {
          type: "string",
          required: true,
          placeholder: "id",
          description: "Provider id such as codex or claude-code",
        },
        model: {
          type: "string",
          required: true,
          placeholder: "id",
          description: "Model id as the provider spells it",
        },
        reasoning: {
          type: "enum",
          values: presetReasoningLevelSchema.options,
          required: true,
          description: "Reasoning level the provider supports",
        },
        permission: {
          type: "enum",
          values: PRESET_PERMISSION_MODES,
          required: true,
          description: "Permission mode for the dispatched thread",
        },
        "service-tier": {
          type: "string",
          placeholder: "id",
          description: "Provider service tier id; none clears it",
        },
        environment: {
          type: "enum",
          values: PRESET_ENVIRONMENTS,
          default: "project-default",
          description: "Where the thread runs; --base-branch and --machine require worktree",
        },
        "base-branch": {
          type: "string",
          placeholder: "branch",
          description: "Branch new worktrees start from",
        },
        machine: {
          type: "string",
          placeholder: "id-or-name",
          description: "Enrolled machine that hosts the worktree",
        },
        instructions: {
          type: "string",
          placeholder: "text",
          description: "Extra instructions prepended to every dispatch",
        },
        json: JSON_OPTION,
      },
      run(input) {
        return guard(async () => {
          const environmentKind = presetEnvironmentKind(
            input.options.environment,
            "project-default",
          );
          const baseBranch = input.options["base-branch"];
          const machine = input.options.machine;
          validatePresetTargetOptions({
            environmentKind,
            baseBranch,
            machine,
          });
          const result = tasksRpcContract.createPreset.output.parse(
            await domain.createPreset(
              tasksRpcContract.createPreset.input.parse({
                name: input.options.name,
                providerId: input.options.provider,
                modelId: input.options.model,
                reasoningLevel: input.options.reasoning,
                serviceTier: presetServiceTier(input.options["service-tier"]) ?? null,
                permissionMode: input.options.permission,
                environmentKind,
                baseBranch: baseBranch ?? null,
                machineId: machine === undefined ? null : await resolveMachineId(domain, machine),
                instructions: input.options.instructions ?? "",
              }),
            ),
          );
          return input.options.json
            ? JSON.stringify(result)
            : `Created preset ${result.preset.name}  ${result.preset.id}`;
        });
      },
    }),
    "preset update": cliCommand({
      summary: "Update a dispatch preset",
      positionals: [
        {
          name: "name-or-id",
          description: "Preset name (case-insensitive) or its ULID",
          required: true,
        },
      ],
      options: {
        name: { type: "string", description: "New preset name" },
        provider: {
          type: "string",
          placeholder: "id",
          description: "Provider id such as codex or claude-code",
        },
        model: {
          type: "string",
          placeholder: "id",
          description: "Model id as the provider spells it",
        },
        reasoning: {
          type: "enum",
          values: presetReasoningLevelSchema.options,
          description: "Reasoning level the provider supports",
        },
        permission: {
          type: "enum",
          values: PRESET_PERMISSION_MODES,
          description: "Permission mode for the dispatched thread",
        },
        "service-tier": {
          type: "string",
          placeholder: "id",
          description: "Provider service tier id; none clears it",
        },
        environment: {
          type: "enum",
          values: PRESET_ENVIRONMENTS,
          description:
            "Where the thread runs; switching to project-default clears --base-branch and --machine",
        },
        "base-branch": {
          type: "string",
          placeholder: "branch",
          description: "Branch new worktrees start from",
        },
        machine: {
          type: "string",
          placeholder: "id-or-name",
          description: "Enrolled machine that hosts the worktree",
        },
        instructions: {
          type: "string",
          placeholder: "text",
          description: "Extra instructions prepended to every dispatch",
        },
        json: JSON_OPTION,
      },
      run(input) {
        return guard(async () => {
          const preset = resolvePreset(await listPresets(domain), input.positionals["name-or-id"]);
          const environmentOption = input.options.environment;
          const environmentKind = presetEnvironmentKind(environmentOption, preset.environmentKind);
          const baseBranch = input.options["base-branch"];
          const machine = input.options.machine;
          validatePresetTargetOptions({
            environmentKind,
            baseBranch,
            machine,
          });
          const result = tasksRpcContract.updatePreset.output.parse(
            await domain.updatePreset(
              tasksRpcContract.updatePreset.input.parse({
                presetId: preset.id,
                name: input.options.name,
                providerId: input.options.provider,
                modelId: input.options.model,
                reasoningLevel: input.options.reasoning,
                serviceTier: presetServiceTier(input.options["service-tier"]),
                permissionMode: input.options.permission,
                environmentKind: environmentOption === undefined ? undefined : environmentKind,
                baseBranch:
                  environmentOption !== undefined && environmentKind === "project-default"
                    ? null
                    : baseBranch,
                machineId:
                  environmentOption !== undefined && environmentKind === "project-default"
                    ? null
                    : machine === undefined
                      ? undefined
                      : await resolveMachineId(domain, machine),
                instructions: input.options.instructions,
              }),
            ),
          );
          return input.options.json
            ? JSON.stringify(result)
            : `Updated preset ${result.preset.name}  ${result.preset.id}`;
        });
      },
    }),
    "preset delete": cliCommand({
      summary: "Delete a dispatch preset",
      positionals: [
        {
          name: "name-or-id",
          description: "Preset name (case-insensitive) or its ULID",
          required: true,
        },
      ],
      options: { json: JSON_OPTION },
      run(input) {
        return guard(async () => {
          const preset = resolvePreset(await listPresets(domain), input.positionals["name-or-id"]);
          const result = tasksRpcContract.deletePreset.output.parse(
            await domain.deletePreset(
              tasksRpcContract.deletePreset.input.parse({
                presetId: preset.id,
              }),
            ),
          );
          return input.options.json
            ? JSON.stringify({ ...result, preset })
            : `Deleted preset ${preset.name}`;
        });
      },
    }),
  };
}
