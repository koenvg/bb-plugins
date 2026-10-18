import { resolve } from "node:path";
import { PluginCliError, type BbPluginApi, type PluginCliContext } from "@get-bb/plugin-sdk";
import { errorMessage } from "../shared/errors";
import { CliError, type TasksDomain } from "./common";
import { resolveMachineId } from "./boundary";

async function resolveClientHostId(
  bb: BbPluginApi,
  domain: TasksDomain,
  machine: string | undefined,
  ctx: PluginCliContext,
): Promise<string | undefined> {
  if (machine !== undefined) return resolveMachineId(domain, machine);
  if (!ctx.threadId) return undefined;
  const thread = await bb.sdk.threads.get({ threadId: ctx.threadId });
  if (!thread.environmentId) return undefined;
  const environment = await bb.sdk.environments.get({
    environmentId: thread.environmentId,
  });
  return environment.hostId;
}

function isMissingClientFileError(error: unknown): boolean {
  const message = errorMessage(error);
  return /\bENOENT\b|does not exist|not found|is a directory/i.test(message);
}

async function readClientFile(
  bb: BbPluginApi,
  hostId: string | undefined,
  path: string,
): Promise<{ bytes: Buffer; text: string | null }> {
  const file = await bb.sdk.files.read({
    ...(hostId ? { hostId } : {}),
    path,
  });
  return {
    bytes: Buffer.from(file.content, file.contentEncoding === "base64" ? "base64" : "utf8"),
    text: file.contentEncoding === "utf8" ? file.content : null,
  };
}

async function readAttachmentSource(
  bb: BbPluginApi,
  hostId: string | undefined,
  path: string,
): Promise<Buffer> {
  try {
    return (await readClientFile(bb, hostId, path)).bytes;
  } catch (error) {
    if (isMissingClientFileError(error)) {
      throw new CliError(`attachment source is not a file: ${path}`, {
        code: "attachment_source_missing",
      });
    }
    throw error;
  }
}

async function writeClientFile(
  bb: BbPluginApi,
  hostId: string | undefined,
  path: string,
  content: Buffer,
): Promise<void> {
  await bb.sdk.files.write({
    ...(hostId ? { hostId } : {}),
    path,
    content: content.toString("base64"),
    contentEncoding: "base64",
    createParents: true,
  });
}

function attachmentFileName(path: string): string {
  return path.split(/[\\/]/).at(-1) || "attachment";
}

async function readTextOption(
  bb: BbPluginApi,
  ctx: PluginCliContext,
  hostId: string | undefined,
  inline: string | undefined,
  file: string | undefined,
): Promise<string | undefined> {
  if (file === undefined) return inline;
  const path = resolve(ctx.cwd ?? process.cwd(), file);
  if (/^\/(?:dev\/(?:stdin|fd\/0)|proc\/(?:self|thread-self|[0-9]+)\/fd\/0)$/.test(path)) {
    throw new CliError(
      `could not read ${file}: stdin paths are not supported because the SDK host process does not read the invoking CLI's stdin. Use a regular UTF-8 file or --description.`,
    );
  }
  try {
    const { text } = await readClientFile(bb, hostId, path);
    if (text === null) {
      throw new CliError(`could not read ${file}: file is not UTF-8 text`);
    }
    return text;
  } catch (error) {
    if (error instanceof PluginCliError) throw error;
    throw new CliError(`could not read ${file}: ${errorMessage(error)}`);
  }
}

async function readWebhookConfigFile(
  bb: BbPluginApi,
  domain: TasksDomain,
  ctx: PluginCliContext,
  file: string,
  machine: string | undefined,
): Promise<string> {
  try {
    const path = resolve(ctx.cwd ?? process.cwd(), file);
    if (/^\/(?:dev|proc)(?:\/|$)/.test(path)) throw new Error();
    const hostId = await resolveClientHostId(bb, domain, machine, ctx);
    const result = await bb.sdk.files.read({
      ...(hostId ? { hostId } : {}),
      path,
      signal: AbortSignal.timeout(5000),
    });
    if (
      result.contentEncoding !== "utf8" ||
      result.sizeBytes > 8192 ||
      Buffer.byteLength(result.content) > 8192
    )
      throw new Error();
    return result.content;
  } catch {
    throw new CliError("Could not read webhook config file", { code: "webhook_file_error" });
  }
}

export {
  resolveClientHostId,
  readAttachmentSource,
  writeClientFile,
  attachmentFileName,
  readTextOption,
  readWebhookConfigFile,
};
