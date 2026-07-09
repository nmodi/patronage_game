import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Scene } from "@babylonjs/core/scene";

// Procedural limestone paving for roads and plaza pads. The Kenney kit's
// colormap UVs are flat-color palette lookups, so surface detail has to come
// from our own textures on our own quads. Roads are full-tile and share the
// pad pattern, so streets and plazas join seamlessly.

/** Paving stones per world tile, per axis. */
const STONES_PER_CELL = 5;
const ROAD_STONES_PER_CELL = 2; // slightly larger slabs on streets; cells are 0.5 world units

// Limestone palette (ref: Piazza della Signoria paving) — pale, low contrast.
const GROUT = "#aaa290";
const STONE_TONES = ["#cfc8b7", "#d5cebe", "#c9c1b0", "#d0cabc"];
// Streets: same limestone, a shade darker so they read against the plazas.
const ROAD_GROUT = "#998f7c";
const ROAD_TONES = ["#bcb5a3", "#c2bbaa", "#b6ae9c", "#bdb7a8"];

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

function drawPaving(
  ctx: CanvasRenderingContext2D,
  size: number,
  n: number,
  grout: string,
  tones: string[]
) {
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(n * 31 + 5);
  // 2:1 slabs in a running bond (odd courses offset half a slab); the extra
  // leading stone covers the wrapped edge so tiles still join seamlessly.
  const w = size / n;
  const h = w / 2;
  const gap = Math.max(0.75, w / 16);
  for (let y = 0; y < n * 2; y += 1) {
    const offset = y % 2 ? w / 2 : 0;
    for (let x = -1; x < n; x += 1) {
      const tone = Color3.FromHexString(tones[Math.floor(rand() * tones.length)]);
      const v = 0.97 + rand() * 0.05; // per-stone brightness jitter
      ctx.fillStyle = new Color3(tone.r * v, tone.g * v, tone.b * v).toHexString();
      ctx.fillRect(x * w + offset + gap, y * h + gap, w - gap * 2, h - gap * 2);
    }
  }
}

const padMaterials = new Map<number, StandardMaterial>();
let roadMaterial: StandardMaterial | null = null;

function pavingMaterial(name: string, size: number, n: number, grout: string, tones: string[], scene: Scene) {
  const tex = new DynamicTexture(`${name}-tex`, { width: size, height: size }, scene, true);
  drawPaving(tex.getContext() as CanvasRenderingContext2D, size, n, grout, tones);
  tex.update();
  const mat = new StandardMaterial(`${name}-mat`, scene);
  mat.specularColor = Color3.Black();
  mat.diffuseTexture = tex;
  return mat;
}

/** Flagstone paving material for a cells×cells pad (cached per size). */
export function getPadMaterial(cells: number, scene: Scene) {
  let mat = padMaterials.get(cells);
  if (mat) return mat;
  const size = Math.min(1024, cells * 128); // room for the 5×5 stones per cell
  mat = pavingMaterial(`pad-${cells}`, size, cells * STONES_PER_CELL, GROUT, STONE_TONES, scene);
  padMaterials.set(cells, mat);
  return mat;
}

/** Full-tile street paving — darker limestone, larger slabs than the plazas. */
export function getRoadMaterial(scene: Scene) {
  roadMaterial ??= pavingMaterial("road", 128, ROAD_STONES_PER_CELL, ROAD_GROUT, ROAD_TONES, scene);
  return roadMaterial;
}

export function disposePathMaterials() {
  for (const mat of padMaterials.values()) {
    mat.diffuseTexture?.dispose();
    mat.dispose();
  }
  padMaterials.clear();
  roadMaterial?.diffuseTexture?.dispose();
  roadMaterial?.dispose();
  roadMaterial = null;
}
