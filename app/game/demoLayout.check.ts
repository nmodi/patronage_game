// Self-check for the ?demo layout: every hand-placed building must actually
// place — i.e. land clear of the seeded river and of every other building —
// and the two SW residential terraces must row-house-blend. Guards against the
// map seed / grid size shifting the water under the layout (they just did: 80→120).
// Run: node --experimental-strip-types app/game/demoLayout.check.ts
import assert from "node:assert";

import { BUILDING_METADATA_BY_ID, rotatedFootprint } from "./buildings.ts";
import type { GridPos, Tile, TileMap } from "./grid.ts";
import { planPlacement } from "./placementRules.ts";
import {
  doorLocalSide,
  effectiveRotation,
  getBlendGroup,
  localSideForGrid,
  type GridSide,
} from "./render/modelManifest.ts";
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
  const { metadata, footprint } = plan;
  for (let dx = 0; dx < footprint.width; dx += 1) {
    for (let dy = 0; dy < footprint.depth; dy += 1) {
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
}
assert.equal(
  failures.length,
  0,
  `demo buildings that fail to place (water/overlap/bounds):\n  ${failures.join("\n  ")}`
);

// --- 2. Row-house blending: a port of mapRenderer.computeBlend (Babylon-free),
// so the terrace houses are verified to actually merge and the lone house not.
const OPPOSITE: Record<GridSide, GridSide> = { posX: "negX", negX: "posX", posY: "negY", negY: "posY" };

function blendSides(originKey: string): Set<string> {
  const tile = tiles[originKey]!;
  const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
  const group = getBlendGroup(tile.buildingId);
  const r = effectiveRotation(tile.buildingId, tile.position, tile.rotation);
  const door = doorLocalSide(tile.buildingId);
  const { width, depth } = rotatedFootprint(metadata, tile.rotation);
  const { x, y } = tile.position;
  const strips: Record<GridSide, GridPos[]> = { negX: [], posX: [], negY: [], posY: [] };
  for (let dy = 0; dy < depth; dy += 1) {
    strips.negX.push({ x: x - 1, y: y + dy });
    strips.posX.push({ x: x + width, y: y + dy });
  }
  for (let dx = 0; dx < width; dx += 1) {
    strips.negY.push({ x: x + dx, y: y - 1 });
    strips.posY.push({ x: x + dx, y: y + depth });
  }
  const blend = new Set<string>();
  for (const gridSide of Object.keys(strips) as GridSide[]) {
    if (localSideForGrid(gridSide, r) === door) continue;
    const facing = OPPOSITE[gridSide];
    for (const cell of strips[gridSide]) {
      const neighbor = tiles[`${cell.x},${cell.y}`];
      if (!neighbor || getBlendGroup(neighbor.buildingId) !== group) continue;
      const origin = tiles[`${neighbor.origin.x},${neighbor.origin.y}`]!;
      const rn = effectiveRotation(origin.buildingId, origin.position, origin.rotation);
      if (localSideForGrid(facing, rn) === doorLocalSide(origin.buildingId)) continue;
      blend.add(localSideForGrid(gridSide, r));
      break;
    }
  }
  return blend;
}

// Middle house of each terrace blends on both shared walls — the two SW
// vertical terraces (stacked, doors E/W) and the horizontal south-belt farm row.
for (const key of ["22,52", "22,56", "27,52", "27,56", "42,82"]) {
  assert.ok(blendSides(key).size >= 2, `terrace house ${key} should blend on both shared walls`);
}
// The lone cottage has no same-group neighbor → no blend.
assert.equal(blendSides("8,52").size, 0, "isolated cottage 8,52 must not blend");

console.log(`demoLayout.check: ${LAYOUT.length} entries place on seed "${DEMO_MAP_SEED}", terraces blend`);
