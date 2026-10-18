import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { ULID_PATTERN } from "../shared/contract";

export type WebhookScope = { kind: "global" } | { kind: "tracker"; projectId: string };
export interface EndpointSummary {
  id: string;
  scope: WebhookScope;
  hasAuthorization: boolean;
}
interface Endpoint {
  id: string;
  scope: WebhookScope;
  url: string;
  authorization?: string;
}
interface EndpointDocument {
  version: 1;
  endpoints: Endpoint[];
}
interface CreatedTask {
  projectId: string;
  key: string;
  title: string;
  createdAt: string;
}
interface TaskCreatedEvent {
  event: "task.created";
  key: string;
  project: string;
  title: string;
  createdAt: string;
  test?: true;
}
export type DeliveryOutcome =
  | { code: "delivered" | "http_error"; attempts: number; status: number }
  | { code: "network_error" | "timeout" | "queue_full" | "expired" | "disposed"; attempts: number };
export interface Webhooks {
  create(scope: WebhookScope, json: string): Promise<EndpointSummary>;
  list(): EndpointSummary[];
  delete(id: string): Promise<EndpointSummary>;
  test(id: string): Promise<{ endpoint: EndpointSummary; outcome: DeliveryOutcome }>;
  taskCreated(task: CreatedTask, project: string): void;
  dispose(): void;
}
interface DeliveryJob {
  endpoint: Endpoint;
  body: string;
  bytes: number;
  attempts: number;
  deadline: ReturnType<typeof setTimeout>;
  retry?: ReturnType<typeof setTimeout>;
  requestTimer?: ReturnType<typeof setTimeout>;
  controller?: AbortController;
  resolve(outcome: DeliveryOutcome): void;
}

const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_JOBS = 128;
const MAX_JOB_BYTES = 512 * 1024;
const CONCURRENCY = 4;
const REQUEST_MS = 2000;
const RESIDENCE_MS = 8000;
const BACKOFF_MS = [100, 300];
const messages = {
  invalid_input: "Invalid webhook configuration",
  invalid_stored: "Invalid stored webhook configuration",
  storage_error: "Webhook configuration unavailable",
  limit: "Webhook configuration limit exceeded",
  not_found: "Webhook endpoint not found",
  disposed: "Webhook service disposed",
} as const;

export class WebhookError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
  }
}

function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      Buffer.byteLength(value) <= 2048 &&
      !/\s/u.test(value) &&
      !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
      /^https?:\/\//i.test(value) &&
      !/^https?:\/\/[^/?#]*@/i.test(value) &&
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !value.includes("#")
    );
  } catch {
    return false;
  }
}
const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("global") }).strict(),
  z.object({ kind: z.literal("tracker"), projectId: z.string().regex(ULID_PATTERN) }).strict(),
]);
const inputSchema = z
  .object({
    url: z.string().refine(validUrl),
    authorization: z
      .string()
      .min(1)
      .max(4096)
      .regex(/^[\x20-\x7e]+$/)
      .refine((value) => value === value.trim())
      .optional(),
  })
  .strict();
const endpointSchema = inputSchema.extend({
  id: z.string().regex(/^wh_[a-f0-9]{32}$/),
  scope: scopeSchema,
});
const documentSchema = z
  .object({
    version: z.literal(1),
    endpoints: z.array(endpointSchema).max(32),
  })
  .strict()
  .refine((doc) => new Set(doc.endpoints.map((e) => e.id)).size === doc.endpoints.length);

function readDocument(value: string | undefined): EndpointDocument {
  try {
    if (value === undefined) return { version: 1, endpoints: [] };
    if (Buffer.byteLength(value) > MAX_CONFIG_BYTES) throw new Error();
    return documentSchema.parse(JSON.parse(value));
  } catch {
    throw new WebhookError("invalid_stored");
  }
}
function summary(endpoint: Endpoint): EndpointSummary {
  return {
    id: endpoint.id,
    scope: { ...endpoint.scope },
    hasAuthorization: endpoint.authorization !== undefined,
  };
}
function encode(event: TaskCreatedEvent): string {
  switch (event.event) {
    case "task.created":
      return JSON.stringify(event);
  }
}

