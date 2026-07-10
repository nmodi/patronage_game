import { create } from "zustand";
import type { StateCreator } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import type { Artist, Artwork, BuildingType, Commission } from "~/game/types";
import { BUILDING_METADATA_BY_ID, rotatedFootprint, type BuildingId } from "~/game/buildings";
import { createArtist } from "~/game/artists";
import { generateSeed, pickCityName } from "~/game/seed";
import { computePlazaConnectivity, PLAZA_CONNECTION_BONUS } from "~/game/connectivity";
import { getSupply } from "~/game/materials";
import { createTick } from "~/game/tick";
import { BASE_POPULATION_CAP, BASE_TICK_INTERVAL, GRID_SIZE } from "~/game/constants";

export interface GridPos {
  x: number;
  y: number;
}

export interface Tile {
  type: BuildingType;
  buildingId: BuildingId;
  position: GridPos;  // Grid position for this cell
  origin: GridPos;    // Top-left cell of the structure
  isOrigin: boolean;
  isActive: boolean;
  variant?: number;   // For different building styles
  rotation?: number;  // Player-chosen quarter turns (0-3); undefined = seeded random
  workers: number;   // Number of workers assigned to this tile
  builtTick: number; // Month when this building cell was placed
}

export interface MapState {
  tiles: Record<string, Tile>;  // Key is "x,y"
  selectedBuilding: BuildingId | null;
}

export interface TimeState {
  tickCount: number;
}

export type GameState = {
  seed: string;
  cityName: string;
  setCityName: (value: string) => void;
  florins: number;
  inspiration: number;
  prestige: number;
  population: number;
  artists: Artist[];
  artworks: Artwork[];
  commissions: Commission[];
  assignCommission: (commissionId: string, workshopKey: string) => void;
  addFlorins: (amount: number) => void;
  setFlorins: (value: number) => void;
  setPopulation: (value: number) => void;
  hoveredTileKey: string | null;
  setHoveredTile: (key: string | null) => void;
  tick: () => void;
  map: MapState;
  time: TimeState;
  paused: boolean;
  togglePause: () => void;
  setPaused: (value: boolean) => void;
  tickInterval: number;
  setTickInterval: (value: number) => void;
  setSelectedBuilding: (id: BuildingId | null) => void;
  placeTile: (position: GridPos, buildingId: BuildingId, rotation?: number) => boolean;
  placeTiles: (positions: GridPos[], buildingId: BuildingId, rotation?: number) => boolean;
  removeTile: (position: GridPos) => void;
  getTileAt: (position: GridPos) => Tile | undefined;
  getHousing: () => number;
  getAmenities: () => number;
  getCalendarLabel: () => string;
  resetGame: () => void;
};

const createInitialState = () => {
  // Demo mode is for stable screenshots — fix the seed so the city name (and any
  // future seed-driven visuals) don't change on every refresh.
  const seed = isDemo() ? "demo" : generateSeed();
  return {
    seed,
    cityName: pickCityName(seed),
    florins: 500,
    inspiration: 0,
    prestige: 0,
    population: 0,
    artists: [] as Artist[],
    artworks: [] as Artwork[],
    commissions: [] as Commission[],
    hoveredTileKey: null as string | null,
    map: { tiles: {}, selectedBuilding: null } as MapState,
    time: { tickCount: 0 },
    paused: false,
    tickInterval: BASE_TICK_INTERVAL,
  };
};

