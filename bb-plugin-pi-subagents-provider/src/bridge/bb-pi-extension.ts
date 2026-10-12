import { CODEX_SPEED_SOURCE } from "./codex-speed-source.js";
import { SUBAGENT_STATUS_SOURCE } from "./subagents/extension-source.js";

export const BB_PI_EXTENSION_SOURCE =
  CODEX_SPEED_SOURCE +
  SUBAGENT_STATUS_SOURCE +
  String.raw`
import { randomUUID } from "node:crypto";
import { existsSync, linkSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { Socket } from "node:net";
import { StringDecoder } from "node:string_decoder";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const CHILD_TO_BRIDGE_FD = 3;
const BRIDGE_TO_CHILD_FD = 4;

function writeLine(fd, message) {
  const line = JSON.stringify(message) + "\n";
  try {
    // Synchronous: tool results and fork replies must never interleave.
    writeSyncAll(fd, line);
  } catch {
    // The bridge is gone; nothing to report to.
  }
}

function writeSyncAll(fd, text) {
  const buffer = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < buffer.length) {
    offset += writeSync(fd, buffer, offset, buffer.length - offset);
  }
}

/** Newline-only line reader (never readline: it splits on U+2028/U+2029). */
function readLines(input, onLine) {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  input.on("data", (chunk) => {
    const text = typeof chunk === "string" ? chunk : decoder.write(chunk);
    let start = 0;
    for (;;) {
      const index = text.indexOf("\n", start);
      if (index === -1) {
        pending += text.slice(start);
        return;
      }
      const line = pending + text.slice(start, index);
      pending = "";
      start = index + 1;
      onLine(line.endsWith("\r") ? line.slice(0, -1) : line);
    }
  });
}

// ---- JSON Schema → TypeBox (the bb tool definitions carry JSON Schema) ----

function toJsonSchemaObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/**
 * Annotations and constraints TypeBox carries through to the schema the
 * model sees: descriptions, defaults, and the numeric/string keywords.
 */
const CARRIED_KEYWORDS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minItems",
  "maxItems",
];
function annotations(schema) {
  const out = {};
  if (typeof schema.description === "string") out.description = schema.description;
  if (typeof schema.title === "string") out.title = schema.title;
  if (schema.default !== undefined) out.default = schema.default;
  if (Array.isArray(schema.examples)) out.examples = schema.examples;
  for (const keyword of CARRIED_KEYWORDS) {
    if (schema[keyword] !== undefined) out[keyword] = schema[keyword];
  }
  return out;
}

function toLiteral(value) {
  return ["string", "number", "boolean"].includes(typeof value) ? Type.Literal(value) : null;
}

function toEnumSchema(schema) {
  if (!Array.isArray(schema.enum) || schema.enum.length === 0) return null;
  const literals = schema.enum.map(toLiteral).filter(Boolean);
  if (literals.length === 0) return null;
  return literals.length === 1
    ? Type.Unsafe({ ...literals[0], ...annotations(schema) })
    : Type.Union(literals, annotations(schema));
}

function toObjectSchema(schema) {
  const properties = toJsonSchemaObject(schema.properties) ?? {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const shape = {};
  for (const [key, value] of Object.entries(properties)) {
    const property = toJsonSchemaObject(value);
    if (!property) continue;
    const propertySchema = toTypeBoxSchema(property);
    shape[key] = required.has(key) ? propertySchema : Type.Optional(propertySchema);
  }
  const options = annotations(schema);
  if (schema.additionalProperties === false) options.additionalProperties = false;
  return Type.Object(shape, options);
}

function toTypedSchema(type, schema) {
  const options = annotations(schema);
  switch (type) {
    case "object":
      return toObjectSchema(schema);
    case "array": {
      const items = toJsonSchemaObject(schema.items);
      return Type.Array(items ? toTypeBoxSchema(items) : Type.Unknown(), options);
    }
    case "string":
      return Type.String(options);
    case "number":
      return Type.Number(options);
    case "integer":
      return Type.Integer(options);
    case "boolean":
      return Type.Boolean(options);
    case "null":
      return Type.Null(options);
    default:
      // JSON Schema is provider-owned here; unsupported shapes degrade.
      return Type.Unknown(options);
  }
}

function toTypeBoxSchema(schema) {
  const enumSchema = toEnumSchema(schema);
  if (enumSchema) return enumSchema;
  if (schema.const !== undefined) {
    const literal = toLiteral(schema.const);
    if (literal) return Type.Unsafe({ ...literal, ...annotations(schema) });
  }
  for (const key of ["anyOf", "oneOf"]) {
    if (Array.isArray(schema[key]) && schema[key].length > 0) {
      const variants = schema[key].map(toJsonSchemaObject).filter(Boolean).map(toTypeBoxSchema);
      if (variants.length > 0) return Type.Union(variants, annotations(schema));
    }
  }
  if (Array.isArray(schema.type)) {
    const variants = schema.type.map((type) => toTypedSchema(type, { ...schema, description: undefined }));
    return variants.length === 1 ? toTypedSchema(schema.type[0], schema) : Type.Union(variants, annotations(schema));
  }
  if (schema.type === undefined) {
    return schema.properties ? toObjectSchema(schema) : Type.Unknown(annotations(schema));
  }
  return toTypedSchema(schema.type, schema);
}

function buildParameters(inputSchema) {
  const schema = toJsonSchemaObject(inputSchema);
  return schema ? toTypeBoxSchema(schema) : Type.Object({});
}

// ---- the extension ----

function attachBridgeChannel(onLine) {
  const key = Symbol.for("bb.pi.bridge.channel.v1");
  let channel = globalThis[key];
  if (!channel) {
    channel = { onLine: null };
    globalThis[key] = channel;
    const dispatch = (line) => channel.onLine?.(line);
    if (typeof Bun !== "undefined") {
      void (async () => {
        const decoder = new StringDecoder("utf8");
        let pending = "";
        try {
          for await (const chunk of Bun.file(BRIDGE_TO_CHILD_FD).stream()) {
            const text = typeof chunk === "string" ? chunk : decoder.write(chunk);
            let start = 0;
            for (;;) {
              const index = text.indexOf("\n", start);
              if (index === -1) {
                pending += text.slice(start);
                break;
              }
              const line = pending + text.slice(start, index);
              pending = "";
              start = index + 1;
              dispatch(line.endsWith("\r") ? line.slice(0, -1) : line);
            }
          }
        } catch {}
      })();
    } else {
      const bridgeIn = new Socket({ fd: BRIDGE_TO_CHILD_FD, readable: true, writable: false });
      bridgeIn.on("error", () => undefined);
      bridgeIn.unref();
      readLines(bridgeIn, dispatch);
    }
  }
  channel.onLine = onLine;
  return () => {
    if (channel.onLine === onLine) channel.onLine = null;
  };
}

export default function bbExtension(pi) {
  const toolsFile = process.env.PI_BB_TOOLS_FILE;
  const tools = toolsFile ? JSON.parse(readFileSync(toolsFile, "utf8")) : [];
  const pendingToolCalls = new Map();
  let sessionContext = null;
  let detachBridgeChannel = () => {};
  let speed = null;
  let preferredSpeed = "default";
  let speedSelectionGeneration = 0;

  function speedPreferenceFile() {
    const file = sessionContext?.sessionManager?.getSessionFile?.();
    if (!file) throw new Error("Speed preference cannot be saved in this session.");
    return file + ".bb-codex-speed.json";
  }

  function persistSessionIdentity() {
    const manager = sessionContext?.sessionManager;
    const file = manager?.getSessionFile?.();
    if (!file || existsSync(file)) return;
    const header = manager.getHeader?.();
    if (!header) throw new Error("Native session identity is unavailable.");
    const temporary = file + ".bb-codex-speed.identity." + process.pid + ".tmp";
    try {
      writeFileSync(temporary, [header, ...manager.getEntries()].map((entry) => JSON.stringify(entry)).join("\n") + "\n", { mode: 0o600 });
      try { linkSync(temporary, file); }
      catch (error) { if (error?.code !== "EEXIST") throw error; }
    } finally {
      rmSync(temporary, { force: true });
    }
    return file;
  }

  function saveSpeedPreference(value) {
    const file = speedPreferenceFile();
    const temporary = file + "." + process.pid + ".tmp";
    try {
      writeFileSync(temporary, JSON.stringify({ version: 1, speed: value }), { mode: 0o600 });
      renameSync(temporary, file);
    } catch {
      try { rmSync(temporary, { force: true }); } catch {}
      throw new Error("Speed preference could not be saved. Retry the /speed command.");
    }
    preferredSpeed = value;
  }

  function restoreSpeedPreference(legacy) {
    let missing = false;
    let value = legacy === "fast" ? "fast" : legacy === undefined || legacy === "default" ? "default" : null;
    try {
      const saved = JSON.parse(readFileSync(speedPreferenceFile(), "utf8"));
      value = saved.version === 1 && (saved.speed === "default" || saved.speed === "fast")
        ? saved.speed : null;
    } catch (error) {
      missing = error?.code === "ENOENT";
      if (!missing) value = null;
    }
    preferredSpeed = value;
    speed?.restore(value);
    if (missing && value !== "default") saveSpeedPreference(value);
    return { selected: preferredSpeed ?? "invalid" };
  }

  async function runSpeedCommand(action) {
    const generation = action === "fast" || action === "default"
      ? ++speedSelectionGeneration : speedSelectionGeneration;
    if (action === "default") {
      saveSpeedPreference("default");
    } else if (action === "fast") {
      if (!speed || !sessionContext?.model) throw new Error("Speed unavailable. Use /speed default.");
      const result = await speed.capabilities(sessionContext.model);
      if (generation !== speedSelectionGeneration) return { selected: preferredSpeed };
      if (result.error || !result.tiers.some((tier) => tier.id === "fast"))
        throw new Error("Fast is not confirmed for this account and model. Use /speed refresh or /speed default.");
      saveSpeedPreference("fast");
    } else if (action !== "status" && action !== "refresh") {
      throw new Error("Unknown speed command. Use /speed, /speed fast, /speed default, or /speed refresh.");
    }
    const choices = action === "status" || action === "refresh"
      ? await (action === "refresh" ? speed?.refresh(sessionContext?.model) : speed?.capabilities(sessionContext?.model))
      : null;
    if (action === "refresh" && (!choices || choices.error))
      throw new Error("Speed discovery failed. Retry /speed refresh or use /speed default.");
    const available = choices?.tiers?.filter((tier) => tier.id !== "ultrafast").map((tier) => tier.name).join(", ");
    const message = "Saved Codex speed: " + (preferredSpeed ?? "invalid") + " for the next turn."
      + (available ? " Available: " + available + "." : "")
      + (choices && !choices.tiers?.some((tier) => tier.id === preferredSpeed) ? " Not confirmed for this account and model." : "")
      + (choices?.error ? " Discovery failed. Use /speed refresh or /speed default." : "")
      + (preferredSpeed === "fast" ? " Fast uses increased usage." : "");
    sessionContext?.ui?.notify?.(message, "info");
    return { selected: preferredSpeed ?? "invalid", message };
  }
  const readSubagentStatus = installSubagentStatusChannel(pi, () => sessionContext, () => {
    writeLine(CHILD_TO_BRIDGE_FD, { kind: "subagent-hint" });
  });

  const onBridgeLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (message.kind === "tool-result") {
      const pending = pendingToolCalls.get(message.id);
      if (!pending) return;
      pendingToolCalls.delete(message.id);
      if (message.isError) {
        pending.reject(new Error(toolErrorText(message.content) || "Tool call failed"));
      } else {
        pending.resolve({ content: message.content, details: {} });
      }
      return;
    }
    if (message.kind === "request") {
      void handleBridgeRequest(message);
    }
  };

  async function handleBridgeRequest(message) {
    try {
      const result = await runBridgeRequest(message);
      writeLine(CHILD_TO_BRIDGE_FD, { kind: "reply", id: message.id, result });
    } catch (error) {
      writeLine(CHILD_TO_BRIDGE_FD, {
        kind: "reply",
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function runBridgeRequest(message) {
    switch (message.method) {
      case "subagent-status":
        return readSubagentStatus();
      case "subagent-inspection-context":
        return readSubagentStatus.inspectionContext();
      case "fork": {
        // Documented SessionManager API (docs/sdk.md, docs/session-format.md):
        // a full fork copies the source history, a checkpoint fork branches
        // at an entry. Both pick their own file name; the bridge names the
        // target, so the file is moved onto it. Both read the source file
        // and write only the new one.
        const forkedFile =
          message.checkpointId === undefined
            ? SessionManager.forkFrom(
                message.sourceFile,
                message.cwd,
                message.sessionDir,
              ).getSessionFile()
            : SessionManager.open(
                message.sourceFile,
                message.sessionDir,
                message.cwd,
              ).createBranchedSession(message.checkpointId);
        if (!forkedFile) {
          throw new Error("forked pi session was not persisted");
        }
        if (forkedFile !== message.targetFile) {
          renameSync(forkedFile, message.targetFile);
        }
        return { sessionFile: message.targetFile };
      }
      case "leaf":
        return { leafId: currentLeafId() };
      case "speed-restore": {
        const reopenSessionFile = persistSessionIdentity();
        return { ...restoreSpeedPreference(message.serviceTier), ...(reopenSessionFile ? { reopenSessionFile } : {}) };
      }
      case "speed-command":
        return runSpeedCommand(message.action);
      case "speed-prepare": {
        const selected = sessionContext?.model?.provider === "openai-codex" ? (message.active ? (speed?.selected ?? "default") : preferredSpeed) : "default";
        if (!speed) {
          if (selected !== "default") throw new Error("Speed unavailable. Use /speed default.");
        } else {
          await speed.select(sessionContext?.model, selected);
        }
        return { selected: preferredSpeed ?? "invalid" };
      }
      case "model-scope":
        return currentModelScope();
      default:
        throw new Error("unknown bridge request " + String(message.method));
    }
  }

  function currentLeafId() {
    return sessionContext?.sessionManager?.getLeafId?.() ?? null;
  }

  function currentModelScope() {
    return {
      scopedModelIds: (sessionContext?.scopedModels ?? []).map(
        ({ model }) => model.provider + "/" + model.id,
      ),
      defaultModelId: sessionContext?.model
        ? sessionContext.model.provider + "/" + sessionContext.model.id
        : null,
    };
  }

  for (const tool of tools) {
    pi.registerTool({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      parameters: buildParameters(tool.inputSchema),
      async execute(_toolCallId, params, signal) {
        const id = "tc-" + randomUUID();
        const result = new Promise((resolve, reject) => {
          pendingToolCalls.set(id, { resolve, reject });
        });
        if (signal) {
          signal.addEventListener(
            "abort",
            () => {
              const pending = pendingToolCalls.get(id);
              if (!pending) return;
              pendingToolCalls.delete(id);
              pending.reject(new Error("Tool call aborted"));
            },
            { once: true },
          );
        }
        writeLine(CHILD_TO_BRIDGE_FD, {
          kind: "tool-call",
          id,
          toolName: tool.name,
          arguments: params ?? {},
        });
        return result;
      },
    });
  }

  pi.on("session_shutdown", () => {
    detachBridgeChannel();
    sessionContext = null;
    for (const pending of pendingToolCalls.values()) {
      pending.reject(new Error("Pi session shut down"));
    }
    pendingToolCalls.clear();
  });

  pi.on("session_start", async (_event, ctx) => {
    sessionContext = ctx;
    detachBridgeChannel = attachBridgeChannel(onBridgeLine);
    try {
      speed = __bbCodexSpeed.installSpeed(pi, ctx, { ownership: "bb-managed" }) ?? null;
    } catch {
      // Older Pi or a custom Codex transport still works at Default.
      speed = null;
    }
    writeLine(CHILD_TO_BRIDGE_FD, {
      kind: "model-scope",
      ...currentModelScope(),
    });
    // Pi's active-tool set is session state; a resumed or forked session can
    // predate the bb tools, so make sure every injected tool is active.
    if (tools.length > 0 && typeof pi.setActiveTools === "function") {
      const active = new Set(pi.getActiveTools?.() ?? []);
      let missing = false;
      for (const tool of tools) {
        if (!active.has(tool.name)) {
          active.add(tool.name);
          missing = true;
        }
      }
      if (missing) pi.setActiveTools([...active]);
    }
    writeLine(CHILD_TO_BRIDGE_FD, { kind: "ready", speedControl: true });
  });

  // The run's checkpoint, read in-process the moment the run ends: pi emits
  // this to extensions before it writes its own agent_end to stdout, and
  // before any continuation or compaction can move the leaf.
  pi.on("agent_end", async (_event, ctx) => {
    sessionContext = ctx ?? sessionContext;
    writeLine(CHILD_TO_BRIDGE_FD, { kind: "agent-end-leaf", leafId: currentLeafId() });
  });
}

function toolErrorText(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}
`;
