import type { ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";

import { playSfx } from "~/game/sfx";

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
  /** Horizontal offset for the floating card — override to dodge docked HUD chrome. */
  cardClass?: string;
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
  cardClass = "left-0",
  className = "",
  children,
}: HudPanelProps) {
  return (
    <div className="relative">
      <button
        data-hud="true"
        className={`hud-toggle panel-parchment pointer-events-auto relative h-11 rounded-full text-ink ${
          open ? "is-open ring-2 ring-sienna" : ""
        }`}
        onClick={() => {
          playSfx(open ? "close" : "open");
          onToggle();
        }}
        aria-label={label}
        title={label}
      >
        <Icon className="h-5 w-5 text-sienna" strokeWidth={1.75} />
        <span className="hud-toggle-label" aria-hidden="true">
          <span className="pl-0.5 pr-3.5">{label}</span>
        </span>
        {count != null && count > 0 && (
          <span
            className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-parchment ${countClassName}`}
          >
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className={`absolute top-full mt-2 ${cardClass} ${widthClass}`}>
          <Panel
            header={
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">{header}</span>
                <button
                  className="rounded-full p-1 text-ink-faint transition hover:bg-parchment-deep"
                  onClick={() => {
                    playSfx("close");
                    onToggle();
                  }}
                  aria-label={`Close ${label}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            }
            className={className}
          >
            {children}
          </Panel>
        </div>
      )}
    </div>
  );
}
