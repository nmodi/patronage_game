import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, type LucideIcon } from "lucide-react";
import type { IconComponent } from "./gameIcons";

import { playSfx } from "~/game/audio/sfx";

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

/** Round icon button for panel headers — close (default X) or back (ArrowLeft). */
export function CloseButton({
  onClick,
  label,
  icon: Icon = X,
}: {
  onClick: () => void;
  label: string;
  icon?: LucideIcon;
}) {
  return (
    <button
      className="rounded-full p-1 text-ink-faint transition hover:bg-parchment-deep hover:text-ink"
      onClick={onClick}
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** Label/value baseline row inside stat cards. */
export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-faint">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}

/** Fullscreen dimmed modal backdrop, portaled to body so it escapes any panel
 * stacking context. Click-outside dismisses only when onDismiss is given
 * (RenaissanceCard passes none — a once-per-game moment gets a deliberate
 * click). */
export function ModalBackdrop({
  onDismiss,
  children,
}: {
  onDismiss?: () => void;
  children: ReactNode;
}) {
  return createPortal(
    <div
      data-hud="true"
      className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      onClick={onDismiss}
    >
      {children}
    </div>,
    document.body
  );
}

/** The circular HUD toggle (Civ-style) with slide-out label and count badge.
 * Sfx stays with the caller — open/close semantics differ per host. */
export function HudToggleButton({
  icon: Icon,
  label,
  open = false,
  onClick,
  count,
  countClassName = "bg-ink",
}: {
  icon: IconComponent;
  label: string;
  open?: boolean;
  onClick: () => void;
  count?: number;
  countClassName?: string;
}) {
  return (
    <button
      data-hud="true"
      className={`hud-toggle panel-parchment theme-navy pointer-events-auto relative h-11 rounded-full text-ink ${
        open ? "is-open ring-2 ring-sienna" : ""
      }`}
      onClick={onClick}
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
  );
}

interface HudPanelProps {
  icon: IconComponent;
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
  icon,
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
      <HudToggleButton
        icon={icon}
        label={label}
        open={open}
        count={count}
        countClassName={countClassName}
        onClick={() => {
          playSfx(open ? "close" : "open");
          onToggle();
        }}
      />
      {open && (
        <div className={`absolute top-full mt-2 ${cardClass} ${widthClass}`}>
          <Panel
            header={
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">{header}</span>
                <CloseButton
                  label={`Close ${label}`}
                  onClick={() => {
                    playSfx("close");
                    onToggle();
                  }}
                />
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
