import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
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

/** Mounted split panes must not claim each other's existing action keys. */
interface ShortcutFocusOwner {
  rootRef: RefObject<HTMLElement | null>;
  allowUnfocused?: boolean;
}
const ShortcutOwnerContext = createContext<ShortcutFocusOwner | null>(null);
export const ShortcutOwner = ShortcutOwnerContext.Provider;
type HandlersRef = RefObject<{
  handlers: ShortcutHandlers;
  owner: ShortcutFocusOwner | null;
}>;

const ShortcutRegistryContext = createContext<{
  register(handlers: HandlersRef): () => void;
  registerScope(root: RefObject<HTMLElement | null>): () => void;
} | null>(null);

export function ShortcutProvider({
  rootRef,
  children,
}: {
  rootRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const registrations = useRef<HandlersRef[]>([]);
  const scopes = useRef<RefObject<HTMLElement | null>[]>([]);
  const registry = useRef({
    registerScope(root: RefObject<HTMLElement | null>) {
      scopes.current = [...scopes.current, root];
      return () => {
        scopes.current = scopes.current.filter((entry) => entry !== root);
      };
    },
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
      const roots = [
        rootRef.current,
        ...scopes.current.map((ref) => ref.current),
      ].filter((root): root is HTMLElement =>
        Boolean(root?.isConnected && !root.closest("[hidden], [inert]")),
      );
      if (roots.every((root) => shouldIgnoreKey(event, root))) return;
      for (const handlers of registrations.current) {
        const owner = handlers.current.owner;
        if (owner) {
          const root = owner.rootRef.current;
          const unfocused = document.activeElement === document.body;
          if (
            !root ||
            root.closest("[hidden], [inert]") ||
            !(
              root.contains(document.activeElement) ||
              (owner.allowUnfocused && unfocused)
            )
          )
            continue;
        }
        for (const shortcut of SHORTCUTS) {
          const handler = handlers.current.handlers[shortcut.id];
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

/** Include plugin-owned portal content without claiming the host's other tabs. */
export function useShortcutScope(root: RefObject<HTMLElement | null>): void {
  const registry = useContext(ShortcutRegistryContext);
  useLayoutEffect(() => registry?.registerScope(root), [registry, root]);
}
export function useShortcuts(handlers: ShortcutHandlers): void {
  const registry = useContext(ShortcutRegistryContext);
  const owner = useContext(ShortcutOwnerContext);
  const handlersRef = useRef({ handlers, owner });
  useEffect(() => {
    handlersRef.current = { handlers, owner };
  });
  useEffect(() => registry?.register(handlersRef), [registry]);
}
