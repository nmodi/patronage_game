import type { ReactNode } from "react";

interface PanelProps {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ header, children, className = "" }: PanelProps) {
  return (
    <div
      data-hud="true"
      className="pointer-events-auto rounded-2xl border border-stone-300/60 bg-stone-50/95 shadow-lg shadow-black/20 backdrop-blur"
    >
      {header && (
        <div className="border-b border-stone-300/60 px-4 py-2 font-display text-xs font-semibold uppercase tracking-wide text-stone-600">
          {header}
        </div>
      )}
      <div className={`px-4 py-3 ${className}`}>{children}</div>
    </div>
  );
}
