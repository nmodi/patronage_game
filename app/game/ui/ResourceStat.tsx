import type { LucideIcon } from "lucide-react";

interface ResourceStatProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  iconClassName?: string;
  valueClassName?: string;
}

export function ResourceStat({
  icon: Icon,
  label,
  value,
  iconClassName = "text-prestige-gold",
  valueClassName = "text-ink",
}: ResourceStatProps) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className={`h-6 w-6 ${iconClassName}`} strokeWidth={2} />
      <div className="flex flex-col leading-tight">
        <span className={`text-xl font-semibold ${valueClassName}`}>{value}</span>
        <span className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</span>
      </div>
    </div>
  );
}
