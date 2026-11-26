import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TasksApiStore } from "../api";
import { WebhookError, type Webhooks } from "./index";
import {
  addInput,
  byId,
  renameInput,
  webhookRpcContract,
  type WebhookActionError,
  type WebhookSettings,
} from "./contract";

function failure(code: WebhookActionError) {
  return { ok: false, code } as const;
}

async function action<T>(run: () => Promise<T>) {
  try {
    return { ok: true, ...(await run()) } as const;
  } catch (error) {
    return failure(error instanceof WebhookError ? error.code : "storage_error");
  }
}

export function registerWebhookSettings(bb: BbPluginApi, store: TasksApiStore, webhooks: Webhooks) {
  bb.rpc.register(webhookRpcContract, {
    async listWebhooks(): Promise<WebhookSettings> {
      try {
        const endpoints = await webhooks.list();
        const trackers = store.tasks
          .listProjects()
          .map(({ id, prefix, name }) => ({ id, prefix, name }));
        return { state: "healthy", endpoints, trackers };
      } catch (error) {
        if (error instanceof WebhookError && error.code === "invalid_stored")
          return { state: "blocked" };
        throw new Error("Could not load webhook settings");
      }
    },
    async addWebhook(input) {
      const parsed = addInput.safeParse(input);
      if (!parsed.success || !/^https:\/\//i.test(parsed.data.url)) return failure("invalid_input");
      const { scope, ...secret } = parsed.data;
      try {
        if (scope.kind === "tracker" && !store.tasks.getProject(scope.projectId)) {
          await webhooks.list();
          return failure("tracker_not_found");
        }
      } catch (error) {
        return failure(error instanceof WebhookError ? error.code : "storage_error");
      }
      return action(async () => ({
        endpoint: await webhooks.create(scope, JSON.stringify(secret)),
      }));
    },
    renameWebhook(input) {
      return Promise.try(() => {
        const parsed = renameInput.safeParse(input);
        if (!parsed.success) return failure("invalid_input");
        return action(async () => ({
          endpoint: await webhooks.rename(parsed.data.id, parsed.data.name),
        }));
      });
    },
    testWebhook(input) {
      return Promise.try(() => {
        const parsed = byId.safeParse(input);
        if (!parsed.success) return failure("invalid_input");
        return action(async () => {
          const result = await webhooks.test(parsed.data.id);
          return { outcome: result.outcome };
        });
      });
    },
    deleteWebhook(input) {
      return Promise.try(() => {
        const parsed = byId.safeParse(input);
        if (!parsed.success) return failure("invalid_input");
        return action(async () => ({ endpoint: await webhooks.delete(parsed.data.id) }));
      });
    },
  });
}
