import type { BuildingId } from "~/game/buildings";

/** Local horizontal face of a composed prefab, pre-rotation. */
export type LocalSide = "posX" | "negX" | "posZ" | "negZ";
/** Grid-space side of a footprint (grid y maps to world z). */
export type GridSide = "posX" | "negX" | "posY" | "negY";
/** Local sides whose face stretches to the footprint boundary to meet an
 * abutting row-house (see mapRenderer computeBlend). */
export type BlendSides = Partial<Record<LocalSide, boolean>>;
/** Same-buildingId orthogonal neighbors of a drag-placed linear segment tile,
 * in grid space (grid y maps to local/world z). Drives per-cell orientation and
 * open-end caps (see mapRenderer computeSegment). */
export type SegmentMask = { px: boolean; nx: boolean; pz: boolean; nz: boolean };

/** One kit piece placed relative to the footprint center, in kit units (1 unit = 1 cell). */
type Part = {
  file: string;
  position?: [number, number, number];
  rotationY?: number;
  /** Uniform, or per-axis (e.g. squash roof Y for a shallower pitch). */
  scale?: number | [number, number, number];
  /** Per-variant override of ModelDef.sinkY (trunk heights differ per model). */
  sinkY?: number;
  /** Exclude from the bounding fit — for parts meant to break the footprint
   * box: sunken pieces (negative position.y survives the ground rebase) and
   * overhanging extensions (reach past the footprint without shrinking it). */
  buried?: boolean;
  /** Stretched along the blend axis so its face meets an abutting row-house
   * (walls, roof). Non-structural parts keep their true proportions. */
  structural?: boolean;
  /** Thin panel attached to this local face (door, windows, banner) — dropped
   * when that face blends into a neighbor, since it would be buried in the
   * shared wall. */
  face?: LocalSide;
  /** Multiply tint over the piece's base color. "facade"/"roof" resolve to the
   * building's position-hashed pick from FACADE_PALETTES/ROOF_PALETTE; any
   * other string is a TINT_COLORS id directly. One tint per part, applied to
   * every material it has — so a detail that must move independently of its
   * wall needs to be its own part (see proc:gable-end), not its own material. */
  tint?: "facade" | "roof" | string;
};

type ModelDef = {
  /** Composed prefab. Mutually exclusive with `variants`. */
  parts?: Part[];
  /** Single-piece alternatives picked by position hash (trees etc.). */
  variants?: Part[];
  /** Paved ground quad under the parts, in kit units — square, or [width, depth]
   * for rectangular pads (also sets the design span). Mottled apron stone by
   * default; `padStyle: "plaza"` for showpiece paving. */
  pad?: number | [number, number];
  /** "plaza" swaps the pad's plain flagstone for the showpiece plaza paving. */
  padStyle?: "plaza";
  /** Fraction of the footprint the composed bounding box fills. Default 0.9. */
  fit?: number;
  /** Squash the whole composed model's height after footprint fitting (1 = as-fit). */
  scaleY?: number;
  /** Fraction of the fitted height buried below ground (hides bare trunks). */
  sinkY?: number;
  /** Scale x/z independently to fill both footprint axes (rectangular prefabs). */
  stretch?: boolean;
  /** Direction the entrance faces at rotation 0 (unit ±x/±z). Drives the
   * placement facing arrow; omit for buildings with no meaningful front. */
  front?: [number, number];
  /** "quarter" = random 90° steps, "free" = any angle. Seeded by grid position. */
  randomRotate?: "quarter" | "free";
  randomScale?: [number, number];
  /** Extra parts appended when a solid building abuts that end of the local X
   * axis (see mapRenderer neighbor detection). Mark them `buried` so they
   * overhang the footprint instead of shrinking the fit. */
  extendNegX?: Part[];
  extendPosX?: Part[];
  /** Buildings sharing a group visually merge when side-adjacent: `structural`
   * parts stretch to the footprint boundary on sides facing a same-group
   * neighbor (row-houses). Sides carrying the door (`front`) never blend. */
  blendGroup?: string;
  /** Drag-placed linear decoration (fence/wall/colonnade): the model is built
   * per 1×1 cell from this spec + the neighbor mask instead of `parts`. */
  segment?: SegmentSpec;
};

/** Per-cell spec for a linear segment. `along` is authored spanning ±0.5 kit on
 * local X (thin on Z); it renders on the X axis when an x-neighbor exists and,
 * rotated 90°, on the Z axis for z-neighbors. `core` renders once at center;
 * `cap` is a centered post dropped at each open run-axis end (wall end-posts). */
type SegmentSpec = {
  core?: Part[];
  along: Part[];
  cap?: Part;
};

const TOWN = "/models/town/";
const NATURE = "/models/nature/";

// Kenney's tall pines double as Italian cypresses: stretched into a slender
// column and sunk so the bare trunk is buried (shared with the hill scatter).
// sinkY = each glb's measured foliage-bottom fraction (A: trunk tops at
// 0.63/1.53, B: 1.03/1.94) plus a hair so foliage meets the ground.
const CYPRESS_STRETCH = 3.0;
const CYPRESS_VARIANTS: Part[] = [
  { file: "/models/nature/tree_pineTallA.glb", sinkY: 0.44 },
  { file: "/models/nature/tree_pineTallB.glb", sinkY: 0.57 },
  { file: "/models/nature/tree_pineTallC.glb", sinkY: 0.4 },
  { file: "/models/nature/tree_pineTallD.glb", sinkY: 0.52 },
];

// Vineyard: three dirt furrows, each planted with a row of small "grapevine"
// trees (tree_simple's bare trunk reads as the training post).
const VINE_XS = [-2.1, -1.26, -0.42, 0.42, 1.26, 2.1];
const VINEYARD_PARTS: Part[] = [-1.3, 0, 1.3].flatMap((z, row) => [
  { file: NATURE + "crops_dirtRow.glb", position: [0, 0, z], scale: [5.2, 1, 1] } as Part,
  ...VINE_XS.map(
    (x, i): Part => ({
      file: NATURE + "tree_simple.glb",
      position: [x, -0.3, z],
      scale: [0.9, 0.5 + ((row + i) % 3) * 0.06, 0.9],
      buried: true,
    })
  ),
]);

// Rotate an `along` part 90° about Y so its long (local X) axis points along Z
// for a vertical run. Parts sit near center, so position rotates too (x'=z, z'=−x).
function rotateAlong90(part: Part): Part {
  const [x, y, z] = part.position ?? [0, 0, 0];
  return { ...part, position: [z, y, -x], rotationY: (part.rotationY ?? 0) + Math.PI / 2 };
}

