import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Scene } from "@babylonjs/core/scene";

import { CELL_SIZE } from "~/game/constants";
import { mulberry32 } from "~/game/random";
import { DIRT_EDGE, drawDirtTexture } from "./dirtTexture";

// Procedural limestone paving for roads and plaza pads. The Kenney kit's
// colormap UVs are flat-color palette lookups, so surface detail has to come
// from our own textures on our own quads. Roads are full-tile and share the
// pad pattern, so streets and plazas join seamlessly.

/** Paving stones per world tile, per axis — shared by roads, plazas, and aprons so slab size matches everywhere. */
const STONES_PER_CELL = 2;

// Limestone palette (ref: Piazza della Signoria paving) — pale, low contrast.
const GROUT = "#aaa290";
const STONE_TONES = ["#cfc8b7", "#d5cebe", "#c9c1b0", "#d0cabc"];
// Streets: same limestone, a shade darker so they read against the plazas.
const ROAD_GROUT = "#998f7c";
const ROAD_TONES = ["#bcb5a3", "#c2bbaa", "#b6ae9c", "#bdb7a8"];
// Plaza fields — the focal-point paving (see drawPlaza* below).
const BRICK_GROUT = "#8f5741"; // sun-baked terracotta (ref: Piazza del Campo)
const BRICK_TONES = ["#b56a4e", "#bd7457", "#aa6147", "#c37e60"];
const TRAVERTINE_GROUT = "#a1977f"; // creamy grand slabs (ref: Florentine piazzas)
const TRAVERTINE_TONES = ["#ddd5c2", "#e2dbca", "#d7cfbc", "#e0d8c6"];
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

function tonePick(rand: () => number, tones: string[], jitter: number) {
  const tone = Color3.FromHexString(tones[Math.floor(rand() * tones.length)]);
  const v = 1 - jitter / 2 + rand() * jitter;
  return new Color3(tone.r * v, tone.g * v, tone.b * v).toHexString();
}

// --- Plaza paving styles ------------------------------------------------
// Plazas are the city's focal points, so their pads get a showpiece paving
// distinct from the utilitarian flagstone of roads/aprons/market: a pale
// travertine border course framing a patterned field.

/** Terracotta herringbone framed by travertine (ref: Siena's Piazza del Campo). */
function drawPlazaHerringbone(ctx: CanvasRenderingContext2D, size: number, cellPx: number) {
  // Border course: the plain pale flagstone, one cell wide.
  drawPaving(ctx, size, size, (size / cellPx) * STONES_PER_CELL, GROUT, STONE_TONES);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cellPx, cellPx, size - 2 * cellPx, size - 2 * cellPx);
  ctx.clip();
  ctx.fillStyle = BRICK_GROUT;
  ctx.fillRect(0, 0, size, size);
  // Herringbone at 45°: unit-cell rule on a rotated lattice. Bricks are 2u×1u;
  // cell (x,y) anchors a horizontal brick when (x−y)≡0 (mod 4) and the bottom
  // of a vertical one when ≡3 — together they tile the plane exactly once.
  ctx.translate(size / 2, size / 2);
  ctx.rotate(Math.PI / 4);
  const u = cellPx / 3;
  const gap = Math.max(0.75, u / 8);
  const rand = mulberry32(1348);
  const half = Math.ceil((size * 0.75) / u);
  for (let y = -half; y <= half; y += 1) {
    for (let x = -half; x <= half; x += 1) {
      const m = (((x - y) % 4) + 4) % 4;
      if (m !== 0 && m !== 3) continue;
      ctx.fillStyle = tonePick(rand, BRICK_TONES, 0.08);
      if (m === 0) ctx.fillRect(x * u + gap, y * u + gap, 2 * u - 2 * gap, u - 2 * gap);
      else ctx.fillRect(x * u + gap, y * u + gap, u - 2 * gap, 2 * u - 2 * gap);
    }
  }
  ctx.restore();
}

/** Grand creamy travertine slabs laid diagonally, dark border (Florentine). */
function drawPlazaTravertine(ctx: CanvasRenderingContext2D, size: number, cellPx: number) {
  // Border course: the darker street limestone, one cell wide.
  drawPaving(ctx, size, size, (size / cellPx) * STONES_PER_CELL, ROAD_GROUT, ROAD_TONES);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cellPx, cellPx, size - 2 * cellPx, size - 2 * cellPx);
  ctx.clip();
  ctx.fillStyle = TRAVERTINE_GROUT;
  ctx.fillRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.rotate(Math.PI / 4);
  const s = cellPx * 1.3;
  const gap = Math.max(1, s / 24);
  const rand = mulberry32(1504);
  const half = Math.ceil((size * 0.75) / s);
  for (let y = -half; y <= half; y += 1) {
    for (let x = -half; x <= half; x += 1) {
      ctx.fillStyle = tonePick(rand, TRAVERTINE_TONES, 0.05);
      ctx.fillRect(x * s + gap, y * s + gap, s - 2 * gap, s - 2 * gap);
    }
  }
  ctx.restore();
}

