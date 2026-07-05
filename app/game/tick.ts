import type { StateCreator } from "zustand";

import type { GameState } from "~/stores/useGameStore";
import { BUILDING_METADATA_BY_ID } from "~/game/buildings";


type StoreSet = Parameters<StateCreator<GameState>>[0];
type StoreGet = Parameters<StateCreator<GameState>>[1];


export const createTick = (set: StoreSet, get: StoreGet) =>
  () => {
    const state = get();
    
    const { florinDelta, inspirationDelta } = calculateResourceDeltas(state.map.tiles);
    const updatedTiles = updateBuildings(state.map.tiles, state.getPopulationCapacity());

    set((s) => ({
      florins: florinDelta ? s.florins + florinDelta : s.florins,
      inspiration: inspirationDelta ? s.inspiration + inspirationDelta : s.inspiration,
      time: { tickCount: s.time.tickCount + 1 },
      map: {
        ...s.map,
        tiles: updatedTiles,
      },
    }));
  };


const updateBuildings = (tiles: GameState["map"]["tiles"], totalPopulation: number) => {
  const updatedTiles: GameState["map"]["tiles"] = {};

  for (const [key, tile] of Object.entries(tiles)) {
    const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
    updatedTiles[key] = tile;

    // assign workers to buildings
    if (!!metadata.workersRequired && metadata.workersRequired > 0) {
      const availableWorkers = totalPopulation - Object.values(updatedTiles).reduce((acc, tile) => acc + (tile.workers || 0), 0);
      const workersToAssign = Math.min(availableWorkers, metadata.workersRequired - (tile.workers || 0));

      const isActive = tile.workers >= metadata.workersRequired;
      updatedTiles[key] = {
        ...tile, 
        workers: (tile.workers || 0) + workersToAssign,
        isActive: isActive 
      };

      // check if building is now active
      if (tile.isActive && !updatedTiles[key]?.isActive) {
        console.log(`Building ${tile.buildingId} has been activated.`);
      }
      console.log(`Tile ${key} (Building: ${tile.buildingId}) - Workers: ${tile.workers}, Active: ${isActive}`);
    }

    // TODO we can then do another pass to update buildings past minimum workers

  }

  return updatedTiles;
}



const calculateResourceDeltas = (tiles: GameState["map"]["tiles"]) => {
  let florinDelta = 0;
  let inspirationDelta = 0;

  for (const tile of Object.values(tiles)) {
    if (!tile.isOrigin || !tile.isActive) continue;
    const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
    const income = metadata?.generates?.income ?? 0;
    const inspiration = metadata?.generates?.inspiration ?? 0;
    florinDelta += income;
    inspirationDelta += inspiration;
  }

  return { florinDelta, inspirationDelta };
}
