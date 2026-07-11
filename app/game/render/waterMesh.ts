// Water visuals (G5): the river's bed/bank ribbons, the coastline shore, and
// the animated water surfaces. The terrain mesh only dips coarsely out of the
// way (2-wu vertices); everything the eye reads as "river" is built here at
// sub-cell resolution from the same analytic WaterBody the sim rasterizes,
// so the visible water matches the blocked cells.
//
// Layering: terrain sits at y=-0.01 (dipped to ~-0.5 near water), the ribbon
// bed at -0.35, water surfaces at -0.08, in-grid bank rims at -0.005 — above
// grass, below building aprons (0.005), so banks slide under riverside
// buildings instead of poking through them.

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

import { CELL_SIZE, GRID_SIZE } from "~/game/constants";
import type { WaterBody } from "~/game/water";

const HALF_GRID = (GRID_SIZE * CELL_SIZE) / 2;
/** Rivers/sea render out to here; fog (end 95) hides the cutoff. */
const EXTENT = 115;

const SURFACE_Y = -0.08;
const BED_Y = -0.35;
/** Bank rim/lip height inside the grid: above the terrain plain (-0.01),
 * below aprons/roads (0.005+). */
const RIM_IN_Y = -0.005;

const GRASS_TONES = ["#98a861", "#91a15d", "#9fac66"].map(Color3.FromHexString);
const BANK_TONES = ["#b89d68", "#b09566"].map(Color3.FromHexString);
const BED_TONES = ["#6b6a4e", "#636347"].map(Color3.FromHexString);

function smoothstep01(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 0 inside the buildable grid → 1 a few wu into the countryside. */
function gridBlend(x: number, z: number) {
  return smoothstep01((Math.max(Math.abs(x), Math.abs(z)) - HALF_GRID) / 3);
}

/** Same position hash the terrain uses, so lip faces melt into the grass. */
function toneAt(tones: Color3[], x: number, z: number) {
  const hash = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453);
  return tones[Math.floor(hash % tones.length)];
}

/** Accumulates unindexed (flat-shaded) triangles with per-face colors. */
class TriBuilder {
  positions: number[] = [];
  colors: number[] = [];

  private tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, color: Color3) {
    this.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let i = 0; i < 3; i += 1) this.colors.push(color.r, color.g, color.b, 1);
  }

  /** Quad a→b→c→d (a/b on the previous section, d/c on the current one). */
  quad(a: number[], b: number[], c: number[], d: number[], color: Color3) {
    this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], color);
    this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], color);
  }

  build(name: string, scene: Scene, updatable: boolean): Mesh {
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = new Float32Array(this.positions);
    data.colors = new Float32Array(this.colors);
    const indices = new Uint32Array(this.positions.length / 3);
    for (let i = 0; i < indices.length; i += 1) indices[i] = i;
    data.indices = indices;
    // Normals must be final before applyToMesh: a non-updatable buffer
    // silently ignores later updateVerticesData calls.
    const normals = new Float32Array(this.positions.length);
    computeUpNormals(data.positions, normals);
    data.normals = normals;
    data.applyToMesh(mesh, updatable);
    return mesh;
  }
}

/** Per-face normals for unindexed triangles, flipped to point up — winding
 * mistakes then cost nothing (materials render both sides). */
