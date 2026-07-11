import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";

import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";

import { CELL_SIZE, GRID_SIZE } from "~/game/constants";
import { BUILDING_METADATA_BY_ID, type BuildingId } from "~/game/buildings";
import { disposePathMaterials, getPadMaterial, getPlazaMaterial } from "./paths";

registerBuiltInLoaders();

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
  /** Multiply tint over the shared colormap. "facade"/"roof" resolve to the
   * building's position-hashed pick from FACADE_PALETTES/ROOF_PALETTE; any
   * other string is a TINT_COLORS id directly. Walls' baked quoins share the
   * material, so they shift with the facade — intended (Florence look). */
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

/** Shallower roof pitch: kit roofs squashed to 60% height, origin at the base
 * so they stay flush on the walls. */
const ROOF_SCALE: [number, number, number] = [1, 0.6, 1];

// Flat-color material tints per file (Nature Kit has no texture; defaults are teal/orange).
const MATERIAL_TINTS: Record<string, Record<string, string>> = {
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
  stone: "#ddd8ca", // pale stone — marks civic/monumental buildings
  roofBrown: "#b1a296", // over terracotta: a slightly browner, sun-faded roof
};
// Texture-swap tints: a colormap variant instead of a diffuse multiply, for
// accents baked into the atlas that a whole-material multiply can't isolate.
// "mint" recolors just the terracotta quoin swatch (see make-mint-quoins.py)
// to deep olive-green marble (verde di Prato, ~#58634c) — so a religious
// wall-block keeps stone plaster but green corner quoins, like the Duomo.
// (The id stays "mint" from an earlier lighter draft.) `diffuse` multiplies on.
const TEXTURE_TINTS: Record<string, { file: string; diffuse?: string }> = {
  // stone diffuse so the plaster matches the civic "stone" panels beside it;
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
  { file: TOWN + "wall-block.glb", position: [-0.5, 0, 0], tint: "facade" },
  { file: TOWN + "wall-block.glb", position: [0.5, 0, 0], tint: "facade" },
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
      { file: TOWN + "wall-block.glb", position: [0, 0, 0], structural: true, tint: "facade" },
      { file: TOWN + "roof-gable.glb", position: [0, 1, 0], scale: ROOF_SCALE, structural: true, tint: "roof" },
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
      { file: TOWN + "wall-block.glb", position: [0, 0, 0], structural: true, tint: "facade" },
      { file: TOWN + "wall-block.glb", position: [0, 1, 0], structural: true, tint: "facade" },
      { file: TOWN + "roof-gable.glb", position: [0, 2, 0], scale: ROOF_SCALE, structural: true, tint: "roof" },
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
      { file: TOWN + "wall-block.glb", position: [-0.5, 1, 0.33], scale: [0.22, 0.2, 0.24], tint: "facade" },
      { file: TOWN + "roof-gable.glb", position: [-0.5, 1.2, 0.33], rotationY: Math.PI / 2, scale: [0.26, 0.15, 0.26], tint: "roof" },
      // Prominent chimney — the production tell. The shaft sits at x 0.21-0.43
      // inside its cell, so the position compensates for the 1.3 scale-out.
      { file: TOWN + "chimney.glb", position: [0.405, 0.55, 0], scale: 1.3 },
      // Painter's yard: worktable with a canvas standing on it, framed
      // canvases leaning on the wall (squashed wall-blocks — the texture's
      // corner quoins read as frame corners), and a squat pigment basin.
      { file: TOWN + "stall-bench.glb", position: [0.32, 0, 0.66], rotationY: Math.PI / 2, scale: 0.85 },
      { file: TOWN + "wall-block.glb", position: [0.15, 0.19, 0.66], scale: [0.26, 0.3, 0.04], rotationY: 0.12 },
      { file: TOWN + "wall-block.glb", position: [-0.88, 0, 0.57], scale: [0.3, 0.42, 0.05], rotationY: -0.12 },
      { file: TOWN + "wall-block.glb", position: [-0.16, 0, 0.58], scale: [0.2, 0.28, 0.05], rotationY: 0.2 },
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
      { file: TOWN + "wall-block.glb", position: [0.5, 1, 0], scale: [1, 0.55, 1], tint: "facade" },
      { file: TOWN + "roof-gable.glb", position: [0.5, 1.55, 0], rotationY: Math.PI / 2, scale: [1, 0.5, 1], tint: "roof" },
      { file: TOWN + "chimney.glb", position: [0.5, 1.3, 0] },
      // Stone yard: plinth with a rough block on it (statue in progress),
      // uncarved boulder, scattered/stacked cut blocks, a column drum stub.
      { file: TOWN + "wall-block.glb", position: [0.42, 0, 0.68], scale: [0.3, 0.16, 0.3] },
      { file: TOWN + "rock-small.glb", position: [0.42, 0.16, 0.68], scale: 0.26, rotationY: 0.7 },
      { file: TOWN + "rock-large.glb", position: [0.85, 0, 0.62], scale: 0.22, rotationY: 2.3 },
      { file: TOWN + "pillar-stone.glb", position: [0.08, 0, 0.7], scale: [1.8, 0.35, 1.8] },
      { file: TOWN + "wall-block.glb", position: [-0.22, 0, 0.6], scale: 0.17 },
      { file: TOWN + "wall-block.glb", position: [-0.22, 0.17, 0.6], scale: 0.12, rotationY: 0.4 },
      { file: TOWN + "wall-block.glb", position: [-0.95, 0, 0.6], scale: 0.14, rotationY: 0.6 },
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
      { file: TOWN + "wall-block.glb", position: [0, 0, -0.25], scale: [3, 1, 1.5], tint: "facade" },
      { file: TOWN + "wall-doorway-square-wide.glb", position: [-0.5, 0, 0.02], rotationY: -Math.PI / 2, tint: "facade" },
      // main block upper stories, overhanging the loggia
      { file: TOWN + "wall-block.glb", position: [-0.5, 1, 0], scale: [2, 1, 2], tint: "facade" },
      { file: TOWN + "wall-block.glb", position: [-0.5, 2, 0], scale: [2, 1, 2], tint: "facade" },
      { file: TOWN + "roof-point.glb", position: [-0.5, 3, 0], scale: [2, 1, 2], tint: "roof" },
      // wing on +X, one story lower
      { file: TOWN + "wall-block.glb", position: [1, 1, 0], scale: [1, 1, 2], tint: "facade" },
      { file: TOWN + "roof-gable.glb", position: [1, 2, 0], scale: [1, 1, 2], tint: "roof" },
      { file: TOWN + "chimney.glb", position: [0.5, 2.3, 0] },
      // one-story annex on −X, set slightly behind the colonnade line
      { file: TOWN + "wall-block.glb", position: [-2, 0, 0.25], tint: "facade" },
      { file: TOWN + "roof-gable.glb", position: [-2, 1, 0.25], tint: "roof" },
      { file: TOWN + "wall-door.glb", position: [-2, 0, 0.27], rotationY: -Math.PI / 2, tint: "facade" },
      // lanterns flanking the forecourt (buried: overhang, don't shrink the fit)
      { file: TOWN + "lantern.glb", position: [-1.9, 0, 0.92], buried: true },
      { file: TOWN + "lantern.glb", position: [1.9, 0, 0.92], buried: true },
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
      { file: TOWN + "wall-block.glb", position: [0, 0, 0], scale: [4, 1, 1], tint: "mint" },
      { file: TOWN + "wall-block.glb", position: [0, 1, 0], scale: [4, 1, 1], tint: "mint" },
      { file: TOWN + "roof-high-gable.glb", position: [0, 2, 0], scale: [4, 1, 1], tint: "roof" },
      // side aisles
      { file: TOWN + "wall-block.glb", position: [0, 0, -1], scale: [4, 1, 1], tint: "mint" },
      // lean-to roofs: gable body spans x ±0.55 unscaled, so 3.62 ends it just
      // inside the ±2 facades (no ledge poking past the front); ridge cap sits
      // 0.02 behind the nave wall face (z-fight)
      { file: TOWN + "roof-gable.glb", position: [0, 1, -0.48], scale: [3.62, 0.4, 2.1], tint: "roof" },
      { file: TOWN + "wall-block.glb", position: [0, 0, 1], scale: [4, 1, 1], tint: "mint" },
      { file: TOWN + "roof-gable.glb", position: [0, 1, 0.48], scale: [3.62, 0.4, 2.1], tint: "roof" },
      // lanterns flanking the central portal (buried: overhang past the facade)
      { file: TOWN + "lantern.glb", position: [2.3, 0, -0.5], buried: true },
      { file: TOWN + "lantern.glb", position: [2.3, 0, 0.5], buried: true },
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
      { file: TOWN + "wall-block.glb", position: [0, 0, 0], scale: [1.3, 1.2, 2], tint: "mint" },
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
      { file: TOWN + "wall-block.glb", position: [0, 1.75, 0.35], scale: [0.32, 0.6, 0.32], tint: "mint" },
      { file: TOWN + "roof-point.glb", position: [0, 2.35, 0.35], scale: 0.55 },
    ],
    fit: 0.95,
    scaleY: 0.63,
    stretch: true,
  },
  pigment_trader: {
    front: [1, 0],
    parts: [
      { file: TOWN + "wall-block.glb", position: [0, 0, 0], tint: "facade" },
      { file: TOWN + "banner-green.glb", position: [0, 0.25, 0] },
      // low hip, not a spire — spires read civic now
      { file: TOWN + "roof-point.glb", position: [0, 1, 0], scale: [1, 0.45, 1], tint: "roof" },
      // shop door under the banner, windows on the long sides
      { file: TOWN + "wall-door.glb", position: [0.02, 0, 0], tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, 0.02], rotationY: -Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, -0.02], rotationY: Math.PI / 2, tint: "facade" },
      // delivery yard along the back side: cart + pigment crates
      { file: TOWN + "cart.glb", position: [-0.15, 0, -0.85], rotationY: Math.PI / 2, scale: 0.5 },
      { file: TOWN + "wall-block.glb", position: [0.45, 0, -0.7], scale: 0.18 },
      { file: TOWN + "wall-block.glb", position: [0.66, 0, -0.68], scale: 0.14, rotationY: 0.5 },
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
      { file: TOWN + "wall-block.glb", position: [-0.4, 0, -0.3], tint: "facade" },
      { file: TOWN + "roof-point.glb", position: [-0.4, 1, -0.3], scale: [1, 0.35, 1], tint: "roof" },
      // shed door opening onto the yard, window on the side
      { file: TOWN + "wall-door.glb", position: [-0.38, 0, -0.3], tint: "facade" },
      { file: TOWN + "wall-window-shutters.glb", position: [-0.4, 0, -0.28], rotationY: -Math.PI / 2, tint: "facade" },
      { file: TOWN + "rock-large.glb", position: [0.5, 0, 0.5], scale: 0.55 },
      { file: TOWN + "rock-small.glb", position: [-0.3, 0, 0.7], scale: 0.7 },
      { file: TOWN + "pillar-stone.glb", position: [0.65, 0, -0.35], scale: 0.6 },
      // cut marble stock: stacked slabs + a cart
      { file: TOWN + "wall-block.glb", position: [0.15, 0, 0.72], scale: [0.3, 0.14, 0.22] },
      { file: TOWN + "wall-block.glb", position: [0.17, 0.14, 0.72], scale: [0.22, 0.11, 0.17], rotationY: 0.35 },
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
      { file: TOWN + "wall-block.glb", position: [-1, 0, 0], scale: [1, 1, 1.5], tint: "facade" },
      { file: TOWN + "wall-block.glb", position: [0, 0, 0], scale: [1, 1, 1.5], tint: "facade" },
      { file: TOWN + "wall-block.glb", position: [1, 0, 0], scale: [1, 1, 1.5], tint: "facade" },
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
      { file: TOWN + "roof-gable.glb", position: [0, 0.82, 0.75], scale: [2.6, 0.2, 0.5], tint: "roof" },
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
      { file: TOWN + "wall-block.glb", position: [0, 0, 0], tint: "facade" },
      { file: TOWN + "roof-gable.glb", position: [0, 1, 0], scale: ROOF_SCALE, tint: "roof" },
      // oven chimney, scaled up (production tell); position compensates for
      // the shaft sitting at x 0.21-0.43 inside its cell
      { file: TOWN + "chimney.glb", position: [-0.08, 0.55, 0], scale: 1.25 },
      // projecting shop bay: gable end faces the street (service grammar),
      // apex 0.98 tucks under the main eave line
      { file: TOWN + "wall-block.glb", position: [0.45, 0, 0], scale: [0.4, 0.75, 0.5], tint: "facade" },
      { file: TOWN + "roof-gable.glb", position: [0.45, 0.75, 0], scale: [0.4, 0.4, 0.55], tint: "roof" },
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
      { file: TOWN + "lantern.glb", position: [-2.4, 0.02, -2.4] },
      { file: TOWN + "lantern.glb", position: [2.4, 0.02, -2.4] },
      { file: TOWN + "lantern.glb", position: [-2.4, 0.02, 2.4] },
      { file: TOWN + "lantern.glb", position: [2.4, 0.02, 2.4] },
    ],
    fit: 1,
  },
  plaza: {
    pad: 4,
    padStyle: "plaza",
    parts: [
      { file: TOWN + "fountain-round-detail.glb", position: [0, 0.02, 0], scale: 0.9 },
      { file: TOWN + "lantern.glb", position: [-1.55, 0.02, -1.55] },
      { file: TOWN + "lantern.glb", position: [1.55, 0.02, -1.55] },
      { file: TOWN + "lantern.glb", position: [-1.55, 0.02, 1.55] },
      { file: TOWN + "lantern.glb", position: [1.55, 0.02, 1.55] },
    ],
    fit: 1,
  },
  // Neighborhood piazzetta: open paving with corner lanterns, no centerpiece —
  // a fountain would crowd a 5-cell square (and the wandering citizens).
  small_plaza: {
    pad: 2.5,
    padStyle: "plaza",
    parts: [
      { file: TOWN + "lantern.glb", position: [-0.9, 0.02, -0.9] },
      { file: TOWN + "lantern.glb", position: [0.9, 0.02, -0.9] },
      { file: TOWN + "lantern.glb", position: [-0.9, 0.02, 0.9] },
      { file: TOWN + "lantern.glb", position: [0.9, 0.02, 0.9] },
    ],
    fit: 1,
  },
  // Freestanding campanile (the cathedral's old bell tower): four stacked
  // stories under a spire, belfry windows on all four faces.
  bell_tower: {
    front: [1, 0],
    parts: [
      { file: TOWN + "wall-block.glb", position: [0, 0, 0], tint: "mint" },
      { file: TOWN + "wall-block.glb", position: [0, 1, 0], tint: "mint" },
      { file: TOWN + "wall-block.glb", position: [0, 2, 0], tint: "mint" },
      { file: TOWN + "wall-block.glb", position: [0, 3, 0], tint: "mint" },
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
      along: [{ file: TOWN + "wall-block.glb", position: [0, 1.5, 0], scale: [1, 0.13, 0.72] }],
    },
    fit: 1.0,
  },
  obelisk: {
    parts: [
      { file: TOWN + "pillar-stone.glb", scale: [5.5, 0.2, 5.5] },
      { file: TOWN + "pillar-stone.glb", position: [0, 0.2, 0], scale: [3.8, 0.15, 3.8] },
      { file: TOWN + "wall-block.glb", position: [0, 0.35, 0], scale: [0.26, 1.5, 0.26] },
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
      along: [{ file: TOWN + "wall-block.glb", scale: [1, 0.4, 0.18] }],
      cap: { file: TOWN + "wall-block.glb", scale: [0.2, 0.52, 0.24] },
    },
    fit: 1.0,
  },
};