// Compose a linear segment's parts from its neighbor mask: run pieces on each
// axis that has a same-id neighbor (isolated cells default to the X axis), plus
// a cap post at every open run-axis end. Caps are `buried` so they overhang the
// footprint at the cell edge instead of shrinking the fit.
const SEG_HALF = 0.5; // kit half-extent — the cell edge, where end caps sit
function segmentParts(spec: SegmentSpec, mask: SegmentMask): Part[] {
  const out: Part[] = [...(spec.core ?? [])];
  const hasX = mask.px || mask.nx;
  const hasZ = mask.pz || mask.nz;
  const capAt = (px: number, pz: number): Part => ({
    ...spec.cap!,
    position: [px, spec.cap!.position?.[1] ?? 0, pz],
    buried: true,
  });
  if (hasX || !hasZ) {
    out.push(...spec.along);
    if (spec.cap) {
      if (!mask.px) out.push(capAt(SEG_HALF, 0));
      if (!mask.nx) out.push(capAt(-SEG_HALF, 0));
    }
  }
  if (hasZ) {
    out.push(...spec.along.map(rotateAlong90));
    if (spec.cap) {
      if (!mask.pz) out.push(capAt(0, SEG_HALF));
      if (!mask.nz) out.push(capAt(0, -SEG_HALF));
    }
  }
  return out;
}

/** Shallower roof pitch: roofs squashed to 60% height, origin at the base so
 * they stay flush on the walls. */
const ROOF_SCALE: [number, number, number] = [1, 0.6, 1];

// proc:roof-gable is open-ended tile; proc:gable-end is the stucco triangle that
// closes it. They always come as a pair at the SAME position/rotation/scale —
// the two builders share one cross-section, so identical transforms are what
// keeps them aligned. The split exists because a tint covers a whole part: the
// kit's roof baked its gable wall onto the tile material, so a pink house got a
// brown gable and no tint could separate them.
//
// The gable is deliberately NOT `structural`, even on the blending row houses.
// Blend stretch scales each structural part from its OWN bounds to the shared
// edge, and the gable is necessarily smaller than the roof hiding it (any
// triangle strictly inside the roof's is), so it would stretch further and walk
// out through the tiles. It doesn't need to: only the neighbour-facing side
// stretches, and that gable is buried in the neighbour.

// Flat-color material tints per file (Nature Kit has no texture; defaults are teal/orange).
const MATERIAL_TINTS: Record<string, Record<string, string>> = {
  // No entries for the generated `proc:` pieces — they author their own base
  // colors (render/proceduralPieces.ts), which is the whole point of building
  // them. Adding one here would silently override the piece and split the
  // colour across two files; their check tests the piece's own value.
  [NATURE + "tree_default.glb"]: { leafsGreen: "#6b7d46", woodBark: "#7a5a40" },
  [NATURE + "tree_fat.glb"]: { leafsGreen: "#75854d", woodBark: "#7a5a40" },
  [NATURE + "tree_oak.glb"]: { leafsGreen: "#5f7540", woodBark: "#6f523a" },
  [NATURE + "tree_pineTallA.glb"]: { leafsDark: "#3f5c35", woodBarkDark: "#6f523a" },
  [NATURE + "tree_pineTallB.glb"]: { leafsDark: "#44613a", woodBarkDark: "#6f523a" },
  [NATURE + "tree_pineTallC.glb"]: { leafsDark: "#3f5c35", woodBarkDark: "#6f523a" },
  [NATURE + "tree_pineTallD.glb"]: { leafsDark: "#44613a", woodBarkDark: "#6f523a" },
  // Vineyard pieces: a small lollipop tree reads as a grapevine on its post.
  [NATURE + "tree_simple.glb"]: { leafsGreen: "#55743c", woodBark: "#7a5a40" },
  [NATURE + "crops_dirtRow.glb"]: { dirt: "#8a6a4d", dirtDark: "#6f5238" },
  // Bushes are a single "grass" material; olive tones matching the tree canopies.
  [NATURE + "plant_bush.glb"]: { grass: "#6b7d46" },
  [NATURE + "plant_bushLarge.glb"]: { grass: "#75854d" },
  [NATURE + "plant_bushDetailed.glb"]: { grass: "#5f7540" },
  // Rocks: "dirt" is the rock body, "grass" mossy accents, "_defaultMat" crevices.
  ...Object.fromEntries(
    ["rock_smallA", "rock_smallD", "rock_smallG", "rock_largeA", "rock_largeD", "rock_tallB"].map(
      (f) => [NATURE + f + ".glb", { dirt: "#91887a", grass: "#7a8a52", _defaultMat: "#7e766a" }]
    )
  ),
  [NATURE + "fence_simple.glb"]: { wood: "#9a7b57", woodDark: "#6f523a" },
  [NATURE + "fence_planks.glb"]: { wood: "#9a7b57", woodDark: "#6f523a" },
};

// Florence-style stucco variation: subtle diffuse multiplies over the shared
// colormap (town pieces load with a white diffuse, so these are pure tints).
const TINT_COLORS: Record<string, string> = {
  cream: "#eae5d8",
  pink: "#e3b8a6",
  sand: "#e0d5bf",
  white: "#f5efe2",
  ochre: "#d9c187", // warm workshop stucco (see FACADE_PALETTES.artist)
  stone: "#ddd8ca", // pale stone — marks civic/monumental buildings
  verde: "#58634c", // verde di Prato marble — the Duomo's green banding
  roofBrown: "#b1a296", // over terracotta: a slightly browner, sun-faded roof
  bronze: "#a3773e", // warm cast-metal brown for the foundry's ingot stock (diffuse-only — no metal sheen)
};
// Texture-swap tints: a colormap variant instead of a diffuse multiply, for
// accents baked into the atlas that a whole-material multiply can't isolate.
const TEXTURE_TINTS: Record<string, { file: string; diffuse?: string }> = {
  // "mint" recolors the atlas's terracotta quoin swatch (see make-mint-quoins.py)
  // to verde di Prato — the Duomo's green trim. Still needed: the generated
  // pieces have no quoins to recolor, but the kit's door/window/arch panels are
  // still atlas-textured, and they are where a religious building's green now
  // comes from. Retires only when those panels are generated too.
  // stone diffuse so the plaster matches the civic "stone" walls beside it;
  // the olive quoin swatch is pre-divided by stone so it lands on target.
  mint: { file: "colormap-mint", diffuse: "stone" },
  // Market-stall awning fabrics: the retint left both fabric-red and roof-red as
  // the same terracotta, so awnings read as rooftops. These variants recolor
  // only the two awning swatch columns (see make-stall-cloth.py) — stall-red.glb
  // takes the red column, stall-green.glb the green — so one variant paints two
  // fabrics; the pair gives blue/gold and crimson/green across the booths.
  cloth1: { file: "colormap-cloth1" },
  cloth2: { file: "colormap-cloth2" },
};
// Facade palette per build-menu category; a building's pick is position-hashed.
const FACADE_PALETTES: Record<string, string[]> = {
  residential: ["cream", "pink", "sand", "white"],
  service: ["cream", "sand"],
  artist: ["ochre", "sand"],
  materials: ["sand", "white"],
  city: ["stone"],
};
// Minor city-wide roof variation: ~1 in 3 roofs leans slightly brown.
const ROOF_PALETTE: (string | undefined)[] = [undefined, undefined, "roofBrown"];

