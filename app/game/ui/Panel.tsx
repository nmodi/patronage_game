import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface PanelProps {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Outer frame classes — override to dock the panel to a screen edge. */
  frameClassName?: string;
}

export function Panel({ header, children, className = "", frameClassName = "rounded-lg" }: PanelProps) {
  return (
    <div
      data-hud="true"
      className={`panel-parchment pointer-events-auto text-ink ${frameClassName}`}
    >
      {header && (
        <div className="mx-2 border-b border-wood/50 px-2 py-2 font-display text-sm font-semibold tracking-wider text-ink [font-variant-caps:small-caps]">
          {header}
        </div>
      )}
      <div className={`px-4 py-3 ${className}`}>{children}</div>
    </div>
  );
}

interface HudPanelProps {
  icon: LucideIcon;
  label: string;
  header: ReactNode;
  /** Controlled by the HUD so only one panel is open at a time. */
  open: boolean;
  onToggle: () => void;
  count?: number;
  /** Badge background — defaults to ink; pass bg-sienna for attention counts. */
  countClassName?: string;
  widthClass?: string;
  className?: string;
  children: ReactNode;
}

/** Circular HUD button (Civ-style) that toggles a floating card below it. */
export function HudPanel({
  icon: Icon,
  label,
  header,
  open,
  onToggle,
  count,
  countClassName = "bg-ink",
  widthClass = "w-72",
  className = "",
  children,
}: HudPanelProps) {
  return (
    <div className="relative">
      <button
        data-hud="true"
        className={`panel-parchment pointer-events-auto relative flex h-11 w-11 items-center justify-center rounded-full text-ink transition ${
          open ? "ring-2 ring-sienna" : ""
        }`}
        onClick={onToggle}
        aria-label={label}
        title={label}
      >
        <Icon className="h-5 w-5 text-sienna" strokeWidth={1.75} />
        {count != null && count > 0 && (
          <span
            className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-parchment ${countClassName}`}
          >
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className={`absolute left-0 top-full mt-2 ${widthClass}`}>
          <Panel header={header} className={className}>
            {children}
          </Panel>
        </div>
      )}
    </div>
  );
}
