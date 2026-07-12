import { create } from "zustand";
import type { StateCreator } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import type { Artist, Artwork, Commission } from "~/game/types";
import { BUILDING_METADATA_BY_ID, rotatedFootprint, type BuildingId } from "~/game/buildings";
import type { GridPos, Tile, TileMap } from "~/game/grid";
import { planPlacement } from "~/game/placementRules";
import { canAssignCommission, OFFER_EXPIRY_MONTHS } from "~/game/commissions";
import { createArtist } from "~/game/artists";
import { generateSeed, pickCityName } from "~/game/seed";
import { getSupply } from "~/game/materials";
import { getAmenityCapacity, getHousingCapacity } from "~/game/metrics";
import { advanceTick } from "~/game/tick";
import { BASE_TICK_INTERVAL } from "~/game/constants";

// The demolition tool rides the building-selection slot: camera-drag detach,
// grid visibility, and the palette's cancel keys all treat it like placement.
export const RAZE_TOOL = "raze" as const;

export interface MapState {
  tiles: TileMap;  // Key is "x,y"
  selectedBuilding: BuildingId | typeof RAZE_TOOL | null;
}

export interface TimeState {
  tickCount: number;
}

export type GameState = {
  seed: string;
  // Seed the run's map (water archetype, river course, coastline) derives
  // from; null = no water anywhere (old saves, demo). Kept separate from
  // `seed` so pre-water saves stay dry.
  mapSeed: string | null;
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
  // Origin key awaiting raze confirmation (building houses artists or a
  // commission); null = no prompt. Transient — never persisted.
  razeTarget: string | null;
  setRazeTarget: (key: string | null) => void;
  tick: () => void;
  map: MapState;
  time: TimeState;
  paused: boolean;
  togglePause: () => void;
  setPaused: (value: boolean) => void;
  tickInterval: number;
  setTickInterval: (value: number) => void;
  setSelectedBuilding: (id: BuildingId | typeof RAZE_TOOL | null) => void;
  placeTile: (position: GridPos, buildingId: BuildingId, rotation?: number) => boolean;
  placeTiles: (positions: GridPos[], buildingId: BuildingId, rotation?: number) => boolean;
  removeTile: (position: GridPos) => void;
  getTileAt: (position: GridPos) => Tile | undefined;
  getHousing: () => number;
  getAmenities: () => number;
  getCalendarLabel: () => string;
  resetGame: () => void;
};

// ?map=<seed> (dev): force the map's water layer for course/visual iteration —
// works with ?demo too (LAYOUT placements landing on water simply fail).
const devMapSeed = () => {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  // Lowercased: generated seeds are stored lowercase but the TopBar displays
  // them uppercase, so a pasted seed would otherwise hash to a different map.
  return new URLSearchParams(window.location.search).get("map")?.toLowerCase() ?? null;
};

const createInitialState = () => {
  // Demo mode is for stable screenshots — fix the seed so the city name (and any
  // future seed-driven visuals) don't change on every refresh.
  const seed = isDemo() ? "demo" : generateSeed();
  return {
    seed,
    // Demo stays dry: its hand-placed layout spans nearly the whole grid.
    mapSeed: devMapSeed() ?? (isDemo() ? null : seed),
    cityName: pickCityName(seed),
    florins: 2000,
    inspiration: 0,
    prestige: 0,
    population: 0,
    artists: [] as Artist[],
    artworks: [] as Artwork[],
    commissions: [] as Commission[],
    hoveredTileKey: null as string | null,
    razeTarget: null as string | null,
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
  setRazeTarget: (key) => set(() => ({ razeTarget: key })),

  tick: () =>
    set((s) => {
      const next = advanceTick(s);
      return {
        florins: next.florins,
        inspiration: next.inspiration,
        prestige: next.prestige,
        population: next.population,
        artists: next.artists,
        artworks: next.artworks,
        commissions: next.commissions,
        time: { tickCount: next.tickCount },
        map: next.tiles === s.map.tiles ? s.map : { ...s.map, tiles: next.tiles },
      };
    }),

  resetGame: () => set(createInitialState()),

  assignCommission: (commissionId, workshopKey) =>
    set((s) => {
      const commission = s.commissions.find((c) => c.id === commissionId);
      if (!commission) return s;
      // Founder = first artist homed at the workshop; work is tracked on them.
      const founder = s.artists.find((a) => a.homeTileKey === workshopKey);
      const supply = founder ? getSupply(s.map.tiles, s.artists)[founder.type] : undefined;
      if (!canAssignCommission(commission, workshopKey, founder, s.map.tiles, supply)) return s;
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
    set((s) => ({ map: { ...s.map, selectedBuilding: id }, razeTarget: null })),

  placeTile: (position, buildingId, rotation) => get().placeTiles([position], buildingId, rotation),

  placeTiles: (positions, buildingId, rotation) => {
    let placed = false;
    set((s) => {
      const plan = planPlacement(s, positions, buildingId, rotation);
      if (!plan) return s;
      const { metadata, footprint, freeCells, totalCost } = plan;
      const type = metadata.type;
      const { width, depth } = footprint;
      const workersRequired = metadata.workersRequired ?? 0;

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
            if (!freeCells.has(key)) continue; // overlapped cell keeps its owner
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

      // Razing salvages half the build cost. Homed artists depart now rather
      // than waiting for the tick's prune (keeps the roster honest while
      // paused, and a same-origin rebuild founds a fresh artist), and any
      // commission worked here re-opens — same shape as reconcileCommissions.
      const originKey = `${originX},${originY}`;
      const evicting = s.artists.some((a) => a.homeTileKey === originKey);
      const orphaned = s.commissions.some((c) => c.workshopKey === originKey);
      return {
        florins: s.florins + Math.floor((metadata?.baseCost ?? 0) / 2),
        ...(evicting ? { artists: s.artists.filter((a) => a.homeTileKey !== originKey) } : {}),
        ...(orphaned
          ? {
              commissions: s.commissions.map((c) =>
                c.workshopKey === originKey
                  ? { ...c, workshopKey: undefined, expiresTick: s.time.tickCount + OFFER_EXPIRY_MONTHS }
                  : c
              ),
            }
          : {}),
        map: { ...s.map, tiles: newTiles },
      };
    }),

  getTileAt: (position) => {
    const state = get();
    return state.map.tiles[`${position.x},${position.y}`];
  },

  getHousing: () => {
    return getHousingCapacity(get().map.tiles);
  },

  getAmenities: () => {
    return getAmenityCapacity(get().map.tiles);
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
    // v6: seeded map (water layer) added — the first *preserving* migration:
    // pre-water saves keep their city and get mapSeed: null (forever dry,
    // since a newly seeded river would collide with their buildings).
    // (v5: cathedral/tavern footprints grew — stamped tile spans no longer
    // matched the metadata, so saves were discarded; v4: grid subdivided 2×;
    // v3: commissions replaced free-play artworks; v2: footprints rescaled —
    // same discard policy.)
    version: 6,
    migrate: (persisted, version) => {
      // Pre-v5 saves keep the old discard policy: an empty patch merges into
      // the fresh initial state (same outcome as the no-migrate mismatch,
      // but the hydration lifecycle still completes for the loading gate).
      if (version < 5) return {};
      return version === 5 ? { ...(persisted as object), mapSeed: null } : persisted;
    },
    // SSR: hydrate manually from the game route's client effect
    skipHydration: true,
    storage: createJSONStorage(() => (isDemo() ? noopStorage : localStorage)),
    partialize: (s) => ({
      seed: s.seed,
      mapSeed: s.mapSeed,
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
