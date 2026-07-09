import { useGameStore } from "~/stores/useGameStore";
import type { BuildingId } from "./buildings";

// Rectangular run of road cells, one entry per cell (demo seeds per-cell, the
// in-game drag tool widens stretches itself).
function road(x0: number, y0: number, x1: number, y1: number, id: BuildingId = "road") {
  const cells: Array<[number, number, BuildingId]> = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) cells.push([x, y, id]);
  }
  return cells;
}

// ponytail: dev-only visual test scene (load /?demo). Not reachable in normal play.
const LAYOUT: Array<[number, number, BuildingId, number?]> = [
  [24, 24, "town_center_plaza"], // 12x12, occupies cells 24-35
  [10, 38, "plaza"], // secondary plaza (8x8) in the residential quarter
  [38, 24, "market"], // 8x8
  [38, 16, "pigment_trader"], // 4x4
  [46, 16, "marble_supplier"], // 4x4
  [38, 34, "workshop"], // 6x4
  [48, 24, "bakery"], // 4x4
  [38, 38, "tavern"], // 6x4
  [46, 38, "tavern", 1], // rotated: 4x6
  [10, 18, "cottage"], // 4x4 each
  [16, 18, "cottage"],
  [10, 24, "cottage"],
  [16, 24, "cottage"],
  [10, 30, "townhouse"],
  [16, 30, "townhouse"],
  // 2-wide road ring around the town center plaza
  ...road(22, 22, 23, 37),
  ...road(36, 22, 37, 37),
  ...road(24, 22, 35, 23),
  ...road(24, 36, 35, 37),
  // 2-wide road spur west between the cottage and townhouse rows
  ...road(10, 28, 21, 29),
  // 1-wide path from the spur down to the secondary plaza (network refresh demo)
  ...road(14, 30, 14, 37, "path"),
  [8, 16, "tree"], [20, 16, "tree"], [6, 26, "tree"], [20, 34, "tree"],
  [44, 16, "tree"], [38, 12, "tree"], [32, 40, "tree"], [22, 40, "tree"],
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
  // Completed works so the gallery codex has content in demo mode.
  const founder = useGameStore.getState().artists[0];
  if (founder) {
    useGameStore.setState({
      artworks: [
        { id: "demo-art-1", name: "Madonna of the Lilies", requester: "The Church", artistId: founder.id, artistType: founder.type, completedTick: 14 },
        { id: "demo-art-2", name: "Portrait of Contessina de' Bardi", requester: "House Medici", artistId: founder.id, artistType: founder.type, completedTick: 43 },
      ],
    });
  }
}
