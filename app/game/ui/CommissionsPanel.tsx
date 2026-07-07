import { useGameStore } from "~/stores/useGameStore";
import { getSupply } from "~/game/materials";
import { Panel } from "./Panel";
import type { Commission } from "~/game/types";

export function CommissionsPanel() {
  const commissions = useGameStore((s) => s.commissions);
  const artists = useGameStore((s) => s.artists);
  const tiles = useGameStore((s) => s.map.tiles);
  const tickCount = useGameStore((s) => s.time.tickCount);
  const assignCommission = useGameStore((s) => s.assignCommission);

  if (commissions.length === 0) return null;

  const supply = getSupply(tiles, artists);
  const active = commissions.filter((c) => c.workshopKey);
  const offers = commissions.filter((c) => !c.workshopKey);

  // Founder = first artist homed at each workshop key, same rule as the sim.
  const founders = new Map<string, (typeof artists)[number]>();
  for (const a of artists) {
    if (!founders.has(a.homeTileKey)) founders.set(a.homeTileKey, a);
  }

  // Eligible workshops for an offer — mirrors the assignCommission guards so
  // the button never no-ops: founder of the right type, idle, workshop staffed,
  // supply not at capacity.
  const eligibleWorkshops = (c: Commission) =>
    [...founders.entries()]
      .filter(([key, founder]) => {
        if (founder.type !== c.artistType || founder.workProgress != null) return false;
        if (!tiles[key]?.isActive) return false;
        const s = supply[founder.type];
        return !(s && s.inUse >= s.capacity);
      })
      .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="pointer-events-none fixed right-4 top-24 z-40 w-64">
      <Panel header={`Commissions (${commissions.length})`} className="flex flex-col gap-3">
        {active.map((c) => {
          const founder = artists.find((a) => a.homeTileKey === c.workshopKey);
          const progress = Math.min(1, (founder?.workProgress ?? 0) / c.durationMonths);
          const remaining = Math.max(0, Math.ceil(c.durationMonths - (founder?.workProgress ?? 0)));
          return (
            <div key={c.id} className="flex flex-col gap-1 leading-tight">
              <span className="font-display text-sm font-semibold text-stone-800">{c.title}</span>
              <span className="text-[10px] text-stone-500">
                {c.requester} · {remaining} mo left
              </span>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-300/70">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
        {offers.map((c) => {
          const workshops = eligibleWorkshops(c);
          const monthsLeft = c.expiresTick - tickCount;
          return (
            <div key={c.id} className="flex flex-col gap-1 leading-tight">
              <span className="font-display text-sm font-semibold text-stone-800">{c.title}</span>
              <span className="text-[10px] text-stone-500">
                {c.requester} · {c.florins} fl · {c.prestige} prestige · {c.durationMonths} mo
                {monthsLeft < 4 && (
                  <span className="text-amber-700"> · expires in {monthsLeft} mo</span>
                )}
              </span>
              {workshops.length > 0 ? (
                workshops.map(([key, founder]) => (
                  <button
                    key={key}
                    className="self-start rounded-full bg-emerald-700 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-emerald-600"
                    onClick={() => assignCommission(c.id, key)}
                  >
                    Assign — Bottega di {founder.name}
                  </button>
                ))
              ) : (
                <span className="text-[10px] text-amber-700">No idle {c.artistType} workshop</span>
              )}
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