// Long workshop hall: two bays, 3x2 footprint. Walls/openings are shared by
// both workshop types; roofs are per-workshop (the painter runs the full
// gable with a dormer, the sculptor crosses a head-house over the +X bay) so
// the two silhouettes differ. Props stay within x ±1.04 / z ≤ 0.84 so
// scaleZ ≥ scaleX still holds and the hall's fitted height is unchanged —
// the yard just borrows footprint depth from the hall.
const WORKSHOP_WALLS: Part[] = [
  { file: "proc:block", position: [-0.5, 0, 0], tint: "facade" },
  { file: "proc:block", position: [0.5, 0, 0], tint: "facade" },
  // door on the front bay, windows on the other faces (wall-doorway-square-wide
  // is an open hole showing the blank block behind it — reads as a gray smear)
  { file: TOWN + "wall-door.glb", position: [-0.5, 0, 0.02], rotationY: -Math.PI / 2, tint: "facade" },
  { file: TOWN + "wall-window-shutters.glb", position: [0.5, 0, 0.02], rotationY: -Math.PI / 2, tint: "facade" },
  { file: TOWN + "wall-window-shutters.glb", position: [-0.5, 0, -0.02], rotationY: Math.PI / 2, tint: "facade" },
  { file: TOWN + "wall-window-shutters.glb", position: [0.5, 0, -0.02], rotationY: Math.PI / 2, tint: "facade" },
  { file: TOWN + "wall-window-shutters.glb", position: [0.52, 0, 0], tint: "facade" },
  { file: TOWN + "wall-window-shutters.glb", position: [-0.52, 0, 0], rotationY: Math.PI, tint: "facade" },
];
// Gable halves of the hall roof: caps face outward, open ends meet at x=0.
const WORKSHOP_ROOF_NEGX: Part = {
  file: TOWN + "roof-gable-end.glb", position: [-0.5, 1, 0], rotationY: Math.PI, scale: ROOF_SCALE, tint: "roof",
};
const WORKSHOP_ROOF_POSX: Part = {
  file: TOWN + "roof-gable-end.glb", position: [0.5, 1, 0], scale: ROOF_SCALE, tint: "roof",
};