/** Sett cobbles in rings radiating from the central fountain (Roman), in the
 * street limestone so plazas read as kin to the roads — pattern, not color,
 * marks them out. */
function drawPlazaCobble(ctx: CanvasRenderingContext2D, size: number, cellPx: number) {
  ctx.fillStyle = ROAD_GROUT;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(1506);
  const sett = cellPx * 0.3;
  for (let r = sett * 0.8; r < size * 0.75; r += sett) {
    const count = Math.max(6, Math.round((2 * Math.PI * r) / sett));
    const phase = rand(); // stagger ring starts so radial seams don't align
    for (let i = 0; i < count; i += 1) {
      const a = ((i + phase) / count) * 2 * Math.PI;
      ctx.save();
      ctx.translate(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r);
      ctx.rotate(a);
      ctx.fillStyle = tonePick(rand, ROAD_TONES, 0.1);
      ctx.fillRect(-sett * 0.42, -sett * 0.36, sett * 0.84, sett * 0.72);
      ctx.restore();
    }
  }
}

export type PlazaStyle = "herringbone" | "travertine" | "cobble";
const PLAZA_DRAWERS: Record<PlazaStyle, typeof drawPlazaHerringbone> = {
  herringbone: drawPlazaHerringbone,
  travertine: drawPlazaTravertine,
  cobble: drawPlazaCobble,
};

// ponytail: dev toggle for previewing the alternate styles
// (?plaza=herringbone|travertine); stays until the per-plaza style picker
// stretch goal lands (see design doc), then per-tile state replaces it.
function plazaStyle(): PlazaStyle {
  if (typeof window === "undefined") return "cobble";
  const p = new URLSearchParams(window.location.search).get("plaza");
  return p === "travertine" || p === "herringbone" ? p : "cobble";
}

const plazaMaterials = new Map<string, StandardMaterial>();

/** Showpiece paving for plaza pads (cached per style+size; size in world units). */
export function getPlazaMaterial(worldUnits: number, scene: Scene) {
  const style = plazaStyle();
  const key = `${style}-${worldUnits}`;
  let mat = plazaMaterials.get(key);
  if (mat) return mat;
  const cells = Math.round(worldUnits / CELL_SIZE);
  const cellPx = Math.min(128, Math.floor(2048 / cells));
  const size = cells * cellPx;
  const tex = new DynamicTexture(`plaza-${key}-tex`, { width: size, height: size }, scene, true);
  PLAZA_DRAWERS[style](tex.getContext() as CanvasRenderingContext2D, size, cellPx);
  tex.update();
  mat = new StandardMaterial(`plaza-${key}-mat`, scene);
  mat.specularColor = Color3.Black();
  mat.diffuseTexture = tex;
  plazaMaterials.set(key, mat);
  return mat;
}

let roadMaterial: StandardMaterial | null = null;

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

/** Non-plaza pads (market) share the aprons' mottled stone (sizes in world units). */
export function getPadMaterial(worldW: number, worldD: number, scene: Scene) {
  return getApronMaterial(Math.round(worldW / CELL_SIZE), Math.round(worldD / CELL_SIZE), scene);
}

const apronMaterials = new Map<string, StandardMaterial>();

// Aprons: the dirt-path mottling recolored to the street limestone — quiet
// stone ground with no slab grid, so buildings don't sit on lighter flagstone
// islands but still join roads/plazas in the same palette.
const APRON_BASE = ROAD_TONES[0];
const APRON_TONES = [...ROAD_TONES.slice(1), ROAD_GROUT];

