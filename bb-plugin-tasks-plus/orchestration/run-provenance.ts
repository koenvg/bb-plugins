import { PluginCliError, type BbPluginApi } from "@get-bb/plugin-sdk";
import { invocationSchema, RUN_LIMITS, type Invocation } from "./run-contract";

export function refuse(code: string, message: string): never {
  throw new PluginCliError(message, { code });
}
export async function readInvocation(
  bb: BbPluginApi,
  coordinator: string,
  requestId: string,
  isReplay: (key: string) => boolean = () => false,
): Promise<{
  key: string;
  requestId: string;
  invocation: Invocation;
  bbProjectId: string;
}> {
  const thread = await bb.sdk.threads.get({ threadId: coordinator });
  const version = await bb.sdk.system.version();
  if (thread.providerId !== "pi" || version.currentVersion !== "0.44.0")
    refuse(
      "provider_unverified",
      "Run control is verified only for BB 0.44.0 Pi. Other paths refuse activation.",
    );
  if (thread.deletedAt !== null || thread.archivedAt !== null)
    refuse("coordinator_unavailable", "The coordinator is deleted or archived.");
  const rows = await bb.sdk.threads.events.list({
    threadId: coordinator,
    types: ["client/turn/requested"],
    order: "desc",
    limit: "100",
  });
  const latest =
    requestId === "latest"
      ? rows[0]
      : rows.find(
          (row) => row.type === "client/turn/requested" && row.data.requestId === requestId,
        );
  if (!latest || latest.type !== "client/turn/requested")
    refuse(
      "stale_invocation",
      "The persisted invocation was not found in the bounded request history.",
    );
  if (latest.threadId !== coordinator)
    refuse(
      "invocation_required",
      "The persisted invocation belongs to another coordinator thread.",
    );
  const key = `${coordinator}:${latest.data.requestId}:${latest.seq}`;
  const replay = isReplay(key);
  if (!replay && latest !== rows[0])
    refuse("stale_invocation", "Use the latest persisted invocation in this coordinator thread.");
  const data = latest.data;
  // BB-recorded user classification is the temporary boundary, not human identity.
  // BB 0.44.0 agent self-sends can pass this check. See BBP-51.
  if (
    data.initiator !== "user" ||
    data.senderThreadId !== null ||
    data.retryOfRequestId ||
    (data.inputGroups && data.inputGroups.length !== 1)
  )
    refuse(
      "invocation_required",
      "An identifiable unmixed BB-recorded user invocation is required.",
    );
  if (
    !replay &&
    (Date.now() - latest.createdAt > RUN_LIMITS.invocationAgeMs ||
      latest.createdAt > Date.now() + 1000)
  )
    refuse(
      "stale_invocation",
      "The invocation is older than 15 minutes or has an invalid timestamp.",
    );
  if (
    data.input.length !== 1 ||
    data.input[0]?.type !== "text" ||
    data.input[0].visibility === "agent-only"
  )
    refuse(
      "invocation_required",
      "Use one explicit skill command without hidden input or attachments.",
    );
  const input = data.input[0];
  let argumentsText: string | null = null;
  const native = /^\/skill:bb-orchestrator(?:\s+([\s\S]*))?$/.exec(input.text);
  if (native && input.mentions.length === 0) argumentsText = native[1] ?? "";
  if (input.mentions.length === 1) {
    const mention = input.mentions[0]!;
    const resource = mention.resource;
    if (
      resource.kind === "command" &&
      resource.source === "skill" &&
      resource.name === "bb-orchestrator" &&
      mention.start === 0 &&
      mention.end === resource.name.length + 1 &&
      input.text.slice(0, mention.end) === `${resource.trigger}bb-orchestrator` &&
      (input.text.length === mention.end || /^\s/.test(input.text.slice(mention.end)))
    )
      argumentsText = input.text.slice(mention.end).trim();
  }
  if (argumentsText === null)
    refuse(
      "invocation_required",
      "Use the exact leading selected skill or /skill:bb-orchestrator invocation, not a quote or discussion.",
    );
  let invocation: Invocation;
  try {
    invocation = invocationSchema.parse(
      argumentsText.trim() ? JSON.parse(argumentsText) : { action: "begin" },
    );
  } catch {
    return refuse(
      "invocation_ambiguous",
      "Skill arguments must be one strict JSON run-control object. See the run-control reference.",
    );
  }
  return {
    key: `${coordinator}:${latest.data.requestId}:${latest.seq}`,
    requestId: latest.data.requestId,
    invocation,
    bbProjectId: thread.projectId,
  };
}