export const MODEL_MANIFEST: Partial<Record<BuildingId, ModelDef>> = {
  cottage: {
    front: [1, 0],
    blendGroup: "rowhouse",
    parts: [
      { file: "proc:block", position: [0, 0, 0], structural: true, tint: "facade" },
      { file: "proc:roof-gable", position: [0, 1, 0], scale: ROOF_SCALE, structural: true, tint: "roof" },
      { file: "proc:gable-end", position: [0, 1, 0], scale: ROOF_SCALE, tint: "facade" },
      // door on the gable end, shuttered windows on the long sides
      { file: TOWN + "wall-door.glb", position: [0.02, 0, 0], face: "posX", tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, 0.02], rotationY: -Math.PI / 2, face: "posZ", tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, -0.02], rotationY: Math.PI / 2, face: "negZ", tint: "facade" },
    ],
    fit: 0.85,
    // Keeps the ridge at ~2.4 person-heights (~13.7 ft) after the fit bump.
    scaleY: 0.58,
    randomRotate: "quarter",
  },
  townhouse: {
    front: [1, 0],
    blendGroup: "rowhouse",
    parts: [
      { file: "proc:block", position: [0, 0, 0], structural: true, tint: "facade" },
      { file: "proc:block", position: [0, 1, 0], structural: true, tint: "facade" },
      { file: "proc:roof-gable", position: [0, 2, 0], scale: ROOF_SCALE, structural: true, tint: "roof" },
      { file: "proc:gable-end", position: [0, 2, 0], scale: ROOF_SCALE, tint: "facade" },
      // door under the banner, shuttered windows on both floors of the long sides
      { file: TOWN + "wall-door.glb", position: [0.02, 0, 0], face: "posX", tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, 0.02], rotationY: -Math.PI / 2, face: "posZ", tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 1, 0.02], rotationY: -Math.PI / 2, face: "posZ", tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, -0.02], rotationY: Math.PI / 2, face: "negZ", tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 1, -0.02], rotationY: Math.PI / 2, face: "negZ", tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [-0.02, 1, 0], rotationY: Math.PI, face: "negX", tint: "facade" },
    ],
    // Widened + squashed together: at fit 0.65 / full height the two-story
    // stack read as a tower next to person-scale citizens.
    fit: 0.82,
    // ~22.4 ft: cottage story (13.7 ft) plus a ~9 ft second floor.
    scaleY: 0.56,
    randomRotate: "quarter",
  },
  workshop: {
    front: [0, 1],
    parts: [
      ...WORKSHOP_WALLS,
      WORKSHOP_ROOF_NEGX,
      WORKSHOP_ROOF_POSX,
      // Dormer (north light for the painter): a mini block + cross-ridge gable
      // buried into the front slope of the -X bay (chapel-lantern trick —
      // roof-window's thin overlay showed its open underside over the ridge
      // from behind). Apex 1.29 stays under the hall ridge (1.343).
      { file: "proc:block", position: [-0.5, 1, 0.33], scale: [0.22, 0.2, 0.24], tint: "facade" },
      { file: "proc:roof-gable", position: [-0.5, 1.2, 0.33], rotationY: Math.PI / 2, scale: [0.26, 0.15, 0.26], tint: "roof" },
      { file: "proc:gable-end", position: [-0.5, 1.2, 0.33], rotationY: Math.PI / 2, scale: [0.26, 0.15, 0.26], tint: "facade" },
      // Prominent chimney — the production tell. The shaft sits at x 0.21-0.43
      // inside its cell, so the position compensates for the 1.3 scale-out.
      { file: TOWN + "chimney.glb", position: [0.405, 0.55, 0], scale: 1.3 },
      // Painter's yard: worktable with a canvas standing on it, framed
      // canvases leaning on the wall (squashed wall-blocks — the texture's
      // corner quoins read as frame corners), and a squat pigment basin.
      { file: TOWN + "stall-bench.glb", position: [0.32, 0, 0.66], rotationY: Math.PI / 2, scale: 0.85 },
      { file: "proc:block", position: [0.15, 0.19, 0.66], scale: [0.26, 0.3, 0.04], rotationY: 0.12 },
      { file: "proc:block", position: [-0.88, 0, 0.57], scale: [0.3, 0.42, 0.05], rotationY: -0.12 },
      { file: "proc:block", position: [-0.16, 0, 0.58], scale: [0.2, 0.28, 0.05], rotationY: 0.2 },
      { file: TOWN + "pillar-stone.glb", position: [0.85, 0, 0.68], scale: [1.4, 0.1, 1.4] },
    ],
    fit: 0.92,
    scaleY: 0.65, // ~12 ft roofline, chimney to ~16 ft
    stretch: true,
  },
  sculpture_workshop: {
    front: [0, 1],
    parts: [
      ...WORKSHOP_WALLS,
      WORKSHOP_ROOF_NEGX,
      // Head-house over the +X bay: a half-story under its own cross-ridge
      // gable rising above the hall ridge (apex 1.84 vs 1.34) — T-silhouette
      // vs the painter's long hall. It buries the +X gable half entirely.
      { file: "proc:block", position: [0.5, 1, 0], scale: [1, 0.55, 1], tint: "facade" },
      { file: "proc:roof-gable", position: [0.5, 1.55, 0], rotationY: Math.PI / 2, scale: [1, 0.5, 1], tint: "roof" },
      { file: "proc:gable-end", position: [0.5, 1.55, 0], rotationY: Math.PI / 2, scale: [1, 0.5, 1], tint: "facade" },
      { file: TOWN + "chimney.glb", position: [0.5, 1.3, 0] },
      // Stone yard: the Phase-9 display plinth stands here, front-right of this
      // bay (footprint cell (4,3)) — so the yard is just its supporting cast:
      // uncarved boulder, scattered/stacked cut blocks, a column drum stub.
      { file: TOWN + "rock-large.glb", position: [0.85, 0, 0.62], scale: 0.22, rotationY: 2.3 },
      { file: TOWN + "pillar-stone.glb", position: [0.08, 0, 0.7], scale: [1.8, 0.35, 1.8] },
      { file: "proc:block", position: [-0.22, 0, 0.6], scale: 0.17 },
      { file: "proc:block", position: [-0.22, 0.17, 0.6], scale: 0.12, rotationY: 0.4 },
      { file: "proc:block", position: [-0.95, 0, 0.6], scale: 0.14, rotationY: 0.6 },
    ],
    fit: 0.92,
    scaleY: 0.65,
    stretch: true,
  },
  // Facade panels (wall-arch, wall-door, wall-window-*) are thin pieces on the
  // +X face of a unit cell: rotationY 0/π/±π/2 picks the face, and the cell is
  // offset 0.02 outward so the panel sits proud of the block wall (no z-fight).
  //
  // Palazzo, front facing +Z (toward the default camera). Three-story main
  // block under a low hip roof, two-story wing on +X under its own gable,
  // one-story annex on −X. Ground floor is recessed 0.5 behind the upper
  // floors with stone pillars along the front edge — an open loggia (the kit
  // has no curved arch piece; wall-arch is just a flat pier strip).
  palazzo: {
    front: [0, 1],
    parts: [
      // recessed ground floor (loggia interior wall)
      { file: "proc:block", position: [0, 0, -0.25], scale: [3, 1, 1.5], tint: "facade" },
      { file: TOWN + "wall-doorway-square-wide.glb", position: [-0.5, 0, 0.02], rotationY: -Math.PI / 2, tint: "facade" },
      // main block upper stories, overhanging the loggia
      { file: "proc:block", position: [-0.5, 1, 0], scale: [2, 1, 2], tint: "facade" },
      { file: "proc:block", position: [-0.5, 2, 0], scale: [2, 1, 2], tint: "facade" },
      { file: TOWN + "roof-point.glb", position: [-0.5, 3, 0], scale: [2, 1, 2], tint: "roof" },
      // wing on +X, one story lower
      { file: "proc:block", position: [1, 1, 0], scale: [1, 1, 2], tint: "facade" },
      { file: "proc:roof-gable", position: [1, 2, 0], scale: [1, 1, 2], tint: "roof" },
      { file: "proc:gable-end", position: [1, 2, 0], scale: [1, 1, 2], tint: "facade" },
      { file: TOWN + "chimney.glb", position: [0.5, 2.3, 0] },
      // one-story annex on −X, set slightly behind the colonnade line
      { file: "proc:block", position: [-2, 0, 0.25], tint: "facade" },
      { file: "proc:roof-gable", position: [-2, 1, 0.25], tint: "roof" },
      { file: "proc:gable-end", position: [-2, 1, 0.25], tint: "facade" },
      { file: TOWN + "wall-door.glb", position: [-2, 0, 0.27], rotationY: -Math.PI / 2, tint: "facade" },
      // loggia colonnade
      { file: TOWN + "pillar-stone.glb", position: [-1.5, 0, 0.92] },
      { file: TOWN + "pillar-stone.glb", position: [-0.9, 0, 0.92] },
      { file: TOWN + "pillar-stone.glb", position: [-0.3, 0, 0.92] },
      { file: TOWN + "pillar-stone.glb", position: [0.3, 0, 0.92] },
      { file: TOWN + "pillar-stone.glb", position: [0.9, 0, 0.92] },
      { file: TOWN + "pillar-stone.glb", position: [1.5, 0, 0.92] },
      // piano nobile front: shuttered windows + banner
      { file: TOWN + "wall-window-shutters.glb", position: [-1, 1, 0.52], rotationY: -Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 1, 0.52], rotationY: -Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [1, 1, 0.52], rotationY: -Math.PI / 2, tint: "facade" },
      // top floor (main block only): round windows flanking the banner
      { file: TOWN + "wall-window-round.glb", position: [-1, 2, 0.52], rotationY: -Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-round.glb", position: [0, 2, 0.52], rotationY: -Math.PI / 2, tint: "facade" },
      { file: TOWN + "banner-red.glb", position: [-0.5, 2, 0.66], rotationY: -Math.PI / 2 },
      // side windows: main block −X face (above the annex) and wing +X face
      { file: TOWN + "wall-window-shutters.glb", position: [-1.02, 1, -0.5], rotationY: Math.PI, tint: "facade" },
      { file: TOWN + "wall-window-round.glb", position: [-1.02, 2, -0.5], rotationY: Math.PI, tint: "facade" },
      { file: TOWN + "wall-window-round.glb", position: [-1.02, 2, 0.5], rotationY: Math.PI, tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [1.02, 1, -0.5], tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [1.02, 1, 0.5], tint: "facade" },
      // back windows
      { file: TOWN + "wall-window-shutters.glb", position: [-1, 1, -0.52], rotationY: Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 1, -0.52], rotationY: Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [1, 1, -0.52], rotationY: Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-round.glb", position: [-1, 2, -0.52], rotationY: Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-round.glb", position: [0, 2, -0.52], rotationY: Math.PI / 2, tint: "facade" },
    ],
    fit: 0.9,
    scaleY: 0.7,
    // Design is ~2.3:1 but the footprint is 10×8 — fill the depth too, or half
    // the claim reads as empty forecourt.
    stretch: true,
  },
  // Cathedral, front facing +X, symmetrical like Santa Maria Novella:
  // two-story nave under a high gable (ridge runs along X in the kit) with a
  // single-story aisle on each side under a shallow lean-to roof sloping up
  // to the nave wall (no shed piece in the kit: a gable with its ridge sunk
  // into the nave block, so only the outer slope shows). Three-portal facade
  // with a rose window, arcaded aisle walls, clerestory rounds above both
  // aisle roofs. (The bell tower is its own building now — see bell_tower.)
  cathedral: {
    front: [1, 0],
    parts: [
      { file: "proc:block", position: [0, 0, 0], scale: [4, 1, 1], tint: "stone" },
      { file: "proc:block", position: [0, 1, 0], scale: [4, 1, 1], tint: "stone" },
      { file: TOWN + "roof-high-gable.glb", position: [0, 2, 0], scale: [4, 1, 1], tint: "roof" },
      // side aisles
      { file: "proc:block", position: [0, 0, -1], scale: [4, 1, 1], tint: "stone" },
      // lean-to roofs: gable body spans x ±0.55 unscaled, so 3.62 ends it just
      // inside the ±2 facades (no ledge poking past the front); ridge cap sits
      // 0.02 behind the nave wall face (z-fight)
      { file: "proc:roof-gable", position: [0, 1, -0.48], scale: [3.62, 0.4, 2.1], tint: "roof" },
      { file: "proc:gable-end", position: [0, 1, -0.48], scale: [3.62, 0.4, 2.1], tint: "facade" },
      { file: "proc:block", position: [0, 0, 1], scale: [4, 1, 1], tint: "stone" },
      { file: "proc:roof-gable", position: [0, 1, 0.48], scale: [3.62, 0.4, 2.1], tint: "roof" },
      { file: "proc:gable-end", position: [0, 1, 0.48], scale: [3.62, 0.4, 2.1], tint: "facade" },
      // facade: central portal + rose window, side portals on the aisle fronts
      { file: TOWN + "wall-door.glb", position: [1.52, 0, 0], tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [1.52, 1, 0], tint: "mint" },
      { file: TOWN + "wall-door.glb", position: [1.52, 0, -1], tint: "mint" },
      { file: TOWN + "wall-door.glb", position: [1.52, 0, 1], tint: "mint" },
      // clerestory rounds above both aisle roofs
      { file: TOWN + "wall-window-round.glb", position: [-1, 1, -0.02], rotationY: Math.PI / 2, tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [0, 1, -0.02], rotationY: Math.PI / 2, tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [1, 1, -0.02], rotationY: Math.PI / 2, tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [-1, 1, 0.02], rotationY: -Math.PI / 2, tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [0, 1, 0.02], rotationY: -Math.PI / 2, tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [1, 1, 0.02], rotationY: -Math.PI / 2, tint: "mint" },
      // aisle arcades
      { file: TOWN + "wall-arch.glb", position: [-1, 0, -1.02], rotationY: Math.PI / 2, tint: "mint" },
      { file: TOWN + "wall-arch.glb", position: [0, 0, -1.02], rotationY: Math.PI / 2, tint: "mint" },
      { file: TOWN + "wall-arch.glb", position: [1, 0, -1.02], rotationY: Math.PI / 2, tint: "mint" },
      { file: TOWN + "wall-arch.glb", position: [-1, 0, 1.02], rotationY: -Math.PI / 2, tint: "mint" },
      { file: TOWN + "wall-arch.glb", position: [0, 0, 1.02], rotationY: -Math.PI / 2, tint: "mint" },
      { file: TOWN + "wall-arch.glb", position: [1, 0, 1.02], rotationY: -Math.PI / 2, tint: "mint" },
    ],
    fit: 0.95,
    scaleY: 0.71,
    stretch: true,
  },
  // Small parish chapel, front facing +Z: single 1.5-story nave under a gable
  // (rotated so the ridge runs along Z), door + rose window on the facade
  // (the rose panel rides up onto the gable end like a tall church front),
  // and a little bell lantern straddling the ridge toward the facade.
  chapel: {
    front: [0, 1],
    parts: [
      { file: "proc:block", position: [0, 0, 0], scale: [1.3, 1.2, 2], tint: "stone" },
      // High gable (1.112 native vs 0.571) at y-scale 0.75: apex 2.03 vs the
      // old 1.89 — a steeper, taller nave; civic breaks the skyline.
      { file: TOWN + "roof-high-gable.glb", position: [0, 1.2, 0], scale: [2, 0.75, 1.3], rotationY: Math.PI / 2, tint: "roof" },
      // facade
      { file: TOWN + "wall-door.glb", position: [0, 0, 0.52], rotationY: -Math.PI / 2, tint: "mint" },
      // half-size oculus, scaled to fit inside the gable triangle
      { file: TOWN + "wall-window-round.glb", position: [0, 1.05, 0.52], rotationY: -Math.PI / 2, scale: [1, 0.5, 0.5], tint: "mint" },
      // side windows
      { file: TOWN + "wall-window-round.glb", position: [0.17, 0.1, -0.45], tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [0.17, 0.1, 0.45], tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [-0.17, 0.1, -0.45], rotationY: Math.PI, tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [-0.17, 0.1, 0.45], rotationY: Math.PI, tint: "mint" },
      // bell lantern on the ridge (spire cap stays pure terracotta), raised
      // to straddle the taller high-gable ridge (apex 2.03)
      { file: "proc:block", position: [0, 1.75, 0.35], scale: [0.32, 0.6, 0.32], tint: "stone" },
      { file: TOWN + "roof-point.glb", position: [0, 2.35, 0.35], scale: 0.55 },
    ],
    fit: 0.95,
    scaleY: 0.63,
    stretch: true,
  },
  pigment_trader: {
    front: [1, 0],
    parts: [
      { file: "proc:block", position: [0, 0, 0], tint: "facade" },
      { file: TOWN + "banner-green.glb", position: [0, 0.25, 0] },
      // low hip, not a spire — spires read civic now
      { file: TOWN + "roof-point.glb", position: [0, 1, 0], scale: [1, 0.45, 1], tint: "roof" },
      // shop door under the banner, windows on the long sides
      { file: TOWN + "wall-door.glb", position: [0.02, 0, 0], tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, 0.02], rotationY: -Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, -0.02], rotationY: Math.PI / 2, tint: "facade" },
      // delivery yard along the back side: cart + pigment crates
      { file: TOWN + "cart.glb", position: [-0.15, 0, -0.85], rotationY: Math.PI / 2, scale: 0.5 },
      { file: "proc:block", position: [0.45, 0, -0.7], scale: 0.18 },
      { file: "proc:block", position: [0.66, 0, -0.68], scale: 0.14, rotationY: 0.5 },
    ],
    fit: 0.8,
    scaleY: 0.68,
    randomRotate: "quarter",
  },
  // Marble yard: low cutting shed under a squat hip roof (supplier grammar —
  // gables belong to houses), rough blocks, a finished column, cut-slab
  // stacks, and a hauling cart. The yard is the building; the shed serves it.
  marble_supplier: {
    front: [1, 0],
    parts: [
      { file: "proc:block", position: [-0.4, 0, -0.3], tint: "facade" },
      { file: TOWN + "roof-point.glb", position: [-0.4, 1, -0.3], scale: [1, 0.35, 1], tint: "roof" },
      // shed door opening onto the yard, window on the side
      { file: TOWN + "wall-door.glb", position: [-0.38, 0, -0.3], tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [-0.4, 0, -0.28], rotationY: -Math.PI / 2, tint: "facade" },
      { file: TOWN + "rock-large.glb", position: [0.5, 0, 0.5], scale: 0.55 },
      { file: TOWN + "rock-small.glb", position: [-0.3, 0, 0.7], scale: 0.7 },
      { file: TOWN + "pillar-stone.glb", position: [0.65, 0, -0.35], scale: 0.6 },
      // cut marble stock: stacked slabs + a cart
      { file: "proc:block", position: [0.15, 0, 0.72], scale: [0.3, 0.14, 0.22] },
      { file: "proc:block", position: [0.17, 0.14, 0.72], scale: [0.22, 0.11, 0.17], rotationY: 0.35 },
      { file: TOWN + "cart.glb", position: [0.95, 0, 0.15], rotationY: 0.5, scale: 0.6 },
    ],
    fit: 0.88,
    randomRotate: "quarter",
  },
  // Bronze foundry: same supplier grammar as the marble yard (low shed, squat
  // hip), but the yard is a casting works — a stone furnace block and stacks of
  // warm bronze ingots instead of pale marble slabs. No chimney smoke: smoke is
  // production-only (workshops/bakery), a foundry is a supplier.
  bronze_foundry: {
    front: [1, 0],
    parts: [
      { file: "proc:block", position: [-0.4, 0, -0.3], tint: "facade" },
      { file: TOWN + "roof-point.glb", position: [-0.4, 1, -0.3], scale: [1, 0.35, 1], tint: "roof" },
      { file: TOWN + "wall-door.glb", position: [-0.38, 0, -0.3], tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [-0.4, 0, -0.28], rotationY: -Math.PI / 2, tint: "facade" },
      // yard: a stout stone furnace + warm bronze ingot stacks + a hauling cart
      { file: "proc:block", position: [0.55, 0, 0.5], scale: [0.35, 0.5, 0.35], tint: "stone" },
      { file: "proc:block", position: [0.15, 0, 0.72], scale: [0.3, 0.12, 0.2], tint: "bronze" },
      { file: "proc:block", position: [0.18, 0.12, 0.7], scale: [0.2, 0.1, 0.16], rotationY: 0.4, tint: "bronze" },
      { file: TOWN + "cart.glb", position: [0.95, 0, 0.15], rotationY: 0.5, scale: 0.6 },
    ],
    fit: 0.88,
    randomRotate: "quarter",
  },
  // Long tavern hall: three bays under one continuous gable roof, with a
  // one-tile terrace out front (9x7 footprint). Bays are 3 wide × 1.5 deep in
  // kit units so the fitted cell scale matches the 6x4 houses — doors/windows
  // stay kit-sized instead of inflating with the footprint. Wall faces sit at
  // z ±0.75, so face panels center at ±0.27 (panel is +0.5 from piece center,
  // +0.02 z-fight nudge). The awning's outer edge at z=1.0 sets the fit box:
  // 1.75 kit deep on 7 cells keeps the same cells-per-kit-unit as the walls.
  tavern: {
    front: [0, 1],
    parts: [
      { file: "proc:block", position: [-1, 0, 0], scale: [1, 1, 1.5], tint: "facade" },
      { file: "proc:block", position: [0, 0, 0], scale: [1, 1, 1.5], tint: "facade" },
      { file: "proc:block", position: [1, 0, 0], scale: [1, 1, 1.5], tint: "facade" },
      { file: TOWN + "roof-gable-end.glb", position: [-0.75, 1, 0], rotationY: Math.PI, scale: [1.5, 0.6, 1.5], tint: "roof" },
      { file: TOWN + "roof-gable-end.glb", position: [0.75, 1, 0], scale: [1.5, 0.6, 1.5], tint: "roof" },
      { file: TOWN + "banner-red.glb", position: [1, 0.25, 0] },
      // door + windows on the front, windows on the back and far gable end
      { file: TOWN + "wall-door.glb", position: [-1, 0, 0.27], rotationY: -Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, 0.27], rotationY: -Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [1, 0, 0.27], rotationY: -Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [-1, 0, -0.27], rotationY: Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, -0.27], rotationY: Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [1, 0, -0.27], rotationY: Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [-1.02, 0, 0], rotationY: Math.PI, tint: "facade" },
      // terrace: shallow tiled awning (ridge sunk into the wall, cathedral
      // lean-to trick) over benches and potted shrubs. Prop scales counter the
      // global stretch (~1.36x / 1.84z) so they render roughly square.
      // awning rides just under the eaves — the arched door frame reaches
      // nearly the full wall height, so anything lower slices through it
      { file: "proc:roof-gable", position: [0, 0.82, 0.75], scale: [2.6, 0.2, 0.5], tint: "roof" },
      { file: "proc:gable-end", position: [0, 0.82, 0.75], scale: [2.6, 0.2, 0.5], tint: "facade" },
      // square café tables (the market's open table stand); z=0.9 keeps the legs
      // clear of the wall face at 0.75, buried so poking past the awning's
      // z=1.0 fit edge doesn't rescale the walls
      { file: TOWN + "stall.glb", position: [0.1, 0, 0.9], rotationY: Math.PI, scale: [0.38, 0.52, 0.29], buried: true },
      { file: TOWN + "stall.glb", position: [0.85, 0, 0.9], rotationY: Math.PI, scale: [0.38, 0.52, 0.29], buried: true },
      { file: NATURE + "plant_bush.glb", position: [-1.35, 0, 0.86], scale: [0.46, 0.52, 0.34] },
      { file: NATURE + "plant_bush.glb", position: [-0.55, 0, 0.86], scale: [0.36, 0.42, 0.27] },
      { file: NATURE + "plant_bushDetailed.glb", position: [1.4, 0, 0.86], scale: [0.46, 0.52, 0.34] },
    ],
    fit: 0.92,
    scaleY: 0.79, // ~16 ft ridge — a public hall, half a notch above the cottage
    stretch: true,
  },
  bakery: {
    front: [1, 0],
    parts: [
      { file: "proc:block", position: [0, 0, 0], tint: "facade" },
      { file: "proc:roof-gable", position: [0, 1, 0], scale: ROOF_SCALE, tint: "roof" },
      { file: "proc:gable-end", position: [0, 1, 0], scale: ROOF_SCALE, tint: "facade" },
      // oven chimney, scaled up (production tell); position compensates for
      // the shaft sitting at x 0.21-0.43 inside its cell
      { file: TOWN + "chimney.glb", position: [-0.08, 0.55, 0], scale: 1.25 },
      // projecting shop bay: gable end faces the street (service grammar),
      // apex 0.98 tucks under the main eave line
      { file: "proc:block", position: [0.45, 0, 0], scale: [0.4, 0.75, 0.5], tint: "facade" },
      { file: "proc:roof-gable", position: [0.45, 0.75, 0], scale: [0.4, 0.4, 0.55], tint: "roof" },
      { file: "proc:gable-end", position: [0.45, 0.75, 0], scale: [0.4, 0.4, 0.55], tint: "facade" },
      // shop door on the bay front, sign banner on the street-side wall
      { file: TOWN + "wall-door.glb", position: [0.29, 0, 0], scale: 0.75, tint: "facade" },
      { file: TOWN + "banner-green.glb", position: [0, 0.25, 0.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, 0.02], rotationY: -Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, -0.02], rotationY: Math.PI / 2, tint: "facade" },
    ],
    fit: 0.88,
    scaleY: 0.56, // ridge matches the cottage; chimney tips out at ~16 ft
    randomRotate: "quarter",
  },
  // Open market square: stalls sit small on a paved pad (the paving sets the
  // bounding box, so the stalls read as furniture, not as the building mass).
  // 7x4 cells with the stall rows on the two long edges, so adjacent markets
  // tile into continuous rows of stalls (three span a town-center plaza side).
  market: {
    pad: [3.5, 2],
    parts: [
      // Keep every piece inside the pad's ±1.75 × ±1.0 half-extents — anything
      // poking out grows the measured bounding box and shrinks/shifts the pad
      // off the tile. Booths at ~0.62 anchor to the citizens/tavern tables
      // (kit-native 1.0 towers over the meeples); rows face a central aisle.
      // Stall is 1x1 native → 0.31 half-extent here, so ±0.65 rides the edge.
      // Stalls front along +X natively; quarter-turn each row toward the aisle.
      // Awning fabrics vary via the cloth1/cloth2 colormap variants (blue/gold
      // vs crimson/green) so the market reads as bolts of cloth, not rooftops.
      { file: TOWN + "stall-red.glb", position: [-1.1, 0.02, -0.65], rotationY: -Math.PI / 2, scale: 0.62, tint: "cloth1" },
      { file: TOWN + "stall-green.glb", position: [0, 0.02, -0.65], rotationY: -Math.PI / 2, scale: 0.62, tint: "cloth1" },
      { file: TOWN + "stall-red.glb", position: [1.1, 0.02, -0.65], rotationY: -Math.PI / 2, scale: 0.62, tint: "cloth2" },
      { file: TOWN + "stall-green.glb", position: [-1.1, 0.02, 0.65], rotationY: Math.PI / 2, scale: 0.62, tint: "cloth2" },
      { file: TOWN + "stall-red.glb", position: [0, 0.02, 0.65], rotationY: Math.PI / 2, scale: 0.62, tint: "cloth1" },
      { file: TOWN + "stall-green.glb", position: [1.1, 0.02, 0.65], rotationY: Math.PI / 2, scale: 0.62, tint: "cloth2" },
    ],
    fit: 1,
  },
  // Single street stall: the kit stall reshaped one-sided (make-stall-side.py
  // slides the awning ridge to the back, long slope presenting +X to the
  // street — the market's rows keep the symmetric gable). Awning fabric
  // hash-varies across the market's four cloth combos; facing is seeded but R
  // overrides it (a stall should face along or across its street).
  market_stall: {
    front: [1, 0],
    variants: [
      { file: TOWN + "stall-side-red.glb", tint: "cloth1" },
      { file: TOWN + "stall-side-green.glb", tint: "cloth1" },
      { file: TOWN + "stall-side-red.glb", tint: "cloth2" },
      { file: TOWN + "stall-side-green.glb", tint: "cloth2" },
    ],
    fit: 1,
    randomRotate: "quarter",
  },
  town_center_plaza: {
    // Fountain with a central column (mockup: obelisk rising from the water);
    // the rest stays open paving so future citizens/stalls have room.
    pad: 6,
    padStyle: "plaza",
    parts: [
      // 1.4× footprint with the height squashed to the small fountain's 0.9 —
      // uniform 1.4 makes the rim read as a parapet, and sinking it instead
      // drowns the water plane below the rim
      { file: TOWN + "fountain-round-detail.glb", position: [0, 0.02, 0], scale: [1.4, 0.9, 1.4] },
      { file: TOWN + "pillar-stone.glb", position: [0, 0.05, 0], scale: 2 },
    ],
    fit: 1,
  },
  plaza: {
    pad: 4,
    padStyle: "plaza",
    parts: [{ file: TOWN + "fountain-round-detail.glb", position: [0, 0.02, 0], scale: 0.9 }],
    fit: 1,
  },
  // Neighborhood piazzetta: open paving, no centerpiece — a fountain would
  // crowd a 5-cell square (and the wandering citizens).
  small_plaza: {
    pad: 2.5,
    padStyle: "plaza",
    fit: 1,
  },
  // Pad-only entry (like small_plaza): suppresses the color-box fallback so the
  // decoration reads as ground + the displayArt pedestal, not a floating block.
  sculpture_display: {
    pad: 3,
    fit: 1,
  },
  // Freestanding campanile (the cathedral's old bell tower): four stacked
  // stories under a spire, belfry windows on all four faces.
  bell_tower: {
    front: [1, 0],
    parts: [
      { file: "proc:block", position: [0, 0, 0], tint: "stone" },
      { file: "proc:block", position: [0, 1, 0], tint: "stone" },
      { file: "proc:block", position: [0, 2, 0], tint: "stone" },
      { file: "proc:block", position: [0, 3, 0], tint: "stone" },
      { file: TOWN + "roof-high-point.glb", position: [0, 4, 0] },
      // door at the base, slit windows up the shaft
      { file: TOWN + "wall-door.glb", position: [0.02, 0, 0], tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [0.02, 1.2, 0], scale: [1, 0.6, 0.6], tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [0.02, 2.2, 0], scale: [1, 0.6, 0.6], tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [0.02, 3, 0], tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [-0.02, 3, 0], rotationY: Math.PI, tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [0, 3, 0.02], rotationY: -Math.PI / 2, tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [0, 3, -0.02], rotationY: Math.PI / 2, tint: "mint" },
    ],
    fit: 0.8,
    scaleY: 0.75,
  },
  // Roads render as connectivity-textured quads in mapRenderer (see paths.ts), not kit models.
  tree: {
    variants: [
      { file: NATURE + "tree_default.glb" },
      { file: NATURE + "tree_fat.glb" },
      { file: NATURE + "tree_oak.glb" },
    ],
    fit: 0.8,
    randomRotate: "free",
    randomScale: [0.85, 1.15],
  },
  cypress: {
    variants: CYPRESS_VARIANTS,
    fit: 0.4,
    scaleY: CYPRESS_STRETCH,
    randomRotate: "free",
    randomScale: [0.9, 1.2],
  },
  // Vine rows: tree_default canopies stretched into long low hedges; the whole
  // prefab sinks by the foliage-bottom fraction (0.8/1.71) to bury the trunks.
  vineyard: {
    parts: VINEYARD_PARTS,
    fit: 0.92,
  },
  fountain: {
    parts: [{ file: TOWN + "fountain-round-detail.glb" }],
    fit: 0.85,
  },
  // Per-cell colonnade: a thick column per cell under a full-cell entablature
  // (consecutive cells' entablature blocks butt into a continuous cornice).
  // Column width stays under the cell so the entablature — not the column —
  // drives the fit and stays gapless. Drag a run like a road.
  colonnade: {
    segment: {
      core: [{ file: TOWN + "pillar-stone.glb", scale: [1.7, 1.55, 1.7] }],
      along: [{ file: "proc:block", position: [0, 1.5, 0], scale: [1, 0.13, 0.72] }],
    },
    fit: 1.0,
  },
  obelisk: {
    parts: [
      { file: TOWN + "pillar-stone.glb", scale: [5.5, 0.2, 5.5] },
      { file: TOWN + "pillar-stone.glb", position: [0, 0.2, 0], scale: [3.8, 0.15, 3.8] },
      { file: "proc:block", position: [0, 0.35, 0], scale: [0.26, 1.5, 0.26] },
      { file: TOWN + "roof-point.glb", position: [0, 1.85, 0], scale: [0.24, 0.7, 0.24] },
    ],
    fit: 0.85,
  },
  olive_grove: {
    parts: [
      { file: NATURE + "tree_fat.glb", position: [-1.8, 0, -1.4], scale: 1.1 },
      { file: NATURE + "tree_default.glb", position: [0.2, 0, -1.8], scale: 0.95 },
      { file: NATURE + "tree_oak.glb", position: [1.8, 0, -1.2] },
      { file: NATURE + "tree_default.glb", position: [-1.4, 0, 1.5] },
      { file: NATURE + "tree_fat.glb", position: [0.6, 0, 1.2], scale: 1.05 },
      { file: NATURE + "tree_oak.glb", position: [1.9, 0, 1.8], scale: 0.9 },
    ],
    fit: 0.95,
    randomRotate: "quarter",
  },
  bush: {
    variants: [
      { file: NATURE + "plant_bush.glb" },
      { file: NATURE + "plant_bushLarge.glb" },
      { file: NATURE + "plant_bushDetailed.glb" },
    ],
    fit: 0.85,
    randomRotate: "free",
    randomScale: [0.8, 1.2],
  },
  rocks: {
    variants: [
      { file: NATURE + "rock_smallA.glb" },
      { file: NATURE + "rock_smallD.glb" },
      { file: NATURE + "rock_smallG.glb" },
    ],
    fit: 0.85,
    randomRotate: "free",
    randomScale: [0.8, 1.2],
  },
  boulder: {
    variants: [
      { file: NATURE + "rock_largeA.glb" },
      { file: NATURE + "rock_largeD.glb" },
      { file: NATURE + "rock_tallB.glb" },
    ],
    fit: 0.9,
    randomRotate: "free",
    randomScale: [0.85, 1.15],
  },
  // Per-cell fence: one rail spanning the cell, oriented to the run — scaled up
  // in height and thickness so it reads as sturdy posts-and-rails. Drag a run
  // like a road.
  fence: {
    segment: {
      along: [{ file: NATURE + "fence_simple.glb", scale: [1, 1.5, 1.6] }],
    },
    fit: 1.0,
  },
  // Per-cell low wall: a squashed wall-block slab spanning the cell, with square
  // end posts at the open ends of a run only. Drag a run like a road.
  stone_wall: {
    segment: {
      along: [{ file: "proc:block", scale: [1, 0.4, 0.18] }],
      cap: { file: "proc:block", scale: [0.2, 0.52, 0.24] },
    },
    fit: 1.0,
  },
};

