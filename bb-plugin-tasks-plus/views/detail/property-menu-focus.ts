import { useCallback, useRef } from "react";
import { isLastInputKeyboard } from "@/components/ui/overlay-trigger";

export function usePropertyMenuFocus(open: boolean) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusFrame = useRef<number | null>(null);
  const contentRef = useCallback(
    (content: HTMLDivElement | null) => {
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
      focusFrame.current = null;
      if (content && open && isLastInputKeyboard()) {
        focusFrame.current = requestAnimationFrame(() => {
          focusFrame.current = null;
          content
            .querySelector<HTMLElement>('input, [role="menuitem"], [role="combobox"]')
            ?.focus();
        });
      }
    },
    [open],
  );
  const onOpenAutoFocus = (event: Event) => {
    if (isLastInputKeyboard()) event.preventDefault();
  };
  const onCloseAutoFocus = (event: Event) => {
    if (!isLastInputKeyboard()) return;
    event.preventDefault();
    const trigger = triggerRef.current;
    if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus();
  };
  return { triggerRef, contentRef, onOpenAutoFocus, onCloseAutoFocus };
}
