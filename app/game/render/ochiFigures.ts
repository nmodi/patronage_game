import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { Scene } from "@babylonjs/core/scene";

import { prepareThinInstanceHost } from "./thinInstanceHost";
import { ROBE_COLORS, type CitizenFigure, type FigureFactory, type FigureLocomotion } from "./citizenFigures";

// Studio Ochi low-poly people — the game's citizen figures (replacing the
// procedural cone figures in citizenFigures.ts).
// The pack has no rigs — static posed meshes ride the same procedural
// bob/sway as the cone figures — and its blue-grid texture is a placeholder,
// so each figure gets a flat per-instance tint from the robe palette.
// One thin-instance host per model file, one material for all of them.

// Man04/Woman02 are sitting poses — they read as gliding chairs on the walk loop.
const SITTERS = new Set(["Man04", "Woman02"]);
const FILES = ["Man", "Woman"].flatMap((p) =>
  Array.from({ length: 10 }, (_, i) => `${p}${String(i + 1).padStart(2, "0")}`)
)
  .filter((name) => !SITTERS.has(name))
  .map((name) => `/models/people/${name}.glb`);

const OCHI_HEIGHT = 0.68; // world-unit standing height — THE fit knob
const YAW_OFFSET = 0; // radians, in case the pack fronts off-axis

// Same gait feel as the procedural figures (citizenFigures.ts).
const BOB_AMP = 0.01;
const SWAY_AMP = 0.05;
const LEAN = 0.04;
const GAIT_EASE = 8;

const INITIAL_CAPACITY = 8;
const TINTS = ROBE_COLORS.map((hex) => Color3.FromHexString(hex));

type Batch = {
  host: Mesh | null; // null until its GLB lands; buffers fill CPU-side regardless
  matrices: Float32Array;
  colors: Float32Array;
  figures: { index: number }[];
  count: number;
  capacity: number;
  matricesDirty: boolean;
  colorsDirty: boolean;
  countDirty: boolean;
};

const scratchScale = new Vector3();
const scratchQuat = new Quaternion();
const scratchPos = new Vector3();
const scratchMatrix = new Matrix();

