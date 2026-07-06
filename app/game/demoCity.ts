import { useGameStore } from "~/stores/useGameStore";
import type { BuildingId } from "./buildings";

// ponytail: dev-only visual test scene (load /?demo). Not reachable in normal play.
const LAYOUT: Array<[number, number, BuildingId]> = [
  [9, 9, "town_center_plaza"], // 5x5, occupies cells 9-13
  [5, 12, "plaza"], // secondary plaza (3x3) in the residential quarter
  [15, 9, "market"],
  [15, 7, "pigment_trader"],
  [15, 12, "workshop"],
  [6, 7, "cottage"],
  [7, 7, "cottage"],
  [6, 8, "cottage"],
  [7, 8, "cottage"],
  [8, 7, "cottage"],
  [6, 10, "townhouse"],
  [7, 10, "townhouse"],
  [6, 11, "townhouse"],
  // road ring around the town center plaza
  [8, 8, "road"], [8, 9, "road"], [8, 10, "road"], [8, 11, "road"], [8, 12, "road"], [8, 13, "road"], [8, 14, "road"],
  [9, 8, "road"], [10, 8, "road"], [11, 8, "road"], [12, 8, "road"], [13, 8, "road"], [14, 8, "road"],
  [14, 9, "road"], [14, 10, "road"], [14, 11, "road"], [14, 12, "road"], [14, 13, "road"], [14, 14, "road"],
  [9, 14, "road"], [10, 14, "road"], [11, 14, "road"], [12, 14, "road"], [13, 14, "road"],
  [5, 7, "tree"], [5, 10, "tree"], [9, 6, "tree"], [16, 6, "tree"],
  [17, 11, "tree"], [9, 16, "tree"], [11, 16, "tree"], [4, 10, "tree"],
];

export function seedDemoCity() {
  const state = useGameStore.getState();
  if (Object.keys(state.map.tiles).length > 0) return;
  const florins = state.florins;
  state.setFlorins(1_000_000);
  for (const [x, y, buildingId] of LAYOUT) {
    useGameStore.getState().placeTile({ x, y }, buildingId);
  }
  useGameStore.getState().setFlorins(florins);
}
