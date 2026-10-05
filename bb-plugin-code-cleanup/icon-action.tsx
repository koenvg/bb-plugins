import { useId, useState, type ButtonHTMLAttributes, type Ref } from "react";
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import { HugeiconsIcon } from "@hugeicons/react";
import FloppyDiskIcon from "@hugeicons/core-free-icons/FloppyDiskIcon";

type IconActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: "Edit" | "Eye" | "Save" | "RotateCcw" | "Info";
  label: string;
  ref?: Ref<HTMLButtonElement>;
};

/** Named icon control with a keyboard-dismissible hover/focus tooltip. */
export function IconAction({ icon, label, ref, ...props }: IconActionProps) {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const showTooltip = (hovered || focused) && !dismissed;
  return <span className="cleanup-icon-action" onMouseEnter={() => { setHovered(true); setDismissed(false); }} onMouseLeave={() => setHovered(false)}>
    <button {...props} ref={ref} type="button" aria-label={label} aria-describedby={showTooltip ? id : undefined}
      onFocus={event => { setFocused(true); setDismissed(false); props.onFocus?.(event); }}
      onBlur={event => { setFocused(false); props.onBlur?.(event); }}
      onKeyDown={event => {
        if (event.key === "Escape" && showTooltip) { setDismissed(true); event.stopPropagation(); }
        props.onKeyDown?.(event);
      }}>
      {icon === "Save"
        ? <HugeiconsIcon icon={FloppyDiskIcon} className="cleanup-icon" aria-hidden="true" data-icon="Save" />
        : <Icon name={icon} className="cleanup-icon" aria-hidden="true" />}
    </button>
    {showTooltip && <span id={id} role="tooltip" className="cleanup-tooltip">{label}</span>}
  </span>;
}