export function hashPosition(x: number, y: number) {
  return (((x * 73856093) ^ (y * 19349663)) >>> 0) % 4096;
}

/** Local direction the building's entrance faces at rotation 0 (placement arrow). */
export function getFrontDirection(buildingId: BuildingId): [number, number] | null {
  return MODEL_MANIFEST[buildingId]?.front ?? null;
}

/** Footprint-fill fraction the model was scaled to (default matches assetLibrary). */
export function getModelFit(buildingId: BuildingId): number {
  return MODEL_MANIFEST[buildingId]?.fit ?? 0.9;
}

/** Buildings that orient in quarter steps: placement stores the ghost's shown
 * rotation explicitly so the placed building always matches the preview
 * (mapRenderer's random seeding only applies to tiles with no stored rotation,
 * e.g. the demo city). */
export function usesQuarterRotation(buildingId: BuildingId) {
  return MODEL_MANIFEST[buildingId]?.randomRotate === "quarter";
}

/** The quarter rotation (0-3) a building renders with at this origin: the
 * stored player rotation, or the position-seeded one for quarter-rotate
 * buildings. mapRenderer's neighbor scans must use this same value so blend
 * decisions match what actually renders. */
export function effectiveRotation(
  buildingId: BuildingId,
  gridPos: { x: number; y: number },
  rotation?: number
) {
  if (rotation != null) return ((rotation % 4) + 4) % 4;
  const def = MODEL_MANIFEST[buildingId];
  return def?.randomRotate === "quarter" ? hashPosition(gridPos.x, gridPos.y) % 4 : 0;
}

