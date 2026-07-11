import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Scene } from "@babylonjs/core/scene";

import { CELL_SIZE, GRID_SIZE } from "~/game/constants";
import type { WaterBody } from "~/game/water";

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
function hillHeight(x: number, z: number) {
  const d = Math.max(Math.abs(x), Math.abs(z)) - FLAT_RADIUS;
  if (d <= 0) return 0;
  const t = Math.min(1, d / HILL_RAMP);
  const ramp = t * t * (3 - 2 * t); // smoothstep
  const n =
    Math.sin(x * 0.075 + 1.3) * Math.cos(z * 0.065 + 0.7) +
    0.45 * Math.sin(x * 0.16 + 3.1) * Math.cos(z * 0.14 + 1.9);
  return Math.max(0, ramp * (3.0 + n * 2.6));
}

function smoothstep01(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Analytic ground height including the water valley/channel/sea shaping. */
function makeHeightAt(water: WaterBody | null): (x: number, z: number) => number {
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
      CHANNEL_DEPTH * smoothstep01((sd + 1.5) / 3)
    );
    return hillHeight(x, z) * hillMask - dip;
  };
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRASS_TONES = ["#98a861", "#91a15d", "#9fac66"].map(Color3.FromHexString);
const FIELD_TONES = ["#c4a45e", "#ad9a55", "#b98e58", "#a3ac60"].map(Color3.FromHexString);
// Shoreline sand and underwater bed for faces near/inside the carve.
const SHORE_TONE = Color3.FromHexString("#b89d68");
const BED_TONE = Color3.FromHexString("#6b6a4e");

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

export function createTerrain(scene: Scene, water: WaterBody | null = null) {
  const heightAt = makeHeightAt(water);
  // Vertex displacement takes the min over a small neighborhood near water
  // (see CARVE_DILATION) — identical to heightAt away from the channel.
  const displacedAt = !water
    ? heightAt
    : (x: number, z: number) =>
        Math.min(
          heightAt(x, z),
          heightAt(x + CARVE_DILATION, z),
          heightAt(x - CARVE_DILATION, z),
          heightAt(x, z + CARVE_DILATION),
          heightAt(x, z - CARVE_DILATION)
        );

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
  const rand = mulberry32(1482);
  const patches = makeFieldPatches(rand);
  const flat = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const colors = new Float32Array((flat.length / 3) * 4);
  for (let f = 0; f < flat.length; f += 9) {
    const x = (flat[f] + flat[f + 3] + flat[f + 6]) / 3;
    const z = (flat[f + 2] + flat[f + 5] + flat[f + 8]) / 3;
    const hash = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453);
    let color = GRASS_TONES[Math.floor(hash % GRASS_TONES.length)];
    for (const p of patches) {
      if (Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2) {
        color = p.color;
        break;
      }
    }
    if (water) {
      const rd = water.riverDistance(x, z);
      const sd = water.seaDistance(x, z);
      if (rd < 0.2 || sd > 0.5) color = BED_TONE;
      else if (rd < 1.6 || sd > -1.8) color = SHORE_TONE;
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

  return { mesh, heightAt, surfaceAt, rand: mulberry32(93) };
}
