// Map water (design doc, G5): a seeded river — and on coastal runs, a sea —
// as a *derived layer*, not tiles. The store persists only `waterSeed`; the
// cells are recomputed from it here. Water blocks placement (the one gate in
// placeTiles) and everything else ignores it: empty cells already stop the
// connectivity BFS and citizen walks, so water blocks "by absence". Bridges
// (type "road") are the single building allowed onto water cells.
//
// Coordinates: grid cell (gx, gy) has its center at world
// x = gx * CELL_SIZE - HALF_GRID + CELL_SIZE / 2 (same for z from gy) — the
// same transform as mapRenderer's gridToWorld. Compass: east = +X, west = -X,
// north = +Z, south = -Z.

// No runtime imports: water.check.ts runs this file under plain Node.

// Mirrors ~/game/constants (duplicated so this file stays import-free).
const GRID_SIZE = 80;
const CELL_SIZE = 0.5;
const HALF_GRID = (GRID_SIZE * CELL_SIZE) / 2;

/** Water must stay this far (world units) from the grid edges parallel to the
 * river, so the larger bank always holds a real city. */
const EDGE_MARGIN = 5;
/** Narrowest rasterized river (world units). At 1.2 every cross-row of the
 * grid covers at least two cell centers — no one-cell trickle a road ghost
 * could visually straddle. */
const MIN_RIVER_WIDTH = 1.2;

export type WaterArchetype = "inland" | "coastal";
export type CoastEdge = "north" | "south" | "east" | "west";

export interface WaterBody {
  archetype: WaterArchetype;
  /** Every "x,y" grid cell covered by water (river ∪ sea strip). */
  cells: ReadonlySet<string>;
  /** Axis the river flows along ("x": west–east, "z": south–north). */
  riverAxis: "x" | "z";
  /** Cross-axis world coordinate of the river centerline at flow coordinate t. */
  riverCenterAt(t: number): number;
  /** River water width (world units) at flow coordinate t. */
  riverWidthAt(t: number): number;
  /** Signed world distance from the river's water edge; negative inside water. */
  riverDistance(x: number, z: number): number;
  /** Coastal only: the world edge the sea lies along. */
  coastEdge?: CoastEdge;
  /** Signed world distance past the coastline; positive = open sea.
   * -Infinity on inland maps (there is no sea anywhere). */
  seaDistance(x: number, z: number): number;
}

// mulberry32 + FNV-1a (same algorithm as seed.ts, kept local — see header).
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