// Active/inactive material pairs, shared by every clone of a container.
const materialPairs = new Map<Material, { on: Material; off: Material }>();
// Tinted twins of a base pair, per (on-material, tint id) — see Part.tint.
const tintedPairs = new Map<Material, Map<string, { on: Material; off: Material }>>();

// Colormap variants beyond the base/desat pair (e.g. mint quoins), by file stem.
const variantColormaps = new Map<string, { on: Texture; off: Texture }>();
function getVariantColormaps(scene: Scene, stem: string) {
  let v = variantColormaps.get(stem);
  if (!v) {
    v = {
      on: new Texture(`${TOWN}Textures/${stem}.png`, scene, false, false),
      off: new Texture(`${TOWN}Textures/${stem}-desat.png`, scene, false, false),
    };
    variantColormaps.set(stem, v);
  }
  return v;
}

function getTintedPair(pair: { on: Material; off: Material }, tintId: string) {
  let byTint = tintedPairs.get(pair.on);
  if (!byTint) tintedPairs.set(pair.on, (byTint = new Map()));
  let tinted = byTint.get(tintId);
  if (!tinted) {
    const texTint = TEXTURE_TINTS[tintId];
    const color = Color3.FromHexString(TINT_COLORS[texTint?.diffuse ?? tintId] ?? "#ffffff");
    const on = (pair.on as StandardMaterial).clone(`${pair.on.name}~${tintId}`);
    on.diffuseColor = on.diffuseColor.multiply(color);
    // Clone keeps the desat colormap texture, so inactive tinted buildings gray
    // out the same way untinted ones do, just under their tint.
    const off = (pair.off as StandardMaterial).clone(`${pair.off.name}~${tintId}`);
    off.diffuseColor = off.diffuseColor.multiply(color);
    // Texture-swap tints replace the colormap so a baked-in swatch (quoins) can
    // be recolored without touching the rest of the wall via a diffuse multiply.
    if (texTint && on.diffuseTexture) {
      const variant = getVariantColormaps(on.getScene(), texTint.file);
      on.diffuseTexture = variant.on;
      off.diffuseTexture = variant.off;
    }
    byTint.set(tintId, (tinted = { on, off }));
  }
  return tinted;
}
const containers = new Map<string, AssetContainer>();
const containerLoads = new Map<string, Promise<AssetContainer | null>>();
// Shared gamma-space colormaps. The loader's own albedo textures are sRGB buffers meant
// for the PBR pipeline; sampling them from StandardMaterial renders too dark.
let townColormap: Texture | null = null;
let desatColormap: Texture | null = null;

