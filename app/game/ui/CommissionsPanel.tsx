import { Clock, Coins, Crown, Scroll } from "lucide-react";

import { useGameStore } from "~/stores/useGameStore";
import { commissionMaterial, getSupply } from "~/game/materials";
import { canAssignCommission, requesterPool } from "~/game/commissions";
import { HudPanel } from "./Panel";
import type { Commission } from "~/game/types";
import { ArtworkThumbnail } from "./ArtworkThumbnail";
import { capitalizeLabel, ordinal } from "./format";

export function CommissionsPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const commissions = useGameStore((s) => s.commissions);
  const artists = useGameStore((s) => s.artists);
  const artworks = useGameStore((s) => s.artworks);
  const tiles = useGameStore((s) => s.map.tiles);
  const tickCount = useGameStore((s) => s.time.tickCount);
  const assignCommission = useGameStore((s) => s.assignCommission);
  const declineCommission = useGameStore((s) => s.declineCommission);

  const supply = getSupply(tiles, artists, commissions);
  const active = commissions.filter((c) => c.workshopKey);
  const offers = commissions.filter((c) => !c.workshopKey);

  // "— Nth work" flavor beside the requester: cumulative works, decoupled from
  // the favor meter; shown once there's at least one prior work.
  const worksBy = new Map<string, number>();
  for (const w of artworks) {
    if (w.requester) worksBy.set(w.requester, (worksBy.get(w.requester) ?? 0) + 1);
  }
  const nthWork = (requester: string) => {
    const prior = worksBy.get(requester) ?? 0;
    return prior >= 1 ? ` — ${ordinal(prior + 1)} work` : "";
  };

  // Founder = first artist homed at each workshop key, same rule as the sim.
  const founders = new Map<string, (typeof artists)[number]>();
  for (const a of artists) {
    if (!founders.has(a.homeTileKey)) founders.set(a.homeTileKey, a);
  }

  // Eligible workshops for an offer — mirrors the assignCommission guards so
  // the button never no-ops: founder of the right type, idle, workshop staffed,
  // supply not at capacity.
  const eligibleWorkshops = (c: Commission) => {
    const material = commissionMaterial(c);
    const materialSupply = material ? supply[material] : undefined;
    return [...founders.entries()]
      .filter(([, founder]) => canAssignCommission(c, founder, tiles, materialSupply))
      .sort(([a], [b]) => a.localeCompare(b));
  };

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
            {requesterPool(tiles).length === 0
              ? "Build a Chapel — the Church will bring commissions."
              : "No commissions available right now — new offers arrive as your city grows."}
          </span>
        )}
        {active.map((c) => {
          const founder = artists.find((a) => a.homeTileKey === c.workshopKey);
          const progress = Math.min(1, (founder?.workProgress ?? 0) / c.durationMonths);
          const remaining = Math.max(0, Math.ceil(c.durationMonths - (founder?.workProgress ?? 0)));
          return (
            <div key={c.id} className="flex items-start gap-2.5">
              <ArtworkThumbnail title={c.title} variant="offer" />
              <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                <span className="font-display text-base font-semibold text-ink">{c.title}</span>
                <span className="flex items-center gap-1 text-sm text-ink-faint">
                  {c.requester}
                  {nthWork(c.requester)} ·
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
          const material = commissionMaterial(c);
          return (
            <div key={c.id} className="flex items-start gap-2.5">
              <ArtworkThumbnail title={c.title} variant="offer" />
              <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                <span className="font-display text-base font-semibold text-ink">{c.title}</span>
                <span className="flex flex-wrap items-center gap-1 text-sm text-ink-faint">
                  {c.requester}
                  {nthWork(c.requester)} ·
                  <Coins className="h-4 w-4 text-prestige-gold" /> {c.florins}ƒ ·
                  <Crown className="h-4 w-4 text-prestige-gold" /> {c.prestige} ·
                  <Clock className="h-4 w-4" /> {c.durationMonths} mo
                </span>
                <span className="text-sm font-semibold text-sienna">
                  Requires: {capitalizeLabel(c.artistType)}
                  {material && <span> · {capitalizeLabel(material)}</span>}
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
                <button
                  className="self-start text-xs font-semibold text-ink-faint underline-offset-2 transition hover:text-ink hover:underline"
                  onClick={() => declineCommission(c.id)}
                >
                  Decline
                </button>
              </div>
            </div>
          );
        })}
    </HudPanel>
  );
}
