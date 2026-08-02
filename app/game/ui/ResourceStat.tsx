import type { ReactNode } from "react";
import { Info, type LucideIcon } from "lucide-react";

interface ResourceStatProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  iconClassName?: string;
  valueClassName?: string;
  /** Hover card anchored below the chip; adds the Info glyph to the label. */
  tooltip?: ReactNode;
}

export function ResourceStat({
  icon: Icon,
  label,
  value,
  iconClassName = "text-prestige-gold",
  valueClassName = "text-ink",
  tooltip,
}: ResourceStatProps) {
  return (
    <div className={`${tooltip ? "group relative " : ""}flex items-center gap-2.5`}>
      <Icon className={`h-6 w-6 ${iconClassName}`} strokeWidth={2} />
      <div className="flex flex-col leading-tight">
        <span className={`text-xl font-semibold ${valueClassName}`}>{value}</span>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-faint">
          {label}
          {tooltip && <Info className="h-3 w-3" />}
        </span>
      </div>
      {tooltip && (
        <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden group-hover:block">
          {tooltip}
        </div>
      )}
    </div>
  );
}
