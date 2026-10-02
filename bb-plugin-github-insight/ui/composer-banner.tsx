import { useBbNavigate, useComposerView } from "@get-bb/plugin-sdk/app";
import { bannerState } from "../core/banner";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { blockerTone } from "./blocker-tone";
import { MergeActionButton } from "./merge-action-button";
import { useInsight } from "./use-insight";

const TEXT_BUTTON_CLASS =
  "flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring";

export function ComposerBanner() {
  const { scope } = useComposerView();
  if (scope.kind !== "thread") return null;
  return <ThreadBanner threadId={scope.threadId} />;
}

function ThreadBanner({ threadId }: { threadId: string }) {
  const { result } = useInsight(threadId);
  const navigate = useBbNavigate();
  if (result?.kind !== "ok") return null;
  const { insight } = result;
  const state = bannerState(insight);
  const openPrTab = () => navigate.openThreadPanel({ actionId: "pr" });

  switch (state.kind) {
    case "hidden":
      return null;
    case "blockers":
      return (
        <BannerText
          icon="AlertCircle"
          iconClassName={blockerTone(state.topCode)}
          text={state.parts.join(" · ")}
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
        <div className="flex min-w-0 items-center gap-2 pr-3">
          <BannerText
            icon="CircleCheck"
            iconClassName="text-success"
            text={state.action.kind === "enqueue" ? "Ready to enqueue" : "Ready to merge"}
            onClick={openPrTab}
          />
          <MergeActionButton threadId={threadId} pr={insight.pr} action={state.action} />
        </div>
      );
  }
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
      <Icon name={icon} className={cn("size-4 shrink-0", iconClassName)} />
      <span className="truncate">{text}</span>
    </button>
  );
}
