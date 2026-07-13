import { useMemo } from "react";

import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { getRazeImpact, getRazeSalvage } from "~/game/raze";
import { useGameStore } from "~/stores/useGameStore";
import { Panel } from "./Panel";

/**
 * Confirmation for razes that hurt: the target houses artists or is working a
 * commission (set by the placement controller; instant razes never land here).
 */
export function RazeConfirm() {
  const razeTarget = useGameStore((s) => s.razeTarget);
  const setRazeTarget = useGameStore((s) => s.setRazeTarget);
  const removeTile = useGameStore((s) => s.removeTile);
  const tile = useGameStore((s) => (s.razeTarget ? s.map.tiles[s.razeTarget] : undefined));
  const artists = useGameStore((s) => s.artists);
  const artworks = useGameStore((s) => s.artworks);
  const commissions = useGameStore((s) => s.commissions);
  const { artistCount, commission, displayedWorkCount } = useMemo(
    () => getRazeImpact(artists, commissions, artworks, razeTarget),
    [artists, commissions, artworks, razeTarget]
  );

  if (!razeTarget || !tile) return null;
  const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
  if (!metadata) return null;
  const salvage = getRazeSalvage(tile.buildingId);

  return (
    <div className="fixed left-1/2 top-1/3 z-50 -translate-x-1/2">
      <Panel className="w-72">
        <div className="font-display text-base font-semibold">Raze the {metadata.name}?</div>
        <div className="mt-1 space-y-0.5 text-sm text-ink-faint">
          {artistCount > 0 && (
            <div>
              {artistCount === 1 ? "Its artist" : `Its ${artistCount} artists`} will depart the
              city.
            </div>
          )}
          {commission && <div>“{commission.title}” will be set aside.</div>}
          {displayedWorkCount > 0 && (
            <div>
              {displayedWorkCount === 1
                ? "Its displayed work returns"
                : `Its ${displayedWorkCount} displayed works return`}{" "}
              to storage.
            </div>
          )}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            className="rounded-md border border-wood/60 bg-white/50 px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-white/80"
            onClick={() => setRazeTarget(null)}
          >
            Keep
          </button>
          <button
            className="rounded-md border border-sienna bg-white/80 px-3 py-1.5 text-sm font-semibold text-sienna transition hover:bg-white"
            onClick={() => {
              removeTile(tile.origin);
              setRazeTarget(null);
            }}
          >
            Raze (+{salvage}ƒ)
          </button>
        </div>
      </Panel>
    </div>
  );
}
