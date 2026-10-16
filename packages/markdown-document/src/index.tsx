import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { boundedCode } from "./code.js";
import { denyDestinations, type Destination, type DestinationPolicy } from "./destinations.js";
import { renderedDocument, type DocumentData, type RenderedDocument } from "./rendered-document.js";
import { RemoteImage, RemoteImages } from "./remote-images.js";

export { denyDestinations } from "./destinations.js";
export type { DestinationPolicy, SourceDestination } from "./destinations.js";
export type DocumentView = "preview" | "raw";
export type MarkdownDocumentProps = Readonly<{
  text: string;
  view: DocumentView;
  namespace: string;
  destinations?: DestinationPolicy;
  outline?: boolean;
}>;
type Scope = {
  policy: DestinationPolicy;
  outline: boolean;
  resources: RemoteImages;
  targets: Map<string, HTMLElement>;
  document: RenderedDocument;
};
const ScopeContext = createContext<Scope | null>(null);
function useScope(): Scope {
  const scope = useContext(ScopeContext);
  if (!scope) throw new Error("Missing document scope");
  return scope;
}
function data(node: ExtraProps["node"]): DocumentData {
  return node?.data || {};
}
function activateLocal(scope: Scope, id: string) {
  const target = scope.targets.get(id);
  if (!target) return;
  target.focus({ preventScroll: true });
  const scroller = target.closest(".md-document")?.parentElement;
  if (!scroller) return;
  let container: HTMLElement | null = scroller;
  while (container && container !== document.body) {
    if (/(auto|scroll)/.test(getComputedStyle(container).overflowY)) {
      container.scrollTop +=
        target.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
      return;
    }
    container = container.parentElement;
  }
}
function localHandlers(scope: Scope, id: string) {
  const activate = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (event.type !== "auxclick" || event.button === 1) activateLocal(scope, id);
  };
  return { onClick: activate, onAuxClick: activate };
}
function DocumentLink({
  node,
  children,
  id,
  ...attributes
}: React.ComponentProps<"a"> & ExtraProps) {
  const scope = useScope();
  const [failed, setFailed] = useState(false);
  const parsed: Destination = data(node).destination || { kind: "denied" };
  const target =
    parsed.kind === "fragment" ? scope.document.fragments.get(parsed.fragment) : undefined;
  const ref = (element: HTMLAnchorElement | null) => {
    if (id && element) scope.targets.set(id, element);
    else if (id) scope.targets.delete(id);
  };
  if (target)
    return (
      <a {...attributes} id={id} ref={ref} href={`#${target}`} {...localHandlers(scope, target)}>
        {children}
      </a>
    );
  const open =
    parsed.kind === "external" && scope.policy.kind !== "deny"
      ? scope.policy.openExternal
      : undefined;
  const source =
    parsed.kind === "source" && scope.policy.kind === "bound-source"
      ? scope.policy.activateSource
      : undefined;
  if ((!open || parsed.kind !== "external") && (!source || parsed.kind !== "source"))
    return <span id={id}>{children}</span>;
  const activate = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      parsed.kind === "external" &&
      (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
    )
      return;
    event.preventDefault();
    try {
      const result =
        parsed.kind === "external"
          ? await open!(parsed.url)
          : parsed.kind === "source"
            ? await source!(parsed.destination)
            : false;
      setFailed(!result);
    } catch {
      setFailed(true);
    }
  };
  return (
    <>
      <a
        {...attributes}
        id={id}
        ref={ref}
        href={parsed.kind === "external" ? parsed.url : undefined}
        role={parsed.kind === "source" ? "link" : undefined}
        tabIndex={parsed.kind === "source" ? 0 : undefined}
        onClick={activate}
        onAuxClick={parsed.kind === "source" ? activate : undefined}
        onKeyDown={(event) => {
          if (parsed.kind === "source" && event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.click();
          }
        }}
      >
        {children}
      </a>
      {failed ? <span role="status">Link could not be opened.</span> : null}
    </>
  );
}
function DocumentImage({ node, alt }: React.ComponentProps<"img"> & ExtraProps) {
  const scope = useScope();
  const parsed = data(node).destination;
  if (scope.policy.kind !== "deny" && scope.policy.remoteImages && parsed?.kind === "external")
    return (
      <RemoteImage
        key={parsed.url}
        url={parsed.url}
        alt={alt || "Image"}
        resources={scope.resources}
      />
    );
  return (
    <span role="img" aria-label={alt || "Image"}>
      {alt || "Image"}
    </span>
  );
}
function OwnedTarget({ node, children, ...props }: React.HTMLAttributes<HTMLElement> & ExtraProps) {
  const scope = useScope();
  const id = props.id;
  return createElement(
    node!.tagName,
    {
      ...props,
      tabIndex: id ? -1 : undefined,
      ref: (element: HTMLElement | null) => {
        if (id && element) scope.targets.set(id, element);
        else if (id) scope.targets.delete(id);
      },
    },
    children,
  );
}
function Content({ node, children }: { children?: ReactNode } & ExtraProps) {
  const inherited = useScope();
  const model = data(node).document;
  if (!model) return <div>{children}</div>;
  const scope = { ...inherited, document: model };
  return (
    <ScopeContext.Provider value={scope}>
      {scope.outline &&
      scope.policy.kind !== "deny" &&
      scope.policy.localFragments &&
      model.headings.length ? (
        <nav className="md-document-outline" aria-label="Document outline">
          <details>
            <summary>On this page</summary>
            <ol>
              {model.headings.map((heading) => (
                <li key={heading.id} data-level={heading.level}>
                  <a href={`#${heading.id}`} {...localHandlers(scope, heading.id)}>
                    {heading.label}
                  </a>
                </li>
              ))}
            </ol>
          </details>
        </nav>
      ) : null}
      <article className="md-document-prose">{children}</article>
    </ScopeContext.Provider>
  );
}
const components: Components = {
  div: Content,
  a: DocumentLink,
  img: DocumentImage,
  h1: OwnedTarget,
  h2: OwnedTarget,
  h3: OwnedTarget,
  h4: OwnedTarget,
  h5: OwnedTarget,
  h6: OwnedTarget,
  li: OwnedTarget,
  table: ({ children }) => (
    <div className="md-document-table" tabIndex={0} role="region" aria-label="Table">
      <table>{children}</table>
    </div>
  ),
  pre: ({ children }) => <pre tabIndex={0}>{children}</pre>,
};
function Preview({
  text,
  destinations = denyDestinations,
  outline = true,
  prefix,
}: MarkdownDocumentProps & { prefix: string }) {
  const targets = useRef(new Map<string, HTMLElement>());
  const imagePermission = destinations.kind !== "deny" && destinations.remoteImages === true;
  const resources = useMemo(() => new RemoteImages(), [text, imagePermission]);
  useEffect(() => () => resources.dispose(), [resources]);
  const scope = {
    policy: destinations,
    outline,
    resources,
    targets: targets.current,
    document: { headings: [], fragments: new Map() },
  };
  return (
    <ScopeContext.Provider value={scope}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[boundedCode, [renderedDocument, { prefix, policy: destinations }]]}
        skipHtml
        components={components}
      >
        {text}
      </Markdown>
    </ScopeContext.Provider>
  );
}
export function MarkdownDocument(props: MarkdownDocumentProps): ReactElement {
  const identity = useId();
  const prefix = `md-${encodeURIComponent(props.namespace)}-${identity}`;
  return (
    <div className="md-document" data-document-namespace={props.namespace}>
      {props.view === "raw" ? (
        <pre className="md-document-raw" aria-label="Raw source" tabIndex={0}>
          {props.text}
        </pre>
      ) : (
        <Preview {...props} prefix={prefix} />
      )}
    </div>
  );
}
