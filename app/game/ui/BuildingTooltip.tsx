import { useEffect, useRef } from "react";

import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { blockedReason, getSupply, MATERIAL_BY_ARTIST_TYPE } from "~/game/materials";
import type { BuildingMetadata } from "~/game/types";
import { staffingEfficiency } from "~/game/workers";
import { useGameStore } from "~/stores/useGameStore";

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getActiveEffects(metadata: BuildingMetadata, workers: number) {
  const effects: string[] = [];
  const multiplier = staffingEfficiency(
    metadata.workersRequired ?? 0,
    metadata.maxWorkers ?? 0,
    workers
  );

  if (metadata.generates?.income) {
    effects.push(`+${formatAmount(metadata.generates.income * multiplier)} Florins / month`);
  }
  if (metadata.generates?.inspiration) {
    effects.push(`+${formatAmount(metadata.generates.inspiration * multiplier)} Inspiration / month`);
  }
  if (metadata.amenities) {
    effects.push(`+${metadata.amenities} amenities`);
  }
  if (metadata.housing) {
    effects.push(`+${metadata.housing} housing`);
  }

  return effects;
}

export function BuildingTooltip() {
  const tile = useGameStore((s) =>
    s.hoveredTileKey ? s.map.tiles[s.hoveredTileKey] : undefined
  );
  const artists = useGameStore((s) => s.artists);
  const tiles = useGameStore((s) => s.map.tiles);
  const mouse = useRef({ x: 0, y: 0 });
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      const el = boxRef.current;
      if (el) el.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  if (!tile) return null;
  const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
  if (!metadata) return null;
  if (metadata.type === "decoration") return null;

  const required = metadata.workersRequired ?? 0;
  const canBeInactive = required > 0;
  const missing = Math.max(0, required - tile.workers);
  const isActive = tile.isActive;
  const activeEffects = isActive ? getActiveEffects(metadata, tile.workers) : [];

  // Material supply status (Phase 7): citywide per-material totals, so a
  // supplier reads "Pigment: 2/3 painters" and a staffed-but-blocked workshop
  // gets its reason instead of "Needs 0 more workers".
  const supply = getSupply(tiles, artists);
  const material = metadata.supplies
    ? MATERIAL_BY_ARTIST_TYPE[metadata.supplies.artistType]
    : undefined;
  const materialStatus = metadata.supplies ? supply[metadata.supplies.artistType] : undefined;
  const founder =
    metadata.artistCapacity != null
      ? artists.find((a) => a.homeTileKey === `${tile.origin.x},${tile.origin.y}`)
      : undefined;
  const materialReason =
    !isActive && missing === 0 && founder
      ? blockedReason(founder.type, supply[founder.type])
      : null;

  return (
    <div
      ref={boxRef}
      className="pointer-events-none fixed left-0 top-0 z-50"
      style={{ transform: `translate(${mouse.current.x + 14}px, ${mouse.current.y + 14}px)` }}
    >
      <div className="max-w-56 rounded-md bg-stone-900/90 px-3 py-2 text-stone-100 shadow-lg">
        <div className="text-xs font-semibold">{metadata.name}</div>
        {required > 0 && (
          <div className="text-[10px] text-stone-300">
            Workers {tile.workers}/{required}
            {(metadata.maxWorkers ?? 0) > required ? ` (max ${metadata.maxWorkers})` : ""}
          </div>
        )}
        {metadata.supplies && material && materialStatus && (
          <div className="text-[10px] text-stone-300">
            {material.charAt(0).toUpperCase() + material.slice(1)}: {materialStatus.inUse}/
            {materialStatus.capacity} {metadata.supplies.artistType}s
          </div>
        )}
        {canBeInactive && (
          <div className={`text-[10px] ${isActive ? "text-emerald-400" : "text-amber-400"}`}>
            {isActive
              ? "Active"
              : missing > 0
                ? `Needs ${missing} more worker${missing === 1 ? "" : "s"}`
                : materialReason ?? "Inactive"}
          </div>
        )}
        {activeEffects.length > 0 && (
          <div className="mt-1 space-y-0.5 border-t border-stone-700 pt-1">
            {activeEffects.map((effect) => (
              <div key={effect} className="text-[10px] text-stone-200">
                {effect}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
