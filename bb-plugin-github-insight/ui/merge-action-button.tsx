import type { ComponentProps } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { MERGE_METHOD_LABEL, type MergeMethod, type RunnableMergeAction } from "../core/merge-action";
import type { PrInsight } from "../core/overview";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useMergeAction } from "./use-merge-action";

const BUTTON_CLASS =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-150 hover:duration-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";
const PRIMARY_CLASS = cn(BUTTON_CLASS, "bg-foreground text-background hover:bg-foreground/90");
const OUTLINE_CLASS = cn(BUTTON_CLASS, "border border-input hover:bg-state-hover");

interface MergeActionButtonProps {
  threadId: string;
  pr: PrInsight["pr"];
  action: RunnableMergeAction;
}

export function MergeActionButton({ threadId, pr, action }: MergeActionButtonProps) {
  const { state, run } = useMergeAction(threadId, pr.headOid);
  const running = state.kind === "running";
  const runAction = () => void run({ action: action.kind, expectedHeadOid: pr.headOid });
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {action.kind === "enqueue" ? (
        <ActionButton
          icon="ListEnd"
          label="Enqueue"
          busyLabel="Enqueuing…"
          running={running}
          onClick={runAction}
        />
      ) : (
        <MergeConfirm pr={pr} method={action.method} running={running} confirm={runAction} />
      )}
      {state.kind === "error" && (
        <p role="alert" className="break-words text-xs text-destructive">
          {state.message}
        </p>
      )}
    </div>
  );
}

interface ActionButtonProps extends Omit<ComponentProps<"button">, "children"> {
  icon: IconName;
  label: string;
  busyLabel: string;
  running: boolean;
}

function ActionButton({ icon, label, busyLabel, running, ...rest }: ActionButtonProps) {
  return (
    <button type="button" className={PRIMARY_CLASS} disabled={running} {...rest}>
      <Icon
        name={running ? "Spinner" : icon}
        className={cn("size-4", running && "animate-spin motion-reduce:animate-none")}
      />
      {running ? busyLabel : label}
    </button>
  );
}

interface MergeConfirmProps {
  pr: PrInsight["pr"];
  method: MergeMethod;
  running: boolean;
  confirm: () => void;
}

function MergeConfirm({ pr, method, running, confirm }: MergeConfirmProps) {
  const label = MERGE_METHOD_LABEL[method];
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <ActionButton icon="GitMerge" label={label} busyLabel="Merging…" running={running} />
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border bg-background p-6 shadow-sm">
          <AlertDialog.Title className="text-base font-semibold">
            Merge pull request #{pr.number}?
          </AlertDialog.Title>
          <AlertDialog.Description className="flex flex-col gap-1 text-sm text-muted-foreground">
            <span className="break-words text-foreground">{pr.title}</span>
            <span>Method: {label}</span>
          </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel className={OUTLINE_CLASS}>Cancel</AlertDialog.Cancel>
            <AlertDialog.Action className={PRIMARY_CLASS} onClick={confirm}>
              {label}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
