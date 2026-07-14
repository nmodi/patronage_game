// Work display (design doc, Phase 9). Completed works are placed into
// typed display slots on buildings and plazas. A displayed work trickles a
// small permanent bonus to the city — inspiration everywhere, prestige in
// churches — and makes its host building a little more effective (+5% each,
// capped +25%), a second graded scalar alongside plaza connectivity.

// No React/Zustand/Babylon imports: display.check.ts runs this under plain Node.
import {
  BUILDING_METADATA_BY_ID,
  footprintMaskFor,
  isDiagonalRotation,
  yawOfRotation,
} from "./buildings.ts";
import {
  DEFAULT_ARTWORK_PRESTIGE,
  DISPLAY_HOST_BONUS,
  DISPLAY_HOST_BONUS_MAX_WORKS,
  DISPLAY_INSPIRATION_PER_PRESTIGE,
  DISPLAY_PRESTIGE_PER_PRESTIGE,
} from "./constants.ts";
import type { TileMap } from "./grid.ts";
import type { ArtistType, Artwork, DisplaySlotDef, DisplaySlotKind } from "./types.ts";

// --- Tunables (one block) ---------------------------------------------------
// Quality = the minting commission's prestige (roughly 1..20; see
// maybeOfferCommission — ARTWORK_PRESTIGE 1..10, doubled by "prestige" requesters).
// The numeric knobs themselves live in constants.ts; re-exported here so
// existing import paths (display.check.ts etc.) keep working.
export {
  DEFAULT_ARTWORK_PRESTIGE,
  DISPLAY_HOST_BONUS,
  DISPLAY_HOST_BONUS_MAX_WORKS,
  DISPLAY_INSPIRATION_PER_PRESTIGE,
  DISPLAY_PRESTIGE_PER_PRESTIGE,
} from "./constants.ts";
export const CHURCH_HOST_IDS: ReadonlySet<string> = new Set(["cathedral", "chapel"]);

export const SLOT_KINDS_BY_ARTIST: Record<ArtistType, readonly DisplaySlotKind[]> = {
  painter: ["painting"],
  sculptor: ["statue", "plinth"],
  architect: [], // no display form yet; extend when stained glass etc. exist
};

export function slotAccepts(kind: DisplaySlotKind, artistType: ArtistType): boolean {
  return SLOT_KINDS_BY_ARTIST[artistType].includes(kind);
}

/** A work's display quality: its captured commission prestige, or the default. */
export function artworkQuality(a: Artwork): number {
  return a.prestige ?? DEFAULT_ARTWORK_PRESTIGE;
}

/** Host effectiveness multiplier: 1 + 5% per displayed work, capped at +25%. */
export function displayBoost(count: number): number {
  return 1 + DISPLAY_HOST_BONUS * Math.min(count, DISPLAY_HOST_BONUS_MAX_WORKS);
}

/**
 * A plinth's footprint cell (unrotated metadata frame) → its offset in the
 * stamped grid under rotation r. Quarter turns (0-3) use the exact integer
 * ring — local +X faces grid +x, −y, −x, +y (modelManifest LOCAL/GRID_SIDE_RING).
 * Diagonal rotations (4-7) rotate the cell about the footprint center in
 * continuous space and land on the nearest claimed mask cell (which is the
 * containing cell whenever that cell is claimed).
 */
export function rotateSlotCell(
  cell: { x: number; y: number },
  footprint: { width: number; depth: number },
  r: number
): { x: number; y: number } {
  const u = cell.x - (footprint.width - 1) / 2;
  const v = cell.y - (footprint.depth - 1) / 2;
  if (isDiagonalRotation(r)) {
    const theta = yawOfRotation(r);
    const gx = u * Math.cos(theta) + v * Math.sin(theta);
    const gy = -u * Math.sin(theta) + v * Math.cos(theta);
    const { cells, center } = footprintMaskFor(footprint, r);
    const tx = center.x + gx;
    const ty = center.y + gy;
    let best = cells[0]!;
    let bestD = Infinity;
    for (const c of cells) {
      const d = (c.x - tx) ** 2 + (c.y - ty) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return { x: best.x, y: best.y };
  }
  const k = ((r % 4) + 4) % 4;
  const ring: [number, number][] = [
    [u, v],
    [v, -u],
    [-u, -v],
    [-v, u],
  ];
  const [gx, gy] = ring[k]!;
  const rw = k % 2 === 1 ? footprint.depth : footprint.width;
  const rd = k % 2 === 1 ? footprint.width : footprint.depth;
  return { x: gx + (rw - 1) / 2, y: gy + (rd - 1) / 2 };
}

/** Slot index of the plinth whose rotated cell sits at footprint offset (dx,dy), else undefined. */
export function plinthSlotAt(
  slots: readonly DisplaySlotDef[],
  footprint: { width: number; depth: number },
  r: number,
  dx: number,
  dy: number
): number | undefined {
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i]!;
    if (slot.kind !== "plinth" || !slot.cell) continue;
    const c = rotateSlotCell(slot.cell, footprint, r);
    if (c.x === dx && c.y === dy) return i;
  }
  return undefined;
}

/**
 * Shared authoritative guard for placing a work into a display slot — reused by
 * the store action and both assign UIs so a button never no-ops (mirror of
 * canAssignCommission).
 */
export function canDisplayWork(
  artwork: Artwork | undefined,
  hostKey: string,
  slot: number,
  tiles: TileMap,
  artworks: Artwork[]
): boolean {
  if (!artwork || artwork.displayedAt) return false;
  const tile = tiles[hostKey];
  if (!tile?.isOrigin) return false;
  const slotDef = BUILDING_METADATA_BY_ID[tile.buildingId]?.displaySlots?.[slot];
  if (!slotDef || !slotAccepts(slotDef.kind, artwork.artistType)) return false;
  // Slot already occupied?
  return !artworks.some(
    (w) => w.displayedAt?.key === hostKey && w.displayedAt.slot === slot
  );
}

export interface DisplaySummary {
  counts: Map<string, number>; // host origin key → displayed-work count (uncapped)
  inspiration: number; // per-tick trickle, non-church hosts
  prestige: number; // per-tick trickle, church hosts (fractional)
}

/** One O(artworks) scan; a work whose host no longer exists contributes nothing. */
export function computeDisplaySummary(tiles: TileMap, artworks: Artwork[]): DisplaySummary {
  const counts = new Map<string, number>();
  let inspiration = 0;
  let prestige = 0;
  for (const w of artworks) {
    if (!w.displayedAt) continue;
    const key = w.displayedAt.key;
    const tile = tiles[key];
    if (!tile?.isOrigin) continue; // host razed — treat as in storage until recalled
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const q = artworkQuality(w);
    if (CHURCH_HOST_IDS.has(tile.buildingId)) prestige += q * DISPLAY_PRESTIGE_PER_PRESTIGE;
    else inspiration += q * DISPLAY_INSPIRATION_PER_PRESTIGE;
  }
  return { counts, inspiration, prestige };
}
