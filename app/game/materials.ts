import type { Artist, ArtistType } from "./types.ts";
import type { Tile } from "~/stores/useGameStore";
import { BUILDING_METADATA_BY_ID } from "./buildings.ts";

export const MATERIAL_BY_ARTIST_TYPE: Partial<Record<ArtistType, string>> = {
  painter: "pigment",
  sculptor: "marble",
};

export interface MaterialSupply {
  capacity: number; // total slots from staffed suppliers
  inUse: number; // working workshops granted a slot
  allowed: Set<string>; // workshop origin keys permitted to work this tick
}

export interface WorkingWorkshop {
  key: string; // origin key "x,y"
  type: ArtistType;
  builtTick: number;
}

/**
 * Allocate supplier capacity to working workshops (design doc, Phase 7).
 * Materials aren't consumed — a working workshop holds a slot until its
 * artwork completes. When demand exceeds capacity the oldest workshops keep
 * their slots: sort by (builtTick, key), the same tiebreak family as
 * allocateWorkers. Gated artist types always get an entry, even with no
 * supplier built (capacity 0); ungated types are absent and never blocked.
 */
export function computeSupply(
  suppliers: { artistType: ArtistType; capacity: number }[],
  working: WorkingWorkshop[]
): Partial<Record<ArtistType, MaterialSupply>> {
  const result: Partial<Record<ArtistType, MaterialSupply>> = {};
  for (const type of Object.keys(MATERIAL_BY_ARTIST_TYPE) as ArtistType[]) {
    const capacity = suppliers
      .filter((s) => s.artistType === type)
      .reduce((sum, s) => sum + s.capacity, 0);
    const allowed = new Set(
      working
        .filter((w) => w.type === type)
        .sort((a, b) => a.builtTick - b.builtTick || a.key.localeCompare(b.key))
        .slice(0, capacity)
        .map((w) => w.key)
    );
    result[type] = { capacity, inUse: allowed.size, allowed };
  }
  return result;
}

/** Store/UI adapter: capacity from staffed supplier tiles, demand from working founders. */
export function getSupply(
  tiles: Record<string, Tile>,
  artists: Artist[]
): Partial<Record<ArtistType, MaterialSupply>> {
  const suppliers: { artistType: ArtistType; capacity: number }[] = [];
  for (const tile of Object.values(tiles)) {
    if (!tile.isOrigin || !tile.isActive) continue;
    const supplies = BUILDING_METADATA_BY_ID[tile.buildingId]?.supplies;
    if (supplies) suppliers.push(supplies);
  }
  const working: WorkingWorkshop[] = [];
  for (const a of artists) {
    if (a.workProgress == null || MATERIAL_BY_ARTIST_TYPE[a.type] == null) continue;
    const home = tiles[a.homeTileKey];
    if (!home) continue; // workshop demolished; pruned by the next tick
    working.push({ key: a.homeTileKey, type: a.type, builtTick: home.builtTick ?? 0 });
  }
  return computeSupply(suppliers, working);
}

/** Tooltip/panel reason for a material-blocked workshop; null for ungated types. */
export function blockedReason(
  type: ArtistType,
  supply: MaterialSupply | undefined
): string | null {
  const material = MATERIAL_BY_ARTIST_TYPE[type];
  if (material == null || supply == null) return null;
  if (supply.capacity === 0) return `No ${material} supplier`;
  const name =
    Object.values(BUILDING_METADATA_BY_ID).find((m) => m.supplies?.artistType === type)?.name ??
    "Supplier";
  return `${name} at capacity`;
}
