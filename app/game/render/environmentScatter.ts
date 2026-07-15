import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";

import { CELL_SIZE, GRID_SIZE } from "~/game/constants";
import { CYPRESS_STRETCH, CYPRESS_VARIANTS, NATURE } from "./modelManifest";
import { prepareThinInstanceHost } from "./thinInstanceHost";

const SCATTER_OLIVE = [NATURE + "tree_default.glb", NATURE + "tree_fat.glb", NATURE + "tree_oak.glb"];
const SCATTER_ROCKS = [NATURE + "rock_smallA.glb", NATURE + "rock_smallD.glb", NATURE + "rock_smallG.glb"];
const SCATTER_BOULDERS = [NATURE + "rock_largeA.glb", NATURE + "rock_largeD.glb", NATURE + "rock_tallB.glb"];
const SCATTER_FENCES = [NATURE + "fence_simple.glb", NATURE + "fence_planks.glb"];
export const SCATTER_FILES = [
  ...SCATTER_OLIVE,
  ...SCATTER_ROCKS,
  ...SCATTER_BOULDERS,
  ...SCATTER_FENCES,
  ...CYPRESS_VARIANTS.map((variant) => variant.file),
  NATURE + "tree_simple.glb",
  NATURE + "crops_dirtRow.glb",
  "proc:block",
];
const ENV_CLEARANCE = 4;
const ENV_DEPTH = 60;

type ScatterOptions = {
  scale?: number;
  stretch?: [number, number, number];
  rotY?: number;
  sinkY?: number;
  drop?: number;
};

/** Decorative wilderness on the hills outside the buildable grid, rendered as
 * thin-instance batches: one host mesh per unique kit mesh instead of one
 * clone per tree, so hundreds of scatter items cost a couple dozen draw calls. */
