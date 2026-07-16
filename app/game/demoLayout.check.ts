// Self-check for the ?demo layout: every hand-placed building must actually
// place — i.e. land clear of the seeded river and of every other building —
// and the two SW residential terraces must sit adjacent (row houses fill their
// footprint, so abutting them is what reads as a terrace). Guards against the
// map seed / grid size shifting the water under the layout (they just did: 80→120).
// Run: node --experimental-strip-types app/game/demoLayout.check.ts
import assert from "node:assert";

import { BUILDING_METADATA_BY_ID, rotatedFootprint } from "./buildings.ts";
import type { Tile, TileMap } from "./grid.ts";
import { planPlacement } from "./placementRules.ts";
import { DEMO_MAP_SEED, LAYOUT } from "./demoLayout.ts";

// --- 1. Replay LAYOUT exactly as seedDemoCity does, asserting every entry places.
const tiles: TileMap = {};
const state = { florins: Number.MAX_SAFE_INTEGER, mapSeed: DEMO_MAP_SEED, map: { tiles } };

const failures: string[] = [];
for (const [x, y, buildingId, rotation] of LAYOUT) {
  const plan = planPlacement(state, [{ x, y }], buildingId, rotation);
  if (!plan) {
    failures.push(`${buildingId} @ ${x},${y}${rotation != null ? ` r${rotation}` : ""}`);
    continue;
  }
  const { metadata, cells } = plan;
  for (const { x: dx, y: dy } of cells) {
    const key = `${x + dx},${y + dy}`;
    if (!plan.freeCells.has(key)) continue; // decoration overlapping an existing tile keeps its owner
    tiles[key] = {
      buildingId,
      type: metadata.type,
      position: { x: x + dx, y: y + dy },
      origin: { x, y },
      isOrigin: dx === 0 && dy === 0,
      isActive: true,
      rotation,
      workers: 0,
      builtTick: 0,
    } as Tile;
  }
}
assert.equal(
  failures.length,
  0,
  `demo buildings that fail to place (water/overlap/bounds):\n  ${failures.join("\n  ")}`
);

// --- 2. Terraces: row houses fill their footprint, so a terrace is just houses
// placed wall-to-wall. Count footprint edges that abut another residence.
function residentialSides(originKey: string): number {
  const tile = tiles[originKey]!;
  const { width, depth } = rotatedFootprint(BUILDING_METADATA_BY_ID[tile.buildingId], tile.rotation);
  const { x, y } = tile.position;
  const isRes = (cx: number, cy: number) =>
    BUILDING_METADATA_BY_ID[tiles[`${cx},${cy}`]?.buildingId!]?.type === "residential";
  const sides = [false, false, false, false]; // -x, +x, -y, +y
  for (let dy = 0; dy < depth; dy += 1) {
    sides[0] ||= isRes(x - 1, y + dy);
    sides[1] ||= isRes(x + width, y + dy);
  }
  for (let dx = 0; dx < width; dx += 1) {
    sides[2] ||= isRes(x + dx, y - 1);
    sides[3] ||= isRes(x + dx, y + depth);
  }
  return sides.filter(Boolean).length;
}

// Middle house of each terrace abuts a neighbour on both shared walls — the two
// SW vertical terraces (stacked, doors E/W) and the horizontal south-belt farm row.
for (const key of ["22,52", "22,56", "27,52", "27,56", "42,82"]) {
  assert.ok(residentialSides(key) >= 2, `terrace house ${key} should abut houses on both shared walls`);
}
// The lone cottage has no residential neighbour.
assert.equal(residentialSides("8,52"), 0, "isolated cottage 8,52 must stand alone");

console.log(`demoLayout.check: ${LAYOUT.length} entries place on seed "${DEMO_MAP_SEED}", terraces abut`);