export function createOchiFigureFactory(scene: Scene): FigureFactory {
  // Instance colors multiply the host diffuse — white passes them through.
  const whiteMat = new StandardMaterial("ochi-white", scene);
  whiteMat.diffuseColor = Color3.White();
  whiteMat.specularColor = Color3.Black();

  let disposed = false;

  const batches: Batch[] = FILES.map(() => ({
    host: null,
    matrices: new Float32Array(INITIAL_CAPACITY * 16),
    colors: new Float32Array(INITIAL_CAPACITY * 4),
    figures: [],
    count: 0,
    capacity: INITIAL_CAPACITY,
    matricesDirty: false,
    colorsDirty: false,
    countDirty: false,
  }));

  function bindBuffers(batch: Batch) {
    if (!batch.host) return;
    batch.host.thinInstanceSetBuffer("matrix", batch.matrices, 16, false);
    batch.host.thinInstanceSetBuffer("color", batch.colors, 4, false);
    batch.countDirty = true;
  }

  FILES.forEach((file, i) => {
    // ponytail: the pack is licensed and gitignored, so a clone without it 404s
    // here — the batch keeps a null host and simply renders no one. Wire the
    // procedural cone factory (citizenFigures.ts) in if empty streets matter.
    LoadAssetContainerAsync(file, scene).catch(() => null).then((container) => {
      if (!container) return;
      if (disposed || scene.isDisposed) {
        container.dispose();
        return;
      }
      container.addAllToScene();
      const mesh = container.meshes.find((m) => m.getTotalVertices() > 0) as Mesh;
      // Flatten the node hierarchy into the vertices so instance matrices are
      // pure figure placement.
      mesh.bakeTransformIntoVertices(mesh.computeWorldMatrix(true));
      // The pack poses all 20 figures in one lineup, so a model's node carries
      // its slot in that row (up to ~1.7wu off-origin). Left baked in, the body
      // renders that far from its walk position — off the road — and orbits it
      // on every turn, since the instance matrix rotates about the origin.
      // Recentre on the feet, and take the fit scale from the measured height
      // rather than assuming every figure in the pack is the same size.
      mesh.refreshBoundingInfo();
      const box = mesh.getBoundingInfo().boundingBox;
      const s = OCHI_HEIGHT / (box.maximum.y - box.minimum.y);
      mesh.bakeTransformIntoVertices(
        Matrix.Translation(
          -(box.minimum.x + box.maximum.x) / 2,
          -box.minimum.y,
          -(box.minimum.z + box.maximum.z) / 2
        ).multiply(Matrix.Scaling(s, s, s))
      );
      mesh.refreshBoundingInfo();
      mesh.material = whiteMat;
      prepareThinInstanceHost(mesh);
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.doNotSyncBoundingInfo = true;
      mesh.setEnabled(false);
      for (const m of container.meshes) if (m !== mesh) m.dispose();
      for (const m of container.materials) m.dispose();
      for (const t of container.textures) t.dispose();
      const batch = batches[i];
      batch.host = mesh;
      bindBuffers(batch);
    });
  });

  function ensureCapacity(batch: Batch) {
    if (batch.count < batch.capacity) return;
    batch.capacity *= 2;
    const matrices = new Float32Array(batch.capacity * 16);
    matrices.set(batch.matrices);
    batch.matrices = matrices;
    const colors = new Float32Array(batch.capacity * 4);
    colors.set(batch.colors);
    batch.colors = colors;
    bindBuffers(batch);
  }

  function removeFigure(batch: Batch, slot: { index: number }) {
    const last = batch.count - 1;
    const moved = batch.figures[last];
    if (slot.index !== last) {
      batch.matrices.copyWithin(slot.index * 16, last * 16, last * 16 + 16);
      batch.colors.copyWithin(slot.index * 4, last * 4, last * 4 + 4);
      batch.figures[slot.index] = moved;
      moved.index = slot.index;
      batch.matricesDirty = true;
      batch.colorsDirty = true;
    }
    batch.figures.pop();
    batch.count = last;
    batch.countDirty = true;
  }

  function create(): CitizenFigure {
    const batch = batches[Math.floor(Math.random() * batches.length)];
    ensureCapacity(batch);
    const slot = { index: batch.count };
    batch.count += 1;
    batch.figures.push(slot);
    batch.countDirty = true;

    const tint = TINTS[Math.floor(Math.random() * TINTS.length)];
    batch.colors[slot.index * 4] = tint.r;
    batch.colors[slot.index * 4 + 1] = tint.g;
    batch.colors[slot.index * 4 + 2] = tint.b;
    batch.colors[slot.index * 4 + 3] = 1;
    batch.colorsDirty = true;

    const scale = 0.92 + Math.random() * 0.16;
    let gaitWeight = 0;
    let figDisposed = false;

    return {
      update(loco: FigureLocomotion, dt: number) {
        if (figDisposed) return;
        const target = loco.moving ? 1 : 0;
        gaitWeight += (target - gaitWeight) * Math.min(1, dt * GAIT_EASE);
        const w = gaitWeight;
        const bob = BOB_AMP * Math.sin(2 * loco.stridePhase) * w;
        scratchScale.setAll(scale);
        Quaternion.RotationYawPitchRollToRef(
          loco.yaw + YAW_OFFSET,
          LEAN * w,
          SWAY_AMP * Math.sin(loco.stridePhase) * w,
          scratchQuat
        );
        scratchPos.set(loco.x, loco.y + bob, loco.z);
        Matrix.ComposeToRef(scratchScale, scratchQuat, scratchPos, scratchMatrix);
        scratchMatrix.copyToArray(batch.matrices, slot.index * 16);
        batch.matricesDirty = true;
      },
      dispose() {
        if (figDisposed) return;
        figDisposed = true;
        removeFigure(batch, slot);
      },
    };
  }

  function flush() {
    for (const batch of batches) {
      if (!batch.host) continue;
      if (batch.countDirty) {
        batch.host.thinInstanceCount = batch.count;
        batch.host.setEnabled(batch.count > 0);
        batch.countDirty = false;
      }
      if (batch.count === 0) {
        batch.matricesDirty = false;
        batch.colorsDirty = false;
        continue;
      }
      if (batch.matricesDirty) {
        batch.host.thinInstanceBufferUpdated("matrix");
        batch.matricesDirty = false;
      }
      if (batch.colorsDirty) {
        batch.host.thinInstanceBufferUpdated("color");
        batch.colorsDirty = false;
      }
    }
  }

  function dispose() {
    disposed = true;
    for (const batch of batches) batch.host?.dispose();
    whiteMat.dispose();
  }

  return { create, flush, dispose };
}
