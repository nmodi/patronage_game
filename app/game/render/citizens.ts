import type { Scene } from "@babylonjs/core/scene";

import { BUILDING_METADATA_BY_ID } from "~/game/buildings";
import { BASE_TICK_INTERVAL, CELL_SIZE } from "~/game/constants";
import { gridToWorld, type GridPos, type Tile, type TileMap } from "~/game/grid";
import { useGameStore } from "~/stores/useGameStore";
import {
  createPrimitiveFigureFactory,
  type CitizenFigure,
  type FigureLocomotion,
} from "./citizenFigures";

// Cosmetic wanderers (design doc G5). Pure ambience: no tie to population,
// no sim meaning. They random-walk the tile network below.
// Any type:"road" tile is also walkable (path/road/avenue variants).
const WALKABLE_BUILDINGS = new Set(["plaza", "small_plaza", "town_center_plaza", "market"]);
const MAX_CITIZENS = 16;
const TILES_PER_CITIZEN = 8;
// ponytail: one foot height for all surfaces — road quads sit at 0.01, plaza/market
// pads at ~0.02, and the couple-centimeter hover is invisible at this scale.
const FOOT_Y = 0.03;
// World units per full two-step gait cycle; the figure's bob/sway advances by
// distance travelled, so it tracks walk speed and sim speed for free.
const STRIDE_LEN = 0.22;
// Yaw smoothing rate (per second) — a 90° grid turn resolves in ~0.2s.
const TURN_RATE = 12;

type Citizen = {
  figure: CitizenFigure;
  from: GridPos;
  to: GridPos;
  t: number; // 0..1 progress from `from` to `to`
  speed: number; // world units per second
  yaw: number; // current smoothed heading, radians
  phase: number; // gait stride phase, radians
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
  const factory = createPrimitiveFigureFactory(scene);

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
      // Diagonal roads are corner-touching staircases; the rotated ribbon
      // visually covers the center-to-center diagonal, so plain 8-adjacency
      // reads fine (no corner-cut rule — a 1-wide diagonal has grass flanks
      // and a corner-cut requirement would forbid walking it at all).
      { x: x + 1, y: y + 1 },
      { x: x + 1, y: y - 1 },
      { x: x - 1, y: y + 1 },
      { x: x - 1, y: y - 1 },
    ].filter((n) => walkable.has(key(n)));
    const ahead = options.filter((n) => n.x !== cameFrom.x || n.y !== cameFrom.y);
    const pool = ahead.length > 0 ? ahead : options;
    // Isolated tile: stand in place (t keeps cycling, so this re-checks periodically).
    citizen.to = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : citizen.from;
    citizen.t = 0;
  }

  // Snaps a citizen onto a tile and poses its figure immediately — spawns while
  // paused must not sit at the origin, and yaw is snapped (not smoothed) so a
  // respawn doesn't pirouette from its old heading.
  function placeAt(citizen: Citizen, tile: GridPos) {
    citizen.from = tile;
    citizen.to = tile;
    citizen.t = 1; // forces a destination pick on the next frame
    citizen.phase = Math.random() * Math.PI * 2; // desync the crowd's gait
    const p = gridToWorld(tile.x, tile.y);
    citizen.figure.update(
      { x: p.x, y: FOOT_Y, z: p.z, yaw: citizen.yaw, stridePhase: citizen.phase, moving: false, speed: 0 },
      0
    );
  }

  function randomTile() {
    return spawnTiles[Math.floor(Math.random() * spawnTiles.length)];
  }

  function spawn(): Citizen {
    const citizen: Citizen = {
      figure: factory.create(),
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      t: 1,
      speed: 0.3 + Math.random() * 0.2, // a stroll, with a little variety
      yaw: Math.random() * Math.PI * 2,
      phase: 0,
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
      // A diagonal hop spans √2 cells — scale progress so walk speed stays
      // constant in world units.
      const stepLen =
        citizen.from.x !== citizen.to.x && citizen.from.y !== citizen.to.y ? Math.SQRT2 : 1;
      citizen.t += (citizen.speed * dt) / (CELL_SIZE * stepLen);
      if (citizen.t >= 1) {
        const cameFrom = citizen.from;
        citizen.from = citizen.to;
        pickDestination(citizen, cameFrom);
      }
      const a = gridToWorld(citizen.from.x, citizen.from.y);
      const b = gridToWorld(citizen.to.x, citizen.to.y);
      const t = Math.min(citizen.t, 1);
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;

      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const moving = dx !== 0 || dz !== 0;
      if (moving) {
        // Smoothly turn toward the travel direction (shortest angle).
        const targetYaw = Math.atan2(dx, dz);
        let d = targetYaw - citizen.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        citizen.yaw += d * Math.min(1, dt * TURN_RATE);
        // Advance the gait by distance so bob/sway match the walk speed.
        citizen.phase += citizen.speed * dt * ((Math.PI * 2) / STRIDE_LEN);
      }

      const loco: FigureLocomotion = {
        x,
        y: FOOT_Y,
        z,
        yaw: citizen.yaw,
        stridePhase: citizen.phase,
        moving,
        speed: citizen.speed,
      };
      citizen.figure.update(loco, dt);
    }
  });

  function sync(tiles: TileMap) {
    walkable = new Set();
    spawnTiles = [];
    for (const tile of Object.values(tiles)) {
      if ((tile.type === "road" || WALKABLE_BUILDINGS.has(tile.buildingId)) && !isFountainCell(tile)) {
        walkable.add(key(tile.position));
        spawnTiles.push(tile.position);
      }
    }

    const desired = Math.min(MAX_CITIZENS, Math.ceil(spawnTiles.length / TILES_PER_CITIZEN));
    while (citizens.length > desired) citizens.pop()!.figure.dispose();
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
    for (const citizen of citizens) citizen.figure.dispose();
    citizens.length = 0;
    factory.dispose();
  }

  return { sync, dispose };
}
