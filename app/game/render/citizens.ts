import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { BASE_TICK_INTERVAL, CELL_SIZE } from "~/game/constants";
import { useGameStore, type Tile } from "~/stores/useGameStore";
import { gridToWorld } from "./mapRenderer";

// Cosmetic wanderers (design doc G5). Pure ambience: no tie to population,
// no sim meaning. They random-walk the tile network below.
// Any type:"road" tile is also walkable (path/road/avenue variants).
const WALKABLE_BUILDINGS = new Set(["plaza", "small_plaza", "town_center_plaza", "market"]);
const MAX_CITIZENS = 16;
const TILES_PER_CITIZEN = 8;
// ponytail: one foot height for all surfaces — road quads sit at 0.01, plaza/market
// pads at ~0.02, and the couple-centimeter hover is invisible at this scale.
const FOOT_Y = 0.03;
// ponytail: calibration knob — the kit has no humans, so person size is tuned by eye
// against kit anchors (townhouse story, lantern pole). Uniform, so feet stay at y=0.
const CITIZEN_SCALE = 1.75;

// Renaissance-muted robes: terracotta, brown, tan, ivory, sage.
const PALETTE = ["#a8503a", "#7a5c44", "#b3936a", "#ded3ba", "#8c9178"];

type GridPos = { x: number; y: number };

type Citizen = {
  mesh: Mesh;
  from: GridPos;
  to: GridPos;
  t: number; // 0..1 progress from `from` to `to`
  speed: number; // world units per second
};

const key = (p: GridPos) => `${p.x},${p.y}`;

// Both plaza models center a fountain on their (even-sided) footprint — keep the
// middle 4×4 cells (~2 world units) out of the walk network so nobody wades through it.
function isFountainCell(tile: Tile) {
  if (tile.buildingId !== "plaza" && tile.buildingId !== "town_center_plaza") return false;
  const { width, depth } = BUILDING_METADATA_BY_ID[tile.buildingId].footprint;
  const dx = tile.position.x - tile.origin.x;
  const dy = tile.position.y - tile.origin.y;
  return dx >= width / 2 - 2 && dx <= width / 2 + 1 && dy >= depth / 2 - 2 && dy <= depth / 2 + 1;
}

export function createCitizens(scene: Scene) {
  const materials = PALETTE.map((hex, i) => {
    const mat = new StandardMaterial(`citizen-mat-${i}`, scene);
    mat.diffuseColor = Color3.FromHexString(hex);
    mat.specularColor = Color3.Black();
    return mat;
  });

  // One low-poly meeple — tapered robe + head, flat shaded, cloned per citizen.
  // Rotationally symmetric on purpose: no need to face the walk direction.
  const body = MeshBuilder.CreateCylinder(
    "citizen-body",
    { height: 0.2, diameterBottom: 0.13, diameterTop: 0.07, tessellation: 6 },
    scene
  );
  body.position.y = 0.1;
  const head = MeshBuilder.CreateSphere("citizen-head", { diameter: 0.09, segments: 3 }, scene);
  head.position.y = 0.24;
  const template = Mesh.MergeMeshes([body, head], true, false)!;
  template.name = "citizen-template";
  template.convertToFlatShadedMesh();
  template.scaling.setAll(CITIZEN_SCALE);
  template.isPickable = false;
  template.setEnabled(false);

  let walkable = new Set<string>();
  let spawnTiles: GridPos[] = [];
  const citizens: Citizen[] = [];

  function pickDestination(citizen: Citizen, cameFrom: GridPos) {
    const { x, y } = citizen.from;
    const options = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ].filter((n) => walkable.has(key(n)));
    const ahead = options.filter((n) => n.x !== cameFrom.x || n.y !== cameFrom.y);
    const pool = ahead.length > 0 ? ahead : options;
    // Isolated tile: stand in place (t keeps cycling, so this re-checks periodically).
    citizen.to = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : citizen.from;
    citizen.t = 0;
  }

  function placeAt(citizen: Citizen, tile: GridPos) {
    citizen.from = tile;
    citizen.to = tile;
    citizen.t = 1; // forces a destination pick on the next frame
    // Position now, not on the next frame — spawns while paused must not sit at origin.
    const p = gridToWorld(tile.x, tile.y);
    citizen.mesh.position.set(p.x, FOOT_Y, p.z);
  }

  function randomTile() {
    return spawnTiles[Math.floor(Math.random() * spawnTiles.length)];
  }

  function spawn(): Citizen {
    const mesh = template.clone(`citizen-${citizens.length}`);
    mesh.setEnabled(true);
    mesh.isPickable = false;
    mesh.material = materials[Math.floor(Math.random() * materials.length)];
    const citizen: Citizen = {
      mesh,
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      t: 1,
      speed: 0.3 + Math.random() * 0.2, // a stroll, with a little variety
    };
    placeAt(citizen, randomTile());
    return citizen;
  }

  const observer = scene.onBeforeRenderObservable.add(() => {
    const { paused, tickInterval } = useGameStore.getState();
    if (citizens.length === 0 || paused) return;
    // Walk speed tracks sim speed (tickInterval = BASE / multiplier).
    const dt = (scene.getEngine().getDeltaTime() / 1000) * (BASE_TICK_INTERVAL / tickInterval);
    for (const citizen of citizens) {
      citizen.t += (citizen.speed * dt) / CELL_SIZE;
      if (citizen.t >= 1) {
        const cameFrom = citizen.from;
        citizen.from = citizen.to;
        pickDestination(citizen, cameFrom);
      }
      const a = gridToWorld(citizen.from.x, citizen.from.y);
      const b = gridToWorld(citizen.to.x, citizen.to.y);
      const t = Math.min(citizen.t, 1);
      citizen.mesh.position.set(a.x + (b.x - a.x) * t, FOOT_Y, a.z + (b.z - a.z) * t);
    }
  });

  function sync(tiles: Record<string, Tile>) {
    walkable = new Set();
    spawnTiles = [];
    for (const tile of Object.values(tiles)) {
      if ((tile.type === "road" || WALKABLE_BUILDINGS.has(tile.buildingId)) && !isFountainCell(tile)) {
        walkable.add(key(tile.position));
        spawnTiles.push(tile.position);
      }
    }

    const desired = Math.min(MAX_CITIZENS, Math.ceil(spawnTiles.length / TILES_PER_CITIZEN));
    while (citizens.length > desired) citizens.pop()!.mesh.dispose();
    while (citizens.length < desired) citizens.push(spawn());

    // Anyone standing on a demolished tile respawns somewhere walkable.
    for (const citizen of citizens) {
      if (!walkable.has(key(citizen.from)) || !walkable.has(key(citizen.to))) {
        placeAt(citizen, randomTile());
      }
    }
  }

  function dispose() {
    scene.onBeforeRenderObservable.remove(observer);
    for (const citizen of citizens) citizen.mesh.dispose();
    citizens.length = 0;
    template.dispose();
    for (const mat of materials) mat.dispose();
  }

  return { sync, dispose };
}
