import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
} from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Icon } from "../components/ui/icon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  WEBHOOKS_CHANGED,
  WEBHOOK_NAME_MAX_LENGTH,
  type DeliveryOutcome,
  type EndpointSummary,
  type Tracker,
  type WebhookActionError,
  type WebhookScope,
  type WebhookSettings,
  type webhookRpcContract,
} from "./contract";
import "./settings-section.css";

const actionErrors: Record<WebhookActionError, string> = {
  invalid_input: "Check the HTTPS URL and Authorization header.",
  invalid_name: `Use a name with at most ${WEBHOOK_NAME_MAX_LENGTH} characters.`,
  invalid_stored: "The saved webhook configuration is invalid.",
  tracker_not_found: "That tracker no longer exists. Choose another scope.",
  not_found: "This webhook no longer exists.",
  limit: "The webhook configuration is full. Delete a webhook before adding another.",
  storage_error: "Webhook configuration is unavailable. Try again.",
  disposed: "Webhook service is unavailable. Try again.",
};

function scopeLabel(scope: WebhookScope, trackers: Tracker[]) {
  if (scope.kind === "global") return "All trackers";
  const tracker = trackers.find(({ id }) => id === scope.projectId);
  return tracker
    ? `${tracker.prefix} · ${tracker.name}`
    : `Unavailable tracker · ${scope.projectId}`;
}

function testMessage(outcome: DeliveryOutcome) {
  switch (outcome.code) {
    case "delivered":
      return `Test delivered · HTTP ${outcome.status}`;
    case "http_error":
      return `Test rejected · HTTP ${outcome.status}`;
    case "timeout":
    case "expired":
      return "Test timed out. Try again.";
    case "network_error":
      return "Test failed. Could not reach the receiver.";
    case "queue_full":
    case "disposed":
      return "Test unavailable. Try again.";
  }
}

interface Feedback {
  message: string;
  error?: boolean;
}
type Pending = { kind: "add" } | { kind: "test" | "delete" | "rename"; id: string };
interface Selection {
  kind: "delete" | "rename";
  endpoint: EndpointSummary;
}

const RowAction = ({
  label,
  target,
  icon,
  ...props
}: ComponentProps<typeof Button> & { label: string; target: string; icon: string }) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={`${label} ${target}`}
          {...props}
        >
          <Icon name={icon} aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};

