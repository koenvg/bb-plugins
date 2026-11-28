import { useLayoutEffect, useRef } from "react";
import type { ReviewVerdict, ViewerReview } from "../core/pr-head";
import { RelativeAge } from "./relative-age";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export const VERDICTS: Record<
  ReviewVerdict,
  { text: string; icon: IconName; iconClass: string; pillClass: string }
> = {
  APPROVED: {
    text: "You approved",
    icon: "CircleCheck",
    iconClass: "text-success",
    pillClass: "bg-success/10",
  },
  CHANGES_REQUESTED: {
    text: "You requested changes",
    icon: "CircleX",
    iconClass: "text-destructive",
    pillClass: "bg-destructive/10",
  },
  COMMENTED: {
    text: "You commented",
    icon: "MessageSquare",
    iconClass: "text-muted-foreground",
    pillClass: "bg-muted",
  },
  DISMISSED: {
    text: "Your review was dismissed",
    icon: "Unavailable",
    iconClass: "text-muted-foreground",
    pillClass: "bg-muted",
  },
};

export const ViewerReviewBadge = ({
  review,
  headOid,
}: {
  review: ViewerReview | null;
  headOid: string;
}) => {
  const submitted = review?.submittedAt;
  const reviewOnMount = useRef(submitted);
  const badge = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    badge.current?.toggleAttribute("data-new-review", submitted !== reviewOnMount.current);
  }, [submitted]);
  if (review === null) return null;

  const verdict = VERDICTS[review.state];
  const submittedAt = new Date(review.submittedAt);
  const newCommits = review.commitOid !== null && review.commitOid !== headOid;
  return (
    <span
      key={review.submittedAt}
      ref={badge}
      title={submittedAt.toLocaleString()}
      className={cn(
        "group/viewer-review inline-flex h-5 min-w-0 items-center gap-1 rounded-full pl-1.5 pr-2 text-foreground",
        "data-[new-review]:duration-500 data-[new-review]:ease-[cubic-bezier(0.16,1,0.3,1)] data-[new-review]:animate-in data-[new-review]:fade-in data-[new-review]:zoom-in-90 motion-reduce:data-[new-review]:zoom-in-100",
        verdict.pillClass,
      )}
    >
      <Icon
        name={verdict.icon}
        className={cn(
          "size-3.5 shrink-0",
          verdict.iconClass,
          "group-data-[new-review]/viewer-review:duration-500 group-data-[new-review]/viewer-review:[animation-delay:150ms] group-data-[new-review]/viewer-review:ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[new-review]/viewer-review:fill-mode-both group-data-[new-review]/viewer-review:animate-in group-data-[new-review]/viewer-review:fade-in group-data-[new-review]/viewer-review:zoom-in-150 group-data-[new-review]/viewer-review:spin-in-[-45deg] motion-reduce:group-data-[new-review]/viewer-review:animate-none",
        )}
      />
      <span className="truncate font-medium">{verdict.text}</span>
      <RelativeAge date={submittedAt} className="shrink-0 text-muted-foreground" />
      {newCommits && (
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-attention" />
          new commits since
        </span>
      )}
    </span>
  );
};
