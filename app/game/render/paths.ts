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
// Dirt paths: packed earth (matches the vineyard dirt-row tint), no slabs.
const DIRT_BASE = "#96774f";
const DIRT_TONES = ["#8a6a4d", "#a08258", "#7d5f42", "#9c7f56"];

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
  width: number,
  height: number,
  n: number,
  grout: string,
  tones: string[]
) {
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, width, height);
  const rand = mulberry32(n * 31 + 5);
  // 2:1 slabs in a running bond (odd courses offset half a slab); the extra
  // leading stone covers the wrapped edge so tiles still join seamlessly.
  const w = width / n;
  const h = w / 2;
  const rows = Math.ceil(height / h);
  const gap = Math.max(0.75, w / 16);
  for (let y = 0; y < rows; y += 1) {
    const offset = y % 2 ? w / 2 : 0;
    for (let x = -1; x < n; x += 1) {
      const tone = Color3.FromHexString(tones[Math.floor(rand() * tones.length)]);
      const v = 0.97 + rand() * 0.05; // per-stone brightness jitter
      ctx.fillStyle = new Color3(tone.r * v, tone.g * v, tone.b * v).toHexString();
      ctx.fillRect(x * w + offset + gap, y * h + gap, w - gap * 2, h - gap * 2);
    }
  }
}

// Soft tonal blotches over a packed-earth base. Each blob is drawn at all nine
// wrap offsets so the texture tiles seamlessly cell to cell.
function drawDirt(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = DIRT_BASE;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(1509);
  for (let i = 0; i < 60; i += 1) {
    const cx = rand() * size;
    const cy = rand() * size;
    const rx = size * (0.04 + rand() * 0.12);
    const ry = rx * (0.4 + rand() * 0.6);
    const angle = rand() * Math.PI;
    ctx.fillStyle = DIRT_TONES[Math.floor(rand() * DIRT_TONES.length)];
    ctx.globalAlpha = 0.15 + rand() * 0.25;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.ellipse(cx + dx, cy + dy, rx, ry, angle, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

const padMaterials = new Map<number, StandardMaterial>();
let roadMaterial: StandardMaterial | null = null;
let dirtMaterial: StandardMaterial | null = null;

function pavingMaterial(
  name: string,
  width: number,
  height: number,
  n: number,
  grout: string,
  tones: string[],
  scene: Scene
) {
  const tex = new DynamicTexture(`${name}-tex`, { width, height }, scene, true);
  drawPaving(tex.getContext() as CanvasRenderingContext2D, width, height, n, grout, tones);
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
  mat = pavingMaterial(`pad-${cells}`, size, size, cells * STONES_PER_CELL, GROUT, STONE_TONES, scene);
  padMaterials.set(cells, mat);
  return mat;
}

const apronMaterials = new Map<string, StandardMaterial>();

/** Flagstone paving for a building's full w×d-cell footprint apron (cached per size). */
export function getApronMaterial(widthCells: number, depthCells: number, scene: Scene) {
  const key = `${widthCells}x${depthCells}`;
  let mat = apronMaterials.get(key);
  if (mat) return mat;
  const px = Math.min(128, Math.floor(1024 / Math.max(widthCells, depthCells)));
  mat = pavingMaterial(
    `apron-${key}`,
    widthCells * px,
    depthCells * px,
    widthCells * STONES_PER_CELL,
    GROUT,
    STONE_TONES,
    scene
  );
  apronMaterials.set(key, mat);
  return mat;
}

/** Full-tile street paving — darker limestone, larger slabs than the plazas. */
export function getRoadMaterial(scene: Scene) {
  roadMaterial ??= pavingMaterial("road", 128, 128, ROAD_STONES_PER_CELL, ROAD_GROUT, ROAD_TONES, scene);
  return roadMaterial;
}

/** Full-tile packed earth for dirt paths. */
export function getDirtRoadMaterial(scene: Scene) {
  if (dirtMaterial) return dirtMaterial;
  const tex = new DynamicTexture("dirt-tex", { width: 128, height: 128 }, scene, true);
  drawDirt(tex.getContext() as CanvasRenderingContext2D, 128);
  tex.update();
  dirtMaterial = new StandardMaterial("dirt-mat", scene);
  dirtMaterial.specularColor = Color3.Black();
  dirtMaterial.diffuseTexture = tex;
  return dirtMaterial;
}

export function disposePathMaterials() {
  for (const mat of [...padMaterials.values(), ...apronMaterials.values()]) {
    mat.diffuseTexture?.dispose();
    mat.dispose();
  }
  padMaterials.clear();
  apronMaterials.clear();
  roadMaterial?.diffuseTexture?.dispose();
  roadMaterial?.dispose();
  roadMaterial = null;
  dirtMaterial?.diffuseTexture?.dispose();
  dirtMaterial?.dispose();
  dirtMaterial = null;
}
