// Self-check for the generated kit pieces: each must drop into the envelope of
// the Kenney piece it replaces, because every manifest position and `fit` value
// is tuned to those bounds. A builder that drifts misaligns silently.
// Run: npx tsx app/game/render/proceduralPieces.check.ts
import assert from "node:assert";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";

import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";

import {
  BLOCK_ENVELOPE,
  PROC_FILES,
  ROOF_ENVELOPE,
  KIT_TILE_RANGE,
  ROOF_TILE_BULGE,
  buildProceduralContainer,
} from "./proceduralPieces.ts";

const engine = new NullEngine();
const scene = new Scene(engine);

const EPS = 1e-4;

function bounds(file: string) {
  const container = buildProceduralContainer(file, scene);
  const mesh = container.meshes[0]! as Mesh;
  mesh.refreshBoundingInfo();
  const box = mesh.getBoundingInfo().boundingBox;
  return {
    min: [box.minimum.x, box.minimum.y, box.minimum.z],
    max: [box.maximum.x, box.maximum.y, box.maximum.z],
    material: container.materials[0]!.name,
    meshCount: container.meshes.length,
    colors: mesh.getVerticesData(VertexBuffer.ColorKind),
  };
}

function assertEnvelope(file: string, want: { min: readonly number[]; max: readonly number[] }) {
  const got = bounds(file);
  for (let i = 0; i < 3; i++) {
    assert.ok(
      Math.abs(got.min[i] - want.min[i]) < EPS,
      `${file} min[${i}] = ${got.min[i]}, want ${want.min[i]}`
    );
    assert.ok(
      Math.abs(got.max[i] - want.max[i]) < EPS,
      `${file} max[${i}] = ${got.max[i]}, want ${want.max[i]}`
    );
  }
}

// Every piece centers on x/z — that is what lets the manifest pick a face by
// rotationY. Only the roof leaves its base, and only by a tile lap (below).
for (const file of PROC_FILES) {
  const { min, max } = bounds(file);
  assert.ok(Math.abs(min[0] + max[0]) < EPS, `${file}: not centered on x`);
  assert.ok(Math.abs(min[2] + max[2]) < EPS, `${file}: not centered on z`);
  if (file !== "proc:roof-gable") {
    assert.ok(Math.abs(min[1]) < EPS, `${file}: min.y = ${min[1]}, must be 0 (base-center origin)`);
  }
}

// proc:block replaces wall-block.glb, the structural unit — it must be the
// exact cube or every stacked storey and every scaled prop drifts.
assertEnvelope("proc:block", BLOCK_ENVELOPE);

// The roof's core fills the kit envelope and its barrels stand proud of it, so
// it must COVER the envelope and overhang by no more than a tile. Pinning it
// both ways is what stops a silent regrowth (a roof that quietly gains height
// lifts off the wall it sits on).
const roof = bounds("proc:roof-gable");
for (let i = 0; i < 3; i++) {
  assert.ok(
    roof.min[i] <= ROOF_ENVELOPE.min[i] + EPS && roof.min[i] >= ROOF_ENVELOPE.min[i] - ROOF_TILE_BULGE,
    `roof min[${i}] = ${roof.min[i]}, want within ${ROOF_TILE_BULGE} under ${ROOF_ENVELOPE.min[i]}`
  );
  assert.ok(
    roof.max[i] >= ROOF_ENVELOPE.max[i] - EPS && roof.max[i] <= ROOF_ENVELOPE.max[i] + ROOF_TILE_BULGE,
    `roof max[${i}] = ${roof.max[i]}, want within ${ROOF_TILE_BULGE} over ${ROOF_ENVELOPE.max[i]}`
  );
}

// Material names are the MATERIAL_TINTS lookup key; a rename silently drops the
// piece back to its fallback albedo.
assert.equal(bounds("proc:block").material, "stucco");
assert.equal(bounds("proc:gable-end").material, "stucco");
assert.equal(bounds("proc:roof-gable").material, "tile");

// One mesh per piece keeps the batch key (`${file}#${i}`) stable.
for (const file of PROC_FILES) assert.equal(bounds(file).meshCount, 1, `${file}: expected 1 mesh`);

