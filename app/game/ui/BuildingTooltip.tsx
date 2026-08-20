import { useEffect, useRef } from "react";

import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import {
  computePlazaConnectivity,
  connectionBonusOf,
  PLAZA_IDS,
} from "~/game/city/connectivity";
import { displayBoost } from "~/game/art/display";
import { computeGathering, plazaInspiration } from "~/game/city/gathering";
import { materialCaps } from "~/game/art/materials";
import { supplierRate } from "~/game/city/metrics";
import { getRazeSalvage } from "~/game/placement/raze";
import { plazaBoost } from "~/game/city/traffic";
import type { TileMap } from "~/game/grid";
import type { BuildingMetadata } from "~/game/types";
import { staffingEfficiency } from "~/game/city/workers";
import { RAZE_TOOL, useGameStore } from "~/stores/useGameStore";
import { capitalizeLabel, formatAmount } from "./format";

function getActiveEffects(
  metadata: BuildingMetadata,
  workers: number,
  originKey: string,
  plazaStrength: number,
  displayedCount: number,
  tiles: TileMap,
  population: number
) {
  const effects: string[] = [];
  const boost = plazaBoost(metadata, originKey, plazaStrength, tiles, population);
  const displayMult = displayBoost(displayedCount);
  const hostBoost = boost * displayMult;
  const multiplier =
    staffingEfficiency(metadata.workersRequired ?? 0, metadata.maxWorkers ?? 0, workers) * hostBoost;

  if (metadata.supplies) {
    // supplierRate, not `multiplier`: the tick gives supplier output no
    // display boost, and this row must match the tick.
    effects.push(
      `+${formatAmount(
        supplierRate(metadata, workers, originKey, plazaStrength, tiles, population)
      )} ${metadata.supplies.material} / month`
    );
  }
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
    const pct = Math.round((boost - 1) * 100);
    if (!metadata.footTraffic) {
      effects.push(`Plaza connection: +${pct}%`);
    } else if (pct > 0) {
      effects.push(`Foot traffic: +${pct}%`);
    }
  }
  if (displayedCount > 0) {
    effects.push(`Works on display: ${displayedCount} (+${Math.round((displayMult - 1) * 100)}%)`);
  }

  return effects;
}

export function BuildingTooltip() {
  const tile = useGameStore((s) =>
    s.hoveredTileKey ? s.map.tiles[s.hoveredTileKey] : undefined
  );
  const artworks = useGameStore((s) => s.artworks);
  const tiles = useGameStore((s) => s.map.tiles);
  const mapSeed = useGameStore((s) => s.mapSeed);
  const materials = useGameStore((s) => s.materials);
  const population = useGameStore((s) => s.population);
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
    ? computePlazaConnectivity(tiles, mapSeed).get(originKey) ?? 0
    : 0;
  // Freeform paving: has this ground been recognized as a piazza? (Each paving
  // cell is its own origin, so the hovered origin key IS the cell.)
  const paving =
    tile.buildingId === "plaza_paving"
      ? (() => {
          const g = computeGathering(tiles, mapSeed);
          const index = g.plazaCells.get(originKey);
          if (index == null)
            return { status: "Not yet a plaza — no 4×4 open square fits", inspiration: 0 };
          const organic = g.plazas[index]!.organic;
          return {
            status: organic ? "A plaza — the city gathers here" : "A plaza",
            inspiration: plazaInspiration(organic),
          };
        })()
      : null;
  const displayedCount = metadata.displaySlots
    ? artworks.filter((w) => w.displayedAt?.key === originKey).length
    : 0;
  const trafficPct = Math.round(
    (plazaBoost(metadata, originKey, plazaStrength, tiles, population) - 1) * 100
  );
  const activeEffects = isActive
    ? getActiveEffects(
        metadata,
        tile.workers,
        originKey,
        plazaStrength,
        displayedCount,
        tiles,
        population
      )
    : [];

  // Material stock: a supplier also reads the citywide pool it feeds (its own
  // monthly output rides the active-effects list); a warehouse reads the
  // ceiling it adds.
  const supplies = metadata.supplies;
  const caps = supplies ? materialCaps(tiles) : null;

  return (
    <div
      ref={boxRef}
      className="pointer-events-none fixed left-0 top-0 z-50"
      style={{ transform: `translate(${mouse.current.x + 14}px, ${mouse.current.y + 14}px)` }}
    >
      <div className="panel-parchment max-w-64 rounded-md px-3.5 py-2.5 text-ink">
        <div className="font-display text-base font-semibold">{metadata.name}</div>
        {paving && <div className="text-sm text-ink-faint">{paving.status}</div>}
        {paving && paving.inspiration > 0 && (
          <div className="text-sm text-ink">
            +{formatAmount(paving.inspiration)} Inspiration / month
          </div>
        )}
        {required > 0 && (
          <div className="text-sm text-ink-faint">
            Workers {tile.workers}/{required}
            {(metadata.maxWorkers ?? 0) > required ? ` (max ${metadata.maxWorkers})` : ""}
          </div>
        )}
        {supplies && caps && (
          <div className="text-sm text-ink-faint">
            {capitalizeLabel(supplies.material)} stock {Math.floor(materials[supplies.material])} /{" "}
            {caps[supplies.material]} citywide
          </div>
        )}
        {metadata.materialStorage && (
          <div className="text-sm text-ink-faint">
            +{metadata.materialStorage} storage per material
          </div>
        )}
        {canBeInactive && (
          <div className={`text-sm font-semibold ${isActive ? "text-prestige-ink" : "text-sienna"}`}>
            {isActive
              ? "Active"
              : missing > 0
                ? `Needs ${missing} more worker${missing === 1 ? "" : "s"}`
                : "Inactive"}
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
            Link to a plaza with roads: up to +{Math.round(connectionBonusOf(metadata) * 100)}%
          </div>
        )}
        {metadata.footTraffic && plazaStrength > 0 && trafficPct === 0 && (
          <div className="mt-1 text-sm italic text-ink-faint">
            Foot traffic grows with townsfolk and homes in walking reach
          </div>
        )}
        {isRazing && (
          <div className="mt-1 text-sm font-semibold text-sienna">
            Click to raze — salvage {getRazeSalvage(tiles, tile.buildingId, originKey)}ƒ
          </div>
        )}
      </div>
    </div>
  );
}
