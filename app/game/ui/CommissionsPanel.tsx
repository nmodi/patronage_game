import { Clock, Coins, Crown, Scroll } from "lucide-react";

import { useGameStore } from "~/stores/useGameStore";
import { getSupply } from "~/game/materials";
import { HudPanel } from "./Panel";
import type { Commission } from "~/game/types";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function CommissionThumb({ title }: { title: string }) {
  return (
    <img
      src="/art-placeholder.svg"
      alt={title}
      className="h-14 w-10 shrink-0 rounded-sm border border-wood/50 object-cover shadow-sm shadow-black/20"
    />
  );
}

export function CommissionsPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const commissions = useGameStore((s) => s.commissions);
  const artists = useGameStore((s) => s.artists);
  const tiles = useGameStore((s) => s.map.tiles);
  const tickCount = useGameStore((s) => s.time.tickCount);
  const assignCommission = useGameStore((s) => s.assignCommission);

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
    <HudPanel
      icon={Scroll}
      open={open}
      onToggle={onToggle}
      label="Commissions"
      count={offers.length}
      countClassName="bg-sienna"
      widthClass="w-80"
      header={commissions.length > 0 ? `Commissions (${commissions.length})` : "Commissions"}
      className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto"
    >
        {commissions.length === 0 && (
          <span className="text-sm text-ink-faint">
            No commissions available right now — new offers arrive as your city grows.
          </span>
        )}
        {active.map((c) => {
          const founder = artists.find((a) => a.homeTileKey === c.workshopKey);
          const progress = Math.min(1, (founder?.workProgress ?? 0) / c.durationMonths);
          const remaining = Math.max(0, Math.ceil(c.durationMonths - (founder?.workProgress ?? 0)));
          return (
            <div key={c.id} className="flex items-start gap-2.5">
              <CommissionThumb title={c.title} />
              <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                <span className="font-display text-base font-semibold text-ink">{c.title}</span>
                <span className="flex items-center gap-1 text-sm text-ink-faint">
                  {c.requester} ·
                  <Clock className="h-4 w-4" /> {remaining} mo left
                </span>
                <div className="h-1.5 overflow-hidden rounded-full bg-parchment-deep">
                  <div
                    className="h-full rounded-full bg-sienna"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
        {offers.map((c) => {
          const workshops = eligibleWorkshops(c);
          const monthsLeft = c.expiresTick - tickCount;
          return (
            <div key={c.id} className="flex items-start gap-2.5">
              <CommissionThumb title={c.title} />
              <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                <span className="font-display text-base font-semibold text-ink">{c.title}</span>
                <span className="flex flex-wrap items-center gap-1 text-sm text-ink-faint">
                  {c.requester} ·
                  <Coins className="h-4 w-4 text-prestige-gold" /> {c.florins}ƒ ·
                  <Crown className="h-4 w-4 text-prestige-gold" /> {c.prestige} ·
                  <Clock className="h-4 w-4" /> {c.durationMonths} mo
                </span>
                <span className="text-sm font-semibold text-sienna">
                  Requires: {capitalize(c.artistType)}
                  {monthsLeft < 4 && <span> · expires in {monthsLeft} mo</span>}
                </span>
                {workshops.length > 0 ? (
                  workshops.map(([key, founder]) => (
                    <button
                      key={key}
                      className="rounded bg-sienna px-2 py-1.5 text-sm font-semibold text-parchment transition hover:bg-sienna/85"
                      onClick={() => assignCommission(c.id, key)}
                    >
                      Assign to Bottega di {founder.name}
                    </button>
                  ))
                ) : (
                  <span className="rounded border border-wood/50 bg-parchment-deep px-2 py-1.5 text-center text-sm text-ink-faint shadow-inner">
                    Not assigned — no idle {c.artistType} workshop
                  </span>
                )}
              </div>
            </div>
          );
        })}
    </HudPanel>
  );
}