const initializer: StateCreator<GameState> = (set, get) => ({
  ...createInitialState(),
  setCityName: (value) => set(() => ({ cityName: value })),
  addFlorins: (amount: number) => set((s) => ({ florins: s.florins + amount })),
  setFlorins: (value: number) => set(() => ({ florins: value })),
  setPopulation: (value: number) => set(() => ({ population: value })),
  setHoveredTile: (key) => set(() => ({ hoveredTileKey: key })),

  tick: createTick(set, get),

  resetGame: () => set(createInitialState()),

  assignCommission: (commissionId, workshopKey) =>
    set((s) => {
      const commission = s.commissions.find((c) => c.id === commissionId);
      if (!commission || commission.workshopKey) return s;
      // Founder = first artist homed at the workshop; work is tracked on them.
      const founder = s.artists.find((a) => a.homeTileKey === workshopKey);
      if (!founder || founder.type !== commission.artistType || founder.workProgress != null) {
        return s;
      }
      const supply = getSupply(s.map.tiles, s.artists)[founder.type];
      if (supply && supply.inUse >= supply.capacity) return s; // at capacity, or no supplier (0 >= 0)
      return {
        artists: s.artists.map((a) => (a === founder ? { ...a, workProgress: 0 } : a)),
        commissions: s.commissions.map((c) => (c === commission ? { ...c, workshopKey } : c)),
      };
    }),

  togglePause: () =>
    set((s) => ({
      paused: !s.paused,
    })),

  setPaused: (value) =>
    set(() => ({
      paused: value,
    })),

  setTickInterval: (value) =>
    set(() => ({
      tickInterval: Math.max(100, value),
    })),

  setSelectedBuilding: (id) =>
    set((s) => ({ map: { ...s.map, selectedBuilding: id } })),

  placeTile: (position, buildingId, rotation) => get().placeTiles([position], buildingId, rotation),

  placeTiles: (positions, buildingId, rotation) => {
    let placed = false;
    set((s) => {
      const metadata = BUILDING_METADATA_BY_ID[buildingId];
      if (!metadata || positions.length === 0) {
        return s;
      }
      const type = metadata.type;
      const { baseCost: cost } = metadata;
      const { width, depth } = rotatedFootprint(metadata, rotation);
      const workersRequired = metadata.workersRequired ?? 0;
      const batchCells = new Set<string>();

      for (const position of positions) {
        if (
          position.x < 0 ||
          position.y < 0 ||
          position.x + width > GRID_SIZE ||
          position.y + depth > GRID_SIZE
        ) {
          return s;
        }

        // Decorations may overlap existing buildings (a colonnade against a
        // palazzo); they claim only the free cells. The origin cell must be
        // free — it anchors rendering and demolition.
        const canOverlap = type === "decoration";
        for (let dx = 0; dx < width; dx += 1) {
          for (let dy = 0; dy < depth; dy += 1) {
            const key = `${position.x + dx},${position.y + dy}`;
            if (batchCells.has(key)) {
              return s;
            }
            if (s.map.tiles[key]) {
              if (!canOverlap || (dx === 0 && dy === 0)) {
                return s;
              }
              continue;
            }
            batchCells.add(key);
          }
        }
      }

      const totalCost = cost * positions.length;
      if (s.florins < totalCost) {
        return s;
      }

      const newTiles = { ...s.map.tiles };
      const founders: Artist[] = [];

      for (const position of positions) {
        const originX = position.x;
        const originY = position.y;
        const originVector: GridPos = { x: originX, y: originY };

        // Workshops open with a founding artist. Guard: demolish + rebuild on the
        // same origin within one tick leaves the old crew homed there (prune lags
        // a tick) — don't spawn a second founder into an occupied key.
        if (metadata.artistCapacity != null) {
          const key = `${originX},${originY}`;
          if (!s.artists.some((a) => a.homeTileKey === key)) {
            founders.push(createArtist(key, metadata.artistType ?? "painter"));
          }
        }

        for (let dx = 0; dx < width; dx += 1) {
          for (let dy = 0; dy < depth; dy += 1) {
            const cellX = originX + dx;
            const cellY = originY + dy;
            const key = `${cellX},${cellY}`;
            if (newTiles[key]) continue; // overlapped cell keeps its owner
            newTiles[key] = {
              buildingId,
              type,
              position: { x: cellX, y: cellY },
              origin: { ...originVector },
              isOrigin: dx === 0 && dy === 0,
              isActive: workersRequired === 0,
              rotation,
              workers: 0,
              builtTick: s.time.tickCount,
            };
          }
        }
      }

      placed = true;
      return {
        florins: s.florins - totalCost,
        ...(founders.length ? { artists: [...s.artists, ...founders] } : {}),
        map: {
          ...s.map,
          tiles: newTiles,
        }
      };
    });
    return placed;
  },

  removeTile: (position) =>
    set((s) => {
      const newTiles = { ...s.map.tiles };
      const tile = newTiles[`${position.x},${position.y}`];
      if (!tile) {
        return s;
      }
      const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
      const originX = tile.origin.x;
      const originY = tile.origin.y;
      const { width, depth } = metadata
        ? rotatedFootprint(metadata, tile.rotation)
        : { width: 1, depth: 1 };

      for (let dx = 0; dx < width; dx += 1) {
        for (let dy = 0; dy < depth; dy += 1) {
          const key = `${originX + dx},${originY + dy}`;
          const cell = newTiles[key];
          // Only clear this building's own cells — an overlapping decoration
          // (or the building it overlaps) keeps its claim.
          if (cell && cell.origin.x === originX && cell.origin.y === originY) {
            delete newTiles[key];
          }
        }
      }

      return { map: { ...s.map, tiles: newTiles } };
    }),

  getTileAt: (position) => {
    const state = get();
    return state.map.tiles[`${position.x},${position.y}`];
  },

  getHousing: () => {
    const tiles = get().map.tiles;
    // Plaza-connected homes hold more (Phase 10) — same strength map as the tick.
    const connected = computePlazaConnectivity(tiles);
    return Object.entries(tiles).reduce((total, [key, tile]) => {
      if (!tile.isOrigin) return total;
      const housing = BUILDING_METADATA_BY_ID[tile.buildingId]?.housing ?? 0;
      return total + Math.round(housing * (1 + PLAZA_CONNECTION_BONUS * (connected.get(key) ?? 0)));
    }, 0);
  },

  // Mirrors the tick's amenity ceiling (active service buildings, plaza-boosted).
  getAmenities: () => {
    const tiles = get().map.tiles;
    const connected = computePlazaConnectivity(tiles);
    return Object.entries(tiles).reduce((total, [key, tile]) => {
      if (!tile.isOrigin || !tile.isActive) return total;
      const base = BUILDING_METADATA_BY_ID[tile.buildingId]?.amenities ?? 0;
      return total + Math.round(base * (1 + PLAZA_CONNECTION_BONUS * (connected.get(key) ?? 0)));
    }, BASE_POPULATION_CAP);
  },

  getCalendarLabel: () => formatMonth(get().time.tickCount),
});

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export const formatMonth = (tick: number) =>
  `${MONTH_NAMES[tick % 12]} ${1400 + Math.floor(tick / 12)}`;

// ponytail: demo mode gets a black-hole storage so /?demo never reads or clobbers the real save
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const isDemo = () =>
  typeof window !== "undefined" && window.location.search.includes("demo");

export const useGameStore = create<GameState>()(
  persist(initializer, {
    name: "patronage-save",
    // v5: cathedral/tavern footprints grew — stamped tile spans no longer match
    // the metadata, so saves are discarded.
    // (v4: grid subdivided 2×; v3: commissions replaced free-play artworks;
    // v2: footprints rescaled — same policy.)
    version: 5,
    // SSR: hydrate manually from the game route's client effect
    skipHydration: true,
    storage: createJSONStorage(() => (isDemo() ? noopStorage : localStorage)),
    partialize: (s) => ({
      seed: s.seed,
      cityName: s.cityName,
      florins: s.florins,
      inspiration: s.inspiration,
      prestige: s.prestige,
      population: s.population,
      artists: s.artists,
      artworks: s.artworks,
      commissions: s.commissions,
      map: { tiles: s.map.tiles, selectedBuilding: null },
      time: s.time,
      tickInterval: s.tickInterval,
    }),
  }),
);