function getColormaps(scene: Scene) {
  if (!townColormap) {
    // invertY=false to match the glTF loader's UV orientation
    townColormap = new Texture(TOWN + "Textures/colormap.png", scene, false, false);
    desatColormap = new Texture(TOWN + "Textures/colormap-desat.png", scene, false, false);
  }
  return { on: townColormap, off: desatColormap! };
}

function desaturate(color: Color3) {
  const luminance = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
  return Color3.Lerp(color, new Color3(luminance, luminance, luminance), 0.75).scale(0.85);
}

/** glTF loads PBR materials that need IBL to look right; the scene uses simple lights,
 * so convert everything to StandardMaterial and build the desaturated twin while at it. */
function convertMaterials(container: AssetContainer, file: string, scene: Scene) {
  const tints = MATERIAL_TINTS[file];
  for (const mesh of container.meshes) {
    const mat = mesh.material;
    if (!mat || !(mat instanceof PBRMaterial)) continue;

    let pair = materialPairs.get(mat);
    if (!pair) {
      const on = new StandardMaterial(`${mat.name}-std`, scene);
      const tint = tints?.[mat.name];
      on.diffuseColor = tint
        ? Color3.FromHexString(tint)
        : mat.albedoColor.toGammaSpace();
      if (mat.albedoTexture) on.diffuseTexture = getColormaps(scene).on;
      on.specularColor = Color3.Black();
      on.backFaceCulling = mat.backFaceCulling;
      // Kenney meshes are double-sided; in the RH scene the visible side is often the
      // backface, which gets zero diffuse light unless lighting flips with the normal.
      on.twoSidedLighting = true;

      const off = on.clone(`${mat.name}-std-off`);
      if (on.diffuseTexture) {
        off.diffuseTexture = getColormaps(scene).off;
        off.diffuseColor = off.diffuseColor.scale(0.9);
      } else {
        off.diffuseColor = desaturate(on.diffuseColor);
      }

      pair = { on, off };
      materialPairs.set(mat, pair);
      materialPairs.set(on, pair);
      materialPairs.set(off, pair);
    }
    mesh.material = pair.on;
  }
}

// Cache the in-flight promise, not just the resolved container: concurrent callers
// (e.g. StrictMode double-mount) must share one load instead of racing duplicate ones.
async function getContainer(file: string, scene: Scene) {
  let load = containerLoads.get(file);
  if (!load) {
    load = LoadAssetContainerAsync(file, scene).then((container) => {
      if (scene.isDisposed) {
        container.dispose();
        return null;
      }
      convertMaterials(container, file, scene);
      containers.set(file, container);
      return container;
    });
    containerLoads.set(file, load);
  }
  return load;
}

