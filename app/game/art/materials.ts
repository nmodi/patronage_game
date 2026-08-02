import type { ArtistType, Commission, Material } from "../types.ts";
import type { TileMap } from "../grid.ts";
import { origins } from "../buildings.ts";
import { MATERIAL_STORAGE_BASE } from "../constants.ts";

// Materials are an accumulating city-wide stock (July 2026, deliberate reversal
// of the original "capacity token" model): staffed suppliers produce units each
// month into one pool per material, and a commission spends a lump sum from that
// pool when it's assigned. Nothing is routed and nothing is per-building —
// pools are three numbers — so there are still no supply chains. Once assigned,
// work never stalls on materials.

// Legacy-default material per artist type: what a commission needs when it
// doesn't name a material (pre-bronze saves). Sculptors default to marble;
// bronze only ever comes from an explicit Commission.material.
export const MATERIAL_BY_ARTIST_TYPE: Partial<Record<ArtistType, Material>> = {
  painter: "pigment",
  sculptor: "marble",
};

export const MATERIALS: readonly Material[] = ["pigment", "marble", "bronze", "timber", "stone"];

export type MaterialPools = Record<Material, number>;

export const EMPTY_POOLS: MaterialPools = { pigment: 0, marble: 0, bronze: 0, timber: 0, stone: 0 };

/** A commission's required material: explicit field, or the artist-type default. */
export function commissionMaterial(c: Commission): Material | undefined {
  return c.material ?? MATERIAL_BY_ARTIST_TYPE[c.artistType];
}

/** Stock a commission spends at assign; pre-stockpile offers are free. */
export function commissionMaterialCost(c: Commission): number {
  return c.materialCost ?? 0;
}

/**
 * Storage ceiling per material: a base yard, plus each supplier's own storage
 * for its material, plus every warehouse for all materials. Storage counts
 * whether or not the building is staffed — only production needs workers.
 */
export function materialCaps(tiles: TileMap): MaterialPools {
  const caps: MaterialPools = { ...EMPTY_POOLS };
  for (const material of MATERIALS) caps[material] = MATERIAL_STORAGE_BASE;
  for (const [, , metadata] of origins(tiles)) {
    if (metadata.supplies) caps[metadata.supplies.material] += metadata.supplies.storage;
    if (metadata.materialStorage) {
      for (const material of MATERIALS) caps[material] += metadata.materialStorage;
    }
  }
  return caps;
}

/**
 * Add a month's production, clamped to the caps. Pure; returns the same object
 * identity when nothing moved (the tick's change-tracking convention).
 */
export function addProduction(
  pools: MaterialPools,
  produced: { material: Material; amount: number }[],
  caps: MaterialPools
): MaterialPools {
  if (produced.length === 0) return pools;
  const next = { ...pools };
  for (const { material, amount } of produced) {
    next[material] = Math.min(caps[material], next[material] + amount);
  }
  return MATERIALS.every((m) => next[m] === pools[m]) ? pools : next;
}
