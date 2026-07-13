import { useGameStore } from "~/stores/useGameStore";
import { LAYOUT } from "./demoLayout";

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
  // Completed works so the gallery codex + display slots have content in demo
  // mode. Placed across churches (painter easels), plazas + gardens (sculptor
  // plinths), the palazzo and the tavern — the whole city reads as full of art.
  // Only the first two filled painting slots per building render as easels, and
  // sculptor works only show on plinth slots (statue-kind interior slots are
  // popup-only) — see mapRenderer.buildDisplayArt.
  const artists = useGameStore.getState().artists;
  const painter = artists.find((a) => a.type === "painter");
  const sculptor = artists.find((a) => a.type === "sculptor");
  if (painter && sculptor) {
    const paint = painter.id;
    const carve = sculptor.id;
    useGameStore.setState({
      artworks: [
        // — Painter works, on facade easels (church hosts trickle prestige) —
        { id: "demo-art-1", name: "Madonna of the Lilies", requester: "The Church", artistId: paint, artistType: "painter", completedTick: 14, prestige: 8, displayedAt: { key: "18,34", slot: 0 } },
        { id: "demo-art-4", name: "The Annunciation", requester: "The Church", artistId: paint, artistType: "painter", completedTick: 33, prestige: 7, displayedAt: { key: "18,34", slot: 1 } },
        { id: "demo-art-5", name: "Saint Sebastian", requester: "The Church", artistId: paint, artistType: "painter", completedTick: 61, prestige: 6, displayedAt: { key: "14,56", slot: 0 } },
        { id: "demo-art-6", name: "Portrait of a Lady", requester: "House Medici", artistId: paint, artistType: "painter", completedTick: 47, prestige: 9, displayedAt: { key: "35,48", slot: 0 } },
        { id: "demo-art-7", name: "A Village Kermis", requester: "The Guilds", artistId: paint, artistType: "painter", completedTick: 55, prestige: 4, displayedAt: { key: "46,48", slot: 0 } },
        // — Sculptor works, on plinths (plazas + garden pedestals) —
        { id: "demo-art-3", name: "David in Marble", requester: "House Medici", artistId: carve, artistType: "sculptor", completedTick: 51, prestige: 12, displayedAt: { key: "34,34", slot: 0 } },
        { id: "demo-art-8", name: "The Three Graces", requester: "House Strozzi", artistId: carve, artistType: "sculptor", completedTick: 40, prestige: 9, displayedAt: { key: "12,48", slot: 0 } },
        { id: "demo-art-9", name: "Bust of the Gonfaloniere", requester: "The Guilds", artistId: carve, artistType: "sculptor", completedTick: 58, prestige: 7, displayedAt: { key: "54,16", slot: 0 } },
        { id: "demo-art-10", name: "Nymph of the Arno", requester: "House Pazzi", artistId: carve, artistType: "sculptor", completedTick: 64, prestige: 8, displayedAt: { key: "60,38", slot: 0 } },
        { id: "demo-art-11", name: "Bacchus", requester: "House Medici", artistId: carve, artistType: "sculptor", completedTick: 70, prestige: 10, displayedAt: { key: "110,34", slot: 0 } },
        // — In storage — exercises the gallery's "Display at…" flow —
        { id: "demo-art-2", name: "Portrait of Contessina de' Bardi", requester: "House Medici", artistId: paint, artistType: "painter", completedTick: 43, prestige: 8 },
        { id: "demo-art-12", name: "Study of a Rearing Horse", requester: "The Guilds", artistId: paint, artistType: "painter", completedTick: 68, prestige: 5 },
      ],
    });
  }
}