function addModelFiles(files: Set<string>, def: ModelDef | undefined) {
  if (!def) return;
  for (const part of segmentSpecParts(def) ?? def.parts ?? []) files.add(part.file);
  for (const part of def.variants ?? []) files.add(part.file);
  for (const part of def.extendNegX ?? []) files.add(part.file);
  for (const part of def.extendPosX ?? []) files.add(part.file);
}

/** All distinct parts referenced by a segment spec (for loading/hasModel). */
function segmentSpecParts(def: ModelDef): Part[] | null {
  const s = def.segment;
  if (!s) return null;
  return [...(s.core ?? []), ...s.along, ...(s.cap ? [s.cap] : [])];
}

// glTF parsing and material conversion run on the main thread. Keep only a few
// files in flight so loading a save does not turn into one long completion task.
async function preloadFiles(files: Iterable<string>, scene: Scene, onFileLoaded?: () => void) {
  const queue = [...new Set(files)];
  const workers = Math.min(4, queue.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (queue.length > 0) {
        const file = queue.pop();
        if (file) {
          await getContainer(file, scene);
          onFileLoaded?.();
        }
      }
    })
  );
}

/** Distinct model files a set of building types references (loading-progress denominator). */
export function countModelFiles(buildingIds: Iterable<BuildingId>) {
  const files = new Set<string>();
  for (const buildingId of buildingIds) addModelFiles(files, MODEL_MANIFEST[buildingId]);
  return files.size;
}

/** Load only model files referenced by placed/selected building types. */
export async function preloadBuildingModels(
  buildingIds: Iterable<BuildingId>,
  scene: Scene,
  onFileLoaded?: () => void
) {
  const files = new Set<string>();
  for (const buildingId of buildingIds) addModelFiles(files, MODEL_MANIFEST[buildingId]);
  await preloadFiles(files, scene, onFileLoaded);
}

/** Wilderness is decorative, so it deliberately streams after the playable city. */
export async function preloadEnvironmentModels(scene: Scene) {
  await preloadFiles(SCATTER_FILES, scene);
}

function hashPosition(x: number, y: number) {
  return (((x * 73856093) ^ (y * 19349663)) >>> 0) % 4096;
}

