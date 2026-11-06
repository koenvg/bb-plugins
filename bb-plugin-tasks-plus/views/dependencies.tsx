import { useCallback, useRef, useState, type ReactNode } from "react";
import type { Task, TaskDependencyRef } from "../shared/contract.js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function isOpenRef(ref: TaskDependencyRef): boolean {
  return ref.status !== "done" && ref.status !== "canceled";
}

export function openBlockers(task: Task): TaskDependencyRef[] {
  return (task.blockedBy ?? []).filter(isOpenRef);
}

export function DependencyBadges({ task, className }: { task: Task; className?: string }) {
  const blockers = openBlockers(task);
  const blockedBy =
    blockers.length > 0 ? `${blockers.length} task${blockers.length === 1 ? "" : "s"}` : null;
  const blocks = task.openBlockedCount ?? 0;
  if (!blockedBy && blocks === 0) return null;
  const chip = cn(
    "flex min-w-0 max-w-full items-center gap-1 rounded-md border px-1.5 whitespace-normal tabular-nums",
    className,
  );
  return (
    <>
      {blockedBy ? (
        <span
          title={blockers.map((ref) => `${ref.key} (${ref.status})`).join(", ")}
          className={cn(chip, "border-warning/40 text-warning")}
        >
          <Icon name="Lock" className="size-3 shrink-0" />
          Blocked by {blockedBy}
        </span>
      ) : null}
      {blocks > 0 ? (
        <span className={cn(chip, "border-border text-muted-foreground")}>
          <Icon name="CornerDownRight" className="size-3 shrink-0" />
          Blocks {blocks} {blocks === 1 ? "task" : "tasks"}
        </span>
      ) : null}
    </>
  );
}

export function useBlockedWorkConfirm(): {
  confirmBlockedWork: (task: Task) => Promise<boolean>;
  blockedWorkDialog: ReactNode;
} {
  const [pending, setPending] = useState<{
    task: Task;
    blockers: TaskDependencyRef[];
  } | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setPending(null);
  }, []);

  const confirmBlockedWork = useCallback((task: Task) => {
    const blockers = openBlockers(task);
    if (blockers.length === 0) return Promise.resolve(true);
    resolveRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPending({ task, blockers });
    });
  }, []);

  const blockedWorkDialog = (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {pending ? `${pending.task.key} is blocked` : "Task is blocked"}
          </DialogTitle>
          <DialogDescription>These tasks are not done yet:</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-0.5 text-sm">
          {(pending?.blockers ?? []).map((ref) => (
            <li key={ref.id} data-blocker-key={ref.key}>
              {ref.key} · {ref.title} ({ref.status})
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => settle(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => settle(true)}>
            Start anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirmBlockedWork, blockedWorkDialog };
}
