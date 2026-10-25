import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const pullRequestResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("available"),
    pullRequest: z
      .object({
        url: z.string(),
        number: z.number().int().positive(),
        title: z.string(),
        state: z.enum(["open", "draft", "closed", "merged"]),
        updatedAt: z.string(),
      })
      .passthrough(),
  }),
  z.object({ outcome: z.literal("absent") }),
  z.object({ outcome: z.literal("unavailable"), message: z.string() }),
]);

export type PullRequestResult = z.infer<typeof pullRequestResultSchema>;

export async function lookupPullRequest(
  plugins: Pick<BbPluginApi["sdk"]["plugins"], "callRpc">,
  environmentId: string,
): Promise<PullRequestResult> {
  const results = await plugins.callRpc({
    pluginId: "bb--github-pr-status",
    method: "pullRequests",
    input: { keys: [environmentId] },
    outputSchema: z.record(z.string(), pullRequestResultSchema),
  });
  return (
    results[environmentId] ?? {
      outcome: "unavailable",
      message: `No pull request status returned for environment ${environmentId}`,
    }
  );
}