/** Mottled-stone ground for a building's full w×d-cell footprint apron (cached per size). */
export function getApronMaterial(widthCells: number, depthCells: number, scene: Scene) {
  const key = `${widthCells}x${depthCells}`;
  let mat = apronMaterials.get(key);
  if (mat) return mat;
  const px = Math.min(128, Math.floor(1024 / Math.max(widthCells, depthCells)));
  const tex = new DynamicTexture(
    `apron-${key}-tex`,
    { width: widthCells * px, height: depthCells * px },
    scene,
    true
  );
  // The dirt texture fills a square; max dimension covers the rectangle, crop is harmless.
  drawDirtTexture(
    tex.getContext() as CanvasRenderingContext2D,
    Math.max(widthCells, depthCells) * px,
    APRON_BASE,
    APRON_TONES
  );
  tex.update();
  mat = new StandardMaterial(`apron-${key}-mat`, scene);
  mat.specularColor = Color3.Black();
  mat.diffuseTexture = tex;
  apronMaterials.set(key, mat);
  return mat;
}

/** Full-tile street paving — same slab size as the plazas, a shade darker. */
export function getRoadMaterial(scene: Scene) {
  roadMaterial ??= pavingMaterial("road", 128, 128, STONES_PER_CELL, ROAD_GROUT, ROAD_TONES, scene);
  return roadMaterial;
}

let pavedRibbonMaterial: StandardMaterial | null = null;

/** Diagonal paved ribbon: 3 slab courses across U so the quad's √2 X-scale
 * yields near-cardinal slab length (0.236 vs 0.25 wu) while quad seams still
 * land on grout — a plain uScale of √2 would cut slabs mid-brick at every
 * staircase seam. */
export function getPavedRibbonMaterial(scene: Scene) {
  pavedRibbonMaterial ??= pavingMaterial("paved-ribbon", 192, 128, 3, ROAD_GROUT, ROAD_TONES, scene);
  return pavedRibbonMaterial;
}

let dirtPadMaterial: StandardMaterial | null = null;

/** Rimless packed earth for dirt-ribbon junction pads (the ribbon texture minus
 * its grass rim — a rim across a crossing would fence it off). */
export function getDirtPadMaterial(scene: Scene) {
  if (dirtPadMaterial) return dirtPadMaterial;
  const size = 128;
  const tex = new DynamicTexture("dirt-pad-tex", { width: size, height: size }, scene, true);
  drawDirtTexture(tex.getContext() as CanvasRenderingContext2D, size);
  tex.update();
  dirtPadMaterial = new StandardMaterial("dirt-pad-mat", scene);
  dirtPadMaterial.specularColor = Color3.Black();
  dirtPadMaterial.diffuseTexture = tex;
  return dirtPadMaterial;
}

let dirtRibbonMaterial: StandardMaterial | null = null;

/** Packed earth for diagonal dirt ribbons. Cardinal dirt paths draw through the
 * raster overlay (`dirtPathOverlay.ts`), which is grid-axis-aligned and can't
 * follow a 45° run, so diagonal dirt renders as decal quads like the paved
 * diagonals. The overlay's darker grass rim is baked onto the long (v) edges;
 * symmetric top/bottom so the DynamicTexture invertV orientation is moot. */
export function getDirtRibbonMaterial(scene: Scene) {
  if (dirtRibbonMaterial) return dirtRibbonMaterial;
  const size = 128;
  const tex = new DynamicTexture("dirt-ribbon-tex", { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  drawDirtTexture(ctx, size);
  const rim = Math.round(size * 0.18); // matches the overlay's 18%-of-cell rim
  ctx.fillStyle = DIRT_EDGE;
  ctx.fillRect(0, 0, size, rim);
  ctx.fillRect(0, size - rim, size, rim);
  tex.update();
  dirtRibbonMaterial = new StandardMaterial("dirt-ribbon-mat", scene);
  dirtRibbonMaterial.specularColor = Color3.Black();
  dirtRibbonMaterial.diffuseTexture = tex;
  return dirtRibbonMaterial;
}

export function disposePathMaterials() {
  for (const mat of [...apronMaterials.values(), ...plazaMaterials.values()]) {
    mat.diffuseTexture?.dispose();
    mat.dispose();
  }
  apronMaterials.clear();
  plazaMaterials.clear();
  roadMaterial?.diffuseTexture?.dispose();
  roadMaterial?.dispose();
  roadMaterial = null;
  pavedRibbonMaterial?.diffuseTexture?.dispose();
  pavedRibbonMaterial?.dispose();
  pavedRibbonMaterial = null;
  dirtPadMaterial?.diffuseTexture?.dispose();
  dirtPadMaterial?.dispose();
  dirtPadMaterial = null;
  dirtRibbonMaterial?.diffuseTexture?.dispose();
  dirtRibbonMaterial?.dispose();
  dirtRibbonMaterial = null;
}
