import { ULID_PATTERN } from "../shared/contract.js";

export type BrowseScope =
  | { kind: "all" }
  | { kind: "project"; projectId: string };
const VERSION = 1;
type StorageAccess = () => Pick<Storage, "getItem" | "setItem">;

function parseScope(value: unknown): BrowseScope | null {
  if (value === null || typeof value !== "object") return null;
  const scope = value as Record<string, unknown>;
  if (scope.kind === "all") return { kind: "all" };
  if (
    scope.kind === "project" &&
    typeof scope.projectId === "string" &&
    ULID_PATTERN.test(scope.projectId)
  ) {
    return { kind: "project", projectId: scope.projectId };
  }
  return null;
}

function parseDocument(raw: string | null): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Keep session choices when storage is blocked or belongs to a newer client.
 * Re-read on entry so a later choice in another tab wins over this cache. */
export function createBrowsePreference(key: string, storage: StorageAccess) {
  let lastRaw: string | null | undefined;
  let sessionScope: BrowseScope | null = null;
  return {
    load(): BrowseScope | null {
      try {
        const raw = storage().getItem(key);
        if (raw !== lastRaw) {
          lastRaw = raw;
          const document = parseDocument(raw);
          sessionScope =
            document?.version === VERSION ? parseScope(document.scope) : null;
        }
      } catch {}
      return sessionScope;
    },
    store(scope: BrowseScope): void {
      try {
        const target = storage();
        lastRaw = target.getItem(key);
        const version = parseDocument(lastRaw)?.version;
        if (!(typeof version === "number" && version > VERSION)) {
          const raw = JSON.stringify({ version: VERSION, scope });
          target.setItem(key, raw);
          lastRaw = raw;
        }
      } catch {}
      sessionScope = scope;
    },
  };
}

// The pinned SDK has no plugin-id hook. Namespace with this package's plugin id,
// not a BB project id. Keep one session fallback across panel mounts.
export const BROWSE_PREFERENCE_STORAGE_KEY = "tasks-plus:browse-preference";
let preference = createBrowsePreference(
  BROWSE_PREFERENCE_STORAGE_KEY,
  () => window.localStorage,
);
export function browsePreference() {
  return preference;
}

export function resetBrowsePreferenceStateForTest(): void {
  preference = createBrowsePreference(
    BROWSE_PREFERENCE_STORAGE_KEY,
    () => window.localStorage,
  );
}
