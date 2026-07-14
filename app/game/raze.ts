import { BUILDING_METADATA_BY_ID, footprintMask, type BuildingId } from "./buildings.ts";
import { reopenCommission } from "./commissions.ts";
import { RAZE_SALVAGE_FRACTION } from "./constants.ts";
import type { GridPos, TileMap } from "./grid.ts";
import type { Artist, Artwork, Commission } from "./types.ts";

export interface RazeSnapshot {
  florins: number;
  artists: Artist[];
  artworks: Artwork[];
  commissions: Commission[];
  map: { tiles: TileMap };
  time: { tickCount: number };
}

export interface RazeTransition {
  florins: number;
  artists: Artist[];
  artworks: Artwork[];
  commissions: Commission[];
  tiles: TileMap;
}

export interface RazeImpact {
  artistCount: number;
  commission: Commission | undefined;
  displayedWorkCount: number;
  needsConfirmation: boolean;
}

/** Consequences shown by the raze confirmation and enforced by its controller. */
export function getRazeImpact(
  artists: Artist[],
  commissions: Commission[],
  artworks: Artwork[],
  originKey: string | null
): RazeImpact {
  if (!originKey) {
    return { artistCount: 0, commission: undefined, displayedWorkCount: 0, needsConfirmation: false };
  }
  let artistCount = 0;
  for (const artist of artists) {
    if (artist.homeTileKey === originKey) artistCount += 1;
  }
  let displayedWorkCount = 0;
  for (const work of artworks) {
    if (work.displayedAt?.key === originKey) displayedWorkCount += 1;
  }
  const commission = commissions.find((item) => item.workshopKey === originKey);
  return {
    artistCount,
    commission,
    displayedWorkCount,
    needsConfirmation: artistCount > 0 || commission != null || displayedWorkCount > 0,
  };
}

/** RAZE_SALVAGE_FRACTION of the build cost, rounded down once per razed structure. */
export function getRazeSalvage(buildingId: BuildingId): number {
  return Math.floor((BUILDING_METADATA_BY_ID[buildingId]?.baseCost ?? 0) * RAZE_SALVAGE_FRACTION);
}

/** Apply every demolition consequence without depending on the Zustand adapter. */
export function razeBuilding(
  state: RazeSnapshot,
  position: GridPos
): RazeTransition | null {
  const tile = state.map.tiles[`${position.x},${position.y}`];
  if (!tile) return null;

  const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
  const cells = metadata ? footprintMask(metadata, tile.rotation).cells : [{ x: 0, y: 0 }];
  const { x: originX, y: originY } = tile.origin;
  const originKey = `${originX},${originY}`;
  const tiles = { ...state.map.tiles };

  for (const offset of cells) {
    const key = `${originX + offset.x},${originY + offset.y}`;
    const cell = tiles[key];
    // Overlapping decorations and structures retain cells owned by another origin.
    if (cell?.origin.x === originX && cell.origin.y === originY) delete tiles[key];
  }

  const evicting = state.artists.some((artist) => artist.homeTileKey === originKey);
  const reopening = state.commissions.some((item) => item.workshopKey === originKey);
  const recalling = state.artworks.some((work) => work.displayedAt?.key === originKey);

  return {
    florins: state.florins + getRazeSalvage(tile.buildingId),
    artists: evicting
      ? state.artists.filter((artist) => artist.homeTileKey !== originKey)
      : state.artists,
    artworks: recalling
      ? state.artworks.map((work) =>
          work.displayedAt?.key === originKey ? { ...work, displayedAt: undefined } : work
        )
      : state.artworks,
    commissions: reopening
      ? state.commissions.map((item) =>
          item.workshopKey === originKey
            ? reopenCommission(item, state.time.tickCount)
            : item
        )
      : state.commissions,
    tiles,
  };
}