// The gable end shares the roof's transform and hides inside the roof shell.
// These three are the whole reason it's a separate piece — if any fail, the
// stucco triangle shows through the tiles (which is the bug the kit's baked-in
// gable had, just inverted).
const gable = bounds("proc:gable-end");
assert.ok(
  gable.max[0] < ROOF_ENVELOPE.max[0] && gable.min[0] > ROOF_ENVELOPE.min[0],
  `gable-end x ${gable.min[0]}..${gable.max[0]} escapes the roof's verge`
);
// Strictly below the ridge: the gable sits on the roof's CORE slope, and the
// tile barrels stand proud of that core. Equal height means it pokes through
// every valley between tiles.
assert.ok(
  gable.max[1] < ROOF_ENVELOPE.max[1] - 0.01,
  `gable-end apex ${gable.max[1]} is not tucked under the tiles (ridge ${ROOF_ENVELOPE.max[1]})`
);
// ...but it must still reach the wall plane it closes, or the wall top notches.
assert.ok(
  Math.abs(gable.max[2] - 0.5) < 0.02,
  `gable-end z ${gable.max[2]} does not meet the wall plane at 0.5`
);

// Vertex colors carry the shading the kit baked into its atlas. Lose them and
// the pieces silently fall back to one flat color, which is exactly how the
// first cut of these shipped walls that glowed — the bounds checks above were
// all green while it did.
for (const file of PROC_FILES) {
  assert.ok(bounds(file).colors, `${file}: no vertex colors`);
}

// THE glow regression. Kenney bakes an ambient-occlusion ramp into the stucco
// (#c6bba4 at the footing to #f3e4c9 at the eave) and the panels still on the
// buildings carry it. The first cut replaced that whole ramp with its brightest
// band, so every wall rendered at peak brightness. Pin the average against the
// kit's, measured off colormap.png area-weighted: #dcd0b6.
const KIT_STUCCO_AVG = [0xdc, 0xd0, 0xb6];
for (const [file, want] of [
  ["proc:block", KIT_STUCCO_AVG],
  // The gable is flat at the ramp's TOP: its base meets the bright end of the
  // block's ramp, so it matches the wall there rather than on average.
  ["proc:gable-end", [0xf3, 0xe4, 0xc9]],
] as const) {
  const container = buildProceduralContainer(file, scene);
  const base = (container.materials[0]! as PBRMaterial).albedoColor.toGammaSpace();
  const colors = (container.meshes[0]! as Mesh).getVerticesData(VertexBuffer.ColorKind)!;
  let sum = 0;
  for (let i = 0; i < colors.length; i += 4) sum += colors[i]!;
  const mean = sum / (colors.length / 4);
  const got = [base.r, base.g, base.b].map((c) => Math.round(c * mean * 255));
  for (let i = 0; i < 3; i++) {
    assert.ok(
      Math.abs(got[i]! - want[i]!) <= 5,
      `${file} mean stucco ch${i} = ${got[i]}, want ~${want[i]} (kit's baked average)`
    );
  }
}

// Tiles must actually vary — a single shade is the "large vertical tubes" read.
const tileShades = new Set<number>();
const roofColors = bounds("proc:roof-gable").colors!;
for (let i = 0; i < roofColors.length; i += 4) tileShades.add(Math.round(roofColors[i]! * 100));
assert.ok(tileShades.size >= 4, `roof tiles use ${tileShades.size} shades, want variation`);

// Roof tiles must stay inside the kit's measured range. The ceiling is the load
// bearing half: this scene lights a sun-facing slope at ~1.9x, so a tile paler
// than the kit's palest clips red and renders pale sand instead of terracotta.
// (Bounds and shade-count checks above were all green while it did exactly that.)
{
  const roofMat = buildProceduralContainer("proc:roof-gable", scene).materials[0]! as PBRMaterial;
  const base = roofMat.albedoColor.toGammaSpace();
  const chans = [base.r, base.g, base.b];
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const palest = hex(KIT_TILE_RANGE.palest);
  const darkest = hex(KIT_TILE_RANGE.darkest);
  const maxShade = Math.max(...tileShades) / 100;
  let sum = 0;
  for (let i = 0; i < roofColors.length; i += 4) sum += roofColors[i]!;
  const meanShade = sum / (roofColors.length / 4);
  for (let i = 0; i < 3; i++) {
    assert.ok(
      chans[i]! * maxShade <= palest[i]! + 0.01,
      `roof tile ch${i} peaks at ${(chans[i]! * maxShade).toFixed(3)}, over the kit's palest tile ${palest[i]!.toFixed(3)} — it will clip to sand`
    );
    assert.ok(
      chans[i]! * meanShade >= darkest[i]! - 0.02,
      `roof tile ch${i} averages ${(chans[i]! * meanShade).toFixed(3)}, under the kit's darkest tile ${darkest[i]!.toFixed(3)}`
    );
  }
}

console.log("proceduralPieces.check: ok");
