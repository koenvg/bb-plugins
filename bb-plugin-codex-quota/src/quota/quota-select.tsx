import type { ComponentProps } from "react";

type Props = ComponentProps<"select"> & { containerClassName?: string };

export function QuotaSelect({ className = "", containerClassName = "w-36", ...props }: Props) {
  return (
    <span className={`relative inline-flex min-w-0 shrink-0 ${containerClassName}`}>
      <select
        {...props}
        className={`h-9 pointer-coarse:h-11 w-full appearance-none rounded-md border border-border bg-background text-ellipsis pl-2 pr-8 py-0 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 ${className}`}
      />
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        aria-hidden="true"
        focusable="false"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}
