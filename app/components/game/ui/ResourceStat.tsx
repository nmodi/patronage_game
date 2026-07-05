import type { LucideIcon } from "lucide-react";

interface ResourceStatProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  delta?: string;
}

export function ResourceStat({ icon: Icon, label, value, delta }: ResourceStatProps) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-6 w-6 text-amber-700" strokeWidth={2} />
      <div className="flex flex-col leading-tight">
        <span className="text-base font-semibold text-stone-800">{value}</span>
        <span className="text-[10px] uppercase tracking-wide text-stone-500">
          {label}
          {delta && <span className="ml-1 normal-case text-emerald-700">{delta}</span>}
        </span>
      </div>
    </div>
  );
}