export const WebhookSettingsSection = () => {
  const rpc = useRpc<typeof webhookRpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const sectionId = useId();
  const latestRead = useRef(0);
  const operation = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const afterDelete = useRef<number | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const [settings, setSettings] = useState<WebhookSettings | "loading" | "unavailable">("loading");
  const [pending, setPending] = useState<Pending | null>(null);
  const [addFeedback, setAddFeedback] = useState<Feedback & { savedId?: string }>();
  const [deleteFeedback, setDeleteFeedback] = useState<Feedback>();
  const [tests, setTests] = useState<Record<string, Feedback>>({});
  const [selection, setSelection] = useState<Selection | null>(null);
  const [renameFeedback, setRenameFeedback] = useState<Feedback>();
  const renameInput = useRef<HTMLInputElement>(null);
  const dialogTrigger = useRef<HTMLButtonElement>(null);
  const [scope, setScope] = useState("");

  const refresh = useCallback(async (fromSettingChange = false) => {
    const request = ++latestRead.current;
    if (fromSettingChange && !operation.current)
      setSelection((current) => (current?.kind === "delete" ? null : current));
    let next: WebhookSettings | "unavailable";
    try {
      next = await rpcRef.current.call("listWebhooks", null);
    } catch {
      next = "unavailable";
    }
    if (request !== latestRead.current) return;
    setSettings(next);
    if (next !== "unavailable" && next.state === "healthy") {
      const ids = new Set(next.endpoints.map(({ id }) => id));
      setTests((current) => {
        const entries = Object.entries(current);
        const present = entries.filter(([id]) => ids.has(id));
        return present.length === entries.length ? current : Object.fromEntries(present);
      });
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      latestRead.current++;
    };
  }, [refresh]);
  useRealtime(WEBHOOKS_CHANGED, () => {
    void refresh(true);
  });
  useRealtime("projects:changed", () => {
    void refresh();
  });

  const healthy = typeof settings !== "string" && settings.state === "healthy" ? settings : null;
  const deleteSelection = selection?.kind === "delete" ? selection.endpoint : null;
  const renameSelection = selection?.kind === "rename" ? selection.endpoint : null;
  const selected =
    deleteSelection && healthy?.endpoints.find(({ id }) => id === deleteSelection.id);
  const trackers = healthy?.trackers ?? [];
  const selectedScope = scope === "all" || trackers.some(({ id }) => id === scope) ? scope : "";
  const locked = pending !== null;
  const savedId = addFeedback?.savedId;

  function start(next: Pending) {
    if (operation.current || !healthy) return false;
    operation.current = true;
    setPending(next);
    return true;
  }

  function done() {
    operation.current = false;
    setPending(null);
  }

  function failed(code: WebhookActionError): Feedback {
    if (code === "invalid_stored") {
      latestRead.current++;
      setSettings({ state: "blocked" });
    } else if (code === "not_found" || code === "tracker_not_found") {
      void refresh();
    }
    return { message: actionErrors[code], error: true };
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const url = String(fields.get("url") ?? "");
    const authorization = String(fields.get("authorization") ?? "");
    const name = String(fields.get("name") ?? "");
    if (!selectedScope || !start({ kind: "add" })) return;
    setAddFeedback(undefined);
    try {
      const result = await rpc.call("addWebhook", {
        scope:
          selectedScope === "all"
            ? { kind: "global" }
            : { kind: "tracker", projectId: selectedScope },
        url,
        ...(name ? { name } : {}),
        ...(authorization ? { authorization } : {}),
      });
      if (!result.ok) {
        setAddFeedback(failed(result.code));
        return;
      }
      form.reset();
      setScope("");
      setAddFeedback({ message: "Webhook added.", savedId: result.endpoint.id });
      await refresh();
    } catch {
      setAddFeedback(failed("storage_error"));
    } finally {
      done();
    }
  }

  async function test(id: string) {
    if (!start({ kind: "test", id })) return;
    try {
      const result = await rpc.call("testWebhook", { id });
      const feedback = result.ok
        ? { message: testMessage(result.outcome), error: result.outcome.code !== "delivered" }
        : failed(result.code);
      setTests((current) => ({ ...current, [id]: feedback }));
    } catch {
      setTests((current) => ({ ...current, [id]: failed("storage_error") }));
    } finally {
      done();
    }
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameSelection || !start({ kind: "rename", id: renameSelection.id })) return;
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    setRenameFeedback(undefined);
    try {
      const result = await rpc.call("renameWebhook", { id: renameSelection.id, name });
      if (!result.ok) {
        setRenameFeedback(failed(result.code));
        return;
      }
      await refresh();
      setSelection(null);
    } catch {
      setRenameFeedback(failed("storage_error"));
    } finally {
      done();
    }
  }

  async function remove() {
    if (!selected || !healthy || !start({ kind: "delete", id: selected.id })) return;
    setDeleteFeedback(undefined);
    try {
      const result = await rpc.call("deleteWebhook", { id: selected.id });
      if (!result.ok) {
        setDeleteFeedback(failed(result.code));
        return;
      }
      afterDelete.current = healthy.endpoints.findIndex(({ id }) => id === selected.id);
      await refresh();
      setDeleteFeedback({ message: "Webhook deleted." });
      setSelection(null);
    } catch {
      setDeleteFeedback(failed("storage_error"));
    } finally {
      done();
    }
  }

  function restoreFocus() {
    const index = afterDelete.current;
    afterDelete.current = null;
    if (index !== null) {
      const buttons = list.current?.querySelectorAll<HTMLButtonElement>("[data-webhook-delete]");
      const next = buttons?.[index] ?? buttons?.[index - 1] ?? urlInput.current ?? heading.current;
      next?.focus();
    } else if (dialogTrigger.current?.isConnected) {
      dialogTrigger.current.focus();
    } else {
      heading.current?.focus();
    }
  }

  return (
    <section className="task-webhook-settings" aria-labelledby={`${sectionId}-title`}>
      <header>
        <h3 ref={heading} id={`${sectionId}-title`} tabIndex={-1}>
          Webhooks
        </h3>
        <p>Notify an HTTPS endpoint when a task is created.</p>
      </header>
      {settings === "loading" && (
        <p className="task-webhook-placeholder" role="status">
          Loading webhooks…
        </p>
      )}
      {settings === "unavailable" && (
        <div className="task-webhook-notice" role="status">
          <p>Could not load webhook settings.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSettings("loading");
              void refresh();
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {typeof settings !== "string" && settings.state === "blocked" && (
        <div className="task-webhook-notice" role="status">
          <h4>Webhook actions unavailable</h4>
          <p>
            The saved webhook configuration is invalid. An administrator must clear it before you
            can add, rename, test, or delete webhooks.
          </p>
        </div>
      )}
      {healthy && (
        <>
          <div className="task-webhook-saved">
            <h4 id={`${sectionId}-saved`}>Saved webhooks</h4>
            {healthy.endpoints.length === 0 && (
              <p className="task-webhook-empty">No saved webhooks. Add one below.</p>
            )}
            <TooltipProvider delayDuration={300}>
              <ul aria-labelledby={`${sectionId}-saved`} ref={list}>
                {healthy.endpoints.map((endpoint) => {
                  const scope = scopeLabel(endpoint.scope, trackers);
                  const target = `${scope} webhook ${endpoint.id}`;
                  const sending = pending?.kind === "test" && pending.id === endpoint.id;
                  return (
                    <li key={endpoint.id}>
                      <div className="task-webhook-summary">
                        <strong>{endpoint.name ?? "Unnamed webhook"}</strong>
                        <p>
                          <span>{scope}</span>
                          <span>
                            Webhook ID <code>{endpoint.id}</code>
                          </span>
                          <span>
                            {endpoint.hasAuthorization ? "Authorization set" : "No authorization"}
                          </span>
                        </p>
                      </div>
                      <div className="task-webhook-actions">
                        <RowAction
                          label="Rename"
                          target={target}
                          icon="Edit"
                          aria-disabled={locked}
                          onClick={(event) => {
                            if (operation.current) return;
                            setRenameFeedback(undefined);
                            dialogTrigger.current = event.currentTarget;
                            setSelection({ kind: "rename", endpoint });
                          }}
                        />
                        <RowAction
                          label="Send test"
                          target={target}
                          icon="Send"
                          id={`${sectionId}-test-${endpoint.id}`}
                          aria-disabled={locked}
                          onClick={() => void test(endpoint.id)}
                        />
                        <RowAction
                          label="Delete"
                          target={target}
                          icon="Trash2"
                          data-webhook-delete
                          aria-disabled={locked}
                          onClick={(event) => {
                            if (operation.current) return;
                            setDeleteFeedback(undefined);
                            dialogTrigger.current = event.currentTarget;
                            setSelection({ kind: "delete", endpoint });
                          }}
                        />
                      </div>
                      <p
                        className="task-webhook-test"
                        role="status"
                        data-error={!sending && tests[endpoint.id]?.error}
                      >
                        {sending ? "Sending…" : tests[endpoint.id]?.message}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </TooltipProvider>
            <p>Saved URLs and Authorization values are hidden.</p>
            <p role="status" data-error={deleteFeedback?.error}>
              {selection ? null : deleteFeedback?.message}
            </p>
          </div>
          <form
            aria-labelledby={`${sectionId}-add`}
            autoComplete="off"
            onSubmit={(event) => void add(event)}
          >
            <h4 id={`${sectionId}-add`}>Add a webhook</h4>
            <fieldset disabled={locked}>
              <div className="task-webhook-fields">
                <label className="task-webhook-name-field">
                  <span>
                    Name <small>optional</small>
                  </span>
                  <Input
                    name="name"
                    maxLength={WEBHOOK_NAME_MAX_LENGTH}
                    placeholder="e.g. Release alerts"
                    aria-describedby={`${sectionId}-name-help`}
                  />
                  <small id={`${sectionId}-name-help`}>
                    Do not include URLs or credentials in the name.
                  </small>
                </label>
                <label>
                  HTTPS URL
                  <Input
                    ref={urlInput}
                    name="url"
                    type="url"
                    pattern="[Hh][Tt][Tt][Pp][Ss]://.+"
                    required
                    placeholder="https://hooks.example.com/tasks"
                    spellCheck={false}
                    autoCapitalize="off"
                  />
                </label>
                <label>
                  <span>
                    Authorization header <small>optional</small>
                  </span>
                  <Input
                    name="authorization"
                    type="text"
                    placeholder="Bearer …"
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="off"
                  />
                </label>
                <label>
                  Tracker scope
                  <select
                    name="scope"
                    required
                    value={selectedScope}
                    aria-describedby={`${sectionId}-scope`}
                    onChange={(event) => setScope(event.currentTarget.value)}
                  >
                    <option value="" disabled>
                      Choose a scope
                    </option>
                    <option value="all">All trackers</option>
                    {trackers.map((tracker) => (
                      <option key={tracker.id} value={tracker.id}>
                        {tracker.prefix} · {tracker.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p id={`${sectionId}-scope`}>
                {selectedScope === "all"
                  ? "Notify this receiver for tasks created in any tracker."
                  : "Choose a single tracker or all trackers."}
              </p>
              <div className="task-webhook-submit">
                <Button type="submit" size="sm">
                  {pending?.kind === "add" ? "Adding…" : "Add webhook"}
                </Button>
                <p role="status" data-error={addFeedback?.error}>
                  {addFeedback?.message}
                </p>
                {savedId && healthy.endpoints.some(({ id }) => id === savedId) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="link"
                    onClick={() => document.getElementById(`${sectionId}-test-${savedId}`)?.focus()}
                  >
                    Go to saved webhook
                  </Button>
                )}
              </div>
            </fieldset>
            <p>
              Use a receiver you trust. It will receive the task title, key, tracker prefix, and
              creation time.
            </p>
          </form>
        </>
      )}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !operation.current) setSelection(null);
        }}
      >
        <DialogContent
          className="task-webhook-dialog"
          hideCloseButton
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancel.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete webhook?</DialogTitle>
            <DialogDescription asChild>
              <div>
                <p>
                  Scope:{" "}
                  <strong>{deleteSelection && scopeLabel(deleteSelection.scope, trackers)}</strong>
                  <br />
                  Webhook ID: <code>{deleteSelection?.id}</code>
                </p>
                <p>
                  Tasks created after deletion will not send notifications to this webhook. Queued
                  deliveries may still finish.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          {deleteFeedback?.error && (
            <p role="alert" data-error>
              {deleteFeedback.message}
            </p>
          )}
          <DialogFooter>
            <Button
              ref={cancel}
              autoFocus
              type="button"
              variant="outline"
              aria-disabled={locked}
              onClick={() => {
                if (!operation.current) setSelection(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              aria-disabled={locked}
              onClick={() => void remove()}
            >
              {pending?.kind === "delete" ? "Deleting…" : "Delete webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={renameSelection !== null}
        onOpenChange={(open) => {
          if (!open && !operation.current) setSelection(null);
        }}
      >
        <DialogContent
          className="task-webhook-dialog"
          hideCloseButton
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            renameInput.current?.focus();
            renameInput.current?.select();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename webhook</DialogTitle>
            <DialogDescription>
              {renameSelection && scopeLabel(renameSelection.scope, trackers)}
              {" · Webhook ID "}
              <code>{renameSelection?.id}</code>
            </DialogDescription>
          </DialogHeader>
          <form
            className="task-webhook-rename"
            autoComplete="off"
            onSubmit={(event) => void rename(event)}
          >
            <label htmlFor={`${sectionId}-rename`}>
              Name <small>optional</small>
            </label>
            <Input
              ref={renameInput}
              id={`${sectionId}-rename`}
              name="name"
              defaultValue={renameSelection?.name ?? ""}
              maxLength={WEBHOOK_NAME_MAX_LENGTH}
              readOnly={locked}
              aria-describedby={`${sectionId}-rename-help`}
            />
            <p id={`${sectionId}-rename-help`}>
              Clear the name to remove it. Do not include URLs or credentials.
            </p>
            {renameFeedback?.error && (
              <p role="alert" data-error>
                {renameFeedback.message}
              </p>
            )}
            <DialogFooter className="task-webhook-rename-actions">
              <Button
                type="button"
                variant="outline"
                aria-disabled={locked}
                onClick={() => {
                  if (!operation.current) setSelection(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" aria-disabled={locked || !healthy}>
                {pending?.kind === "rename" ? "Saving…" : "Save name"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
};
