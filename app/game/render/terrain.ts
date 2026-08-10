import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Scene } from "@babylonjs/core/scene";

import { CELL_SIZE, GRID_SIZE } from "~/game/constants";
import { mulberry32, positionToneIndex, seededRng, smoothstep01 } from "~/game/random";
import type { WaterBody } from "~/game/map/water";
import { getElevation, groundHeight, LEVEL_HEIGHT, type Elevation } from "~/game/map/elevation";

const TERRAIN_SIZE = 320;
// Raised from 110 when the water layer landed: the river carve needs vertices
// close enough (2 wu) that the dilated channel dip always catches some.
const SUBDIVISIONS = 160;
/** Terrain stays flat out to here so the city sits on a plain. */
const FLAT_RADIUS = (GRID_SIZE * CELL_SIZE) / 2 + 3;
const HILL_RAMP = 18;

// Water shaping (G5). The channel dips well below the water surface (-0.08)
// so the coarse terrain never pokes up through it; the *visible* banks are
// waterMesh's fine ribbons — terrain just gets out of the way underneath.
const VALLEY_HALF_WIDTH = 6; // hills part this far around the river
const CHANNEL_DEPTH = 0.5;
// Vertices sample the channel dip as a min over ± this offset, so every
// triangle that touches water is pulled down even though the channel (1.2–4
// wu) is narrower than the 2-wu vertex spacing.
const CARVE_DILATION = 1.1;

// ponytail: two sine octaves, not real noise — reads as rolling farmland at this scale
// Seeded phases + mild frequency jitter vary the hill layout per map; null seed
// (pre-water saves, ?demo) keeps the classic constants so old scenery is untouched.
function makeHillHeight(mapSeed: string | null) {
  let [f1, f2, f3, f4] = [0.075, 0.065, 0.16, 0.14];
  let [p1, p2, p3, p4] = [1.3, 0.7, 3.1, 1.9];
  if (mapSeed != null) {
    const rand = seededRng(`hills:${mapSeed}`);
    const jitter = () => 0.8 + rand() * 0.4;
    [f1, f2, f3, f4] = [f1 * jitter(), f2 * jitter(), f3 * jitter(), f4 * jitter()];
    const phase = () => rand() * Math.PI * 2;
    [p1, p2, p3, p4] = [phase(), phase(), phase(), phase()];
  }
  return (x: number, z: number) => {
    const d = Math.max(Math.abs(x), Math.abs(z)) - FLAT_RADIUS;
    if (d <= 0) return 0;
    const t = Math.min(1, d / HILL_RAMP);
    const ramp = t * t * (3 - 2 * t); // smoothstep
    const n =
      Math.sin(x * f1 + p1) * Math.cos(z * f2 + p2) +
      0.45 * Math.sin(x * f3 + p3) * Math.cos(z * f4 + p4);
    return Math.max(0, ramp * (3.0 + n * 2.6));
  };
}

/** Analytic ground height including the water valley/channel/sea shaping. */
function makeHeightAt(
  water: WaterBody | null,
  hillHeight: (x: number, z: number) => number
): (x: number, z: number) => number {
  if (!water) return hillHeight;
  return (x, z) => {
    const rd = water.riverDistance(x, z);
    const sd = water.seaDistance(x, z);
    // Hills part into a river valley and never rise out of the sea.
    const hillMask = smoothstep01(rd / VALLEY_HALF_WIDTH) * (1 - smoothstep01((sd + 10) / 10));
    // Channel / sea floor dip. Kept narrow around the river so the flat city
    // plain stays flat right up to the buildable cells beside the water.
    const dip = Math.max(
      CHANNEL_DEPTH * (1 - smoothstep01((rd + 0.2) / 0.9)),
      CHANNEL_DEPTH * smoothstep01((sd + 1.5) / 3),
      // Estuary funnel: the mouth fans open underwater, matching waterMesh's
      // flared water sheet — otherwise the junction floor hovers at the
      // waterline and pokes through as sandbar facets.
      CHANNEL_DEPTH * smoothstep01((5.5 - rd) / 3.5) * smoothstep01((sd + 4) / 4)
    );
    return hillHeight(x, z) * hillMask - dip;
  };
}

const GRASS_TONES = ["#98a861", "#91a15d", "#9fac66"].map(Color3.FromHexString);
const FIELD_TONES = ["#c4a45e", "#ad9a55", "#b98e58", "#a3ac60"].map(Color3.FromHexString);
// Shoreline sand and underwater bed for faces near/inside the carve.
const SHORE_TONE = Color3.FromHexString("#b89d68");
const BED_TONE = Color3.FromHexString("#6b6a4e");
// Terrace cliff faces: exposed tufo, two tones so long walls don't read flat.
const CLIFF_TONES = ["#a08a63", "#94805d"].map(Color3.FromHexString);

// Terrace surfaces sit this far under the object base plane (groundHeight),
// the same relationship the flat plain's -0.01 has to y=0 — aprons (base
// +0.005) and roads (+0.01) clear it, and the rim stays above the big
// terrain's continuation just outside the grid.
const TERRACE_DROP = 0.008;

