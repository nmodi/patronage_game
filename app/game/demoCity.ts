import { useGameStore } from "~/stores/useGameStore";
import type { BuildingId } from "./buildings";

// ponytail: dev-only visual test scene (load /?demo). Not reachable in normal play.
const LAYOUT: Array<[number, number, BuildingId, number?]> = [
  [12, 12, "town_center_plaza"], // 6x6, occupies cells 12-17
  [5, 19, "plaza"], // secondary plaza (4x4) in the residential quarter
  [19, 12, "market"], // 4x4
  [19, 8, "pigment_trader"], // 2x2
  [19, 17, "workshop"], // 3x2
  [24, 12, "bakery"], // 2x2
  [19, 19, "tavern"], // 3x2
  [23, 19, "tavern", 1], // rotated: 2x3
  [5, 9, "cottage"], // 2x2 each
  [8, 9, "cottage"],
  [5, 12, "cottage"],
  [8, 12, "cottage"],
  [5, 15, "townhouse"],
  [8, 15, "townhouse"],
  // road ring around the town center plaza
  [11, 11, "road"], [11, 12, "road"], [11, 13, "road"], [11, 14, "road"], [11, 15, "road"], [11, 16, "road"], [11, 17, "road"], [11, 18, "road"],
  [18, 11, "road"], [18, 12, "road"], [18, 13, "road"], [18, 14, "road"], [18, 15, "road"], [18, 16, "road"], [18, 17, "road"], [18, 18, "road"],
  [12, 11, "road"], [13, 11, "road"], [14, 11, "road"], [15, 11, "road"], [16, 11, "road"], [17, 11, "road"],
  [12, 18, "road"], [13, 18, "road"], [14, 18, "road"], [15, 18, "road"], [16, 18, "road"], [17, 18, "road"],
  // spur west into the residential quarter
  [5, 14, "road"], [6, 14, "road"], [7, 14, "road"], [8, 14, "road"], [9, 14, "road"], [10, 14, "road"],
  [4, 8, "tree"], [10, 8, "tree"], [3, 13, "tree"], [10, 17, "tree"],
  [22, 8, "tree"], [19, 6, "tree"], [16, 20, "tree"], [11, 20, "tree"],
];

export function seedDemoCity() {
  const state = useGameStore.getState();
  if (Object.keys(state.map.tiles).length > 0) return;
  const florins = state.florins;
  state.setFlorins(1_000_000);
  for (const [x, y, buildingId, rotation] of LAYOUT) {
    useGameStore.getState().placeTile({ x, y }, buildingId, rotation);
  }
  useGameStore.getState().setFlorins(florins);
  // Fill the town and run one tick so buildings render staffed even under &pause.
  useGameStore.getState().setPopulation(useGameStore.getState().getHousing());
  useGameStore.getState().tick();
}
