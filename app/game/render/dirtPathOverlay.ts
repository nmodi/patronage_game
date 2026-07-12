import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { CELL_SIZE, GRID_SIZE } from "~/game/constants";
import { DIRT_EDGE, drawDirtTexture } from "./dirtTexture";

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
  drawDirtTexture(pattern.getContext("2d")!, 256);

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