export function generateWater(seed: string): WaterBody {
  // Namespaced hash: the run seed also feeds pickCityName — keep the streams
  // independent so adding water didn't reshuffle existing derived picks.
  const rand = mulberry32(hashString(`water:${seed}`));

  const coastal = rand() < 0.5;
  const riverAxis: "x" | "z" = rand() < 0.5 ? "x" : "z";
  // Coast lies on the edge the river flows into: sign of the flow axis.
  const coastSign = rand() < 0.5 ? 1 : -1;

  // Meander: two gentle sine octaves over the full terrain span. Slopes are
  // capped (amp·2π/λ summed ≤ ~0.9) so consecutive 0.5-wu raster rows always
  // overlap by > one cell — a steeper meander can sever the river's own cells.
  const amp1 = 2 + rand() * 1.0;
  const freq1 = (Math.PI * 2) / (40 + rand() * 20);
  const phase1 = rand() * Math.PI * 2;
  const amp2 = 0.5 + rand() * 0.5;
  const freq2 = (Math.PI * 2) / (15 + rand() * 10);
  const phase2 = rand() * Math.PI * 2;

  // Width oscillates slowly along the flow; coastal mouths ramp to ~2×.
  const widthBase = 1.5 + rand() * 0.2;
  const widthVar = 0.3 + rand() * 0.15;
  const widthFreq = (Math.PI * 2) / (25 + rand() * 20);
  const widthPhase = rand() * Math.PI * 2;

  // Centerline offset from the grid middle, clamped so water (center + full
  // meander + half width) keeps EDGE_MARGIN from both parallel grid edges.
  const maxExcursion = amp1 + amp2 + (widthBase + widthVar); // half of 2× mouth width
  const maxOffset = HALF_GRID - EDGE_MARGIN - maxExcursion;
  const offset = (rand() < 0.5 ? -1 : 1) * Math.min(6 + rand() * 8, maxOffset);

  // Coastline: a strip clipped off the coast edge — base inset 2–3.5 wu
  // (4–7 cells) wiggling by up to ±1.5, so the sea bites 1–10 cells deep.
  const coastInset = 2 + rand() * 1.5;
  const coastAmp = 0.8 + rand() * 0.7;
  const coastFreq = (Math.PI * 2) / (20 + rand() * 20);
  const coastPhase = rand() * Math.PI * 2;
  // Flow-axis coordinate where the river meets the sea (coastline base).
  const mouthT = coastSign * (HALF_GRID - coastInset);

  const riverCenterAt = (t: number) =>
    offset + amp1 * Math.sin(t * freq1 + phase1) + amp2 * Math.sin(t * freq2 + phase2);

  const riverWidthAt = (t: number) => {
    let width = widthBase + widthVar * Math.sin(t * widthFreq + widthPhase);
    if (coastal) {
      // Estuary: widen toward the mouth over the last ~10 wu.
      width *= 1 + smoothstep((t * coastSign - (mouthT * coastSign - 10)) / 10);
    }
    return Math.max(MIN_RIVER_WIDTH, width);
  };

  const riverDistance = (x: number, z: number) => {
    const t = riverAxis === "x" ? x : z;
    const cross = riverAxis === "x" ? z : x;
    let d = Math.abs(cross - riverCenterAt(t)) - riverWidthAt(t) / 2;
    // Past the mouth the sea takes over — fade the river channel out instead
    // of carving a valley across the sea floor.
    if (coastal) d = Math.max(d, t * coastSign - (mouthT * coastSign + 3));
    return d;
  };

  // Signed distance past the coastline along the flow axis; the coastline
  // itself wiggles along the cross axis.
  const seaDistance = coastal
    ? (x: number, z: number) => {
        const t = riverAxis === "x" ? x : z;
        const cross = riverAxis === "x" ? z : x;
        const coastPos = HALF_GRID - coastInset + coastAmp * Math.sin(cross * coastFreq + coastPhase);
        return t * coastSign - coastPos;
      }
    : () => -Infinity;

  const cells = new Set<string>();
  for (let gy = 0; gy < GRID_SIZE; gy += 1) {
    for (let gx = 0; gx < GRID_SIZE; gx += 1) {
      const x = gx * CELL_SIZE - HALF_GRID + CELL_SIZE / 2;
      const z = gy * CELL_SIZE - HALF_GRID + CELL_SIZE / 2;
      if (riverDistance(x, z) < 0 || seaDistance(x, z) > 0) cells.add(`${gx},${gy}`);
    }
  }

  const coastEdge: CoastEdge | undefined = !coastal
    ? undefined
    : riverAxis === "x"
      ? coastSign > 0
        ? "east"
        : "west"
      : coastSign > 0
        ? "north"
        : "south";

  return {
    archetype: coastal ? "coastal" : "inland",
    cells,
    riverAxis,
    riverCenterAt,
    riverWidthAt,
    riverDistance,
    coastEdge,
    seaDistance,
  };
}

// Memoized on the seed string: the store calls getWaterCells inside placeTiles
// and the renderer reads the full body every frame-ish — one generation per run.
let cachedSeed: string | null = null;
let cachedBody: WaterBody | null = null;

/** The run's water body, or null when the run has no water (old saves, demo). */
export function getWater(waterSeed: string | null): WaterBody | null {
  if (waterSeed == null) return null;
  if (cachedSeed !== waterSeed || !cachedBody) {
    cachedBody = generateWater(waterSeed);
    cachedSeed = waterSeed;
  }
  return cachedBody;
}

const EMPTY_CELLS: ReadonlySet<string> = new Set();

/** Grid cells ("x,y") blocked by water for this run. Empty when waterSeed is null. */
export function getWaterCells(waterSeed: string | null): ReadonlySet<string> {
  return getWater(waterSeed)?.cells ?? EMPTY_CELLS;
}
