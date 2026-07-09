import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";

import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";

import { CELL_SIZE, GRID_SIZE } from "~/game/constants";
import type { BuildingId } from "~/game/buildings";
import { disposePathMaterials, getPadMaterial } from "./paths";

registerBuiltInLoaders();

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
};

type ModelDef = {
  /** Composed prefab. Mutually exclusive with `variants`. */
  parts?: Part[];
  /** Single-piece alternatives picked by position hash (trees etc.). */
  variants?: Part[];
  /** Flagstone paving quad under the parts, pad×pad kit units (also sets the design span). */
  pad?: number;
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

export const MODEL_MANIFEST: Partial<Record<BuildingId, ModelDef>> = {
  cottage: {
    front: [1, 0],
    parts: [
      { file: TOWN + "wall-block.glb", position: [0, 0, 0] },
      { file: TOWN + "roof-gable.glb", position: [0, 1, 0], scale: ROOF_SCALE },
      // door on the gable end, shuttered windows on the long sides
      { file: TOWN + "wall-door.glb", position: [0.02, 0, 0] },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, 0.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, -0.02], rotationY: Math.PI / 2 },
    ],
    fit: 0.85,
    // Keeps the ridge at ~2.4 person-heights (~13.7 ft) after the fit bump.
    scaleY: 0.58,
    randomRotate: "quarter",
  },
  townhouse: {
    front: [1, 0],
    parts: [
      { file: TOWN + "wall-block.glb", position: [0, 0, 0] },
      { file: TOWN + "wall-block.glb", position: [0, 1, 0] },
      { file: TOWN + "banner-red.glb", position: [0, 1, 0] },
      { file: TOWN + "roof-gable.glb", position: [0, 2, 0], scale: ROOF_SCALE },
      // door under the banner, shuttered windows on both floors of the long sides
      { file: TOWN + "wall-door.glb", position: [0.02, 0, 0] },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, 0.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 1, 0.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, -0.02], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 1, -0.02], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [-0.02, 1, 0], rotationY: Math.PI },
    ],
    // Widened + squashed together: at fit 0.65 / full height the two-story
    // stack read as a tower next to person-scale citizens.
    fit: 0.82,
    // ~22.4 ft: cottage story (13.7 ft) plus a ~9 ft second floor.
    scaleY: 0.56,
    randomRotate: "quarter",
  },
  // Long workshop hall: two bays under a flat roof, chimney on the far bay (3x2 footprint).
  workshop: {
    front: [0, 1],
    parts: [
      { file: TOWN + "wall-block.glb", position: [-0.5, 0, 0] },
      { file: TOWN + "wall-block.glb", position: [0.5, 0, 0] },
      { file: TOWN + "roof-flat.glb", position: [-0.5, 1, 0] },
      { file: TOWN + "roof-flat.glb", position: [0.5, 1, 0] },
      { file: TOWN + "chimney.glb", position: [0.5, 0.55, 0] },
      // door on the front bay, windows on the other faces (wall-doorway-square-wide
      // is an open hole showing the blank block behind it — reads as a gray smear)
      { file: TOWN + "wall-door.glb", position: [-0.5, 0, 0.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [0.5, 0, 0.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [-0.5, 0, -0.02], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [0.5, 0, -0.02], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [0.52, 0, 0] },
      { file: TOWN + "wall-window-shutters.glb", position: [-0.52, 0, 0], rotationY: Math.PI },
    ],
    fit: 0.92,
    scaleY: 0.65, // ~12 ft roofline, chimney to ~16 ft
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
      { file: TOWN + "wall-block.glb", position: [0, 0, -0.25], scale: [3, 1, 1.5] },
      { file: TOWN + "wall-doorway-square-wide.glb", position: [-0.5, 0, 0.02], rotationY: -Math.PI / 2 },
      // main block upper stories, overhanging the loggia
      { file: TOWN + "wall-block.glb", position: [-0.5, 1, 0], scale: [2, 1, 2] },
      { file: TOWN + "wall-block.glb", position: [-0.5, 2, 0], scale: [2, 1, 2] },
      { file: TOWN + "roof-point.glb", position: [-0.5, 3, 0], scale: [2, 1, 2] },
      // wing on +X, one story lower
      { file: TOWN + "wall-block.glb", position: [1, 1, 0], scale: [1, 1, 2] },
      { file: TOWN + "roof-gable.glb", position: [1, 2, 0], scale: [1, 1, 2] },
      { file: TOWN + "chimney.glb", position: [0.5, 2.3, 0] },
      // one-story annex on −X, set slightly behind the colonnade line
      { file: TOWN + "wall-block.glb", position: [-2, 0, 0.25] },
      { file: TOWN + "roof-gable.glb", position: [-2, 1, 0.25] },
      { file: TOWN + "wall-door.glb", position: [-2, 0, 0.27], rotationY: -Math.PI / 2 },
      // loggia colonnade
      { file: TOWN + "pillar-stone.glb", position: [-1.5, 0, 0.92] },
      { file: TOWN + "pillar-stone.glb", position: [-0.9, 0, 0.92] },
      { file: TOWN + "pillar-stone.glb", position: [-0.3, 0, 0.92] },
      { file: TOWN + "pillar-stone.glb", position: [0.3, 0, 0.92] },
      { file: TOWN + "pillar-stone.glb", position: [0.9, 0, 0.92] },
      { file: TOWN + "pillar-stone.glb", position: [1.5, 0, 0.92] },
      // piano nobile front: shuttered windows + banner
      { file: TOWN + "wall-window-shutters.glb", position: [-1, 1, 0.52], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 1, 0.52], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [1, 1, 0.52], rotationY: -Math.PI / 2 },
      // top floor (main block only): round windows flanking the banner
      { file: TOWN + "wall-window-round.glb", position: [-1, 2, 0.52], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-round.glb", position: [0, 2, 0.52], rotationY: -Math.PI / 2 },
      { file: TOWN + "banner-red.glb", position: [-0.5, 2, 0.66], rotationY: -Math.PI / 2 },
      // side windows: main block −X face (above the annex) and wing +X face
      { file: TOWN + "wall-window-shutters.glb", position: [-1.02, 1, -0.5], rotationY: Math.PI },
      { file: TOWN + "wall-window-round.glb", position: [-1.02, 2, -0.5], rotationY: Math.PI },
      { file: TOWN + "wall-window-round.glb", position: [-1.02, 2, 0.5], rotationY: Math.PI },
      { file: TOWN + "wall-window-shutters.glb", position: [1.02, 1, -0.5] },
      { file: TOWN + "wall-window-shutters.glb", position: [1.02, 1, 0.5] },
      // back windows
      { file: TOWN + "wall-window-shutters.glb", position: [-1, 1, -0.52], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 1, -0.52], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [1, 1, -0.52], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-window-round.glb", position: [-1, 2, -0.52], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-window-round.glb", position: [0, 2, -0.52], rotationY: Math.PI / 2 },
    ],
    fit: 0.9,
    scaleY: 0.7,
    // Design is ~2.3:1 but the footprint is 10×8 — fill the depth too, or half
    // the claim reads as empty forecourt.
    stretch: true,
  },
  // Cathedral, front facing +X, symmetrical like Santa Maria Novella:
  // two-story nave under a high gable (ridge runs along X in the kit) with a
  // single-story flat-roofed aisle on each side. Three-portal facade with a
  // rose window, arcaded aisle walls, clerestory rounds above both aisle
  // roofs. (The bell tower is its own building now — see bell_tower.)
  cathedral: {
    front: [1, 0],
    parts: [
      { file: TOWN + "wall-block.glb", position: [0, 0, 0], scale: [4, 1, 1] },
      { file: TOWN + "wall-block.glb", position: [0, 1, 0], scale: [4, 1, 1] },
      { file: TOWN + "roof-high-gable.glb", position: [0, 2, 0], scale: [4, 1, 1] },
      // side aisles
      { file: TOWN + "wall-block.glb", position: [0, 0, -1], scale: [4, 1, 1] },
      { file: TOWN + "roof-flat.glb", position: [0, 1, -1], scale: [4.1, 1, 1.1] },
      { file: TOWN + "wall-block.glb", position: [0, 0, 1], scale: [4, 1, 1] },
      { file: TOWN + "roof-flat.glb", position: [0, 1, 1], scale: [4.1, 1, 1.1] },
      // facade: central portal + rose window, side portals on the aisle fronts
      { file: TOWN + "wall-door.glb", position: [1.52, 0, 0] },
      { file: TOWN + "wall-window-round.glb", position: [1.52, 1, 0] },
      { file: TOWN + "wall-door.glb", position: [1.52, 0, -1] },
      { file: TOWN + "wall-door.glb", position: [1.52, 0, 1] },
      // clerestory rounds above both aisle roofs
      { file: TOWN + "wall-window-round.glb", position: [-1, 1, -0.02], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-window-round.glb", position: [0, 1, -0.02], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-window-round.glb", position: [1, 1, -0.02], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-window-round.glb", position: [-1, 1, 0.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-round.glb", position: [0, 1, 0.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-round.glb", position: [1, 1, 0.02], rotationY: -Math.PI / 2 },
      // aisle arcades
      { file: TOWN + "wall-arch.glb", position: [-1, 0, -1.02], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-arch.glb", position: [0, 0, -1.02], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-arch.glb", position: [1, 0, -1.02], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-arch.glb", position: [-1, 0, 1.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-arch.glb", position: [0, 0, 1.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-arch.glb", position: [1, 0, 1.02], rotationY: -Math.PI / 2 },
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
      { file: TOWN + "wall-block.glb", position: [0, 0, 0], scale: [1.3, 1.2, 2] },
      { file: TOWN + "roof-gable.glb", position: [0, 1.2, 0], scale: [2, 1.2, 1.3], rotationY: Math.PI / 2 },
      // facade
      { file: TOWN + "wall-door.glb", position: [0, 0, 0.52], rotationY: -Math.PI / 2 },
      // half-size oculus, scaled to fit inside the gable triangle
      { file: TOWN + "wall-window-round.glb", position: [0, 1.05, 0.52], rotationY: -Math.PI / 2, scale: [1, 0.5, 0.5] },
      // side windows
      { file: TOWN + "wall-window-round.glb", position: [0.17, 0.1, -0.45] },
      { file: TOWN + "wall-window-round.glb", position: [0.17, 0.1, 0.45] },
      { file: TOWN + "wall-window-round.glb", position: [-0.17, 0.1, -0.45], rotationY: Math.PI },
      { file: TOWN + "wall-window-round.glb", position: [-0.17, 0.1, 0.45], rotationY: Math.PI },
      // bell lantern on the ridge
      { file: TOWN + "wall-block.glb", position: [0, 1.55, 0.35], scale: [0.32, 0.6, 0.32] },
      { file: TOWN + "roof-point.glb", position: [0, 2.15, 0.35], scale: 0.55 },
    ],
    fit: 0.95,
    scaleY: 0.63,
    stretch: true,
  },
  pigment_trader: {
    front: [1, 0],
    parts: [
      { file: TOWN + "wall-block.glb", position: [0, 0, 0] },
      { file: TOWN + "banner-green.glb", position: [0, 0.25, 0] },
      { file: TOWN + "roof-point.glb", position: [0, 1, 0], scale: ROOF_SCALE },
      // shop door under the banner, windows on the long sides
      { file: TOWN + "wall-door.glb", position: [0.02, 0, 0] },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, 0.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, -0.02], rotationY: Math.PI / 2 },
    ],
    fit: 0.88,
    scaleY: 0.68,
    randomRotate: "quarter",
  },
  // Marble yard: low flat-roofed cutting shed, rough blocks and a finished
  // column in the yard beside it.
  marble_supplier: {
    front: [1, 0],
    parts: [
      { file: TOWN + "wall-block.glb", position: [-0.4, 0, -0.3] },
      { file: TOWN + "roof-flat.glb", position: [-0.4, 1, -0.3] },
      // shed door opening onto the yard, window on the side
      { file: TOWN + "wall-door.glb", position: [-0.38, 0, -0.3] },
      { file: TOWN + "wall-window-shutters.glb", position: [-0.4, 0, -0.28], rotationY: -Math.PI / 2 },
      { file: TOWN + "rock-large.glb", position: [0.5, 0, 0.5], scale: 0.55 },
      { file: TOWN + "rock-small.glb", position: [-0.3, 0, 0.7], scale: 0.7 },
      { file: TOWN + "pillar-stone.glb", position: [0.65, 0, -0.35], scale: 0.6 },
    ],
    fit: 0.88,
    randomRotate: "quarter",
  },
  // Long tavern hall: two bays under one continuous gable roof (3x2 footprint).
  tavern: {
    front: [0, 1],
    parts: [
      { file: TOWN + "wall-block.glb", position: [-0.5, 0, 0] },
      { file: TOWN + "wall-block.glb", position: [0.5, 0, 0] },
      { file: TOWN + "roof-gable-end.glb", position: [-0.5, 1, 0], rotationY: Math.PI, scale: ROOF_SCALE },
      { file: TOWN + "roof-gable-end.glb", position: [0.5, 1, 0], scale: ROOF_SCALE },
      { file: TOWN + "banner-red.glb", position: [0.5, 0.25, 0] },
      // door + window on the front, windows on the back and far gable end
      { file: TOWN + "wall-door.glb", position: [-0.5, 0, 0.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [0.5, 0, 0.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [-0.5, 0, -0.02], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [0.5, 0, -0.02], rotationY: Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [-0.52, 0, 0], rotationY: Math.PI },
    ],
    fit: 0.92,
    scaleY: 0.79, // ~16 ft ridge — a public hall, half a notch above the cottage
    stretch: true,
  },
  bakery: {
    front: [1, 0],
    parts: [
      { file: TOWN + "wall-block.glb", position: [0, 0, 0] },
      { file: TOWN + "roof-gable.glb", position: [0, 1, 0], scale: ROOF_SCALE },
      { file: TOWN + "chimney.glb", position: [0, 0.55, 0] },
      // shop door on the gable end, windows on the long sides
      { file: TOWN + "wall-door.glb", position: [0.02, 0, 0] },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, 0.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-shutters.glb", position: [0, 0, -0.02], rotationY: Math.PI / 2 },
    ],
    fit: 0.88,
    scaleY: 0.56, // ridge matches the cottage; chimney tips out at ~16 ft
    randomRotate: "quarter",
  },
  // Open market square: stalls sit small on a paved pad (the paving sets the
  // bounding box, so the stalls read as furniture, not as the building mass).
  market: {
    pad: 4,
    parts: [
      // Keep every piece inside the pad's ±2 half-extent — anything poking out
      // grows the measured bounding box and shrinks/shifts the pad off the tile.
      { file: TOWN + "stall-red.glb", position: [-1, 0.02, -1], rotationY: Math.PI, scale: 1 },
      { file: TOWN + "stall-green.glb", position: [1, 0.02, -1], rotationY: Math.PI, scale: 1 },
      { file: TOWN + "stall.glb", position: [-1, 0.02, 1], scale: 1 },
      { file: TOWN + "cart.glb", position: [1, 0.02, 1], rotationY: Math.PI / 2, scale: 1 },
      { file: TOWN + "lantern.glb", position: [0, 0.02, 0], scale: 0.8 },
    ],
    fit: 1,
  },
  town_center_plaza: {
    // Fountain with a central column (mockup: obelisk rising from the water);
    // the rest stays open paving so future citizens/stalls have room.
    pad: 6,
    parts: [
      { file: TOWN + "fountain-round-detail.glb", position: [0, 0.02, 0], scale: 1.4 },
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
    parts: [
      { file: TOWN + "fountain-round-detail.glb", position: [0, 0.02, 0], scale: 0.9 },
      { file: TOWN + "lantern.glb", position: [-1.55, 0.02, -1.55] },
      { file: TOWN + "lantern.glb", position: [1.55, 0.02, -1.55] },
      { file: TOWN + "lantern.glb", position: [-1.55, 0.02, 1.55] },
      { file: TOWN + "lantern.glb", position: [1.55, 0.02, 1.55] },
    ],
    fit: 1,
  },
  // Freestanding campanile (the cathedral's old bell tower): four stacked
  // stories under a spire, belfry windows on all four faces.
  bell_tower: {
    front: [1, 0],
    parts: [
      { file: TOWN + "wall-block.glb", position: [0, 0, 0] },
      { file: TOWN + "wall-block.glb", position: [0, 1, 0] },
      { file: TOWN + "wall-block.glb", position: [0, 2, 0] },
      { file: TOWN + "wall-block.glb", position: [0, 3, 0] },
      { file: TOWN + "roof-high-point.glb", position: [0, 4, 0] },
      // door at the base, slit windows up the shaft
      { file: TOWN + "wall-door.glb", position: [0.02, 0, 0] },
      { file: TOWN + "wall-window-round.glb", position: [0.02, 1.2, 0], scale: [1, 0.6, 0.6] },
      { file: TOWN + "wall-window-round.glb", position: [0.02, 2.2, 0], scale: [1, 0.6, 0.6] },
      { file: TOWN + "wall-window-round.glb", position: [0.02, 3, 0] },
      { file: TOWN + "wall-window-round.glb", position: [-0.02, 3, 0], rotationY: Math.PI },
      { file: TOWN + "wall-window-round.glb", position: [0, 3, 0.02], rotationY: -Math.PI / 2 },
      { file: TOWN + "wall-window-round.glb", position: [0, 3, -0.02], rotationY: Math.PI / 2 },
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
  colonnade: {
    parts: [
      { file: TOWN + "pillar-stone.glb", position: [-2, 0, 0], scale: [1.4, 1.15, 1.4] },
      { file: TOWN + "pillar-stone.glb", position: [-1, 0, 0], scale: [1.4, 1.15, 1.4] },
      { file: TOWN + "pillar-stone.glb", position: [0, 0, 0], scale: [1.4, 1.15, 1.4] },
      { file: TOWN + "pillar-stone.glb", position: [1, 0, 0], scale: [1.4, 1.15, 1.4] },
      { file: TOWN + "pillar-stone.glb", position: [2, 0, 0], scale: [1.4, 1.15, 1.4] },
      // Stone architrave: a wall-block squashed to a slab (roof-flat is roof-tinted).
      { file: TOWN + "wall-block.glb", position: [0, 1.15, 0], scale: [4.6, 0.1, 0.5] },
    ],
    fit: 0.95,
    // A building abutting an end: run the architrave (roof slab only) past the
    // footprint into its wall to fake a junction — an extra pillar there crowds
    // the end pillar.
    extendPosX: [
      { file: TOWN + "wall-block.glb", position: [2.75, 1.15, 0], scale: [0.9, 0.1, 0.5], buried: true },
    ],
    extendNegX: [
      { file: TOWN + "wall-block.glb", position: [-2.75, 1.15, 0], scale: [0.9, 0.1, 0.5], buried: true },
    ],
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
  // Two 1-unit segments side by side so the fitted rails stay knee-high
  // (a single stretched segment would fit twice as tall).
  fence: {
    parts: [
      { file: NATURE + "fence_simple.glb", position: [-0.5, 0, 0] },
      { file: NATURE + "fence_planks.glb", position: [0.5, 0, 0] },
    ],
    fit: 0.98,
  },
  // Low sandstone wall: a stretched wall-block slab (wall-half has a painted
  // red band that reads as a barrier bar) with square end posts.
  stone_wall: {
    parts: [
      { file: TOWN + "wall-block.glb", position: [0, 0, 0], scale: [2, 0.28, 0.14] },
      { file: TOWN + "wall-block.glb", position: [-1, 0, 0], scale: [0.16, 0.38, 0.2] },
      { file: TOWN + "wall-block.glb", position: [1, 0, 0], scale: [0.16, 0.38, 0.2] },
    ],
    fit: 0.98,
  },
};

// Active/inactive material pairs, shared by every clone of a container.
const materialPairs = new Map<Material, { on: Material; off: Material }>();
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

/** Load every manifest + scatter model up front so instantiation can stay synchronous. */
export async function preloadModels(scene: Scene) {
  const files = new Set<string>(SCATTER_FILES);
  for (const def of Object.values(MODEL_MANIFEST)) {
    for (const part of def.parts ?? []) files.add(part.file);
    for (const part of def.variants ?? []) files.add(part.file);
    for (const part of def.extendNegX ?? []) files.add(part.file);
    for (const part of def.extendPosX ?? []) files.add(part.file);
  }
  await Promise.all([...files].map((file) => getContainer(file, scene)));
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

function instantiatePart(part: Part, parent: TransformNode, scene: Scene): AbstractMesh[] {
  const container = containers.get(part.file);
  if (!container) return [];
  const entries = container.instantiateModelsToScene((name) => name, false, {
    doNotInstantiate: true, // clones own their material slot, needed for active/inactive swaps
  });
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
    for (const mesh of root.getChildMeshes(false)) meshes.push(mesh);
  }
  return meshes;
}

/** True when the building has a manifest entry whose files are all loaded. */
export function hasModel(buildingId: BuildingId) {
  const def = MODEL_MANIFEST[buildingId];
  if (!def) return false;
  const parts = def.parts ?? def.variants ?? [];
  return parts.length > 0 && parts.every((part) => containers.has(part.file));
}

export type BuildingModel = {
  root: TransformNode;
  meshes: AbstractMesh[];
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
/** Whether this building's model reacts to abutting neighbors (mapRenderer). */
export function hasExtensions(buildingId: BuildingId) {
  const def = MODEL_MANIFEST[buildingId];
  return Boolean(def?.extendNegX || def?.extendPosX);
}

export function instantiateBuilding(
  buildingId: BuildingId,
  footprint: { width: number; depth: number },
  gridPos: { x: number; y: number },
  scene: Scene,
  rotation?: number, // player-chosen quarter turns; overrides seeded randomRotate
  extend?: { negX: boolean; posX: boolean } // append extendNegX/PosX parts
): BuildingModel | null {
  const def = MODEL_MANIFEST[buildingId];
  if (!def) return null;

  const hash = hashPosition(gridPos.x, gridPos.y);
  let parts = def.parts ?? (def.variants ? [def.variants[hash % def.variants.length]] : []);
  if (extend?.negX && def.extendNegX) parts = [...parts, ...def.extendNegX];
  if (extend?.posX && def.extendPosX) parts = [...parts, ...def.extendPosX];
  if (parts.length === 0) return null;

  const root = new TransformNode(`model-${buildingId}-${gridPos.x}-${gridPos.y}`, scene);
  const meshes: AbstractMesh[] = [];
  const buried = new Set<AbstractMesh>();
  for (const part of parts) {
    const partMeshes = instantiatePart(part, root, scene);
    if (part.buried) for (const mesh of partMeshes) buried.add(mesh);
    meshes.push(...partMeshes);
  }
  if (meshes.length === 0) {
    root.dispose();
    return null;
  }

  if (def.pad) {
    // Sets the design span too: the bounding fit below measures the pad, so
    // parts keep the same scale the old paving grid gave them.
    const pad = CreateGround(`pad-${buildingId}`, { width: def.pad, height: def.pad }, scene);
    pad.parent = root;
    pad.position.y = 0.02;
    const on = getPadMaterial(def.pad, scene);
    if (!materialPairs.has(on)) {
      // Dim the flagstones when the building goes inactive (market short on workers).
      const off = on.clone(`${on.name}-off`);
      off.diffuseColor = new Color3(0.6, 0.6, 0.6);
      const pair = { on, off };
      materialPairs.set(on, pair);
      materialPairs.set(off, pair);
    }
    pad.material = on;
    meshes.push(pad);
  }

  // Rotate before fitting so rectangular prefabs fill the (rotated) footprint
  // the caller passes in — the bounding box below already reflects the turn.
  if (rotation != null) root.rotation.y = (Math.PI / 2) * rotation;
  else if (def.randomRotate === "quarter") root.rotation.y = (Math.PI / 2) * (hash % 4);
  else if (def.randomRotate === "free") root.rotation.y = (hash / 4096) * Math.PI * 2;

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
    const scaleY = Math.min(scaleX, scaleZ) * sy;
    const odd = Math.round(root.rotation.y / (Math.PI / 2)) % 2 !== 0;
    root.scaling.set(odd ? scaleZ : scaleX, scaleY, odd ? scaleX : scaleZ);
    root.position.y = -min.y * scaleY;
    return {
      root,
      meshes,
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
  root.scaling.set(scale, scale * sy, scale);
  const height = (max.y - min.y) * scale * sy;
  const sink = (parts[0].sinkY ?? def.sinkY ?? 0) * height;
  root.position.y = -min.y * scale * sy - sink;

  return {
    root,
    meshes,
    height: height - sink,
    offsetX: -centerX * scale,
    offsetZ: -centerZ * scale,
  };
}

export function setBuildingActive(model: BuildingModel, active: boolean) {
  for (const mesh of model.meshes) {
    const pair = mesh.material && materialPairs.get(mesh.material);
    if (pair) mesh.material = active ? pair.on : pair.off;
  }
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
];
const ENV_CLEARANCE = 4;
const ENV_DEPTH = 60;

/** Decorative wilderness on the hills outside the buildable grid: tree clumps,
 * bushes, rocks, the odd vineyard patch, and (very rarely) an old fence or
 * stone wall run. Instanced, no shadows. */
export function scatterEnvironment(
  heightAt: (x: number, z: number) => number,
  rand: () => number
) {
  const roots: TransformNode[] = [];
  const buildHalfExtent = (GRID_SIZE * CELL_SIZE) / 2;
  const minDistance = buildHalfExtent + ENV_CLEARANCE;

  function place(
    file: string,
    x: number,
    z: number,
    opts: {
      scale?: number;
      stretch?: [number, number, number];
      rotY?: number;
      sinkY?: number;
      drop?: number;
    } = {}
  ) {
    const container = containers.get(file);
    if (!container) return;
    const entries = container.instantiateModelsToScene((name) => name, false);
    for (const node of entries.rootNodes) {
      const root = node as TransformNode;
      root.scaling.setAll(opts.scale ?? 1);
      if (opts.stretch) {
        root.scaling.x *= opts.stretch[0];
        root.scaling.y *= opts.stretch[1];
        root.scaling.z *= opts.stretch[2];
      }
      let y = heightAt(x, z) - (opts.drop ?? 0.1);
      if (opts.sinkY) {
        // Bury the bare trunk, matching the placed cypress prefab.
        root.computeWorldMatrix(true);
        const { min, max } = root.getHierarchyBoundingVectors(true);
        y -= opts.sinkY * (max.y - min.y);
      }
      root.position.set(x, y, z);
      root.rotationQuaternion = null;
      root.rotation.y = opts.rotY ?? rand() * Math.PI * 2;
      for (const mesh of root.getChildMeshes(false)) mesh.isPickable = false;
      roots.push(root);
    }
  }

  /** Random point in the scatter ring around the build area, or null. */
  function ringPoint() {
    const angle = rand() * Math.PI * 2;
    const dist = minDistance + rand() * ENV_DEPTH;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    return Math.max(Math.abs(x), Math.abs(z)) < minDistance ? null : { x, z };
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

  return {
    dispose() {
      for (const root of roots) root.dispose();
    },
  };
}

export function disposeAssetLibrary() {
  disposePathMaterials();
  for (const container of containers.values()) container.dispose();
  containers.clear();
  containerLoads.clear();
  materialPairs.clear();
  townColormap?.dispose();
  townColormap = null;
  desatColormap?.dispose();
  desatColormap = null;
}
