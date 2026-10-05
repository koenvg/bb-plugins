import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { experimental_FileLink as FileLink, UrlLink } from "@get-bb/plugin-sdk/app";
import type { TextSnapshot } from "./source";
import {
  destinationKey,
  type Destination,
  type DestinationRequest,
  type DestinationResult,
} from "./destination-types";

export type ResolveDocumentDestinations = (
  target: TextSnapshot["target"],
  requests: DestinationRequest[],
) => Promise<DestinationResult>;
const Context = createContext<ReadonlyMap<string, Destination>>(new Map());

/** One resolution/lease per loaded snapshot. View changes do not allocate transport. */
export function DestinationProvider({
  snapshot,
  requests,
  resolve,
  enabled,
  children,
}: {
  snapshot: TextSnapshot | null;
  requests: DestinationRequest[];
  resolve?: ResolveDocumentDestinations;
  enabled: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<{
    snapshot: TextSnapshot;
    results: Map<string, Destination>;
  } | null>(null);
  useEffect(() => {
    if (!snapshot || !resolve || !requests.length || !enabled) return;
    let current = true;
    void resolve(snapshot.target, requests).then(
      (result) => {
        if (!current) return;
        const identity = result.identity;
        if (
          !identity ||
          identity.hostId !== snapshot.hostId ||
          identity.rootPath !== snapshot.rootPath ||
          identity.documentPath !== snapshot.documentPath
        )
          return;
        setState({
          snapshot,
          results: new Map(
            requests.map((request, i) => [
              destinationKey(request),
              result.destinations[i] ?? { kind: "rejected", reason: "Destination unavailable." },
            ]),
          ),
        });
      },
      () => {
        /* Readable links/alt text remain inert. Refresh retries the source. */
      },
    );
    // The SDK has no lease revocation. Drop references and let its bounded TTL expire.
    return () => {
      current = false;
    };
  }, [snapshot, requests, resolve, enabled]);
  return (
    <Context.Provider value={enabled && state?.snapshot === snapshot ? state.results : new Map()}>
      {children}
    </Context.Provider>
  );
}

export function DestinationLink({
  url,
  fragmentTarget,
  children,
  ...references
}: {
  url: string;
  fragmentTarget: (fragment: string) => string | null;
  children: ReactNode;
  id?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
}) {
  const result = useContext(Context).get(destinationKey({ url, image: false }));
  const fragment = url.startsWith("#") ? url : result?.kind === "fragment" ? result.fragment : "";
  const target = fragmentTarget(fragment);
  if (target)
    return (
      <a {...references} href={`#${target}`} data-heading-target={target}>
        {children}
      </a>
    );
  if (result?.kind === "external-url")
    return (
      <UrlLink {...references} href={result.url}>
        {children}
      </UrlLink>
    );
  if (result?.kind === "local-file")
    return (
      <FileLink {...references} target={result.target} data-source-host={result.hostId}>
        {children}
      </FileLink>
    );
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
  destination,
  alt,
  title,
}: {
  destination: Extract<Destination, { kind: "image" }>;
  alt: string;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!destination.expiresAtMs) return;
    const remaining = destination.expiresAtMs - Date.now();
    if (remaining <= 0) {
      setFailed(true);
      return;
    }
    const timer = setTimeout(() => setFailed(true), remaining);
    return () => clearTimeout(timer);
  }, [destination.expiresAtMs]);
  if (failed || (destination.expiresAtMs != null && destination.expiresAtMs <= Date.now()))
    return (
      <span className="mr-image-placeholder">
        {alt || "Image"}
        <span className="mr-image-error"> Image unavailable. Refresh to retry.</span>
      </span>
    );
  return (
    <img
      src={destination.url}
      alt={alt}
      title={title}
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
  const result = useContext(Context).get(destinationKey({ url, image: true }));
  return result?.kind === "image" ? (
    <LoadedImage key={result.url} destination={result} alt={alt} title={title} />
  ) : (
    <span
      className="mr-image-placeholder"
      title={result?.kind === "rejected" ? result.reason : undefined}
    >
      {alt || "Image"}
    </span>
  );
}