function computeUpNormals(positions: ArrayLike<number>, out: Float32Array) {
  for (let f = 0; f < positions.length; f += 9) {
    const ux = positions[f + 3] - positions[f];
    const uy = positions[f + 4] - positions[f + 1];
    const uz = positions[f + 5] - positions[f + 2];
    const vx = positions[f + 6] - positions[f];
    const vy = positions[f + 7] - positions[f + 1];
    const vz = positions[f + 8] - positions[f + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    for (let v = 0; v < 3; v += 1) {
      out[f + v * 3] = nx / len;
      out[f + v * 3 + 1] = ny / len;
      out[f + v * 3 + 2] = nz / len;
    }
  }
}

/** Point on the flow/cross frame: world position from flow t + cross offset. */
function frame(axis: "x" | "z", t: number, cross: number): [number, number] {
  return axis === "x" ? [t, cross] : [cross, t];
}

export function createWaterVisuals(
  scene: Scene,
  water: WaterBody,
  surfaceAt: (x: number, z: number) => number
) {
  const coastSign =
    water.coastEdge === "east" || water.coastEdge === "north" ? 1 : -1;
  /** Flow-axis world coordinate of the coastline at cross coordinate u. */
  const coastlineAt = (u: number) => {
    const [x0, z0] = frame(water.riverAxis, 0, u);
    return -water.seaDistance(x0, z0) * coastSign;
  };

  // ---- static bed/bank ribbons -------------------------------------------

  const ribbon = new TriBuilder();

  // Rim/lip height: hugs the rendered terrain outside the grid, and is kept
  // above the water surface — except approaching the sea, where the clamp
  // fades away so the banks dive under the waves instead of floating on them.
  function bankY(x: number, z: number, kind: "rim" | "lip") {
    const margin = kind === "rim" ? 0.06 : 0.03;
    const sink = smoothstep01((water.seaDistance(x, z) + 6) / 6);
    const floor = lerp(SURFACE_Y + 0.04, BED_Y - 0.05, sink);
    const outY = Math.max(surfaceAt(x, z) - 0.01 + margin, floor);
    return lerp(RIM_IN_Y, outY, gridBlend(x, z));
  }

  // Bank/lip vertex: [x, y, z] for a cross offset from the channel center.
  function riverPoint(t: number, cross: number, kind: "bed" | "rim" | "lip"): number[] {
    const [x, z] = frame(water.riverAxis, t, cross);
    if (kind === "bed") return [x, BED_Y, z];
    return [x, bankY(x, z, kind), z];
  }

  type Section = { t: number; points: number[][]; };
  let prev: Section | null = null;
  for (let t = -EXTENT; t <= EXTENT; t += 1) {
    const center = water.riverCenterAt(t);
    const [cx, cz] = frame(water.riverAxis, t, center);
    // Past the coastline the open sea takes over.
    if (water.seaDistance(cx, cz) > 0) {
      prev = null;
      continue;
    }
    const w2 = water.riverWidthAt(t) / 2;
    const blend = gridBlend(cx, cz);
    const bedEdge = w2 + 0.15;
    const rim = bedEdge + lerp(0.55, 1.6, blend);
    const lip = rim + lerp(2.6, 1.6, blend);
    const points = [
      riverPoint(t, center - lip, "lip"),
      riverPoint(t, center - rim, "rim"),
      riverPoint(t, center - bedEdge, "bed"),
      riverPoint(t, center + bedEdge, "bed"),
      riverPoint(t, center + rim, "rim"),
      riverPoint(t, center + lip, "lip"),
    ];
    const section = { t, points };
    if (prev) {
      const tones: Color3[][] = [GRASS_TONES, BANK_TONES, BED_TONES, BANK_TONES, GRASS_TONES];
      for (let s = 0; s < 5; s += 1) {
        const midCross = (prev.points[s][0] + prev.points[s + 1][0] + points[s][0]) / 3;
        const midZ = (prev.points[s][2] + prev.points[s + 1][2] + points[s][2]) / 3;
        ribbon.quad(
          prev.points[s],
          prev.points[s + 1],
          points[s + 1],
          points[s],
          toneAt(tones[s], midCross, midZ)
        );
      }
    }
    prev = section;
  }

  // Coastline shore: land lip/rim sloping down to a bed strip; the open sea
  // sheet covers everything seaward of it. (coastEdge is present iff the map
  // has a sea — coastal or scenic-coast.)
  if (water.coastEdge) {
    let prevShore: number[][] | null = null;
    for (let u = -EXTENT; u <= EXTENT; u += 2) {
      const tC = coastlineAt(u);
      const [px, pz] = frame(water.riverAxis, tC, u);
      // Break the shore across the river mouth — the river trough (banks and
      // all, estuary-widened) runs through it there.
      if (water.riverDistance(px, pz) < 4.5) {
        prevShore = null;
        continue;
      }
      const blend = gridBlend(px, pz);
      const rimOff = lerp(0.7, 1.7, blend);
      const lipOff = rimOff + lerp(2.6, 1.6, blend);
      const shorePoint = (off: number, kind: "bed" | "rim" | "lip") => {
        const t = tC + coastSign * off;
        const [x, z] = frame(water.riverAxis, t, u);
        if (kind === "bed") return [x, BED_Y, z];
        // The shore's own rim must never sink (it IS the waterline) — clamp
        // against the surface directly rather than via bankY's mouth fade.
        const margin = kind === "rim" ? 0.06 : 0.03;
        const outY = Math.max(surfaceAt(x, z) - 0.01 + margin, SURFACE_Y + 0.04);
        return [x, lerp(RIM_IN_Y, outY, gridBlend(x, z)), z];
      };
      const points = [
        shorePoint(-lipOff, "lip"),
        shorePoint(-rimOff, "rim"),
        shorePoint(-0.15, "bed"),
        shorePoint(2.5, "bed"),
      ];
      if (prevShore) {
        const tones: Color3[][] = [GRASS_TONES, BANK_TONES, BED_TONES];
        for (let s = 0; s < 3; s += 1) {
          const midX = (prevShore[s][0] + points[s][0]) / 2;
          const midZ = (prevShore[s][2] + points[s][2]) / 2;
          ribbon.quad(prevShore[s], prevShore[s + 1], points[s + 1], points[s], toneAt(tones[s], midX, midZ));
        }
      }
      prevShore = points;
    }
  }

  const ribbonMesh = ribbon.build("water-banks", scene, false);
  const ribbonMat = new StandardMaterial("water-banks-mat", scene);
  ribbonMat.diffuseColor = Color3.White(); // vertex colors carry the tones
  ribbonMat.specularColor = Color3.Black();
  ribbonMat.emissiveColor = new Color3(0.05, 0.05, 0.04);
  ribbonMat.backFaceCulling = false;
  ribbonMesh.material = ribbonMat;
  ribbonMesh.isPickable = false;
  ribbonMesh.receiveShadows = true;
  ribbonMesh.freezeWorldMatrix();

  // ---- animated water surfaces -------------------------------------------

  const waterBuilder = new TriBuilder();
  const waterColor = Color3.FromHexString("#8aa397");

  // River strip: a slim three-line grid so the wobble ripples along the flow.
  let prevStrip: number[][] | null = null;
  for (let t = -EXTENT; t <= EXTENT; t += 1.5) {
    const center = water.riverCenterAt(t);
    const [cx, cz] = frame(water.riverAxis, t, center);
    if (water.seaDistance(cx, cz) > -0.5) {
      prevStrip = null;
      continue; // the sea sheet takes over at the mouth
    }
    const half = water.riverWidthAt(t) / 2 + 0.08;
    const points = [-half, 0, half].map((off) => {
      const [x, z] = frame(water.riverAxis, t, center + off);
      return [x, SURFACE_Y, z];
    });
    if (prevStrip) {
      waterBuilder.quad(prevStrip[0], prevStrip[1], points[1], points[0], waterColor);
      waterBuilder.quad(prevStrip[1], prevStrip[2], points[2], points[1], waterColor);
    }
    prevStrip = points;
  }

  // Open sea sheet: swept along the coastline out past the fog line.
  if (water.coastEdge) {
    const SEA_STEP = 6;
    let prevRow: number[][] | null = null;
    for (let u = -EXTENT; u <= EXTENT; u += SEA_STEP) {
      const start = coastlineAt(u) * coastSign - 0.2;
      const row: number[][] = [];
      for (let d = 0; d <= 22; d += 1) {
        const t = (start + d * SEA_STEP) * coastSign;
        const [x, z] = frame(water.riverAxis, t, u);
        row.push([x, SURFACE_Y, z]);
      }
      if (prevRow) {
        for (let d = 0; d < 22; d += 1) {
          waterBuilder.quad(prevRow[d], prevRow[d + 1], row[d + 1], row[d], waterColor);
        }
      }
      prevRow = row;
    }
  }

  const waterMesh = waterBuilder.build("water-surface", scene, true);
  const waterMat = new StandardMaterial("water-surface-mat", scene);
  waterMat.diffuseColor = waterColor;
  waterMat.alpha = 0.9;
  // Subtle glint only — a broad low-power specular blooms into a white glare
  // sheet across the flat open sea.
  waterMat.specularColor = new Color3(0.16, 0.15, 0.13);
  waterMat.specularPower = 128;
  waterMat.emissiveColor = new Color3(0.04, 0.05, 0.045);
  waterMat.backFaceCulling = false;
  waterMesh.material = waterMat;
  waterMesh.isPickable = false;
  // Vertices wobble in place — skip per-frame bounds work.
  waterMesh.doNotSyncBoundingInfo = true;
  waterMesh.alwaysSelectAsActiveMesh = true;

  // Gentle wobble; the facet normals re-tilt so the low-poly faces glint.
  // Runs while paused too — water is ambience, like fog, not sim state.
  const basePositions = Float32Array.from(waterMesh.getVerticesData("position")!);
  const livePositions = Float32Array.from(basePositions);
  const liveNormals = new Float32Array(basePositions.length);
  const observer = scene.onBeforeRenderObservable.add(() => {
    const time = performance.now() * 0.001;
    for (let i = 0; i < basePositions.length; i += 3) {
      const x = basePositions[i];
      const z = basePositions[i + 2];
      livePositions[i + 1] =
        basePositions[i + 1] +
        0.03 * Math.sin(time * 0.9 + x * 1.7) +
        0.02 * Math.sin(time * 1.7 + z * 2.3);
    }
    waterMesh.updateVerticesData("position", livePositions);
    computeUpNormals(livePositions, liveNormals);
    waterMesh.updateVerticesData("normal", liveNormals);
  });

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      ribbonMesh.dispose();
      ribbonMat.dispose();
      waterMesh.dispose();
      waterMat.dispose();
    },
  };
}