/** effectiveRotation keeping the diagonal component (0-7): a stored rotation
 * passes through whole; seeded rotations are always cardinal quarters. Use
 * where the 45° offset matters (display art, yaw) — the quarter side-ring
 * machinery (blend/extend) stays on effectiveRotation. */
export function effectiveFullRotation(
  buildingId: BuildingId,
  gridPos: { x: number; y: number },
  rotation?: number
) {
  if (rotation != null) return ((rotation % 8) + 8) % 8;
  return effectiveRotation(buildingId, gridPos, rotation);
}

// Rotation r turns local +X to face grid +x, −y, −x, +y (r = 0-3) — the same
// table computeExtend uses. Both rings are in facing order, so rotating by r
// just advances the grid index: local side i faces grid side (i + r) % 4.
const LOCAL_SIDE_RING: LocalSide[] = ["posX", "negZ", "negX", "posZ"];
const GRID_SIDE_RING: GridSide[] = ["posX", "negY", "negX", "posY"];

/** Local side of a building (rotated by quarter turns r) that faces the given grid side. */
export function localSideForGrid(grid: GridSide, r: number): LocalSide {
  return LOCAL_SIDE_RING[(GRID_SIDE_RING.indexOf(grid) - r + 4) % 4];
}

/** Row-house blend group, when the building merges with same-group neighbors. */
export function getBlendGroup(buildingId: BuildingId): string | undefined {
  return MODEL_MANIFEST[buildingId]?.blendGroup;
}