/** Overlay mesh for in-grid terraces: a flat quad per raised cell plus cliff
 * walls at every level step. Per-quad uniform colors keep the low-poly read;
 * grass tones quantize to 2-wu blocks so the mottle matches the big terrain's
 * facet scale instead of turning to per-cell noise. */
function createTerraceOverlay(scene: Scene, elevation: Elevation): Mesh | null {
  if (!elevation.hilly) return null;
  const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  type P = [number, number, number];
  // Perimeter-ordered quad, winding resolved against the outward normal (the
  // bridge-arch recipe) so no face comes out inverted.
  const quad = (pts: P[], n: P, color: Color3) => {
    const base = positions.length / 3;
    for (const p of pts) {
      positions.push(...p);
      normals.push(...n);
      colors.push(color.r, color.g, color.b, 1);
    }
    const [p0, p1, p2] = pts;
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    const cross =
      (ay * bz - az * by) * n[0] + (az * bx - ax * bz) * n[1] + (ax * by - ay * bx) * n[2];
    if (cross > 0) indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const topY = (level: number) => level * LEVEL_HEIGHT - TERRACE_DROP;
  for (let gy = 0; gy < GRID_SIZE; gy += 1) {
    for (let gx = 0; gx < GRID_SIZE; gx += 1) {
      const level = elevation.levelAt(gx, gy);
      if (level === 0) continue;
      const x0 = gx * CELL_SIZE - halfGrid;
      const z0 = gy * CELL_SIZE - halfGrid;
      const x1 = x0 + CELL_SIZE;
      const z1 = z0 + CELL_SIZE;
      const y = topY(level);
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const grass =
        GRASS_TONES[
          positionToneIndex(Math.floor(cx / 2) * 2, Math.floor(cz / 2) * 2, GRASS_TONES.length)
        ];
      quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, 1, 0], grass);

      // Cliff walls toward lower orthogonal neighbors (grid-edge cells skip:
      // the big terrain continues the rim height outside). Bottoms tuck 0.05
      // under the neighbor's surface so no seam shows.
      const cliff = CLIFF_TONES[positionToneIndex(cx, cz, CLIFF_TONES.length)];
      const wall = (nx: number, ny: number, pts: (b: number) => P[], n: P) => {
        if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) return;
        const neighbor = elevation.levelAt(nx, ny);
        if (neighbor < level) quad(pts(topY(neighbor) - 0.05), n, cliff);
      };
      wall(gx + 1, gy, (b) => [[x1, b, z0], [x1, b, z1], [x1, y, z1], [x1, y, z0]], [1, 0, 0]);
      wall(gx - 1, gy, (b) => [[x0, b, z0], [x0, b, z1], [x0, y, z1], [x0, y, z0]], [-1, 0, 0]);
      wall(gx, gy + 1, (b) => [[x0, b, z1], [x1, b, z1], [x1, y, z1], [x0, y, z1]], [0, 0, 1]);
      wall(gx, gy - 1, (b) => [[x0, b, z0], [x1, b, z0], [x1, y, z0], [x0, y, z0]], [0, 0, -1]);
    }
  }
  if (indices.length === 0) return null;

  const mesh = new Mesh("terrace-overlay", scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.colors = colors;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

type FieldPatch = { x: number; z: number; w: number; d: number; color: Color3 };

function makeFieldPatches(rand: () => number): FieldPatch[] {
  const patches: FieldPatch[] = [];
  for (let i = 0; i < 34; i += 1) {
    const angle = rand() * Math.PI * 2;
    const dist = FLAT_RADIUS + 8 + rand() * 70;
    patches.push({
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      w: 7 + rand() * 12,
      d: 6 + rand() * 10,
      color: FIELD_TONES[Math.floor(rand() * FIELD_TONES.length)],
    });
  }
  return patches;
}

export function createTerrain(
  scene: Scene,
  water: WaterBody | null = null,
  mapSeed: string | null = null,
  elevation: Elevation = getElevation(null)
) {
  const baseHeightAt = makeHeightAt(water, makeHillHeight(mapSeed));
  // In-grid terraces render as a separate overlay mesh (sharp per-cell cliffs
  // the 2-wu lattice can't hold); the big terrain stays the flat plain under
  // them. Beyond the grid the plain continues each rim cell's terrace height,
  // so a plateau touching the edge flows into the countryside instead of
  // dropping off — hills and the water carve add on top as before.
  const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
  const terraceBeyond = (x: number, z: number) =>
    Math.max(Math.abs(x), Math.abs(z)) < halfGrid ? 0 : groundHeight(elevation, x, z);
  const heightAt = (x: number, z: number) => baseHeightAt(x, z) + terraceBeyond(x, z);
  // Vertex displacement takes the min over a small neighborhood near water
  // (see CARVE_DILATION) — identical to heightAt away from the channel. The
  // terrace continuation adds after the dilation so a tall rim cell can't
  // read as "land to carve toward".
  const baseDisplacedAt = !water
    ? baseHeightAt
    : (x: number, z: number) =>
        Math.min(
          baseHeightAt(x, z),
          baseHeightAt(x + CARVE_DILATION, z),
          baseHeightAt(x - CARVE_DILATION, z),
          baseHeightAt(x, z + CARVE_DILATION),
          baseHeightAt(x, z - CARVE_DILATION)
        );
  const displacedAt = (x: number, z: number) => baseDisplacedAt(x, z) + terraceBeyond(x, z);

  const mesh = MeshBuilder.CreateGround(
    "terrain",
    { width: TERRAIN_SIZE, height: TERRAIN_SIZE, subdivisions: SUBDIVISIONS },
    scene
  );

  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 1] = displacedAt(positions[i], positions[i + 2]);
  }
  mesh.updateVerticesData(VertexBuffer.PositionKind, positions);

  // Bilinear sampler over the displaced vertex lattice: waterMesh's bank rims
  // must hug the *rendered* surface (the analytic height cuts corners on the
  // 2-wu facets), so they sample this instead of heightAt.
  const step = TERRAIN_SIZE / SUBDIVISIONS;
  const half = TERRAIN_SIZE / 2;
  const nodes = new Float32Array((SUBDIVISIONS + 1) * (SUBDIVISIONS + 1));
  for (let i = 0; i <= SUBDIVISIONS; i += 1) {
    for (let j = 0; j <= SUBDIVISIONS; j += 1) {
      nodes[i * (SUBDIVISIONS + 1) + j] = displacedAt(j * step - half, i * step - half);
    }
  }
  const surfaceAt = (x: number, z: number) => {
    const fx = Math.min(Math.max((x + half) / step, 0), SUBDIVISIONS - 1e-6);
    const fz = Math.min(Math.max((z + half) / step, 0), SUBDIVISIONS - 1e-6);
    const j = Math.floor(fx);
    const i = Math.floor(fz);
    const tx = fx - j;
    const tz = fz - i;
    const row = i * (SUBDIVISIONS + 1);
    const h00 = nodes[row + j];
    const h01 = nodes[row + j + 1];
    const h10 = nodes[row + SUBDIVISIONS + 1 + j];
    const h11 = nodes[row + SUBDIVISIONS + 2 + j];
    return (h00 * (1 - tx) + h01 * tx) * (1 - tz) + (h10 * (1 - tx) + h11 * tx) * tz;
  };

  mesh.convertToFlatShadedMesh(); // faceted low-poly hills

  // Face colors (uniform per triangle so the low-poly facets read): grass tone
  // variation plus rectangular field patches on the hills, sand near water.
  const patches = makeFieldPatches(
    mapSeed != null ? seededRng(`fields:${mapSeed}`) : mulberry32(1482)
  );
  const flat = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const colors = new Float32Array((flat.length / 3) * 4);
  for (let f = 0; f < flat.length; f += 9) {
    const x = (flat[f] + flat[f + 3] + flat[f + 6]) / 3;
    const z = (flat[f + 2] + flat[f + 5] + flat[f + 8]) / 3;
    let color = GRASS_TONES[positionToneIndex(x, z, GRASS_TONES.length)];
    for (const p of patches) {
      if (Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2) {
        color = p.color;
        break;
      }
    }
    if (water) {
      const rd = water.riverDistance(x, z);
      const sd = water.seaDistance(x, z);
      // Depth joins the distance tests so the estuary funnel tints itself:
      // facets fully under the water surface read bed; facets that touch
      // the waterline read sand (a steep wall poking above water is a sandy
      // bank, not dark bed).
      const yMax = Math.max(flat[f + 1], flat[f + 4], flat[f + 7]);
      const yMin = Math.min(flat[f + 1], flat[f + 4], flat[f + 7]);
      if (rd < 0.2 || sd > 0.5 || yMax < -0.13) color = BED_TONE;
      else if (rd < 1.6 || sd > -1.8 || yMin < -0.03) color = SHORE_TONE;
    }
    for (let v = 0; v < 3; v += 1) {
      const c = (f / 3 + v) * 4;
      colors[c] = color.r;
      colors[c + 1] = color.g;
      colors[c + 2] = color.b;
      colors[c + 3] = 1;
    }
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);

  const material = new StandardMaterial("terrain-mat", scene);
  material.diffuseColor = Color3.White(); // vertex colors carry the tones
  material.specularColor = Color3.Black();
  material.emissiveColor = new Color3(0.05, 0.05, 0.04);
  mesh.material = material;
  mesh.position.y = -0.01;
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();

  const terraces = createTerraceOverlay(scene, elevation);
  if (terraces) terraces.material = material;

  return {
    mesh,
    heightAt,
    surfaceAt,
    rand: mapSeed != null ? seededRng(`scatter:${mapSeed}`) : mulberry32(93),
  };
}
