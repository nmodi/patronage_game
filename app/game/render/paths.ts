import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { CELL_SIZE, GRID_SIZE } from "~/game/constants";

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
// Dirt paths: light sun-dried earth (matching how the vineyard furrow models
// *render* under the scene lights) with a darker packed-earth rim at the grass
// edge. No slabs.
const DIRT_BASE = "#c9a172";
const DIRT_TONES = ["#b98f60", "#d4ad7e", "#bd9464", "#8f6f4e"];
const DIRT_EDGE = "#ab8a6c";

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

/**
 * All dirt paths on the map, drawn as one alpha-blended quad over the whole
 * grid instead of per-cell tiles — a single canvas is the only way corners
 * can know their neighbors. Outside corners are shaved to a quarter arc and
 * inside corners get a dirt fillet, so paths curve instead of stair-stepping.
 * A darker rim runs along the grass boundary (light center, worn edges).
 */
export function createDirtPathOverlay(scene: Scene) {
  const size = 2048; // power of two — NPOT + mipmaps samples black on WebGL1
  const px = size / GRID_SIZE; // texture pixels per cell (fractional)
  const r = px / 2; // corner radius: half a cell
  const w = px * 0.18; // width of the dark rim along grass edges
  // Cell edges snapped to whole pixels so adjacent fills share exact edges (no AA seams).
  const edge = (cells: number) => Math.round(cells * px);

  const tex = new DynamicTexture("dirt-overlay-tex", { width: size, height: size }, scene, true);
  tex.hasAlpha = true;
  const mat = new StandardMaterial("dirt-overlay-mat", scene);
  mat.specularColor = Color3.Black();
  mat.diffuseTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  const worldSize = GRID_SIZE * CELL_SIZE;
  const mesh = MeshBuilder.CreateGround("dirt-overlay", { width: worldSize, height: worldSize }, scene);
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.position.y = 0.008; // above building aprons (0.005), below paved roads (0.01)
  mesh.setEnabled(false);

  // Blotch pattern shared by every cell; 256px ≈ 10 cells so the mottling
  // varies at a larger-than-cell scale instead of repeating every tile.
  const pattern = document.createElement("canvas");
  pattern.width = pattern.height = 256;
  drawDirt(pattern.getContext("2d")!, 256);

  let lastSig = "";

  /** Corner detail at point (cx, cy): the region between the corner and a
   * quarter arc of radius rad centered at (cx + rad·ex, cy + rad·ey). Filled
   * it's an inside fillet; erased (destination-out) it rounds an outside
   * corner; refilled dark at a shrunk radius it caps the rim over a corner. */
  function cornerNotch(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    ex: number,
    ey: number,
    rad: number
  ) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + rad * ex, cy);
    ctx.arc(cx + rad * ex, cy + rad * ey, rad, Math.atan2(-ey, 0), Math.atan2(0, -ex), ex * ey > 0);
    ctx.closePath();
    ctx.fill();
  }

  const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;

  /** dirt = "x,y" cells holding a dirt path; occupied = every tile-holding
   * cell — rounding is suppressed against any occupied cell so junctions with
   * paved roads and building fronts stay flush. */
  function update(dirt: Set<string>, occupied: Set<string>) {
    const sig = `${[...dirt].sort().join(";")}#${[...occupied].sort().join(";")}`;
    if (sig === lastSig) return; // tiles resync every tick; only redraw on layout change
    lastSig = sig;

    mesh.setEnabled(dirt.size > 0);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, size, size);
    if (dirt.size === 0) {
      tex.update();
      return;
    }
    // Canvas→ground orientation, measured by projecting marker cells (July 2026):
    // canvas-right = world +x, canvas-top = world +z. Grid y grows toward +z, so
    // flip Y only to draw in grid coordinates.
    ctx.setTransform(1, 0, 0, -1, 0, size);

    // Precompute each cell's boundary situation once; used by all four passes.
    const open = (cx: number, cy: number) => !occupied.has(`${cx},${cy}`);
    const cells = [...dirt].map((key) => {
      const [gx, gy] = key.split(",").map(Number);
      const fillets: Array<[number, number]> = [];
      const rounded: Array<[number, number]> = [];
      for (const [dx, dy] of CORNERS) {
        // Inside fillet: two dirt runs meet around an empty diagonal cell.
        if (dirt.has(`${gx + dx},${gy}`) && dirt.has(`${gx},${gy + dy}`) && open(gx + dx, gy + dy)) {
          fillets.push([dx, dy]);
        }
        // Outside corner: both flanking cells are open.
        if (open(gx + dx, gy) && open(gx, gy + dy)) rounded.push([dx, dy]);
      }
      return { gx, gy, fillets, rounded };
    });
    const cornerX = (gx: number, dx: number) => edge(gx + (dx + 1) / 2);

    // Pass 1 — dark rim layer: the full path shape in the edge tone.
    ctx.fillStyle = DIRT_EDGE;
    for (const { gx, gy, fillets } of cells) {
      ctx.fillRect(edge(gx), edge(gy), edge(gx + 1) - edge(gx), edge(gy + 1) - edge(gy));
      for (const [dx, dy] of fillets) cornerNotch(ctx, cornerX(gx, dx), cornerX(gy, dy), dx, dy, r);
    }
    // Pass 2 — round its outside corners.
    ctx.globalCompositeOperation = "destination-out";
    for (const { gx, gy, rounded } of cells) {
      for (const [dx, dy] of rounded) cornerNotch(ctx, cornerX(gx, dx), cornerX(gy, dy), -dx, -dy, r);
    }
    // Pass 3 — light interior: the same shape eroded by w on every grass-facing
    // side (flush sides against roads/buildings keep no rim), leaving pass 1
    // showing only as the boundary rim. Fillet arcs grow to r+w (same centers).
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = ctx.createPattern(pattern, "repeat")!;
    for (const { gx, gy, fillets } of cells) {
      const x0 = edge(gx) + (open(gx - 1, gy) ? w : 0);
      const x1 = edge(gx + 1) - (open(gx + 1, gy) ? w : 0);
      const y0 = edge(gy) + (open(gx, gy - 1) ? w : 0);
      const y1 = edge(gy + 1) - (open(gx, gy + 1) ? w : 0);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (const [dx, dy] of fillets) {
        cornerNotch(ctx, cornerX(gx, dx) - w * dx, cornerX(gy, dy) - w * dy, dx, dy, r + w);
      }
    }
    // Pass 4 — dark caps over the outside corners: the light rects poke square
    // into the rim there; repaint the notch at radius r−w to restore it (the
    // cap stays inside the pass-2 arc, so the rounded silhouette is untouched).
    ctx.fillStyle = DIRT_EDGE;
    for (const { gx, gy, rounded } of cells) {
      for (const [dx, dy] of rounded) {
        cornerNotch(ctx, cornerX(gx, dx) - w * dx, cornerX(gy, dy) - w * dy, -dx, -dy, r - w);
      }
    }
    tex.update();
  }

  function dispose() {
    tex.dispose();
    mat.dispose();
    mesh.dispose();
  }

  return { update, dispose };
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
}
