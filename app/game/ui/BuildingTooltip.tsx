import { useEffect, useRef } from "react";

import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import {
  computePlazaConnectivity,
  PLAZA_CONNECTION_BONUS,
  PLAZA_IDS,
} from "~/game/connectivity";
import { displayBoost } from "~/game/display";
import { blockedReason, getSupply, MATERIAL_BY_ARTIST_TYPE } from "~/game/materials";
import { getRazeSalvage } from "~/game/raze";
import type { BuildingMetadata } from "~/game/types";
import { staffingEfficiency } from "~/game/workers";
import { RAZE_TOOL, useGameStore } from "~/stores/useGameStore";
import { capitalizeLabel } from "./format";

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const PLAZA_BONUS_MAX_PCT = `+${Math.round(PLAZA_CONNECTION_BONUS * 100)}%`;

function getActiveEffects(
  metadata: BuildingMetadata,
  workers: number,
  plazaStrength: number,
  displayedCount: number
) {
  const effects: string[] = [];
  const displayMult = displayBoost(displayedCount);
  const hostBoost = (1 + PLAZA_CONNECTION_BONUS * plazaStrength) * displayMult;
  const multiplier =
    staffingEfficiency(metadata.workersRequired ?? 0, metadata.maxWorkers ?? 0, workers) * hostBoost;

  if (metadata.generates?.income) {
    effects.push(`+${formatAmount(metadata.generates.income * multiplier)} Florins / month`);
  }
  if (metadata.generates?.inspiration) {
    effects.push(`+${formatAmount(metadata.generates.inspiration * multiplier)} Inspiration / month`);
  }
  if (metadata.amenities) {
    effects.push(`+${Math.round(metadata.amenities * hostBoost)} amenities`);
  }
  if (metadata.housing) {
    effects.push(`+${Math.round(metadata.housing * hostBoost)} housing`);
  }
  if (plazaStrength > 0) {
    effects.push(`Plaza connection: +${Math.round(PLAZA_CONNECTION_BONUS * plazaStrength * 100)}%`);
  }
  if (displayedCount > 0) {
    effects.push(`Masterworks on display: ${displayedCount} (+${Math.round((displayMult - 1) * 100)}%)`);
  }

  return effects;
}

export function BuildingTooltip() {
  const tile = useGameStore((s) =>
    s.hoveredTileKey ? s.map.tiles[s.hoveredTileKey] : undefined
  );
  const artists = useGameStore((s) => s.artists);
  const artworks = useGameStore((s) => s.artworks);
  const tiles = useGameStore((s) => s.map.tiles);
  const isRazing = useGameStore((s) => s.map.selectedBuilding === RAZE_TOOL);
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

  // Plaza connectivity (Phase 10): graded bonus for generators, workshops,
  // housing, and service buildings on the network — same computation as the
  // tick, falling off with road distance from the Main Plaza.
  const isNetwork = tile.type === "road" || PLAZA_IDS.has(tile.buildingId);
  const bonusEligible =
    !isNetwork &&
    (metadata.generates != null ||
      metadata.artistCapacity != null ||
      metadata.housing != null ||
      metadata.amenities != null);
  const originKey = `${tile.origin.x},${tile.origin.y}`;
  const plazaStrength = bonusEligible
    ? computePlazaConnectivity(tiles).get(originKey) ?? 0
    : 0;
  const displayedCount = metadata.displaySlots
    ? artworks.filter((w) => w.displayedAt?.key === originKey).length
    : 0;
  const activeEffects = isActive
    ? getActiveEffects(metadata, tile.workers, plazaStrength, displayedCount)
    : [];

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
      <div className="panel-parchment max-w-64 rounded-md px-3.5 py-2.5 text-ink">
        <div className="font-display text-base font-semibold">{metadata.name}</div>
        {required > 0 && (
          <div className="text-sm text-ink-faint">
            Workers {tile.workers}/{required}
            {(metadata.maxWorkers ?? 0) > required ? ` (max ${metadata.maxWorkers})` : ""}
          </div>
        )}
        {metadata.supplies && material && materialStatus && (
          <div className="text-sm text-ink-faint">
            {capitalizeLabel(material)}: {materialStatus.inUse}/
            {materialStatus.capacity} {metadata.supplies.artistType}s
          </div>
        )}
        {canBeInactive && (
          <div className={`text-sm font-semibold ${isActive ? "text-prestige-gold" : "text-sienna"}`}>
            {isActive
              ? "Active"
              : missing > 0
                ? `Needs ${missing} more worker${missing === 1 ? "" : "s"}`
                : materialReason ?? "Inactive"}
          </div>
        )}
        {activeEffects.length > 0 && (
          <div className="mt-1 space-y-0.5 border-t border-wood/50 pt-1">
            {activeEffects.map((effect) => (
              <div key={effect} className="text-sm text-ink">
                {effect}
              </div>
            ))}
          </div>
        )}
        {bonusEligible && plazaStrength === 0 && (
          <div className="mt-1 text-sm italic text-ink-faint">
            Link to a plaza with roads: up to {PLAZA_BONUS_MAX_PCT}
          </div>
        )}
        {isRazing && (
          <div className="mt-1 text-sm font-semibold text-sienna">
            Click to raze — salvage {getRazeSalvage(tile.buildingId)}ƒ
          </div>
        )}
      </div>
    </div>
  );
}
