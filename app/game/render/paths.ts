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
  tones: string[],
  seed = n * 31 + 5 // default preserves the plaza-border callers' exact pixels
) {
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, width, height);
  const rand = mulberry32(seed);
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

// Streets are medieval-era surfaces: coursed setts — rows of small squared
// stones, random widths per course, corners jittered — read hand-laid against
// the plazas' finished slab bond (drawPaving, which plazas/aprons keep).
const SETT_GROUT = "#7c7260";
function drawSetts(ctx: CanvasRenderingContext2D, width: number, height: number, seed: number) {
  ctx.fillStyle = SETT_GROUT;
  ctx.fillRect(0, 0, width, height);
  const rows = 5;
  const h = height / rows;
  const gap = height / 80;
  const j = h * 0.14;
  // Corner jitter can cross the canvas edge, so each stone draws 9× at tile
  // offsets — the texture wraps seamlessly in both axes at any width.
  const stone = (r: () => number, x: number, y: number, w: number, hh: number) => {
    const p = [
      [x + (r() - 0.5) * j, y + (r() - 0.5) * j],
      [x + w + (r() - 0.5) * j, y + (r() - 0.5) * j],
      [x + w + (r() - 0.5) * j, y + hh + (r() - 0.5) * j],
      [x + (r() - 0.5) * j, y + hh + (r() - 0.5) * j],
    ];
    ctx.fillStyle = tonePick(r, ROAD_TONES, 0.16);
    for (const dx of [-width, 0, width]) {
      for (const dy of [-height, 0, height]) {
        ctx.beginPath();
        p.forEach(([px, py], i) => (i ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)));
        ctx.closePath();
        ctx.fill();
      }
    }
  };
  const rand = mulberry32(seed);
  // Neighboring road cells draw different seed variants (see getRoadMaterial),
  // so tile edges must match across variants, not just wrap within one
  // texture: even courses end on a grout joint exactly at the edge; odd
  // courses share one deterministic edge-crossing stone (seeded independently
  // of the variant) so no course shows a mid-stone cut and the edge joints
  // don't line up into a full-height per-tile seam.
  const edgeRand = mulberry32(4243);
  for (let y = 0; y < rows; y += 1) {
    let x0 = 0;
    let x1 = width;
    if (y % 2) {
      const ew = h * 0.9;
      stone(edgeRand, -ew / 2 + gap, y * h + gap, ew - gap * 2, h - gap * 2);
      x0 = ew / 2;
      x1 = width - ew / 2;
    }
    // Random widths rescaled to fill the span exactly, so the course meets the
    // edge stone (or the edge joint) without a sliver.
    const ws: number[] = [];
    let total = 0;
    while (total < x1 - x0) {
      const w = h * (0.7 + rand() * 0.9);
      ws.push(w);
      total += w;
    }
    const k = (x1 - x0) / total;
    let x = x0;
    for (const w0 of ws) {
      const w = w0 * k;
      stone(rand, x + gap, y * h + gap, w - gap * 2, h - gap * 2);
      x += w;
    }
  }
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
 * streets' own sett language — dark grout, jittered stones — so the plaza
 * reads as kin to the roads; the ring pattern, not the material, marks it. */
