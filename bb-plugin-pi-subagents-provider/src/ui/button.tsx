import type { ButtonHTMLAttributes } from "react";

// Only the dialog variants used by this plugin. No private BB UI dependencies.
export function Button({
  variant = "default",
  size: _size,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
  size?: "sm";
}) {
  const tone = variant === "default"
    ? "bg-foreground text-background"
    : variant === "outline"
      ? "border border-input bg-transparent text-foreground hover:bg-state-hover"
      : "text-foreground hover:bg-state-hover";
  return <button {...props} className={`inline-flex min-h-9 items-center justify-center rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 ${tone} ${className}`} />;
}
