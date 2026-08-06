import { Clock, Scroll } from "./gameIcons";

import { useGameStore } from "~/stores/useGameStore";
import { BUILDING_METADATA_BY_ID, type BuildingId } from "~/game/buildings";
import { commissionMaterial, commissionMaterialCost } from "~/game/art/materials";
import { canAssignCommission, requesterPool } from "~/game/art/commissions";
import { HudPanel } from "./Panel";
import type { Commission } from "~/game/types";
import { ArtworkThumbnail } from "./ArtworkThumbnail";
import { CommissionMeta } from "./CommissionMeta";
import { ordinal } from "./format";

export function CommissionsPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const commissions = useGameStore((s) => s.commissions);
  const artists = useGameStore((s) => s.artists);
  const artworks = useGameStore((s) => s.artworks);
  const tiles = useGameStore((s) => s.map.tiles);
  const materials = useGameStore((s) => s.materials);
  const tickCount = useGameStore((s) => s.time.tickCount);
  const assignCommission = useGameStore((s) => s.assignCommission);
  const declineCommission = useGameStore((s) => s.declineCommission);

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
  // enough material stock to pay the commission's cost.
  const stockFor = (c: Commission) => {
    const material = commissionMaterial(c);
    return material ? materials[material] : Infinity;
  };
  const eligibleWorkshops = (c: Commission) =>
    [...founders.entries()]
      .filter(([, founder]) => canAssignCommission(c, founder, tiles, stockFor(c)))
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
          const cost = commissionMaterialCost(c);
          // Short on stock is its own message: the assign buttons vanish for
          // both reasons, so say which one it is.
          const shortfall = material && stockFor(c) < cost ? material : null;
          // Blueprint commissions: the structure this design will fund.
          const blueprint = c.building
            ? BUILDING_METADATA_BY_ID[c.building as BuildingId]
            : undefined;
          return (
            <div key={c.id} className="flex items-start gap-2.5">
              <ArtworkThumbnail title={c.title} variant="offer" />
              <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                <span className="font-display text-base font-semibold text-ink">{c.title}</span>
                <CommissionMeta
                  commission={c}
                  nth={nthWork(c.requester)}
                  requiresExtra={
                    <>
                      {blueprint && <span> · Funds a {blueprint.name}</span>}
                      {monthsLeft < 4 && <span> · expires in {monthsLeft} mo</span>}
                    </>
                  }
                />
                {blueprint && (
                  <span className="text-sm text-ink-faint">
                    A blueprint — {c.requester} pays for construction
                    {(() => {
                      const bill = Object.entries(blueprint.buildCost ?? {});
                      return bill.length > 0
                        ? `; building it draws ${bill.map(([m, amt]) => `${amt} ${m}`).join(", ")} from your stores.`
                        : ".";
                    })()}
                  </span>
                )}
                {workshops.length > 0 ? (
                  workshops.map(([key, founder]) => (
                    <button
                      key={key}
                      className="btn-primary px-2 py-1.5 text-sm"
                      onClick={() => assignCommission(c.id, key)}
                    >
                      Assign to {founder.name}&rsquo;s Workshop
                    </button>
                  ))
                ) : (
                  <span className="rounded-md border border-wood/50 bg-parchment-deep px-2 py-1.5 text-center text-sm text-ink-faint shadow-inner">
                    {shortfall
                      ? `Not enough ${shortfall} — ${Math.floor(materials[shortfall])} / ${cost} in store`
                      : `Not assigned — no idle ${c.artistType} workshop`}
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
