import { useGameStore } from "~/stores/useGameStore";
import { WORK_DURATION_MONTHS } from "~/game/artists";
import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { blockedReason, getSupply, MATERIAL_BY_ARTIST_TYPE } from "~/game/materials";
import { Panel } from "./Panel";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ArtistsPanel() {
  const artists = useGameStore((s) => s.artists);
  const tiles = useGameStore((s) => s.map.tiles);
  const startArtwork = useGameStore((s) => s.startArtwork);

  const workshops = Object.values(tiles)
    .filter((t) => t.isOrigin && BUILDING_METADATA_BY_ID[t.buildingId]?.artistCapacity != null)
    .map((t) => `${t.position.x},${t.position.y}`)
    .sort();
  const supply = getSupply(tiles, artists);

  if (workshops.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-24 z-40 w-56">
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
          const working = founder.workProgress != null;
          const founderSupply = supply[founder.type];
          const materialBlocked = working && founderSupply != null && !founderSupply.allowed.has(key);
          const atCapacity = founderSupply != null && founderSupply.inUse >= founderSupply.capacity;
          return (
            <div key={key} className="flex flex-col leading-tight">
              <span className="font-display text-sm font-semibold text-stone-800">
                Bottega di {founder.name}
              </span>
              <span className="text-xs text-stone-500">
                {capitalize(founder.rank)} {capitalize(founder.type)} · {members.length}{" "}
                {members.length === 1 ? "artist" : "artists"}
              </span>
              {working ? (
                <span className={`text-[10px] ${active ? "text-emerald-700" : "text-amber-700"}`}>
                  At work — {Math.floor(founder.workProgress!)}/{WORK_DURATION_MONTHS[founder.rank]} months
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
                <button
                  className="mt-1 self-start rounded-full bg-emerald-700 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-emerald-600"
                  onClick={() => startArtwork(key)}
                >
                  Create artwork
                </button>
              )}
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
