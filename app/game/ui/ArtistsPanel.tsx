import { useGameStore } from "~/stores/useGameStore";
import { WORK_DURATION_MONTHS } from "~/game/artists";
import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { Panel } from "./Panel";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ArtistsPanel() {
  const artists = useGameStore((s) => s.artists);
  const tiles = useGameStore((s) => s.map.tiles);
  const startArtwork = useGameStore((s) => s.startArtwork);

  const ateliers = Object.values(tiles)
    .filter((t) => t.isOrigin && BUILDING_METADATA_BY_ID[t.buildingId]?.artistCapacity != null)
    .map((t) => `${t.position.x},${t.position.y}`)
    .sort();

  if (ateliers.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-24 z-40 w-56">
      <Panel header={`Ateliers (${ateliers.length})`} className="flex flex-col gap-2">
        {ateliers.map((key) => {
          const members = artists.filter((a) => a.homeTileKey === key);
          const founder = members[0];
          const active = tiles[key]?.isActive ?? false;
          if (!founder) {
            // Pre-rework save: atelier without a crew; first arrival founds it.
            return (
              <div key={key} className="flex flex-col leading-tight">
                <span className="font-display text-sm font-semibold text-stone-800">Atelier</span>
                <span className="text-[10px] text-stone-500">Vacant</span>
              </div>
            );
          }
          const working = founder.workProgress != null;
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
                  {!active && " (paused)"}
                </span>
              ) : active ? (
                <button
                  className="mt-1 self-start rounded-full bg-emerald-700 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-emerald-600"
                  onClick={() => startArtwork(key)}
                >
                  Create artwork
                </button>
              ) : (
                <span className="text-[10px] text-amber-700">Atelier unstaffed</span>
              )}
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