/** Local side the entrance is on (from `front`) — this side never blends. */
export function doorLocalSide(buildingId: BuildingId): LocalSide | null {
  const front = MODEL_MANIFEST[buildingId]?.front;
  if (!front) return null;
  if (front[0] === 1) return "posX";
  if (front[0] === -1) return "negX";
  return front[1] === 1 ? "posZ" : "negZ";
}

/** Whether this building appends extension parts against abutting solids (colonnade). */
export function hasExtensions(buildingId: BuildingId) {
  const def = MODEL_MANIFEST[buildingId];
  return Boolean(def?.extendNegX || def?.extendPosX);
}

/** Whether this building is a drag-placed per-cell linear segment. */
export function isSegment(buildingId: BuildingId) {
  return MODEL_MANIFEST[buildingId]?.segment != null;
}

/** Whether this building's model reacts to abutting neighbors at all —
 * mapRenderer re-evaluates these origins whenever any tile changes. */
export function reactsToNeighbors(buildingId: BuildingId) {
  return hasExtensions(buildingId) || getBlendGroup(buildingId) != null || isSegment(buildingId);
}

export {
  CYPRESS_STRETCH,
  CYPRESS_VARIANTS,
  FACADE_PALETTES,
  MATERIAL_TINTS,
  NATURE,
  ROOF_PALETTE,
  TEXTURE_TINTS,
  TINT_COLORS,
  TOWN,
  segmentParts,
};

export type { ModelDef, Part, SegmentSpec };
