import type { StateCreator } from "zustand";

import type { GameState } from "~/stores/useGameStore";
import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { BASE_POPULATION_CAP } from "~/game/constants";
import { allocateWorkers, staffingEfficiency, type StaffableBuilding } from "~/game/workers";

type StoreSet = Parameters<StateCreator<GameState>>[0];
type StoreGet = Parameters<StateCreator<GameState>>[1];

export const createTick = (set: StoreSet, get: StoreGet) =>
  () => {
    const state = get();
    const tiles = state.map.tiles;

    const staffables: StaffableBuilding[] = [];
    for (const tile of Object.values(tiles)) {
      if (!tile.isOrigin) continue;
      const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
      if (!metadata) continue;
      staffables.push({
        key: `${tile.position.x},${tile.position.y}`,
        type: metadata.type,
        workersRequired: metadata.workersRequired ?? 0,
        maxWorkers: Math.max(metadata.workersRequired ?? 0, metadata.maxWorkers ?? 0),
      });
    }
    const allocation = allocateWorkers(staffables, state.population);

    let tilesChanged = false;
    const updatedTiles: GameState["map"]["tiles"] = {};
    for (const [key, tile] of Object.entries(tiles)) {
      const required = BUILDING_METADATA_BY_ID[tile.buildingId]?.workersRequired ?? 0;
      const workers = required > 0 ? allocation.get(`${tile.origin.x},${tile.origin.y}`) ?? 0 : 0;
      const isActive = workers >= required;
      if (tile.workers === workers && tile.isActive === isActive) {
        updatedTiles[key] = tile; // keep identity so renderer/tooltip skip unchanged tiles
      } else {
        updatedTiles[key] = { ...tile, workers, isActive };
        tilesChanged = true;
      }
    }

    // Population drifts one per month toward min(housing, amenities). Staffed
    // service buildings raise the ceiling past the unserviced base — the doc's
    // "services unlock population thresholds", no supply chains.
    let amenities = BASE_POPULATION_CAP;
    for (const tile of Object.values(updatedTiles)) {
      if (!tile.isOrigin || !tile.isActive) continue;
      amenities += BUILDING_METADATA_BY_ID[tile.buildingId]?.amenities ?? 0;
    }
    const populationCap = Math.min(state.getHousing(), amenities);
    const population = state.population + Math.sign(populationCap - state.population);

    // Staffing past the minimum boosts output linearly, up to +50% at maxWorkers.
    let florinDelta = 0;
    let inspirationDelta = 0;
    for (const tile of Object.values(updatedTiles)) {
      if (!tile.isOrigin || !tile.isActive) continue;
      const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
      if (!metadata?.generates) continue;
      const efficiency = staffingEfficiency(
        metadata.workersRequired ?? 0,
        metadata.maxWorkers ?? 0,
        tile.workers
      );
      florinDelta += (metadata.generates.income ?? 0) * efficiency;
      inspirationDelta += (metadata.generates.inspiration ?? 0) * efficiency;
    }

    set((s) => ({
      florins: s.florins + Math.round(florinDelta),
      inspiration: s.inspiration + Math.round(inspirationDelta),
      population,
      time: { tickCount: s.time.tickCount + 1 },
      map: tilesChanged ? { ...s.map, tiles: updatedTiles } : s.map,
    }));
  };
