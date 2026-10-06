import { cliCommand } from "@get-bb/plugin-sdk";
import { tasksRpcContract } from "../shared/contract";
import {
  JSON_OPTION,
  REQUIRED_PROJECT_OPTION,
  guard,
  groupCommand,
  type TasksDomain,
} from "./common";
import { requiredProject, projectLabels, resolveLabel } from "./boundary";
import { table } from "./format";

const DEFAULT_LABEL_COLOR = "gray";

export function labelCommands(domain: TasksDomain) {
  return {
    label: groupCommand("label", "Create, list, or delete project labels", [
      ["create", "Create a label in a project"],
      ["list", "List a project's labels"],
      ["delete", "Delete a label"],
    ]),
    "label create": cliCommand({
      summary: "Create a project label",
      options: {
        project: REQUIRED_PROJECT_OPTION,
        name: { type: "string", required: true, description: "Label name" },
        color: {
          type: "string",
          default: DEFAULT_LABEL_COLOR,
          description: "Label color name",
        },
        json: JSON_OPTION,
      },
      unexpectedPositionalHint: "the label name belongs in --name <name>.",
      run(input, ctx) {
        return guard(async () => {
          const project = await requiredProject(domain, ctx, input.options.project);
          const result = tasksRpcContract.createLabel.output.parse(
            await domain.createLabel(
              tasksRpcContract.createLabel.input.parse({
                projectId: project.id,
                name: input.options.name,
                color: input.options.color,
              }),
            ),
          );
          return input.options.json
            ? JSON.stringify(result)
            : `Created label ${result.label.name}  ${result.label.id}`;
        });
      },
    }),
    "label list": cliCommand({
      summary: "List a project's labels",
      options: { project: REQUIRED_PROJECT_OPTION, json: JSON_OPTION },
      run(input, ctx) {
        return guard(async () => {
          const project = await requiredProject(domain, ctx, input.options.project);
          const labels = await projectLabels(domain, project.id);
          return input.options.json
            ? JSON.stringify({ labels })
            : table(
                ["NAME", "COLOR", "ID"],
                labels.map((label) => [label.name, label.color, label.id]),
                "No labels.",
              );
        });
      },
    }),
    "label delete": cliCommand({
      summary: "Delete a project label",
      positionals: [
        {
          name: "name-or-id",
          description: "Label name or its ULID",
          required: true,
        },
      ],
      options: { project: REQUIRED_PROJECT_OPTION, json: JSON_OPTION },
      run(input, ctx) {
        return guard(async () => {
          const project = await requiredProject(domain, ctx, input.options.project);
          const label = resolveLabel(
            await projectLabels(domain, project.id),
            input.positionals["name-or-id"],
          );
          const result = tasksRpcContract.deleteLabel.output.parse(
            await domain.deleteLabel(
              tasksRpcContract.deleteLabel.input.parse({
                labelId: label.id,
              }),
            ),
          );
          return input.options.json
            ? JSON.stringify({ ...result, label })
            : `Deleted label ${label.name}`;
        });
      },
    }),
  };
}
