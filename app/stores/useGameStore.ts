import { create } from "zustand";
import type { StateCreator } from "zustand";

import type { BuildingType } from "~/game/types";
import { BUILDING_METADATA_BY_ID, type BuildingId } from "~/game/buildings";
import { createTick } from "~/game/tick";
import { BASE_TICK_INTERVAL } from "~/game/constants";

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
  workers: number;   // Number of workers assigned to this tile
}

export interface MapState {
  tiles: Record<string, Tile>;  // Key is "x,y"
  selectedBuilding: BuildingId | null;
}

export interface TimeState {
  tickCount: number;
}

export type GameState = {
  florins: number;
  inspiration: number;
  addFlorins: (amount: number) => void;
  setFlorins: (value: number) => void;
  tick: () => void;
  map: MapState;
  time: TimeState;
  paused: boolean;
  togglePause: () => void;
  setPaused: (value: boolean) => void;
  tickInterval: number;
  setTickInterval: (value: number) => void;
  setSelectedBuilding: (id: BuildingId | null) => void;
  placeTile: (position: GridPos, buildingId: BuildingId) => void;
  removeTile: (position: GridPos) => void;
  getTileAt: (position: GridPos) => Tile | undefined;
  getPopulationCapacity: () => number;
  getCalendarLabel: () => string;
};

const initializer: StateCreator<GameState> = (set, get) => ({
  florins: 500,
  inspiration: 0,
  addFlorins: (amount: number) => set((s) => ({ florins: s.florins + amount })),
  setFlorins: (value: number) => set(() => ({ florins: value })),

  tick: createTick(set, get),

  map: {
    tiles: {},
    selectedBuilding: null,
  },
  time: {
    tickCount: 0,
  },
  paused: false,
  tickInterval: BASE_TICK_INTERVAL,

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

  placeTile: (position, buildingId) =>
    set((s) => {
      const metadata = BUILDING_METADATA_BY_ID[buildingId];
      if (!metadata) {
        return s;
      }
      const type = metadata.type;
      const { baseCost: cost, footprint } = metadata;
      const width = footprint?.width ?? 1;
      const depth = footprint?.depth ?? 1;
      const originX = position.x;
      const originY = position.y;
      const workersRequired = metadata.workersRequired ?? 0;

      for (let dx = 0; dx < width; dx += 1) {
        for (let dy = 0; dy < depth; dy += 1) {
          const key = `${originX + dx},${originY + dy}`;
          if (s.map.tiles[key]) {
            return s;
          }
        }
      }

      if (s.florins < cost) {
        return s;
      }

      const newTiles = { ...s.map.tiles };
      const originVector: GridPos = { x: originX, y: originY };

      for (let dx = 0; dx < width; dx += 1) {
        for (let dy = 0; dy < depth; dy += 1) {
          const cellX = originX + dx;
          const cellY = originY + dy;
          const key = `${cellX},${cellY}`;
          newTiles[key] = {
            buildingId,
            type,
            position: { x: cellX, y: cellY },
            origin: { ...originVector },
            isOrigin: dx === 0 && dy === 0,
            isActive: workersRequired === 0,
            workers: 0,
          };
        }
      }

      return {
        florins: s.florins - cost,
        map: {
          ...s.map,
          tiles: newTiles,
        }
      };
    }),

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
      const width = metadata?.footprint.width ?? 1;
      const depth = metadata?.footprint.depth ?? 1;

      for (let dx = 0; dx < width; dx += 1) {
        for (let dy = 0; dy < depth; dy += 1) {
          delete newTiles[`${originX + dx},${originY + dy}`];
        }
      }

      return { map: { ...s.map, tiles: newTiles } };
    }),

  getTileAt: (position) => {
    const state = get();
    return state.map.tiles[`${position.x},${position.y}`];
  },

  getPopulationCapacity: () => {
    const state = get();
    return Object.values(state.map.tiles).reduce((total, tile) => {
      if (!tile.isOrigin) return total;
      const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
      return total + (metadata?.populationCapacity ?? 0);
    }, 0);
  },

  getCalendarLabel: () => {
    const state = get();
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    const monthsElapsed = state.time.tickCount;
    const monthIndex = monthsElapsed % 12;
    const year = 1400 + Math.floor(monthsElapsed / 12);
    return `${monthNames[monthIndex]} ${year}`;
  }
});

export const useGameStore = create<GameState>(initializer);
