import { BUILDING_METADATA_BY_ID, type BuildingId } from "~/game/buildings";
import type { Tile, TileMap } from "~/game/grid";
import type { Artist, Artwork, Commission } from "~/game/types";

/** A single origin tile — enough for the panels, which key off origin cells. */
export function tile(x: number, y: number, buildingId: BuildingId, isActive = true): Tile {
  const meta = BUILDING_METADATA_BY_ID[buildingId];
  return {
    type: meta?.type ?? "empty",
    buildingId,
    position: { x, y },
    origin: { x, y },
    isOrigin: true,
    isActive,
    workers: meta?.maxWorkers ?? meta?.workersRequired ?? 0,
    builtTick: 0,
  };
}

export function tileMap(...tiles: Tile[]): TileMap {
  const map: TileMap = {};
  for (const t of tiles) map[`${t.position.x},${t.position.y}`] = t;
  return map;
}

// A plausible mid-game city shared across the panel stories: two workshops
// (a busy painter, an idle master sculptor), their suppliers, a plaza hub,
// and enough housing to seat the population.
const PAINTER = "10,10";
const SCULPTOR = "16,10";

export const sampleTiles: TileMap = tileMap(
  tile(13, 13, "town_center_plaza"),
  tile(10, 10, "workshop"),
  tile(16, 10, "sculpture_workshop"),
  tile(10, 16, "pigment_trader"),
  tile(16, 16, "marble_supplier"),
  tile(6, 10, "cottage"),
  tile(6, 13, "cottage"),
  tile(6, 16, "townhouse"),
  tile(20, 13, "bakery"),
  tile(20, 16, "tavern"),
);

export const sampleArtists: Artist[] = [
  { id: "a-sandro", name: "Sandro", type: "painter", rank: "journeyman", homeTileKey: PAINTER, xp: 640, workProgress: 3 },
  { id: "a-filippo", name: "Filippo", type: "painter", rank: "apprentice", homeTileKey: PAINTER, xp: 120 },
  { id: "a-donato", name: "Donato", type: "sculptor", rank: "master", homeTileKey: SCULPTOR, xp: 3200 },
];

export const sampleCommissions: Commission[] = [
  {
    id: "c-active",
    title: "The Adoration of the Magi",
    requester: "The Church",
    artistType: "painter",
    durationMonths: 8,
    florins: 180,
    prestige: 14,
    material: "pigment",
    expiresTick: 999,
    workshopKey: PAINTER,
  },
  {
    id: "c-offer-sculptor",
    title: "Bust of Lorenzo",
    requester: "House Medici",
    artistType: "sculptor",
    durationMonths: 6,
    florins: 120,
    prestige: 18,
    material: "marble",
    expiresTick: 20,
  },
  {
    id: "c-offer-painter",
    title: "Annunciation",
    requester: "House Strozzi",
    artistType: "painter",
    durationMonths: 5,
    florins: 90,
    prestige: 11,
    material: "pigment",
    expiresTick: 30,
  },
];

export const sampleArtworks: Artwork[] = [
  {
    id: "w-1",
    name: "Primavera",
    requester: "House Medici",
    artistId: "a-sandro",
    artistType: "painter",
    completedTick: 41,
    prestige: 16,
    displayedAt: { key: "13,13", slot: 0 },
  },
  {
    id: "w-2",
    name: "Pietà",
    requester: "The Church",
    artistId: "a-donato",
    artistType: "sculptor",
    completedTick: 58,
    prestige: 20,
    material: "marble",
  },
  {
    id: "w-3",
    name: "Portrait of a Lady",
    requester: "House Strozzi",
    artistId: "a-sandro",
    artistType: "painter",
    completedTick: 72,
    prestige: 9,
  },
];

/** The shared scene as a store patch. */
export const sampleCity = {
  cityName: "Firenze",
  florins: 640,
  inspiration: 32,
  prestige: 214,
  population: 38,
  artists: sampleArtists,
  artworks: sampleArtworks,
  commissions: sampleCommissions,
  map: { tiles: sampleTiles, selectedBuilding: null },
  time: { tickCount: 78 },
};
