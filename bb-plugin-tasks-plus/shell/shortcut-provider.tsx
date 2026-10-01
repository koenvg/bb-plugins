import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  SHORTCUTS,
  shortcutMatches,
  shouldIgnoreKey,
  type ShortcutId,
} from "./shortcuts.js";

export type ShortcutHandler = () => boolean | void;

export type ShortcutHandlers = Partial<
  Record<ShortcutId, ShortcutHandler | null>
>;

type HandlersRef = RefObject<ShortcutHandlers>;

const ShortcutRegistryContext = createContext<{
  register(handlers: HandlersRef): () => void;
} | null>(null);

export function ShortcutProvider({
  rootRef,
  children,
}: {
  rootRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const registrations = useRef<HandlersRef[]>([]);
  const registry = useRef({
    register(handlers: HandlersRef) {
      registrations.current = [...registrations.current, handlers];
      return () => {
        registrations.current = registrations.current.filter(
          (entry) => entry !== handlers,
        );
      };
    },
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreKey(event, rootRef.current)) return;
      for (const handlers of registrations.current) {
        for (const shortcut of SHORTCUTS) {
          const handler = handlers.current[shortcut.id];
          if (!handler || !shortcutMatches(shortcut, event)) continue;
          if (handler() === false) continue;
          event.preventDefault();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rootRef]);

  return (
    <ShortcutRegistryContext.Provider value={registry.current}>
      {children}
    </ShortcutRegistryContext.Provider>
  );
}

export function useShortcuts(handlers: ShortcutHandlers): void {
  const registry = useContext(ShortcutRegistryContext);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });
  useEffect(() => registry?.register(handlersRef), [registry]);
}