export async function createWebhooks(bb: BbPluginApi): Promise<Webhooks> {
  const settings = bb.settings.define({
    taskWebhooks: {
      type: "string",
      label: "Task webhook endpoints",
      secret: true,
    },
  });
  let snapshot: EndpointDocument | null = null;
  let disposed = false;
  let mutations = Promise.resolve();
  const jobs = new Set<DeliveryJob>();
  let ready: DeliveryJob[] = [];
  let pendingBytes = 0;
  let active = 0;

  function warn(message: string): void {
    try {
      bb.log.warn(message);
    } catch {
      /* Logging must not affect task creation or shutdown. */
    }
  }
  function update(value: string | undefined): void {
    if (disposed) return;
    try {
      snapshot = readDocument(value);
    } catch {
      snapshot = null;
      warn(messages.invalid_stored);
    }
  }
  try {
    update((await settings.get()).taskWebhooks);
  } catch {
    warn(messages.storage_error);
  }
  settings.onChange((next) => update(next.taskWebhooks));

  function configured(): EndpointDocument {
    if (!snapshot) throw new WebhookError("invalid_stored");
    return snapshot;
  }
  function live(): void {
    if (disposed) throw new WebhookError("disposed");
  }
  function endpointById(id: string): Endpoint {
    const endpoint = configured().endpoints.find((e) => e.id === id);
    if (!endpoint) throw new WebhookError("not_found");
    return endpoint;
  }
  function mutate<T>(
    change: (document: EndpointDocument) => { document: EndpointDocument; result: T },
  ): Promise<T> {
    const next = mutations.then(async () => {
      live();
      let document: EndpointDocument;
      try {
        document = readDocument((await settings.get()).taskWebhooks);
      } catch (error) {
        snapshot = null;
        throw error instanceof WebhookError ? error : new WebhookError("storage_error");
      }
      live();
      const changed = change(document);
      const json = JSON.stringify(changed.document);
      if (Buffer.byteLength(json) > MAX_CONFIG_BYTES || changed.document.endpoints.length > 32)
        throw new WebhookError("limit");
      try {
        await settings.experimental_set({ taskWebhooks: json });
      } catch {
        throw new WebhookError("storage_error");
      }
      live();
      snapshot = changed.document;
      return changed.result;
    });
    mutations = next.then(
      () => {},
      () => {},
    );
    return next;
  }

  function report(endpoint: Endpoint, outcome: DeliveryOutcome): void {
    if (outcome.code !== "delivered" && outcome.code !== "disposed") {
      warn(
        `Webhook ${endpoint.id} attempts=${outcome.attempts} code=${outcome.code}${"status" in outcome ? ` status=${outcome.status}` : ""}`,
      );
    }
  }
  function finish(job: DeliveryJob, outcome: DeliveryOutcome): void {
    if (!jobs.delete(job)) return;
    pendingBytes -= job.bytes;
    clearTimeout(job.deadline);
    clearTimeout(job.retry);
    clearTimeout(job.requestTimer);
    job.controller?.abort();
    ready = ready.filter((queued) => queued !== job);
    report(job.endpoint, outcome);
    job.resolve(outcome);
  }
  async function request(job: DeliveryJob): Promise<DeliveryOutcome> {
    const controller = new AbortController();
    job.controller = controller;
    let timedOut = false;
    job.requestTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_MS);
    job.attempts++;
    try {
      const response = await fetch(job.endpoint.url, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(job.endpoint.authorization === undefined
            ? {}
            : { Authorization: job.endpoint.authorization }),
        },
        body: job.body,
      });
      void response.body?.cancel().catch(() => {});
      return {
        code: response.ok ? "delivered" : "http_error",
        attempts: job.attempts,
        status: response.status,
      };
    } catch {
      return { code: timedOut ? "timeout" : "network_error", attempts: job.attempts };
    } finally {
      clearTimeout(job.requestTimer);
      job.controller = undefined;
    }
  }
  async function deliver(job: DeliveryJob): Promise<void> {
    try {
      const outcome = await request(job);
      if (!jobs.has(job)) return;
      const retryable =
        outcome.code === "network_error" ||
        outcome.code === "timeout" ||
        (outcome.code === "http_error" &&
          (outcome.status === 408 ||
            outcome.status === 429 ||
            (outcome.status >= 500 && outcome.status <= 599)));
      if (retryable && job.attempts <= BACKOFF_MS.length) {
        job.retry = setTimeout(
          () => {
            if (!jobs.has(job)) return;
            ready.push(job);
            pump();
          },
          BACKOFF_MS[job.attempts - 1],
        );
      } else finish(job, outcome);
    } finally {
      active--;
      pump();
    }
  }
  function pump(): void {
    while (!disposed && active < CONCURRENCY && ready.length) {
      const job = ready.shift()!;
      if (!jobs.has(job)) continue;
      active++;
      void deliver(job);
    }
  }
  function enqueue(endpoint: Endpoint, body: string): Promise<DeliveryOutcome> {
    const bytes =
      Buffer.byteLength(body) +
      Buffer.byteLength(endpoint.url) +
      Buffer.byteLength(endpoint.authorization ?? "");
    const code = disposed
      ? "disposed"
      : jobs.size >= MAX_JOBS || pendingBytes + bytes > MAX_JOB_BYTES
        ? "queue_full"
        : null;
    if (code) {
      const outcome = { code, attempts: 0 } as const;
      report(endpoint, outcome);
      return Promise.resolve(outcome);
    }
    return new Promise((resolve) => {
      const job: DeliveryJob = {
        endpoint,
        body,
        bytes,
        attempts: 0,
        resolve,
        deadline: setTimeout(
          () => finish(job, { code: "expired", attempts: job.attempts }),
          RESIDENCE_MS,
        ),
      };
      jobs.add(job);
      pendingBytes += bytes;
      ready.push(job);
      pump();
    });
  }
  return {
    create(scope, json) {
      return mutate((document) => {
        let endpoint: Endpoint;
        try {
          if (Buffer.byteLength(json) > 8192) throw new Error();
          endpoint = {
            ...inputSchema.parse(JSON.parse(json)),
            scope: scopeSchema.parse(scope),
            id: `wh_${randomUUID().replaceAll("-", "")}`,
          };
        } catch {
          throw new WebhookError("invalid_input");
        }
        return {
          document: { version: 1, endpoints: [...document.endpoints, endpoint] },
          result: summary(endpoint),
        };
      });
    },
    list() {
      return configured().endpoints.map(summary);
    },
    delete(id) {
      return mutate((document) => {
        const endpoint = document.endpoints.find((e) => e.id === id);
        if (!endpoint) throw new WebhookError("not_found");
        return {
          document: { version: 1, endpoints: document.endpoints.filter((e) => e.id !== id) },
          result: summary(endpoint),
        };
      });
    },
    async test(id) {
      const endpoint = endpointById(id);
      const body = encode({
        event: "task.created",
        key: "WEBHOOK-0",
        project: "WEBHOOK",
        title: "Webhook test sample",
        createdAt: new Date().toISOString(),
        test: true,
      });
      return { endpoint: summary(endpoint), outcome: await enqueue(endpoint, body) };
    },
    taskCreated(task, project) {
      if (disposed || !snapshot) return;
      try {
        const body = encode({
          event: "task.created",
          key: task.key,
          project,
          title: task.title,
          createdAt: task.createdAt,
        });
        for (const endpoint of snapshot.endpoints) {
          if (endpoint.scope.kind === "global" || endpoint.scope.projectId === task.projectId)
            void enqueue(endpoint, body);
        }
      } catch {
        warn("Webhook notification failed");
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const job of jobs) finish(job, { code: "disposed", attempts: job.attempts });
      ready = [];
    },
  };
}
