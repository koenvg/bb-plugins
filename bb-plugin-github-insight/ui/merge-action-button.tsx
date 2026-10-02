import type { ComponentProps } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { MERGE_METHOD_LABEL, type MergeMethod, type RunnableMergeAction } from "../core/merge-action";
import type { PrInsight } from "../core/overview";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useMergeAction } from "./use-merge-action";

type ButtonSize = "default" | "compact";

const BUTTON_CLASS =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-md font-medium transition-colors duration-150 hover:duration-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";
const SIZE_CLASS: Record<ButtonSize, string> = {
  default: "h-8 gap-1.5 px-3 text-sm",
  compact: "h-6 gap-1 px-2 text-xs",
};
const ICON_SIZE_CLASS: Record<ButtonSize, string> = {
  default: "size-4",
  compact: "size-3.5",
};
const PRIMARY_CLASS = cn(BUTTON_CLASS, "bg-foreground text-background hover:bg-foreground/90");
const OUTLINE_CLASS = cn(BUTTON_CLASS, SIZE_CLASS.default, "border border-input hover:bg-state-hover");

interface MergeActionButtonProps {
  threadId: string;
  pr: PrInsight["pr"];
  action: RunnableMergeAction;
  size?: ButtonSize;
}

export function MergeActionButton({ threadId, pr, action, size = "default" }: MergeActionButtonProps) {
  const { state, run } = useMergeAction(threadId, pr.headOid);
  const running = state.kind === "running";
  const runAction = () => void run({ action: action.kind, expectedHeadOid: pr.headOid });
  return (
    <div className="flex min-w-0 shrink-0 flex-col items-start gap-1">
      {action.kind === "enqueue" ? (
        <ActionButton
          icon="ListEnd"
          label="Enqueue"
          busyLabel="Enqueuing…"
          running={running}
          size={size}
          onClick={runAction}
        />
      ) : (
        <MergeConfirm
          pr={pr}
          method={action.method}
          running={running}
          size={size}
          confirm={runAction}
        />
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
  size: ButtonSize;
}

function ActionButton({ icon, label, busyLabel, running, size, ...rest }: ActionButtonProps) {
  return (
    <button
      type="button"
      className={cn(PRIMARY_CLASS, SIZE_CLASS[size])}
      disabled={running}
      {...rest}
    >
      <Icon
        name={running ? "Spinner" : icon}
        className={cn(ICON_SIZE_CLASS[size], running && "animate-spin motion-reduce:animate-none")}
      />
      {running ? busyLabel : label}
    </button>
  );
}

interface MergeConfirmProps {
  pr: PrInsight["pr"];
  method: MergeMethod;
  running: boolean;
  size: ButtonSize;
  confirm: () => void;
}

function MergeConfirm({ pr, method, running, size, confirm }: MergeConfirmProps) {
  const label = MERGE_METHOD_LABEL[method];
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <ActionButton
          icon="GitMerge"
          label={label}
          busyLabel="Merging…"
          running={running}
          size={size}
        />
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
            <AlertDialog.Action className={cn(PRIMARY_CLASS, SIZE_CLASS.default)} onClick={confirm}>
              {label}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
