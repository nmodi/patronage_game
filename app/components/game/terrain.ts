import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Scene } from "@babylonjs/core/scene";

import { CELL_SIZE, GRID_SIZE } from "~/game/constants";

const TERRAIN_SIZE = 320;
const SUBDIVISIONS = 110;
/** Terrain stays flat out to here so the city sits on a plain. */
const FLAT_RADIUS = (GRID_SIZE * CELL_SIZE) / 2 + 3;
const HILL_RAMP = 18;

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

const GRASS_TONES = ["#93ad60", "#8aa55a", "#9db267"].map(Color3.FromHexString);
const FIELD_TONES = ["#c4a45e", "#ad9a55", "#b98e58", "#a3ac60"].map(Color3.FromHexString);

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

export function createTerrain(scene: Scene) {
  const mesh = MeshBuilder.CreateGround(
    "terrain",
    { width: TERRAIN_SIZE, height: TERRAIN_SIZE, subdivisions: SUBDIVISIONS },
    scene
  );

  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 1] = hillHeight(positions[i], positions[i + 2]);
  }
  mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
  mesh.convertToFlatShadedMesh(); // faceted low-poly hills

  // Face colors (uniform per triangle so the low-poly facets read): grass tone
  // variation plus rectangular field patches on the hills.
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

  return { mesh, heightAt: hillHeight, rand: mulberry32(93) };
}
