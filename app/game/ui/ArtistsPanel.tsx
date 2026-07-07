import { useGameStore } from "~/stores/useGameStore";
import { RANK_LABEL } from "~/game/artists";
import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { blockedReason, getSupply, MATERIAL_BY_ARTIST_TYPE } from "~/game/materials";
import { Panel } from "./Panel";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ArtistsPanel() {
  const artists = useGameStore((s) => s.artists);
  const tiles = useGameStore((s) => s.map.tiles);
  const commissions = useGameStore((s) => s.commissions);

  const workshops = Object.values(tiles)
    .filter((t) => t.isOrigin && BUILDING_METADATA_BY_ID[t.buildingId]?.artistCapacity != null)
    .map((t) => `${t.position.x},${t.position.y}`)
    .sort();
  const supply = getSupply(tiles, artists);

  if (workshops.length === 0) return null;

  return (
    <div className="pointer-events-none fixed left-4 top-24 z-40 w-56">
      <Panel header={`Workshops (${workshops.length})`} className="flex flex-col gap-2">
        {workshops.map((key) => {
          const members = artists.filter((a) => a.homeTileKey === key);
          const founder = members[0];
          const active = tiles[key]?.isActive ?? false;
          if (!founder) {
            // Pre-rework save: workshop without a crew; first arrival founds it.
            return (
              <div key={key} className="flex flex-col leading-tight">
                <span className="font-display text-sm font-semibold text-stone-800">Workshop</span>
                <span className="text-[10px] text-stone-500">Vacant</span>
              </div>
            );
          }
          const commission = commissions.find((c) => c.workshopKey === key);
          const working = founder.workProgress != null && commission != null;
          const founderSupply = supply[founder.type];
          const materialBlocked = working && founderSupply != null && !founderSupply.allowed.has(key);
          const atCapacity = founderSupply != null && founderSupply.inUse >= founderSupply.capacity;
          return (
            <div key={key} className="flex flex-col leading-tight">
              <span className="font-display text-sm font-semibold text-stone-800">
                Bottega di {founder.name}
              </span>
              <span className="text-xs text-stone-500">
                {RANK_LABEL[founder.rank]} {capitalize(founder.type)} · {members.length}{" "}
                {members.length === 1 ? "artist" : "artists"}
              </span>
              {working ? (
                <span className={`text-[10px] ${active ? "text-emerald-700" : "text-amber-700"}`}>
                  At work on {commission!.title} — {Math.floor(founder.workProgress!)}/
                  {commission!.durationMonths} months
                  {materialBlocked
                    ? ` (no ${MATERIAL_BY_ARTIST_TYPE[founder.type]})`
                    : !active && " (paused)"}
                </span>
              ) : !active ? (
                <span className="text-[10px] text-amber-700">Workshop unstaffed</span>
              ) : atCapacity ? (
                <span className="text-[10px] text-amber-700">
                  {blockedReason(founder.type, founderSupply)}
                </span>
              ) : (
                <span className="text-[10px] text-stone-500">Awaiting a commission</span>
              )}
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
