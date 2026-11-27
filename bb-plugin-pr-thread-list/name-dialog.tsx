import { useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FOCUS_RING } from "./action-menu";

export interface NameRequest {
  title: string;
  initialName: string;
  action: "Create" | "Rename";
  save: (name: string) => Promise<unknown>;
  failure: string;
}

export const NameDialog = ({
  request,
  onDismiss,
}: {
  request: NameRequest;
  onDismiss: () => void;
}) => {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(request.initialName);
  const name = draft.trim();

  useLayoutEffect(() => {
    dialog.current?.showModal();
    input.current?.select();
  }, []);

  function dismiss() {
    dialog.current?.close();
    onDismiss();
  }

  async function save() {
    if (!name) return;
    dismiss();
    try {
      await request.save(name);
    } catch {
      toast.error(request.failure);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-sm backdrop:bg-foreground/25"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h2 id={titleId} className="font-semibold">
          {request.title}
        </h2>
        <label className="flex flex-col gap-1.5">
          Name
          <input
            ref={input}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            className={`h-9 rounded-md border border-input bg-transparent px-3 ${FOCUS_RING}`}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className={`h-9 rounded-md border border-input px-3 hover:bg-accent ${FOCUS_RING}`}
            onClick={dismiss}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name}
            className={`h-9 rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-50 ${FOCUS_RING}`}
          >
            {request.action}
          </button>
        </div>
      </form>
    </dialog>
  );
};
