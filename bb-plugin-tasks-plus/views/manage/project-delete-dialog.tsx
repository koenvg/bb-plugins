import { useEffect, useId, useRef, useState } from "react";
import type { Project } from "../../shared/contract.js";
import { errorMessage } from "../../shared/errors.js";
import { listAllTasks, useTasksRpc } from "../../shell/data.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import "./project-delete-dialog.css";

export function ProjectDeleteDialog({
  project,
  canDelete,
  pending,
  isLocked,
  onDelete,
  onClose,
}: {
  project: Project;
  canDelete: boolean;
  pending: boolean;
  isLocked: () => boolean;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const rpc = useTasksRpc();
  const inputId = useId();
  const cancel = useRef<HTMLButtonElement | null>(null);
  const submitting = useRef(false);
  const [prefix, setPrefix] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const confirmed = count !== null && prefix === project.prefix && prefix.length > 0;

  useEffect(() => {
    let active = true;
    void listAllTasks(rpc, { projectId: project.id }).then(
      (tasks) => {
        if (active) setCount(tasks.length);
      },
      (error) => {
        if (active) setCountError(errorMessage(error));
      },
    );
    return () => {
      active = false;
    };
  }, [rpc, project.id, attempt]);

  function close() {
    if (!submitting.current && !isLocked()) onClose();
  }

  async function submit() {
    if (!confirmed || !canDelete || submitting.current || isLocked()) return;
    submitting.current = true;
    try {
      await onDelete();
    } catch (error) {
      setDeleteError(errorMessage(error));
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        hideCloseButton
        className="project-delete-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            Delete {project.name} ({project.prefix})?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-2">
              <p className="project-delete-count" role="status">
                {count === null
                  ? countError === null
                    ? "Counting all tasks in this project…"
                    : "Task count unavailable."
                  : `Delete this project and all ${count} ${count === 1 ? "task" : "tasks"}?`}{" "}
                This cannot be undone.
              </p>
              <p>BB workspaces, threads and files remain unchanged.</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        {countError !== null ? (
          <div className="project-delete-count-error">
            <p className="text-sm" role="alert">
              Could not count tasks: {countError}
            </p>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (isLocked()) return;
                setCount(null);
                setCountError(null);
                setAttempt((value) => value + 1);
              }}
            >
              Retry task count
            </Button>
          </div>
        ) : null}
        <div className="project-delete-field">
          <label className="text-sm font-medium" htmlFor={inputId}>
            Type {project.prefix} to confirm
          </label>
          <Input
            id={inputId}
            value={prefix}
            disabled={pending}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              if (!submitting.current && !isLocked()) setPrefix(event.target.value);
            }}
          />
        </div>
        {deleteError !== null ? (
          <p
            className="project-delete-error text-sm"
            role={pending ? undefined : "alert"}
            aria-hidden={pending}
          >
            Could not delete {project.prefix}: {deleteError}. Try again.
          </p>
        ) : null}
        <DialogFooter className="project-delete-actions sm:space-x-0">
          <Button ref={cancel} autoFocus variant="outline" disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="project-delete-submit"
            disabled={!confirmed || !canDelete || pending}
            aria-busy={pending}
            onClick={() => {
              void submit();
            }}
          >
            {pending ? "Deleting…" : "Delete project and tasks"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