export function scatterEnvironment(
  containers: ReadonlyMap<string, AssetContainer>,
  heightAt: (x: number, z: number) => number,
  rand: () => number,
  avoid?: (x: number, z: number) => boolean
) {
  const placements: Array<{ file: string; x: number; z: number; opts: ScatterOptions }> = [];
  const buildHalfExtent = (GRID_SIZE * CELL_SIZE) / 2;
  const minDistance = buildHalfExtent + ENV_CLEARANCE;

  // `avoid` (e.g. the river channel and the sea) rejects here — the funnel for
  // every placement, so clump/row offsets can't stray into the water either.
  function place(
    file: string,
    x: number,
    z: number,
    opts: ScatterOptions = {}
  ) {
    if (avoid?.(x, z)) return;
    placements.push({ file, x, z, opts });
  }

  /** Random point in the scatter ring around the build area, or null. */
  function ringPoint() {
    const angle = rand() * Math.PI * 2;
    const dist = minDistance + rand() * ENV_DEPTH;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (Math.max(Math.abs(x), Math.abs(z)) < minDistance) return null;
    return avoid?.(x, z) ? null : { x, z };
  }

  function placeTree(x: number, z: number) {
    if (rand() < 0.35) {
      const variant = CYPRESS_VARIANTS[Math.floor(rand() * CYPRESS_VARIANTS.length)];
      place(variant.file, x, z, {
        scale: 1.4 + rand() * 1.3,
        stretch: [1, CYPRESS_STRETCH, 1],
        sinkY: variant.sinkY,
      });
    } else {
      place(SCATTER_OLIVE[Math.floor(rand() * SCATTER_OLIVE.length)], x, z, {
        scale: 1.4 + rand() * 1.3,
      });
    }
  }

  // Trees: singles plus loose clumps of 2-4 so the hills read as scrubby
  // groves rather than an evenly seeded park.
  let trees = 0;
  for (let attempts = 0; trees < 330 && attempts < 1300; attempts += 1) {
    const p = ringPoint();
    if (!p) continue;
    const clump = rand() < 0.35 ? 2 + Math.floor(rand() * 3) : 1;
    for (let i = 0; i < clump && trees < 330; i += 1) {
      const x = i === 0 ? p.x : p.x + (rand() - 0.5) * 7;
      const z = i === 0 ? p.z : p.z + (rand() - 0.5) * 7;
      if (Math.max(Math.abs(x), Math.abs(z)) < minDistance) continue;
      placeTree(x, z);
      trees += 1;
    }
  }

  // Undergrowth: small sunken tree canopies read as round shrubs. The kit's
  // plant_bush* models splay like perched birds at hill distance — those stay
  // placeable up close but don't scatter.
  for (let attempts = 0, n = 0; n < 190 && attempts < 800; attempts += 1) {
    const p = ringPoint();
    if (!p) continue;
    place(SCATTER_OLIVE[Math.floor(rand() * SCATTER_OLIVE.length)], p.x, p.z, {
      scale: 0.45 + rand() * 0.35,
      sinkY: 0.4,
    });
    n += 1;
  }
  for (let attempts = 0, n = 0; n < 75 && attempts < 320; attempts += 1) {
    const p = ringPoint();
    if (!p) continue;
    const boulder = rand() < 0.25;
    place(
      (boulder ? SCATTER_BOULDERS : SCATTER_ROCKS)[Math.floor(rand() * 3)],
      p.x,
      p.z,
      { scale: boulder ? 1.2 + rand() * 1 : 0.9 + rand() * 0.8, drop: 0.12 }
    );
    n += 1;
  }

  // A few tended vineyard patches on flat-ish ground: rows of dirt furrows
  // planted with vine-on-post trees, matching the placeable vineyard prefab.
  for (let attempts = 0, n = 0; n < 4 && attempts < 60; attempts += 1) {
    const p = ringPoint();
    if (!p) continue;
    const slopeX = Math.abs(heightAt(p.x - 3, p.z) - heightAt(p.x + 3, p.z));
    const slopeZ = Math.abs(heightAt(p.x, p.z - 2) - heightAt(p.x, p.z + 2));
    if (slopeX > 0.5 || slopeZ > 0.5) continue;
    for (const rowZ of [-1.4, 0, 1.4]) {
      const z = p.z + rowZ;
      // No drop: the thin furrow vanishes under terrain facets if sunk at all.
      place(NATURE + "crops_dirtRow.glb", p.x, z, { scale: 1.2, stretch: [4.5, 1, 1], rotY: 0, drop: 0 });
      for (let i = -2; i <= 2; i += 1) {
        place(NATURE + "tree_simple.glb", p.x + i * 1.1, z, {
          scale: 0.55 + rand() * 0.1,
          rotY: 0,
          sinkY: 0.3,
        });
      }
    }
    n += 1;
  }

  // Very rare: a short run of old fencing or a crumbling low stone wall —
  // traces of past hands on the land.
  for (let attempts = 0, n = 0; n < 4 && attempts < 40; attempts += 1) {
    const p = ringPoint();
    if (!p) continue;
    const stone = rand() < 0.4;
    const theta = rand() * Math.PI * 2;
    const segments = 3 + Math.floor(rand() * 4);
    const scale = 1.6;
    for (let i = 0; i < segments; i += 1) {
      const x = p.x + Math.cos(theta) * i * scale;
      const z = p.z + Math.sin(theta) * i * scale;
      if (stone) {
        // Same slab kitbash as the stone_wall decoration (a squashed cube).
        place("proc:block", x, z, {
          scale,
          stretch: [1, 0.28, 0.14],
          rotY: -theta,
          drop: 0.18,
        });
      } else {
        place(SCATTER_FENCES[Math.floor(rand() * 2)], x, z, { scale, rotY: -theta, drop: 0.18 });
      }
    }
    n += 1;
  }

  // One host mesh per unique mesh in a kit file, unparented at identity so its
  // thin-instance matrices are absolute world transforms. `local` captures the
  // mesh's transform chain inside the model (glTF node TRS) to pre-multiply in.
  type FileBatch = { meshes: Array<{ mesh: Mesh; local: Matrix }>; extentY: number };
  const fileBatches = new Map<string, FileBatch>();
  const hosts: Mesh[] = [];

  function getFileBatch(file: string): FileBatch | null {
    let batch = fileBatches.get(file);
    if (batch) return batch;
    const container = containers.get(file);
    if (!container) return null;
    const entries = container.instantiateModelsToScene((name) => name, false, {
      doNotInstantiate: true,
    });
    const meshes: FileBatch["meshes"] = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of entries.rootNodes) {
      const root = node as TransformNode;
      root.computeWorldMatrix(true);
      const bounds = root.getHierarchyBoundingVectors(true);
      minY = Math.min(minY, bounds.min.y);
      maxY = Math.max(maxY, bounds.max.y);
      for (const child of root.getChildMeshes(false)) {
        const mesh = child as Mesh;
        const local = mesh.computeWorldMatrix(true).clone();
        prepareThinInstanceHost(mesh);
        meshes.push({ mesh, local });
        hosts.push(mesh);
      }
      root.dispose(); // meshes were unparented; this only drops leftover transform nodes
    }
    batch = { meshes, extentY: maxY - minY };
    fileBatches.set(file, batch);
    return batch;
  }

  // Iterating placements in order keeps rand() consumption identical to the
  // old per-clone streaming path, so the scatter layout is unchanged.
  const instanceData = new Map<Mesh, number[]>();
  const scaling = new Vector3();
  const rotation = new Quaternion();
  const translation = new Vector3();
  const placementMatrix = new Matrix();
  const instanceMatrix = new Matrix();
  for (const { file, x, z, opts } of placements) {
    const batch = getFileBatch(file);
    if (!batch) continue;
    const s = opts.scale ?? 1;
    scaling.set(
      s * (opts.stretch?.[0] ?? 1),
      s * (opts.stretch?.[1] ?? 1),
      s * (opts.stretch?.[2] ?? 1)
    );
    let y = heightAt(x, z) - (opts.drop ?? 0.1);
    // Bury the bare trunk, matching the placed cypress prefab.
    if (opts.sinkY) y -= opts.sinkY * batch.extentY * scaling.y;
    Quaternion.RotationYawPitchRollToRef(opts.rotY ?? rand() * Math.PI * 2, 0, 0, rotation);
    translation.set(x, y, z);
    Matrix.ComposeToRef(scaling, rotation, translation, placementMatrix);
    for (const { mesh, local } of batch.meshes) {
      local.multiplyToRef(placementMatrix, instanceMatrix);
      let data = instanceData.get(mesh);
      if (!data) instanceData.set(mesh, (data = []));
      instanceMatrix.copyToArray(data, data.length);
    }
  }
  for (const [mesh, data] of instanceData) {
    mesh.thinInstanceSetBuffer("matrix", Float32Array.from(data), 16, true);
  }

  return {
    dispose() {
      for (const host of hosts) host.dispose();
    },
  };
}
