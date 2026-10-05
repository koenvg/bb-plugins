import { useBbNavigate, useComposerView } from "@get-bb/plugin-sdk/app";
import { bannerState } from "../core/banner";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { blockerTone } from "./blocker-tone";
import { MergeActionButton, MergeConfirmation } from "./merge-action-button";
import { useInsight } from "./use-insight";
import { usePaletteMerge } from "./use-palette-merge";
import { usePrPanelNavigation } from "./use-pr-panel-navigation";

const TEXT_BUTTON_CLASS =
  "flex min-h-8 w-full min-w-0 items-center gap-1.5 px-3 py-1.5 text-left text-xs hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring";

export function ComposerBanner() {
  const { scope } = useComposerView();
  if (scope.kind !== "thread") return null;
  return <ThreadBanner key={scope.threadId} threadId={scope.threadId} />;
}

function ThreadBanner({ threadId }: { threadId: string }) {
  usePrPanelNavigation(threadId);
  const insight = useInsight(threadId);
  const palette = usePaletteMerge(threadId, insight);
  const navigate = useBbNavigate();
  const { result } = insight;
  const { state, operation } = palette;
  const running = operation.kind === "running";
  const progress = running ? (operation.action === "enqueue" ? "Enqueuing…" : "Merging…") : null;
  const message =
    state.kind === "message"
      ? state.message
      : operation.kind === "error"
        ? operation.message
        : null;
  const openPrTab = () => navigate.openThreadPanel({ actionId: "pr" });

  function normalBanner() {
    if (state.kind === "preparing") return <BannerStatus text="Loading pull request…" />;
    if (result?.kind !== "ok") return progress ? <BannerStatus text={progress} /> : null;
    const normal = bannerState(result.insight);
    if (progress && normal.kind !== "ready") return <BannerStatus text={progress} />;
    switch (normal.kind) {
      case "hidden":
        return null;
      case "merged":
        return (
          <BannerText
            icon="GitMerge"
            iconClassName="text-violet-700 [.dark_&]:text-violet-300"
            text="Pull request merged"
            onClick={openPrTab}
          />
        );
      case "blockers":
        return (
          <BannerText
            icon="AlertCircle"
            iconClassName={blockerTone(normal.topCode)}
            text={normal.parts.join(" · ")}
            onClick={openPrTab}
          />
        );
      case "queued":
        return (
          <BannerText
            icon="Circle"
            iconClassName="text-muted-foreground"
            text="Queued"
            onClick={openPrTab}
          />
        );
      case "ready":
        return (
          <div className="flex min-w-0 items-center gap-2 pr-1">
            {progress ? (
              <BannerStatus text={progress} />
            ) : (
              <BannerText
                icon="CircleCheck"
                iconClassName="text-success"
                text={normal.action.kind === "enqueue" ? "Ready to enqueue" : "Ready to merge"}
                onClick={openPrTab}
              />
            )}
            <MergeActionButton
              threadId={threadId}
              pr={result.insight.pr}
              action={normal.action}
              size="compact"
              disabled={state.kind === "confirm"}
              showError={false}
            />
          </div>
        );
    }
  }

  return (
    <>
      {normalBanner()}
      {message && (
        <div className="flex min-w-0 items-start gap-2 px-3 py-1.5">
          <p role="alert" className="min-w-0 flex-1 break-words text-xs text-destructive">
            {message}
          </p>
          <button
            type="button"
            aria-label="Dismiss merge message"
            onClick={palette.dismiss}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Icon name="X" aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      )}
      {state.kind === "confirm" && state.target.action.kind === "merge" && (
        <MergeConfirmation
          pr={state.target.pr}
          method={state.target.action.method}
          running={running}
          open
          onOpenChange={(open) => {
            if (!open) palette.dismiss();
          }}
          confirm={palette.confirm}
        />
      )}
    </>
  );
}

function BannerStatus({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="flex min-h-8 w-full min-w-0 items-center gap-1.5 px-3 py-1.5 text-xs"
    >
      <Icon
        name="Spinner"
        aria-hidden="true"
        className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
      />
      <span className="truncate">{text}</span>
    </div>
  );
}

interface BannerTextProps {
  icon: IconName;
  iconClassName: string;
  text: string;
  onClick: () => void;
}

function BannerText({ icon, iconClassName, text, onClick }: BannerTextProps) {
  return (
    <button type="button" className={TEXT_BUTTON_CLASS} onClick={onClick}>
      <Icon name={icon} aria-hidden="true" className={cn("size-3.5 shrink-0", iconClassName)} />
      <span className="truncate">{text}</span>
    </button>
  );
}