function drawPlazaCobble(ctx: CanvasRenderingContext2D, size: number, cellPx: number) {
  // Midway between SETT_GROUT and the pale ROAD_GROUT: the rings expose more
  // grout than the streets' tight courses, so the streets' value reads darker
  // here at equal hue.
  ctx.fillStyle = "#8b816d";
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(1506);
  const sett = cellPx * 0.28;
  const j = sett * 0.16;
  for (let r = sett * 0.8; r < size * 0.78; r += sett) {
    const count = Math.max(6, Math.round((2 * Math.PI * r) / sett));
    const phase = rand(); // stagger ring starts so radial seams don't align
    for (let i = 0; i < count; i += 1) {
      const a = ((i + phase) / count) * 2 * Math.PI;
      ctx.save();
      ctx.translate(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r);
      ctx.rotate(a);
      const p = [
        [-sett * 0.44 + (rand() - 0.5) * j, -sett * 0.38 + (rand() - 0.5) * j],
        [sett * 0.41 + (rand() - 0.5) * j, -sett * 0.38 + (rand() - 0.5) * j],
        [sett * 0.41 + (rand() - 0.5) * j, sett * 0.36 + (rand() - 0.5) * j],
        [-sett * 0.44 + (rand() - 0.5) * j, sett * 0.36 + (rand() - 0.5) * j],
      ];
      ctx.fillStyle = tonePick(rand, ROAD_TONES, 0.16);
      ctx.beginPath();
      p.forEach(([px, py], q) => (q ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fill();
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

// One cache for every ground material below; disposePathMaterials clears it.
const pathMaterials = new Map<string, StandardMaterial>();

/** DynamicTexture → matte StandardMaterial, drawn once and cached by key. */
function texturedMaterial(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  scene: Scene
) {
  let mat = pathMaterials.get(key);
  if (mat) return mat;
  const tex = new DynamicTexture(`${key}-tex`, { width, height }, scene, true);
  draw(tex.getContext() as CanvasRenderingContext2D);
  tex.update();
  mat = new StandardMaterial(`${key}-mat`, scene);
  mat.specularColor = Color3.Black();
  mat.diffuseTexture = tex;
  pathMaterials.set(key, mat);
  return mat;
}

/** Showpiece paving for plaza pads (cached per style+size; size in world units). */
export function getPlazaMaterial(worldUnits: number, scene: Scene) {
  const style = plazaStyle();
  const cells = Math.round(worldUnits / CELL_SIZE);
  const cellPx = Math.min(128, Math.floor(2048 / cells));
  const size = cells * cellPx;
  return texturedMaterial(
    `plaza-${style}-${worldUnits}`,
    size,
    size,
    (ctx) => PLAZA_DRAWERS[style](ctx, size, cellPx),
    scene
  );
}

/** Non-plaza pads (market) share the aprons' mottled stone (sizes in world units). */
export function getPadMaterial(worldW: number, worldD: number, scene: Scene) {
  return getApronMaterial(Math.round(worldW / CELL_SIZE), Math.round(worldD / CELL_SIZE), scene);
}

// Aprons: the dirt-path mottling recolored to the street limestone — quiet
// stone ground with no slab grid, so buildings don't sit on lighter flagstone
// islands but still join roads/plazas in the same palette.
const APRON_BASE = ROAD_TONES[0];
const APRON_TONES = [...ROAD_TONES.slice(1), ROAD_GROUT];

/** Mottled-stone ground for a building's full w×d-cell footprint apron (cached per size). */
export function getApronMaterial(widthCells: number, depthCells: number, scene: Scene) {
  const px = Math.min(128, Math.floor(1024 / Math.max(widthCells, depthCells)));
  return texturedMaterial(
    `apron-${widthCells}x${depthCells}`,
    widthCells * px,
    depthCells * px,
    // The dirt texture fills a square; max dimension covers the rectangle, crop is harmless.
    (ctx) => drawDirtTexture(ctx, Math.max(widthCells, depthCells) * px, APRON_BASE, APRON_TONES),
    scene
  );
}

/** Seed variants per road cell (hashed by position in roadRenderer) so long
 * straight runs don't visibly repeat one texture when zoomed out. */
export const ROAD_TEX_VARIANTS = 4;

/** Full-tile freeform plaza paving — finished slab bond in the plaza
 * limestone (drawPaving), directionless so any painted blob reads clean.
 * Variant seeds only jitter tones — the slab lattice is seed-independent, so
 * variant boundaries always land on grout joints. */
export function getPavingMaterial(scene: Scene, variant = 0) {
  return texturedMaterial(
    `plaza-paving-${variant}`,
    128,
    128,
    (ctx) => drawPaving(ctx, 128, 128, STONES_PER_CELL, GROUT, STONE_TONES, 1419 + variant * 83),
    scene
  );
}

/** Full-tile street paving — coursed setts in the road limestone. */
export function getRoadMaterial(scene: Scene, variant = 0) {
  return texturedMaterial(
    `road-${variant}`,
    128,
    128,
    (ctx) => drawSetts(ctx, 128, 128, 1417 + variant * 97),
    scene
  );
}

/** Diagonal paved ribbon: the sett courses drawn 192 wide so stone size stays
 * near-cardinal under the quad's √2 X-scale; courses wrap seamlessly at any
 * width, so staircase quad seams need no slab-count alignment. */
export function getPavedRibbonMaterial(scene: Scene, variant = 0) {
  return texturedMaterial(
    `paved-ribbon-${variant}`,
    192,
    128,
    (ctx) => drawSetts(ctx, 192, 128, 1418 + variant * 89),
    scene
  );
}

/** Rimless packed earth for dirt-ribbon junction pads (the ribbon texture minus
 * its grass rim — a rim across a crossing would fence it off). */
export function getDirtPadMaterial(scene: Scene) {
  return texturedMaterial("dirt-pad", 128, 128, (ctx) => drawDirtTexture(ctx, 128), scene);
}

/** Packed earth for diagonal dirt ribbons. Cardinal dirt paths draw through the
 * raster overlay (`dirtPathOverlay.ts`), which is grid-axis-aligned and can't
 * follow a 45° run, so diagonal dirt renders as decal quads like the paved
 * diagonals. The overlay's darker grass rim is baked onto the long (v) edges;
 * symmetric top/bottom so the DynamicTexture invertV orientation is moot. */
export function getDirtRibbonMaterial(scene: Scene) {
  const size = 128;
  return texturedMaterial(
    "dirt-ribbon",
    size,
    size,
    (ctx) => {
      drawDirtTexture(ctx, size);
      const rim = Math.round(size * 0.18); // matches the overlay's 18%-of-cell rim
      ctx.fillStyle = DIRT_EDGE;
      ctx.fillRect(0, 0, size, rim);
      ctx.fillRect(0, size - rim, size, rim);
    },
    scene
  );
}

export function disposePathMaterials() {
  for (const mat of pathMaterials.values()) {
    mat.diffuseTexture?.dispose();
    mat.dispose();
  }
  pathMaterials.clear();
}
