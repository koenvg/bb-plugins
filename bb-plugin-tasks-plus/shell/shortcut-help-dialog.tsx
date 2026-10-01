import { useLayoutEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  keyLabel,
  SHORTCUT_SCOPE_LABELS,
  SHORTCUTS,
  type ShortcutScope,
} from "./shortcuts.js";

const SCOPE_ORDER: readonly ShortcutScope[] = [
  "panel",
  "list",
  "board",
  "detail",
];

export function ShortcutHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement;
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] max-w-md overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Single keys work when you are not typing.
          </DialogDescription>
        </DialogHeader>
        {SCOPE_ORDER.map((scope) => (
          <section key={scope} aria-labelledby={`shortcuts-${scope}`}>
            <h3
              id={`shortcuts-${scope}`}
              className="mb-1 text-xs font-semibold text-muted-foreground"
            >
              {SHORTCUT_SCOPE_LABELS[scope]}
            </h3>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm">
              {SHORTCUTS.filter((shortcut) => shortcut.scope === scope).map(
                (shortcut) => (
                  <div key={shortcut.id} className="contents">
                    <dt>{shortcut.label}</dt>
                    <dd className="flex justify-end gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="min-w-5 rounded border border-border bg-secondary px-1 text-center font-sans text-2xs leading-5 text-muted-foreground"
                        >
                          {keyLabel(key)}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ),
              )}
            </dl>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
