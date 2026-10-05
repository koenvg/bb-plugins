import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const projectInput = z.strictObject({ projectId: z.string().min(1) });
const projectState = z.strictObject({
  projectId: z.string().min(1),
  enabled: z.boolean(),
  enabledOverride: z.boolean().nullable(),
  enableByDefault: z.boolean(),
  prompt: z.string().nullable(),
  effectivePrompt: z.string(),
});
export const settingsContract = defineRpcContract({
  listProjects: {
    input: z.strictObject({}),
    output: z.array(z.strictObject({ id: z.string().min(1), name: z.string() })),
  },
  getProject: { input: projectInput, output: projectState },
  setEnablement: {
    input: z.strictObject({ projectId: z.string().min(1), enabledOverride: z.boolean().nullable() }),
    output: projectState,
  },
  setPrompt: {
    input: z.strictObject({
      projectId: z.string().min(1),
      prompt: z.string().max(4096).refine(text => text.trim() !== "", "Prompt must be nonblank").nullable(),
    }),
    output: projectState,
  },
});
export type SettingsContract = typeof settingsContract;
export type ProjectState = z.infer<typeof projectState>;
export type ProjectChoice = { id: string; name: string };