/** Local direction the building's entrance faces at rotation 0 (placement arrow). */
export function getFrontDirection(buildingId: BuildingId): [number, number] | null {
  return MODEL_MANIFEST[buildingId]?.front ?? null;
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

function getPadPair(width: number, depth: number, style: "plaza" | undefined, scene: Scene) {
  // Plaza paving drawers are square-only; only the mottled stone supports rects.
  const on = style === "plaza" ? getPlazaMaterial(width, scene) : getPadMaterial(width, depth, scene);
  let pair = materialPairs.get(on);
  if (!pair) {
    // Dim the flagstones when the building goes inactive (market short on workers).
    const off = on.clone(`${on.name}-off`);
    off.diffuseColor = new Color3(0.6, 0.6, 0.6);
    pair = { on, off };
    materialPairs.set(on, pair);
    materialPairs.set(off, pair);
  }
  return pair;
}

function instantiatePart(
  part: Part,
  parent: TransformNode,
  scene: Scene
): { roots: TransformNode[]; meshes: AbstractMesh[] } {
  const container = containers.get(part.file);
  if (!container) return { roots: [], meshes: [] };
  const entries = container.instantiateModelsToScene((name) => name, false, {
    doNotInstantiate: true, // clones own their material slot, needed for active/inactive swaps
  });
  const roots: TransformNode[] = [];
  const meshes: AbstractMesh[] = [];
  for (const node of entries.rootNodes) {
    const root = node as TransformNode; // glTF roots are always meshes
    root.parent = parent;
    root.position.set(...(part.position ?? [0, 0, 0]));
    if (part.rotationY) {
      root.rotationQuaternion = null; // glTF roots carry a quaternion that overrides .rotation
      root.rotation.set(0, part.rotationY, 0);
    }
    if (typeof part.scale === "number") root.scaling.setAll(part.scale);
    else if (part.scale) root.scaling.set(...part.scale);
    roots.push(root);
    for (const mesh of root.getChildMeshes(false)) meshes.push(mesh);
  }
  return { roots, meshes };
}

/** True when the building has a manifest entry whose files are all loaded. */
export function hasModel(buildingId: BuildingId) {
  const def = MODEL_MANIFEST[buildingId];
  if (!def) return false;
  const parts = segmentSpecParts(def) ?? def.parts ?? def.variants ?? [];
  return parts.length > 0 && parts.every((part) => containers.has(part.file));
}

export type BuildingModel = {
  root: TransformNode;
  meshes: AbstractMesh[];
  /** Batch key per mesh, parallel to `meshes`: source file + mesh index within
   * its part instance (`pad:<size>` for the paving pad). Lets the batcher map
   * each cloned mesh back to a shared thin-instance host. */
  meshKeys: string[];
  /** World-space height after fitting, for markers/labels. */
  height: number;
  /** Add to the tile-center position: recenters prefabs whose composed
   * bounding box isn't symmetric around the parts' origin (e.g. palazzo). */
  offsetX: number;
  offsetZ: number;
};

/**
 * Build the model for a building, scaled to its footprint with the base at y=0.
 * Returns null when the building has no manifest entry (caller falls back to a box).
 */
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

/** Move a part's faces along one local axis: faces with a target land exactly
 * on it, faces without stay anchored where they are. `boundMin/Max` are the
 * part's kit-space bounds on that axis (building-root space, pre-rotation). */
function stretchPartToTargets(
  roots: TransformNode[],
  partRotationY: number | undefined,
  axis: "x" | "z",
  boundMin: number,
  boundMax: number,
  targetMin: number | null,
  targetMax: number | null
) {
  if (targetMin == null && targetMax == null) return;
  const extent = boundMax - boundMin;
  if (extent <= 0) return;
  const newMin = targetMin ?? boundMin;
  const newMax = targetMax ?? boundMax;
  const factor = (newMax - newMin) / extent;
  // A part's quarter-turn rotationY swaps which of its own scaling axes spans
  // the building axis; its position stays in parent (building) space.
  const odd = Math.abs(Math.round((partRotationY ?? 0) / (Math.PI / 2))) % 2 === 1;
  const scaleAxis = odd ? (axis === "x" ? "z" : "x") : axis;
  for (const partRoot of roots) {
    partRoot.scaling[scaleAxis] *= factor;
    partRoot.position[axis] = newMin + factor * (partRoot.position[axis] - boundMin);
  }
}

export function instantiateBuilding(
  buildingId: BuildingId,
  footprint: { width: number; depth: number },
  gridPos: { x: number; y: number },
  scene: Scene,
  rotation?: number, // player-chosen quarter turns; overrides seeded randomRotate
  extend?: { negX: boolean; posX: boolean }, // append extendNegX/PosX parts
  blend?: BlendSides, // local sides stretched to the footprint edge (row-houses)
  segmentMask?: SegmentMask // per-cell linear segment: build parts from neighbors
): BuildingModel | null {
  const def = MODEL_MANIFEST[buildingId];
  if (!def) return null;

  const hash = hashPosition(gridPos.x, gridPos.y);
  // Position-hashed tints, on shifted bits so they don't correlate with the
  // hash%4 rotation (or each other) — same cell always renders the same.
  const palette = FACADE_PALETTES[BUILDING_METADATA_BY_ID[buildingId].type];
  const facadeTint = palette ? palette[(hash >> 4) % palette.length] : undefined;
  const roofTint = ROOF_PALETTE[(hash >> 7) % ROOF_PALETTE.length];
  const resolveTint = (tint?: string) =>
    tint === "facade" ? facadeTint : tint === "roof" ? roofTint : tint;
  let parts = def.segment
    ? segmentParts(def.segment, segmentMask ?? { px: false, nx: false, pz: false, nz: false })
    : def.parts ?? (def.variants ? [def.variants[hash % def.variants.length]] : []);
  if (!def.segment) {
    if (extend?.negX && def.extendNegX) parts = [...parts, ...def.extendNegX];
    if (extend?.posX && def.extendPosX) parts = [...parts, ...def.extendPosX];
  }
  if (parts.length === 0) return null;

  const root = new TransformNode(`model-${buildingId}-${gridPos.x}-${gridPos.y}`, scene);
  const buried = new Set<AbstractMesh>();
  type PartInstance = { part: Part; roots: TransformNode[]; meshes: AbstractMesh[] };
  const partInstances: PartInstance[] = [];
  for (const part of parts) {
    const { roots, meshes: partMeshes } = instantiatePart(part, root, scene);
    if (part.buried) for (const mesh of partMeshes) buried.add(mesh);
    partInstances.push({ part, roots, meshes: partMeshes });
  }
  if (!partInstances.some((pi) => pi.meshes.length > 0)) {
    root.dispose();
    return null;
  }

  // Kit-space bounds of the stretchable parts, measured while the building
  // root is still at identity (only part transforms apply — the rotation below
  // doesn't touch them, so these stay valid in local space).
  const blendActive =
    blend != null && Boolean(blend.posX || blend.negX || blend.posZ || blend.negZ);
  const structuralBounds = new Map<PartInstance, { min: Vector3; max: Vector3 }>();
  if (blendActive) {
    root.computeWorldMatrix(true);
    for (const pi of partInstances) {
      if (!pi.part.structural) continue;
      let bounds: { min: Vector3; max: Vector3 } | null = null;
      for (const partRoot of pi.roots) {
        partRoot.computeWorldMatrix(true);
        const b = partRoot.getHierarchyBoundingVectors(true);
        if (!bounds) bounds = { min: b.min.clone(), max: b.max.clone() };
        else {
          bounds.min.minimizeInPlace(b.min);
          bounds.max.maximizeInPlace(b.max);
        }
      }
      if (bounds) structuralBounds.set(pi, bounds);
    }
  }

  let padMesh: Mesh | null = null;
  let padW = 0;
  let padD = 0;
  if (def.pad) {
    // Sets the design span too: the bounding fit below measures the pad, so
    // parts keep the same scale the old paving grid gave them.
    [padW, padD] = typeof def.pad === "number" ? [def.pad, def.pad] : def.pad;
    padMesh = CreateGround(`pad-${buildingId}`, { width: padW, height: padD }, scene);
    padMesh.parent = root;
    padMesh.position.y = 0.02;
    padMesh.material = getPadPair(padW, padD, def.padStyle, scene).on;
  }

  // meshes/meshKeys assemble late so blended prefabs can drop buried panels first.
  const meshes: AbstractMesh[] = [];
  const meshKeys: string[] = [];
  const collectMeshes = () => {
    for (const pi of partInstances) {
      const tint = resolveTint(pi.part.tint);
      pi.meshes.forEach((mesh, i) => {
        meshes.push(mesh);
        meshKeys.push(`${pi.part.file}#${i}${tint ? `~${tint}` : ""}`);
      });
    }
    if (padMesh) {
      meshes.push(padMesh);
      meshKeys.push(`pad:${padW}x${padD}:${def.padStyle ?? "flag"}`);
    }
  };

  // Rotate before fitting so rectangular prefabs fill the (rotated) footprint
  // the caller passes in — the bounding box below already reflects the turn.
  if (rotation != null || def.randomRotate === "quarter") {
    root.rotation.y = (Math.PI / 2) * effectiveRotation(buildingId, gridPos, rotation);
  } else if (def.randomRotate === "free") {
    root.rotation.y = (hash / 4096) * Math.PI * 2;
  }

  // Fit the composed bounding box into the footprint, base at y=0.
  root.computeWorldMatrix(true);
  const { min, max } = root.getHierarchyBoundingVectors(
    true,
    buried.size > 0 ? (mesh) => !buried.has(mesh as AbstractMesh) : null
  );
  const extentX = max.x - min.x;
  const extentZ = max.z - min.z;
  const fit = def.fit ?? 0.9;
  const scaleX = (footprint.width * CELL_SIZE * fit) / extentX || 1;
  const scaleZ = (footprint.depth * CELL_SIZE * fit) / extentZ || 1;
  const sy = def.scaleY ?? 1;

  // Recenter horizontally: the measured bounding box isn't necessarily
  // symmetric around the parts' origin, and the caller positions the root at
  // the tile center.
  const centerX = (min.x + max.x) / 2;
  const centerZ = (min.z + max.z) / 2;

  if (def.stretch) {
    // Fill both footprint axes. Extents are world-space (post-rotation), but
    // scaling is local, so odd quarter turns swap which axis each scale drives.
    collectMeshes();
    const scaleY = Math.min(scaleX, scaleZ) * sy;
    const odd = Math.round(root.rotation.y / (Math.PI / 2)) % 2 !== 0;
    root.scaling.set(odd ? scaleZ : scaleX, scaleY, odd ? scaleX : scaleZ);
    root.position.y = -min.y * scaleY;
    return {
      root,
      meshes,
      meshKeys,
      height: (max.y - min.y) * scaleY,
      offsetX: -centerX * scaleX,
      offsetZ: -centerZ * scaleZ,
    };
  }

  let scale = Math.min(scaleX, scaleZ);
  if (def.randomScale) {
    const [lo, hi] = def.randomScale;
    scale *= lo + (hash / 4096) * (hi - lo);
  }

  if (blendActive && blend) {
    // Row-house blending: the fit above measured the complete, untouched part
    // set, so the base scale/offsets are byte-identical with and without
    // neighbors — only now do the structural faces move. Target rectangle: the
    // footprint in kit units around the measured center (the caller recenters
    // by offsetX/Z, so a stretched face lands exactly on the tile boundary,
    // where the neighbor's own stretched face meets it), inverse-rotated from
    // world-aligned into local part space.
    const halfW = (footprint.width * CELL_SIZE) / 2 / scale;
    const halfD = (footprint.depth * CELL_SIZE) / 2 / scale;
    const cos = Math.cos(root.rotation.y);
    const sin = Math.sin(root.rotation.y);
    let fpMinX = Infinity;
    let fpMaxX = -Infinity;
    let fpMinZ = Infinity;
    let fpMaxZ = -Infinity;
    for (const wx of [centerX - halfW, centerX + halfW]) {
      for (const wz of [centerZ - halfD, centerZ + halfD]) {
        const lx = wx * cos - wz * sin;
        const lz = wx * sin + wz * cos;
        fpMinX = Math.min(fpMinX, lx);
        fpMaxX = Math.max(fpMaxX, lx);
        fpMinZ = Math.min(fpMinZ, lz);
        fpMaxZ = Math.max(fpMaxZ, lz);
      }
    }
    for (const [pi, bounds] of structuralBounds) {
      stretchPartToTargets(pi.roots, pi.part.rotationY, "x", bounds.min.x, bounds.max.x,
        blend.negX ? fpMinX : null, blend.posX ? fpMaxX : null);
      stretchPartToTargets(pi.roots, pi.part.rotationY, "z", bounds.min.z, bounds.max.z,
        blend.negZ ? fpMinZ : null, blend.posZ ? fpMaxZ : null);
    }
    // Panels on a blended face would sit buried inside the shared wall.
    for (const pi of partInstances) {
      if (pi.part.face && blend[pi.part.face]) {
        for (const partRoot of pi.roots) partRoot.dispose();
        pi.meshes = [];
      }
    }
  }

  collectMeshes();
  root.scaling.set(scale, scale * sy, scale);
  const height = (max.y - min.y) * scale * sy;
  const sink = (parts[0].sinkY ?? def.sinkY ?? 0) * height;
  root.position.y = -min.y * scale * sy - sink;
  // The pad is the prefab's lowest surface, so the base shift above lands it
  // at exactly y=0 — under the apron (0.005) and roads (0.01). Lift it to
  // 0.015 world so the paving actually shows.
  if (padMesh) padMesh.position.y = (0.015 - root.position.y) / (scale * sy);

  return {
    root,
    meshes,
    meshKeys,
    height: height - sink,
    offsetX: -centerX * scale,
    offsetZ: -centerZ * scale,
  };
}

/** A building registered with the thin-instance batcher. */
export type PlacedBuilding = {
  /** World-space height after fitting, for markers/labels. */
  height: number;
  /** World-space top of the chimney part, when the prefab has one (smoke). */
  chimneyTop: Vector3 | null;
  setActive(active: boolean): void;
  dispose(): void;
};

/**
 * Renders placed buildings as thin-instance batches — one host mesh per
 * (source kit mesh × active state) instead of a clone per building, so draw
 * calls and shadow casters stay constant as the city grows. Layout reuses
 * `instantiateBuilding` verbatim: a transient clone is built, its meshes'
 * world matrices harvested into batches, and the clone disposed. Toggling
 * active moves a building's matrices between the on/off batches (shared
 * desaturated materials), preserving per-building inactive feedback.
 * Call `flush()` once per frame after placements/toggles to upload buffers.
 */
export function createBuildingBatcher(
  scene: Scene,
  onHostCreated?: (mesh: Mesh, castsShadow: boolean) => void
) {
  type Batch = { mesh: Mesh; instances: Map<object, number[]> };
  // `${meshKey}@on|off` → batch; hosts for both states are created together.
  const batches = new Map<string, Batch>();
  const builtMeshKeys = new Set<string>();
  const dirty = new Set<Batch>();

  function registerHost(meshKey: string, mesh: Mesh, state: "on" | "off", castsShadow: boolean) {
    mesh.isPickable = false;
    mesh.setEnabled(false);
    batches.set(`${meshKey}@${state}`, { mesh, instances: new Map() });
    onHostCreated?.(mesh, castsShadow);
  }

  /** Host meshes live unparented at identity with geometry in mesh-local space,
   * so instance matrices are exactly the harvested clone world matrices. */
  function buildHosts(meshKey: string) {
    if (builtMeshKeys.has(meshKey)) return;
    if (meshKey.startsWith("pad:")) {
      builtMeshKeys.add(meshKey);
      const [, sizeStr, style] = meshKey.split(":");
      const [width, depth] = sizeStr.split("x").map(Number);
      const pair = getPadPair(width, depth, style === "plaza" ? "plaza" : undefined, scene);
      const on = CreateGround(`batch-pad-${sizeStr}`, { width, height: depth }, scene);
      on.material = pair.on;
      const off = on.clone(`batch-pad-${sizeStr}-off`);
      off.makeGeometryUnique(); // thin-instance hosts can't share geometry (VAO clash)
      off.material = pair.off;
      // Flat paving pads don't cast — their shadow is just an offset dark rim.
      registerHost(meshKey, on, "on", false);
      registerHost(meshKey, off, "off", false);
      return;
    }
    // A `~tint` suffix picks tinted material twins; hosts are per (file, tint).
    const tintSep = meshKey.indexOf("~");
    const tintId = tintSep >= 0 ? meshKey.slice(tintSep + 1) : null;
    const baseKey = tintSep >= 0 ? meshKey.slice(0, tintSep) : meshKey;
    const file = baseKey.slice(0, baseKey.lastIndexOf("#"));
    const container = containers.get(file);
    if (!container) return; // not loaded yet; the caller skips this mesh
    // Build hosts for every mesh of the file at once — enumeration order
    // matches instantiatePart, which is what meshKey indices refer to.
    const entries = container.instantiateModelsToScene((name) => name, false, {
      doNotInstantiate: true,
    });
    const meshes: Mesh[] = [];
    for (const node of entries.rootNodes) {
      const root = node as TransformNode;
      for (const child of root.getChildMeshes(false)) meshes.push(child as Mesh);
    }
    meshes.forEach((mesh, i) => {
      const key = `${file}#${i}${tintId ? `~${tintId}` : ""}`;
      builtMeshKeys.add(key);
      mesh.parent = null;
      mesh.position.setAll(0);
      mesh.rotationQuaternion = null;
      mesh.rotation.setAll(0);
      mesh.scaling.setAll(1);
      // Thin-instance hosts must not share geometry: Babylon caches VAOs on the
      // geometry, so co-owning hosts (incl. the scatter's) would clobber each
      // other's instance-buffer bindings (GL "vertex buffer not big enough").
      mesh.makeGeometryUnique();
      let pair = mesh.material ? materialPairs.get(mesh.material) : undefined;
      if (pair && tintId) pair = getTintedPair(pair, tintId);
      const off = mesh.clone(`${mesh.name}-off`, null);
      off.makeGeometryUnique();
      if (pair) {
        mesh.material = pair.on;
        off.material = pair.off;
      }
      registerHost(key, mesh, "on", true);
      registerHost(key, off, "off", true);
    });
    for (const node of entries.rootNodes) node.dispose(); // leftover transform nodes
  }

  function getBatch(meshKey: string, active: boolean): Batch | null {
    buildHosts(meshKey);
    return batches.get(`${meshKey}@${active ? "on" : "off"}`) ?? null;
  }

  function place(
    buildingId: BuildingId,
    footprint: { width: number; depth: number },
    gridPos: { x: number; y: number },
    worldX: number,
    worldZ: number,
    rotation: number | undefined,
    extend: { negX: boolean; posX: boolean } | undefined,
    blend: BlendSides | undefined,
    active: boolean,
    segmentMask?: SegmentMask
  ): PlacedBuilding | null {
    const model = instantiateBuilding(buildingId, footprint, gridPos, scene, rotation, extend, blend, segmentMask);
    if (!model) return null;
    model.root.position.x = worldX + model.offsetX;
    model.root.position.z = worldZ + model.offsetZ;
    model.root.computeWorldMatrix(true);

    // Harvest final world matrices (and the chimney top for smoke), grouped by
    // batch key — a building can hold several copies of the same kit mesh.
    let chimneyTop: Vector3 | null = null;
    const matricesByKey = new Map<string, number[]>();
    model.meshes.forEach((mesh, i) => {
      const world = mesh.computeWorldMatrix(true);
      if (!chimneyTop && mesh.name.includes("chimney")) {
        chimneyTop = mesh.getBoundingInfo().boundingBox.maximumWorld.clone();
      }
      const key = model.meshKeys[i];
      let arr = matricesByKey.get(key);
      if (!arr) matricesByKey.set(key, (arr = []));
      world.copyToArray(arr, arr.length);
    });
    const height = model.height;
    model.root.dispose();

    const token = {};
    let state = active;
    function register() {
      for (const [key, arr] of matricesByKey) {
        const batch = getBatch(key, state);
        if (!batch) continue;
        batch.instances.set(token, arr);
        dirty.add(batch);
      }
    }
    function unregister() {
      for (const key of matricesByKey.keys()) {
        const batch = batches.get(`${key}@${state ? "on" : "off"}`);
        if (batch?.instances.delete(token)) dirty.add(batch);
      }
    }
    register();

    return {
      height,
      chimneyTop,
      setActive(next: boolean) {
        if (next === state) return;
        unregister();
        state = next;
        register();
      },
      dispose() {
        unregister();
      },
    };
  }

  /** Upload dirty batch buffers. Returns true when anything changed. */
  function flush(): boolean {
    if (dirty.size === 0) return false;
    for (const batch of dirty) {
      let total = 0;
      for (const arr of batch.instances.values()) total += arr.length;
      if (total === 0) {
        batch.mesh.thinInstanceSetBuffer("matrix", null);
        batch.mesh.setEnabled(false);
        continue;
      }
      const buffer = new Float32Array(total);
      let offset = 0;
      for (const arr of batch.instances.values()) {
        buffer.set(arr, offset);
        offset += arr.length;
      }
      batch.mesh.thinInstanceSetBuffer("matrix", buffer, 16, true);
      batch.mesh.setEnabled(true);
    }
    dirty.clear();
    return true;
  }

  function dispose() {
    for (const batch of batches.values()) batch.mesh.dispose();
    batches.clear();
    builtMeshKeys.clear();
    dirty.clear();
  }

  return { place, flush, dispose };
}

export function overrideMaterials(model: BuildingModel, material: Material) {
  for (const mesh of model.meshes) {
    mesh.material = material;
    mesh.isPickable = false;
  }
}

const SCATTER_OLIVE = [NATURE + "tree_default.glb", NATURE + "tree_fat.glb", NATURE + "tree_oak.glb"];
const SCATTER_ROCKS = [NATURE + "rock_smallA.glb", NATURE + "rock_smallD.glb", NATURE + "rock_smallG.glb"];
const SCATTER_BOULDERS = [NATURE + "rock_largeA.glb", NATURE + "rock_largeD.glb", NATURE + "rock_tallB.glb"];
const SCATTER_FENCES = [NATURE + "fence_simple.glb", NATURE + "fence_planks.glb"];
export const SCATTER_FILES = [
  ...SCATTER_OLIVE,
  ...SCATTER_ROCKS,
  ...SCATTER_BOULDERS,
  ...SCATTER_FENCES,
  ...CYPRESS_VARIANTS.map((variant) => variant.file),
  NATURE + "tree_simple.glb",
  NATURE + "crops_dirtRow.glb",
  TOWN + "wall-block.glb",
];
const ENV_CLEARANCE = 4;
const ENV_DEPTH = 60;

type ScatterOptions = {
  scale?: number;
  stretch?: [number, number, number];
  rotY?: number;
  sinkY?: number;
  drop?: number;
};

/** Decorative wilderness on the hills outside the buildable grid, rendered as
 * thin-instance batches: one host mesh per unique kit mesh instead of one
 * clone per tree, so hundreds of scatter items cost a couple dozen draw calls. */
export function scatterEnvironment(
  heightAt: (x: number, z: number) => number,
  rand: () => number,
  avoid?: (x: number, z: number) => boolean
) {
  const placements: Array<{ file: string; x: number; z: number; opts: ScatterOptions }> = [];
  const buildHalfExtent = (GRID_SIZE * CELL_SIZE) / 2;
  const minDistance = buildHalfExtent + ENV_CLEARANCE;

  // `avoid` (e.g. the river channel and the sea) rejects here — the funnel for
  // every placement, so clump/row offsets can't stray into the water either.
  function place(
    file: string,
    x: number,
    z: number,
    opts: ScatterOptions = {}
  ) {
    if (avoid?.(x, z)) return;
    placements.push({ file, x, z, opts });
  }

  /** Random point in the scatter ring around the build area, or null. */
  function ringPoint() {
    const angle = rand() * Math.PI * 2;
    const dist = minDistance + rand() * ENV_DEPTH;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (Math.max(Math.abs(x), Math.abs(z)) < minDistance) return null;
    return avoid?.(x, z) ? null : { x, z };
  }

  function placeTree(x: number, z: number) {
    if (rand() < 0.35) {
      const variant = CYPRESS_VARIANTS[Math.floor(rand() * CYPRESS_VARIANTS.length)];
      place(variant.file, x, z, {
        scale: 1.4 + rand() * 1.3,
        stretch: [1, CYPRESS_STRETCH, 1],
        sinkY: variant.sinkY,
      });
    } else {
      place(SCATTER_OLIVE[Math.floor(rand() * SCATTER_OLIVE.length)], x, z, {
        scale: 1.4 + rand() * 1.3,
      });
    }
  }

  // Trees: singles plus loose clumps of 2-4 so the hills read as scrubby
  // groves rather than an evenly seeded park.
  let trees = 0;
  for (let attempts = 0; trees < 260 && attempts < 1000; attempts += 1) {
    const p = ringPoint();
    if (!p) continue;
    const clump = rand() < 0.35 ? 2 + Math.floor(rand() * 3) : 1;
    for (let i = 0; i < clump && trees < 260; i += 1) {
      const x = i === 0 ? p.x : p.x + (rand() - 0.5) * 7;
      const z = i === 0 ? p.z : p.z + (rand() - 0.5) * 7;
      if (Math.max(Math.abs(x), Math.abs(z)) < minDistance) continue;
      placeTree(x, z);
      trees += 1;
    }
  }

  // Undergrowth: small sunken tree canopies read as round shrubs. The kit's
  // plant_bush* models splay like perched birds at hill distance — those stay
  // placeable up close but don't scatter.
  for (let attempts = 0, n = 0; n < 150 && attempts < 600; attempts += 1) {
    const p = ringPoint();
    if (!p) continue;
    place(SCATTER_OLIVE[Math.floor(rand() * SCATTER_OLIVE.length)], p.x, p.z, {
      scale: 0.45 + rand() * 0.35,
      sinkY: 0.4,
    });
    n += 1;
  }
  for (let attempts = 0, n = 0; n < 60 && attempts < 250; attempts += 1) {
    const p = ringPoint();
    if (!p) continue;
    const boulder = rand() < 0.25;
    place(
      (boulder ? SCATTER_BOULDERS : SCATTER_ROCKS)[Math.floor(rand() * 3)],
      p.x,
      p.z,
      { scale: boulder ? 1.2 + rand() * 1 : 0.9 + rand() * 0.8, drop: 0.12 }
    );
    n += 1;
  }

  // A few tended vineyard patches on flat-ish ground: rows of dirt furrows
  // planted with vine-on-post trees, matching the placeable vineyard prefab.
  for (let attempts = 0, n = 0; n < 4 && attempts < 60; attempts += 1) {
    const p = ringPoint();
    if (!p) continue;
    const slopeX = Math.abs(heightAt(p.x - 3, p.z) - heightAt(p.x + 3, p.z));
    const slopeZ = Math.abs(heightAt(p.x, p.z - 2) - heightAt(p.x, p.z + 2));
    if (slopeX > 0.5 || slopeZ > 0.5) continue;
    for (const rowZ of [-1.4, 0, 1.4]) {
      const z = p.z + rowZ;
      // No drop: the thin furrow vanishes under terrain facets if sunk at all.
      place(NATURE + "crops_dirtRow.glb", p.x, z, { scale: 1.2, stretch: [4.5, 1, 1], rotY: 0, drop: 0 });
      for (let i = -2; i <= 2; i += 1) {
        place(NATURE + "tree_simple.glb", p.x + i * 1.1, z, {
          scale: 0.55 + rand() * 0.1,
          rotY: 0,
          sinkY: 0.3,
        });
      }
    }
    n += 1;
  }

  // Very rare: a short run of old fencing or a crumbling low stone wall —
  // traces of past hands on the land.
  for (let attempts = 0, n = 0; n < 4 && attempts < 40; attempts += 1) {
    const p = ringPoint();
    if (!p) continue;
    const stone = rand() < 0.4;
    const theta = rand() * Math.PI * 2;
    const segments = 3 + Math.floor(rand() * 4);
    const scale = 1.6;
    for (let i = 0; i < segments; i += 1) {
      const x = p.x + Math.cos(theta) * i * scale;
      const z = p.z + Math.sin(theta) * i * scale;
      if (stone) {
        // Same slab kitbash as the stone_wall decoration (wall-block cube).
        place(TOWN + "wall-block.glb", x, z, {
          scale,
          stretch: [1, 0.28, 0.14],
          rotY: -theta,
          drop: 0.18,
        });
      } else {
        place(SCATTER_FENCES[Math.floor(rand() * 2)], x, z, { scale, rotY: -theta, drop: 0.18 });
      }
    }
    n += 1;
  }

  // One host mesh per unique mesh in a kit file, unparented at identity so its
  // thin-instance matrices are absolute world transforms. `local` captures the
  // mesh's transform chain inside the model (glTF node TRS) to pre-multiply in.
  type FileBatch = { meshes: Array<{ mesh: Mesh; local: Matrix }>; extentY: number };
  const fileBatches = new Map<string, FileBatch>();
  const hosts: Mesh[] = [];

  function getFileBatch(file: string): FileBatch | null {
    let batch = fileBatches.get(file);
    if (batch) return batch;
    const container = containers.get(file);
    if (!container) return null;
    const entries = container.instantiateModelsToScene((name) => name, false, {
      doNotInstantiate: true,
    });
    const meshes: FileBatch["meshes"] = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of entries.rootNodes) {
      const root = node as TransformNode;
      root.computeWorldMatrix(true);
      const bounds = root.getHierarchyBoundingVectors(true);
      minY = Math.min(minY, bounds.min.y);
      maxY = Math.max(maxY, bounds.max.y);
      for (const child of root.getChildMeshes(false)) {
        const mesh = child as Mesh;
        const local = mesh.computeWorldMatrix(true).clone();
        mesh.parent = null;
        mesh.position.setAll(0);
        mesh.rotationQuaternion = null;
        mesh.rotation.setAll(0);
        mesh.scaling.setAll(1);
        mesh.isPickable = false;
        // Thin-instance hosts must not share geometry: Babylon caches VAOs on
        // the geometry, so co-owning hosts would clobber each other's
        // instance-buffer bindings (GL "vertex buffer not big enough").
        mesh.makeGeometryUnique();
        meshes.push({ mesh, local });
        hosts.push(mesh);
      }
      root.dispose(); // meshes were unparented; this only drops leftover transform nodes
    }
    batch = { meshes, extentY: maxY - minY };
    fileBatches.set(file, batch);
    return batch;
  }

  // Iterating placements in order keeps rand() consumption identical to the
  // old per-clone streaming path, so the scatter layout is unchanged.
  const instanceData = new Map<Mesh, number[]>();
  const scaling = new Vector3();
  const rotation = new Quaternion();
  const translation = new Vector3();
  const placementMatrix = new Matrix();
  const instanceMatrix = new Matrix();
  for (const { file, x, z, opts } of placements) {
    const batch = getFileBatch(file);
    if (!batch) continue;
    const s = opts.scale ?? 1;
    scaling.set(
      s * (opts.stretch?.[0] ?? 1),
      s * (opts.stretch?.[1] ?? 1),
      s * (opts.stretch?.[2] ?? 1)
    );
    let y = heightAt(x, z) - (opts.drop ?? 0.1);
    // Bury the bare trunk, matching the placed cypress prefab.
    if (opts.sinkY) y -= opts.sinkY * batch.extentY * scaling.y;
    Quaternion.RotationYawPitchRollToRef(opts.rotY ?? rand() * Math.PI * 2, 0, 0, rotation);
    translation.set(x, y, z);
    Matrix.ComposeToRef(scaling, rotation, translation, placementMatrix);
    for (const { mesh, local } of batch.meshes) {
      local.multiplyToRef(placementMatrix, instanceMatrix);
      let data = instanceData.get(mesh);
      if (!data) instanceData.set(mesh, (data = []));
      instanceMatrix.copyToArray(data, data.length);
    }
  }
  for (const [mesh, data] of instanceData) {
    mesh.thinInstanceSetBuffer("matrix", Float32Array.from(data), 16, true);
  }

  return {
    dispose() {
      for (const host of hosts) host.dispose();
    },
  };
}

export function disposeAssetLibrary() {
  disposePathMaterials();
  for (const container of containers.values()) container.dispose();
  containers.clear();
  containerLoads.clear();
  materialPairs.clear();
  tintedPairs.clear();
  townColormap?.dispose();
  townColormap = null;
  desatColormap?.dispose();
  desatColormap = null;
  for (const v of variantColormaps.values()) {
    v.on.dispose();
    v.off.dispose();
  }
  variantColormaps.clear();
}
