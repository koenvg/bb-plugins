import { createContext, useContext, useState, type ReactNode } from "react";

export const MAX_DESTINATIONS = 128;
export const MAX_IMAGES = 32;
export const MAX_DESTINATION_URL_LENGTH = 4096;
export type DestinationRequest = Readonly<{ url: string; image: boolean }>;
export const destinationKey = ({ url, image }: DestinationRequest) => JSON.stringify([image, url]);
export type LinkReferences = Readonly<{
  children: ReactNode;
  id?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
}>;
export type DestinationGrant =
  | Readonly<{ kind: "rejected"; reason?: string }>
  | Readonly<{ kind: "fragment"; fragment: string }>
  | Readonly<{ kind: "bound-link"; render: (props: LinkReferences) => ReactNode }>
  | Readonly<{ kind: "image"; url: string; source: "remote" | "source" }>;
export type DestinationPolicy =
  | Readonly<{ kind: "deny" }>
  | Readonly<{ kind: "local-only" }>
  | Readonly<{
      kind: "delegated";
      resolve: (request: DestinationRequest) => DestinationGrant | undefined;
    }>;
export const denyDestinations: DestinationPolicy = Object.freeze({ kind: "deny" });
export const localDestinations: DestinationPolicy = Object.freeze({ kind: "local-only" });
export const DestinationContext = createContext<DestinationPolicy>(denyDestinations);

export function checkedDestination(url: string, image: boolean): boolean {
  if (
    !url ||
    url.length > MAX_DESTINATION_URL_LENGTH ||
    url.trim() !== url ||
    Array.from(url).some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || character === "\\",
    )
  )
    return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    return false;
  }
  if (
    Array.from(decoded).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === "\\",
    ) ||
    /[\ud800-\udfff]/u.test(decoded) ||
    decoded.includes("%")
  )
    return false;
  if (url.startsWith("#")) return !image;
  const remote = /^https?:\/\/[^/?#]+(?:[/?#]|$)/i.test(url);
  if (/^[a-z][a-z\d+.-]*:/i.test(decoded) && !remote) return false;
  if (decoded.startsWith("/") || (!remote && decoded.includes("?"))) return false;
  const path = remote
    ? url.replace(/^https?:\/\/[^/?#]+/i, "").split(/[?#]/, 1)[0]!
    : url.split("#", 1)[0]!;
  if (
    /%2f|%5c/i.test(path) ||
    path
      .split("/")
      .some((part) => part.includes("%") && [".", ".."].includes(decodeURIComponent(part)))
  )
    return false;
  if (!remote) return !decodeURIComponent(path).includes(":");
  try {
    const parsed = new URL(url);
    return (
      !!parsed.hostname &&
      !parsed.username &&
      !parsed.password &&
      (!image || !/\.(svg|html?|pdf|tiff?)$/i.test(parsed.pathname))
    );
  } catch {
    return false;
  }
}

function grant(policy: DestinationPolicy, url: string, image: boolean) {
  if (!checkedDestination(url, image) || policy.kind !== "delegated") return undefined;
  return policy.resolve(Object.freeze({ url, image }));
}

export function DestinationLink({
  url,
  fragmentTarget,
  children,
  ...references
}: LinkReferences & {
  url: string;
  fragmentTarget: (fragment: string) => string | null;
}) {
  const policy = useContext(DestinationContext);
  const result = grant(policy, url, false);
  const fragment =
    policy.kind !== "deny" && checkedDestination(url, false) && url.startsWith("#")
      ? url
      : result?.kind === "fragment"
        ? result.fragment
        : "";
  const target = fragmentTarget(fragment);
  if (target)
    return (
      <a {...references} href={`#${target}`} data-heading-target={target}>
        {children}
      </a>
    );
  if (result?.kind === "bound-link") return result.render({ ...references, children });
  return (
    <span
      {...references}
      className="mr-inert-link"
      title={result?.kind === "rejected" ? result.reason : undefined}
    >
      {children}
    </span>
  );
}

function LoadedImage({
  result,
  alt,
  title,
}: {
  result: Extract<DestinationGrant, { kind: "image" }>;
  alt: string;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className="mr-image-placeholder">
        {alt || "Image"}
        <span className="mr-image-error"> Image unavailable. Refresh to retry.</span>
      </span>
    );
  return (
    <img
      src={result.url}
      alt={alt}
      title={title}
      crossOrigin={result.source === "remote" ? "anonymous" : undefined}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function DestinationImage({
  url,
  alt = "",
  title,
}: {
  url: string;
  alt?: string;
  title?: string;
}) {
  const result = grant(useContext(DestinationContext), url, true);
  let allowed = false;
  if (result?.kind === "image") {
    if (
      result.source === "remote" &&
      checkedDestination(result.url, true) &&
      /^https?:\/\//i.test(result.url) &&
      /^https?:\/\//i.test(url)
    ) {
      const remote = new URL(result.url);
      allowed =
        remote.href === new URL(url).href &&
        (typeof location === "undefined" || remote.origin !== location.origin);
    } else if (
      result.source === "source" &&
      !/^[a-z][a-z\d+.-]*:/i.test(url) &&
      !url.startsWith("/")
    ) {
      allowed = /^\/(?!\/)[^\s\\#]+$/.test(result.url) && !/%(?:2f|5c|25)/i.test(result.url);
    }
  }
  return allowed && result?.kind === "image" ? (
    <LoadedImage key={result.url} result={result} alt={alt} title={title} />
  ) : (
    <span
      className="mr-image-placeholder"
      title={result?.kind === "rejected" ? result.reason : undefined}
    >
      {alt || "Image"}
    </span>
  );
}
