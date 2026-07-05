interface MeterBarProps {
  label: string;
  value: number;
  rightLabel?: string;
  colorClassName?: string;
}

export function MeterBar({ label, value, rightLabel, colorClassName = "bg-amber-600" }: MeterBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-stone-600">
        <span className="font-medium">{label}</span>
        {rightLabel && <span>{rightLabel}</span>}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
        <div className={`h-full rounded-full ${colorClassName}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
