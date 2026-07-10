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
function drawDirt(
  ctx: CanvasRenderingContext2D,
  size: number,
  base: string = DIRT_BASE,
  tones: string[] = DIRT_TONES
) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(1509);
  for (let i = 0; i < 60; i += 1) {
    const cx = rand() * size;
    const cy = rand() * size;
    const rx = size * (0.04 + rand() * 0.12);
    const ry = rx * (0.4 + rand() * 0.6);
    const angle = rand() * Math.PI;
    ctx.fillStyle = tones[Math.floor(rand() * tones.length)];
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

/** Non-plaza pads (market) share the aprons' mottled stone (size in world units). */
export function getPadMaterial(worldUnits: number, scene: Scene) {
  const cells = Math.round(worldUnits / CELL_SIZE);
  return getApronMaterial(cells, cells, scene);
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
  // drawDirt fills a square; max dimension covers the rectangle, crop is harmless.
  drawDirt(
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

/**
 * Neighbor-aware dirt paths, split into 4×4 canvas chunks. Each chunk keeps
 * the existing rounded-corner treatment, but only the chunks around a changed
 * cell need a canvas redraw and GPU texture upload.
 */
export function createDirtPathOverlay(scene: Scene) {
  // Chunk size is fixed at 20 cells × 25.6 pixels = 512px, so redraw cost and
  // pixels-per-cell detail stay constant no matter how large the grid grows —
  // a bigger grid just means more lazily-allocated chunks. Chunk meshes are
  // ordinary grounds, so Babylon frustum-culls off-screen ones for free.
  const CHUNK_CELLS = 20;
  const CHUNKS_PER_AXIS = GRID_SIZE / CHUNK_CELLS;
  const size = 512;
  const px = size / CHUNK_CELLS;
  const r = px / 2; // corner radius: half a cell
  const w = px * 0.18; // width of the dark rim along grass edges
  const worldChunkSize = CHUNK_CELLS * CELL_SIZE;

  if (!Number.isInteger(CHUNKS_PER_AXIS)) {
    throw new Error(`Dirt path chunks require GRID_SIZE to be a multiple of ${CHUNK_CELLS}.`);
  }

  type DirtChunk = {
    chunkX: number;
    chunkY: number;
    tex: DynamicTexture;
    mat: StandardMaterial;
    mesh: ReturnType<typeof MeshBuilder.CreateGround>;
  };

  const chunks = new Map<string, DirtChunk>();

  // Blotch pattern shared by every chunk. 512px is an exact multiple of 256px,
  // keeping the original 10-cell mottling phase continuous across chunk edges.
  const pattern = document.createElement("canvas");
  pattern.width = pattern.height = 256;
  drawDirt(pattern.getContext("2d")!, 256);

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

  function chunkKey(chunkX: number, chunkY: number) {
    return `${chunkX},${chunkY}`;
  }

  function createChunk(chunkX: number, chunkY: number): DirtChunk {
    const key = chunkKey(chunkX, chunkY);
    const tex = new DynamicTexture(`dirt-overlay-${key}-tex`, { width: size, height: size }, scene, true);
    tex.hasAlpha = true;
    const mat = new StandardMaterial(`dirt-overlay-${key}-mat`, scene);
    mat.specularColor = Color3.Black();
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    const mesh = MeshBuilder.CreateGround(`dirt-overlay-${key}`, { width: worldChunkSize, height: worldChunkSize }, scene);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.position.set(
      -((GRID_SIZE * CELL_SIZE) / 2) + (chunkX + 0.5) * worldChunkSize,
      0.008, // above building aprons (0.005), below paved roads (0.01)
      -((GRID_SIZE * CELL_SIZE) / 2) + (chunkY + 0.5) * worldChunkSize
    );
    mesh.setEnabled(false);
    const chunk = { chunkX, chunkY, tex, mat, mesh };
    chunks.set(key, chunk);
    return chunk;
  }

  function getChunk(chunkX: number, chunkY: number) {
    return chunks.get(chunkKey(chunkX, chunkY)) ?? createChunk(chunkX, chunkY);
  }

  function hasDirtNearChunk(chunkX: number, chunkY: number, dirt: Set<string>) {
    const startX = chunkX * CHUNK_CELLS;
    const startY = chunkY * CHUNK_CELLS;
    const endX = startX + CHUNK_CELLS;
    const endY = startY + CHUNK_CELLS;
    for (let gy = Math.max(0, startY - 1); gy <= Math.min(GRID_SIZE - 1, endY); gy += 1) {
      for (let gx = Math.max(0, startX - 1); gx <= Math.min(GRID_SIZE - 1, endX); gx += 1) {
        if (dirt.has(`${gx},${gy}`)) return true;
      }
    }
    return false;
  }

  /**
   * Repaint one chunk. The one-cell source border is important: an inside
   * fillet can cross a chunk edge even though its owning dirt cell is outside.
   */
  function redrawChunk(chunk: DirtChunk, dirt: Set<string>, occupied: Set<string>) {
    const startX = chunk.chunkX * CHUNK_CELLS;
    const startY = chunk.chunkY * CHUNK_CELLS;
    const endX = startX + CHUNK_CELLS;
    const endY = startY + CHUNK_CELLS;
    const edgeX = (cell: number) => Math.round((cell - startX) * px);
    const edgeY = (cell: number) => Math.round((cell - startY) * px);
    const cornerX = (gx: number, dx: number) => edgeX(gx + (dx + 1) / 2);
    const cornerY = (gy: number, dy: number) => edgeY(gy + (dy + 1) / 2);
    const ctx = chunk.tex.getContext() as CanvasRenderingContext2D;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, size, size);
    // Canvas→ground orientation, measured by projecting marker cells (July 2026):
    // canvas-right = world +x, canvas-top = world +z. Grid y grows toward +z, so
    // flip Y only to draw in grid coordinates.
    ctx.setTransform(1, 0, 0, -1, 0, size);

    // Include a one-cell source border. Its fill rects clip out, while any
    // fillets extending over the chunk boundary remain visible.
    const open = (cx: number, cy: number) => !occupied.has(`${cx},${cy}`);
    const cells: Array<{ gx: number; gy: number; fillets: Array<[number, number]>; rounded: Array<[number, number]> }> = [];
    for (let gy = Math.max(0, startY - 1); gy <= Math.min(GRID_SIZE - 1, endY); gy += 1) {
      for (let gx = Math.max(0, startX - 1); gx <= Math.min(GRID_SIZE - 1, endX); gx += 1) {
        if (!dirt.has(`${gx},${gy}`)) continue;
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
        cells.push({ gx, gy, fillets, rounded });
      }
    }

    // Pass 1 — dark rim layer: the full path shape in the edge tone.
    ctx.fillStyle = DIRT_EDGE;
    for (const { gx, gy, fillets } of cells) {
      ctx.fillRect(edgeX(gx), edgeY(gy), edgeX(gx + 1) - edgeX(gx), edgeY(gy + 1) - edgeY(gy));
      for (const [dx, dy] of fillets) cornerNotch(ctx, cornerX(gx, dx), cornerY(gy, dy), dx, dy, r);
    }
    // Pass 2 — round its outside corners.
    ctx.globalCompositeOperation = "destination-out";
    for (const { gx, gy, rounded } of cells) {
      for (const [dx, dy] of rounded) cornerNotch(ctx, cornerX(gx, dx), cornerY(gy, dy), -dx, -dy, r);
    }
    // Pass 3 — light interior: the same shape eroded by w on every grass-facing
    // side (flush sides against roads/buildings keep no rim), leaving pass 1
    // showing only as the boundary rim. Fillet arcs grow to r+w (same centers).
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = ctx.createPattern(pattern, "repeat")!;
    for (const { gx, gy, fillets } of cells) {
      const x0 = edgeX(gx) + (open(gx - 1, gy) ? w : 0);
      const x1 = edgeX(gx + 1) - (open(gx + 1, gy) ? w : 0);
      const y0 = edgeY(gy) + (open(gx, gy - 1) ? w : 0);
      const y1 = edgeY(gy + 1) - (open(gx, gy + 1) ? w : 0);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (const [dx, dy] of fillets) {
        cornerNotch(ctx, cornerX(gx, dx) - w * dx, cornerY(gy, dy) - w * dy, dx, dy, r + w);
      }
    }
    // Pass 4 — dark caps over the outside corners: the light rects poke square
    // into the rim there; repaint the notch at radius r−w to restore it (the
    // cap stays inside the pass-2 arc, so the rounded silhouette is untouched).
    ctx.fillStyle = DIRT_EDGE;
    for (const { gx, gy, rounded } of cells) {
      for (const [dx, dy] of rounded) {
        cornerNotch(ctx, cornerX(gx, dx) - w * dx, cornerY(gy, dy) - w * dy, -dx, -dy, r - w);
      }
    }
    chunk.mesh.setEnabled(cells.length > 0);
    chunk.tex.update();
  }

  // Chunk redraws are queued here and drained via process() a frame-budgeted
  // step at a time — a big initial map otherwise rasterizes and uploads every
  // chunk synchronously before first paint. The sets are the caller's live
  // Sets, mutated in place, so drain-time reads see the current topology.
  const pendingChunks = new Set<string>();
  let latestDirt: Set<string> = new Set();
  let latestOccupied: Set<string> = new Set();

  /** dirt = "x,y" cells holding a dirt path; occupied = every tile-holding
   * cell — rounding is suppressed against any occupied cell so junctions with
   * paved roads and building fronts stay flush. */
  function update(dirt: Set<string>, occupied: Set<string>, changedKeys: ReadonlySet<string>) {
    latestDirt = dirt;
    latestOccupied = occupied;
    if (changedKeys.size === 0) return;

    // A topology change can affect a dirt cell up to one cell away, and a
    // fillet can then cross one more chunk boundary. Marking this compact 5×5
    // neighborhood covers both cases and touches at most four chunks.
    for (const key of changedKeys) {
      const [gx, gy] = key.split(",").map(Number);
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const x = gx + dx;
          const y = gy + dy;
          if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) continue;
          pendingChunks.add(chunkKey(Math.floor(x / CHUNK_CELLS), Math.floor(y / CHUNK_CELLS)));
        }
      }
    }
  }

  /** Redraw up to `budget` queued chunks. Returns true when the queue is drained. */
  function process(budget = 1) {
    let drawn = 0;
    for (const key of pendingChunks) {
      if (drawn >= budget) break;
      pendingChunks.delete(key);
      const [chunkX, chunkY] = key.split(",").map(Number);
      const chunk = chunks.get(key);
      // Don't allocate transparent chunks for unrelated buildings. Existing
      // chunks still repaint so removing a nearby path clears stale pixels.
      if (chunk) redrawChunk(chunk, latestDirt, latestOccupied);
      else if (hasDirtNearChunk(chunkX, chunkY, latestDirt)) redrawChunk(getChunk(chunkX, chunkY), latestDirt, latestOccupied);
      else continue; // skipped chunks don't consume budget
      drawn += 1;
    }
    return pendingChunks.size === 0;
  }

  function dispose() {
    for (const chunk of chunks.values()) {
      chunk.tex.dispose();
      chunk.mat.dispose();
      chunk.mesh.dispose();
    }
    chunks.clear();
  }

  return { update, process, dispose };
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
}
