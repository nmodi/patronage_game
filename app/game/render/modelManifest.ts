import type { BuildingId } from "~/game/buildings";

import { SILL_H, WIN_OPENING, procRoofFile } from "./proceduralPieces";

/** Local horizontal face of a composed prefab, pre-rotation. */
export type LocalSide = "posX" | "negX" | "posZ" | "negZ";
/** Grid-space side of a footprint (grid y maps to world z). */
export type GridSide = "posX" | "negX" | "posY" | "negY";
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
/** Row-house roof, landed so its eave/verge PLANES sit flush with the wall face
 * (footprint edge). Per-axis, because the kit verge (0.55) overhangs more than
 * the eave (0.535) at equal scale: 0.5/0.55 and 0.5/0.535 put both planes on the
 * wall. The barrel tiles still bulge a hair past that — a terracotta lip that
 * caps the wall-top edge with no gap — but the dark roof CORE no longer projects,
 * so there's neither the inset dark line an under-scaled roof left (0.9 pulled the
 * roof INSIDE the wall, exposing the bright wall top + dark core edge as a line
 * all round the base) nor the ~0.17wu overhang a full 1.0 roof poked into a taller
 * neighbour. Scaling the roof and its gable end together keeps them aligned. */
const HOUSE_ROOF_SCALE: [number, number, number] = [0.5 / 0.55, 0.6, 0.5 / 0.535];
/** Row houses fill their footprint to the wall plane so side-adjacent houses
 * touch (the roof is `buried`, so only the walls + window reveals drive the fit;
 * >1 to push the block face out past the reveals to the footprint edge). Tuned
 * by eye — the walls of two neighbours should just meet, no grass sliver. */
const HOUSE_FIT = 1.07;
/** The kit's roof-high-gable was a steeper pitch, not a different piece — this
 * is its ridge height over the ordinary gable's (1.112 vs 0.571), so a y-scale
 * reproduces it on the generated roof. */
const HIGH_GABLE = 1.112 / 0.571;

/** A tiled gable roof and the stucco triangles that close its ends. They are two
 * pieces because a tint covers a whole part — the kit's roof baked its gable
 * wall onto the tile material, so a pink house got a brown gable — but they
 * always come as a pair at the SAME transform: the builders share one
 * cross-section, so identical transforms are what keeps them aligned.
 *
 * `buried` excludes the roof from the footprint fit (see instantiateBuilding),
 * so a house that fills its footprint to the walls can still overhang the tile
 * with its eaves — which is what makes side-adjacent houses read as one terrace
 * roof without any neighbour-reactive stretching. */
const gableRoof = (
  position: [number, number, number],
  scale: [number, number, number] = ROOF_SCALE,
  opts: { rotationY?: number; buried?: boolean } = {}
): Part[] => [
  { file: procRoofFile("roof-gable", scale), position, scale, tint: "roof", ...opts },
  { file: "proc:gable-end", position, scale, tint: "facade", rotationY: opts.rotationY, buried: opts.buried },
];

/** A tiled hip roof (the kit's roof-point). No end pieces — four slopes, no
 * gable to close. Only ever used square in plan; an sx != sz ref would stretch
 * the tiles the way procRoofFile exists to prevent. */
const hipRoof = (
  position: [number, number, number],
  scale: [number, number, number]
): Part => ({ file: procRoofFile("roof-hip", scale), position, scale, tint: "roof" });

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
  sand: "#e0d5bf",
  white: "#f5efe2",
  ochre: "#d9c187", // warm workshop stucco (see FACADE_PALETTES.artist)
  stone: "#ddd8ca", // pale stone — marks civic/monumental buildings
  verde: "#58634c", // verde di Prato marble — the Duomo's green banding
  // The roof colour itself is TILE_BASE (proceduralPieces.ts) — every roof is a
  // generated piece now, so this only varies it: a slight cool-grey wash, ~8%
  // down, for the sun-faded third. Anything stronger and the city stops reading
  // as one roofline.
  roofFaded: "#e9eef0",
  bronze: "#a3773e", // warm cast-metal brown for the foundry's ingot stock (diffuse-only — no metal sheen)
  // Unlit interior behind a window opening. Dark enough to survive the ~1.9x
  // sun on a lit face — at the old #6a5c4b the shutterless arched windows'
  // reveals blew out to pale tan and read as empty niches.
  reveal: "#453d33",
  // Knocks shutters.glb's orange atlas swatch toward the door WOOD brown. This
  // multiplies over the swatch, so it's picked for the product, not literal —
  // tune against the rendered door.
  shutter: "#b0a488",
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
  // Residences read as sandstone, not stucco: these are STONE_TINTS pattern
  // ids (render/wallTexture.ts), routed down the texture path in
  // getTintedPair rather than through TINT_COLORS. Repeats weight the
  // position-hashed pick — patchy (bare stone through broken plaster) is the
  // loudest pattern, so it lands on one house in six.
  residential: ["rubble", "ashlar", "brick", "plaster", "rubble", "ashlar", "plaster", "patchy"],
  service: ["cream", "sand"],
  artist: ["ochre", "sand"],
  materials: ["sand", "white"],
  city: ["stone"],
};
// Minor city-wide roof variation: ~1 in 3 roofs is slightly sun-faded.
const ROOF_PALETTE: (string | undefined)[] = [undefined, undefined, "roofFaded"];

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
// One gable over both bays. The kit had no piece this long, so the hall was two
// half-gables meeting at x=0 (caps outward); a generated roof just spans it. The
// x-scale is what keeps the houses' 0.05 verge over the ±1 walls.
const WORKSHOP_HALL_ROOF = gableRoof([0, 1, 0], [1.05 / 0.55, 0.6, 1]);
// The sculptor roofs only the -X bay: its head-house takes the +X bay and buries
// this roof's inner gable end in its wall.
const WORKSHOP_BAY_ROOF = gableRoof([-0.5, 1, 0]);

// A window = a generated pietra-serena surround (proc:surround-rect, the
// batch-1 fitting the brief asked an artist for) around a dark reveal plate,
// with shutters.glb's louvred leaf (extracted from the kit's panel — see
// scripts/make-plain-openings.py) recessed inside the frame — the Florence
// street look: grey stone frames, closed louvres, colored plaster.
//
// Nothing here may share a plane with anything else. proc:block's wall face is
// at ±0.5, so the stack is: wall 0.5 → jamb back 0.5005 (the deeper sill dips
// into the wall) → slat back 0.508 → reveal front 0.51 → frame front 0.5355.
// The reveal is a hair larger than the opening so its edges bury inside the
// frame ring, and the slats a hair narrower so they clear the opening's faces.
const WIN_W = WIN_OPENING.w; // the opening the surround frames — the leaf ships
const WIN_H = WIN_OPENING.h; // 0.30 wide, so it needs narrowing to fit it
const REVEAL_T = 0.03;
const REVEAL_PLANE = 0.495; // block face 0.5 → reveal front 0.51
const SHUTTER_OUT = 0.07; //  → slat back 0.508. Keep > 0.048 or it re-buries.
const SHUTTER_NARROW: [number, number, number] = [1, 1, (WIN_W - 0.01) / 0.3];
// Wall 0.5 → jamb back 0.5005, frame front 0.5355 (fitting depth 0.035). Slimmer
// and pulled flusher than the old kit look — the reference wants near-flush trim.
const SURROUND_OUT = 0.518;

/** One window on a local face, `along` = its offset across that wall. Scale is
 * local and applies before rotationY, so the leaf's own Z (its width) narrows
 * whichever world axis the face turns it onto. */
function windowOn(face: LocalSide, y: number, along: number): Part[] {
  const sign = face === "posX" || face === "posZ" ? 1 : -1;
  const onX = face === "posX" || face === "negX";
  const reveal: Part = {
    file: "proc:block",
    tint: "reveal",
    scale: onX ? [REVEAL_T, WIN_H + 0.02, WIN_W + 0.02] : [WIN_W + 0.02, WIN_H + 0.02, REVEAL_T],
    position: onX
      ? [sign * REVEAL_PLANE, y + 0.29, along]
      : [along, y + 0.29, sign * REVEAL_PLANE],
  };
  const rotationY = { posX: 0, negX: Math.PI, posZ: -Math.PI / 2, negZ: Math.PI / 2 }[face];
  const surround: Part = {
    file: "proc:surround-rect",
    position: onX
      ? [sign * SURROUND_OUT, y + 0.3 - SILL_H, along]
      : [along, y + 0.3 - SILL_H, sign * SURROUND_OUT],
    rotationY,
  };
  const leaf: Part = {
    file: TOWN + "shutters.glb",
    tint: "shutter",
    position: onX
      ? [sign * SHUTTER_OUT, y, along]
      : [along, y, sign * SHUTTER_OUT],
    rotationY,
    scale: SHUTTER_NARROW,
  };
  return [reveal, surround, leaf];
}

/** Arched pietra-serena window for the stone buildings (the palazzo reference):
 * generated voussoir surround + dark reveal, no shutters. The civic prefabs'
 * wall faces aren't at ±0.5, so `wall` is the face plane's distance from the
 * origin and `yOpen` the opening bottom's absolute height. */
const ARCH_WIN_S = 1.25; // palazzo windows run grander than house ones
function archWindow(face: LocalSide, wall: number, yOpen: number, along: number): Part[] {
  const s = ARCH_WIN_S;
  const sign = face === "posX" || face === "posZ" ? 1 : -1;
  const onX = face === "posX" || face === "negX";
  const rotationY = { posX: 0, negX: Math.PI, posZ: -Math.PI / 2, negZ: Math.PI / 2 }[face];
  const out = wall + 0.004 + 0.025 * s; // 0.025 = the slimmed SILL_T/2 (deepest course); frame back kisses the wall
  const rev = wall - 0.005;
  // The reveal covers the opening to just past its apex; taller or wider and
  // its top corners poke out past the voussoir ring's outer arc.
  const w = 0.195 * s;
  const h = 0.5 * s;
  const reveal: Part = {
    file: "proc:block",
    tint: "reveal",
    scale: onX ? [REVEAL_T, h, w] : [w, h, REVEAL_T],
    position: onX ? [sign * rev, yOpen - 0.005, along] : [along, yOpen - 0.005, sign * rev],
  };
  const surround: Part = {
    file: "proc:surround-arch",
    scale: s,
    position: onX
      ? [sign * out, yOpen - SILL_H * s, along]
      : [along, yOpen - SILL_H * s, sign * out],
    rotationY,
  };
  // Louvred leaf under the springline (the semicircular lunette above stays dark
  // reveal), same shutters.glb the house windows use — brown-tinted grill. Native
  // depth-back ~0.438 (unscaled X), so leafOut lands the slats just proud of the
  // reveal like the house's SHUTTER_OUT does; native shutter sits +0.3 above its
  // origin, scaled by s, so leafY drops it onto the opening bottom (yOpen).
  const leafOut = wall - 0.43;
  const leaf: Part = {
    file: TOWN + "shutters.glb",
    tint: "shutter",
    scale: [1, s, (WIN_OPENING.w * s - 0.01) / 0.3],
    position: onX
      ? [sign * leafOut, yOpen - 0.3 * s, along]
      : [along, yOpen - 0.3 * s, sign * leafOut],
    rotationY,
  };
  return [reveal, surround, leaf];
}

// Facade columns, shared by both house tiers so upper windows land directly over
// the door and the ground-floor window (the reference elevation). The door leaf
// is 0.4 wide and sits off-centre; the window shares the remaining bay.
const DOOR_COL = -0.2;
const WIN_COL = 0.28;
const SIDE_COLS = [-0.25, 0.25];
const houseFront = (upper: number | null): Part[] => [
  // Stone doorway + planked leaf recessed in it (batch-1 fittings — the kit's
  // extracted leaf alone never quite read as a door).
  { file: "proc:door-frame", position: [SURROUND_OUT, 0, DOOR_COL] },
  { file: "proc:door-leaf", position: [0.508, 0, DOOR_COL] },
  ...windowOn("posX", 0, WIN_COL),
  ...(upper == null
    ? []
    : [...windowOn("posX", upper, DOOR_COL), ...windowOn("posX", upper, WIN_COL)]),
];
const houseSides = (floors: number[]): Part[] =>
  floors.flatMap((y) =>
    SIDE_COLS.flatMap((c) => [...windowOn("posZ", y, c), ...windowOn("negZ", y, c)])
  );
// Back gable: no door, so the columns sit symmetrically.
const houseBack = (floors: number[]): Part[] =>
  floors.flatMap((y) => [...windowOn("negX", y, -0.22), ...windowOn("negX", y, 0.22)]);

export const MODEL_MANIFEST: Partial<Record<BuildingId, ModelDef>> = {
  // Row houses fill their footprint to the walls (HOUSE_FIT ≈ 1), so two placed
  // side by side simply touch and read as a terrace — no neighbour-reactive
  // stretching. The gable roof runs its ridge across the party-wall axis (a +90°
  // turn) so the eaves face the street front/back and the gable ends land on the
  // shared side walls, where a neighbour buries them into a continuous roofline.
  cottage: {
    front: [1, 0],
    parts: [
      { file: "proc:block", position: [0, 0, 0], tint: "facade" },
      ...gableRoof([0, 1, 0], HOUSE_ROOF_SCALE, { rotationY: Math.PI / 2, buried: true }),
      // Loose fittings, not panels: the door leaf and shutters extracted from
      // the kit's wall panels (scripts/make-plain-openings.py), so the stucco
      // keeps its plain corners. They carry no wall of their own — the offset
      // pushes them proud of proc:block's face at x=0.5 (the panels' own quoins
      // used to do that job at 0.50, these thin leaves top out at ~0.47).
      ...houseFront(null),
      ...houseSides([0]),
      ...houseBack([0]),
    ],
    fit: HOUSE_FIT,
    // Keeps the ridge at ~2.4 person-heights (~13.7 ft) after the fit bump.
    scaleY: 0.58,
    randomRotate: "quarter",
  },
  townhouse: {
    front: [1, 0],
    parts: [
      // One 2-storey block, not two stacked — a single continuous AO ramp, so no
      // dark seam where the floors used to meet (see proc:block storeys).
      { file: "proc:block@1x2", position: [0, 0, 0], tint: "facade" },
      ...gableRoof([0, 2, 0], HOUSE_ROOF_SCALE, { rotationY: Math.PI / 2, buried: true }),
      ...houseFront(1),
      ...houseSides([0, 1]),
      ...houseBack([0, 1]),
    ],
    fit: HOUSE_FIT,
    // ~22.4 ft: cottage story (13.7 ft) plus a ~9 ft second floor.
    scaleY: 0.56,
    randomRotate: "quarter",
  },
  workshop: {
    front: [0, 1],
    parts: [
      ...WORKSHOP_WALLS,
      ...WORKSHOP_HALL_ROOF,
      // Dormer (north light for the painter): a mini block + cross-ridge gable
      // buried into the front slope of the -X bay (chapel-lantern trick —
      // roof-window's thin overlay showed its open underside over the ridge
      // from behind). Apex 1.29 stays under the hall ridge (1.343).
      { file: "proc:block", position: [-0.5, 1, 0.33], scale: [0.22, 0.2, 0.24], tint: "facade" },
      ...gableRoof([-0.5, 1.2, 0.33], [0.26, 0.15, 0.26], { rotationY: Math.PI / 2 }),
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
      ...WORKSHOP_BAY_ROOF,
      // Head-house over the +X bay: a half-story under its own cross-ridge
      // gable rising above the hall ridge (apex 1.84 vs 1.34) — T-silhouette
      // vs the painter's long hall. It buries the +X gable half entirely.
      { file: "proc:block", position: [0.5, 1, 0], scale: [1, 0.55, 1], tint: "facade" },
      ...gableRoof([0.5, 1.55, 0], [1, 0.5, 1], { rotationY: Math.PI / 2 }),
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
  // floors with stone pillars along the front edge — an open loggia.
  palazzo: {
    front: [0, 1],
    parts: [
      // recessed ground floor (loggia interior wall)
      { file: "proc:block", position: [0, 0, -0.25], scale: [3, 1, 1.5], tint: "facade" },
      { file: TOWN + "wall-doorway-square-wide.glb", position: [-0.5, 0, 0.02], rotationY: -Math.PI / 2, tint: "facade" },
      // main block upper stories, overhanging the loggia
      { file: "proc:block", position: [-0.5, 1, 0], scale: [2, 1, 2], tint: "facade" },
      { file: "proc:block", position: [-0.5, 2, 0], scale: [2, 1, 2], tint: "facade" },
      hipRoof([-0.5, 3, 0], [2, 1, 2]),
      // wing on +X, one story lower
      { file: "proc:block", position: [1, 1, 0], scale: [1, 1, 2], tint: "facade" },
      ...gableRoof([1, 2, 0], [1, 1, 2]),
      { file: TOWN + "chimney.glb", position: [0.5, 2.3, 0] },
      // one-story annex on −X, set slightly behind the colonnade line
      { file: "proc:block", position: [-2, 0, 0.25], tint: "facade" },
      ...gableRoof([-2, 1, 0.25], [1, 1, 1]),
      { file: TOWN + "wall-door.glb", position: [-2, 0, 0.27], rotationY: -Math.PI / 2, tint: "facade" },
      // loggia colonnade — generated pietra-serena arcade (proc:arch-bay), five
      // bays tiling the front (shared piers) and opening ±Z; untinted STONE
      // matches the piano-nobile archWindows above. Full unit tall so the solid
      // top band meets the overhang's base at y=1 (the block above is base-
      // mounted from y=1) — a shorter arcade leaves a gap under the overhang.
      ...[-1.2, -0.6, 0, 0.6, 1.2].map((x): Part => ({
        file: "proc:arch-bay",
        position: [x, 0, 0.9],
        rotationY: Math.PI / 2,
        scale: [1, 1, 0.6],
      })),
      // piano nobile front: arched pietra-serena windows + banner
      ...archWindow("posZ", 1, 1.28, -1),
      ...archWindow("posZ", 1, 1.28, 0),
      ...archWindow("posZ", 1, 1.28, 1),
      // top floor (main block only): round windows flanking the banner
      { file: TOWN + "wall-window-round.glb", position: [-1, 2, 0.52], rotationY: -Math.PI / 2, tint: "facade" },
      { file: TOWN + "wall-window-round.glb", position: [0, 2, 0.52], rotationY: -Math.PI / 2, tint: "facade" },
      { file: TOWN + "banner-red.glb", position: [-0.5, 2, 0.66], rotationY: -Math.PI / 2 },
      // side windows: main block −X face (above the annex) and wing +X face
      ...archWindow("negX", 1.5, 1.28, -0.5),
      { file: TOWN + "wall-window-round.glb", position: [-1.02, 2, -0.5], rotationY: Math.PI, tint: "facade" },
      { file: TOWN + "wall-window-round.glb", position: [-1.02, 2, 0.5], rotationY: Math.PI, tint: "facade" },
      ...archWindow("posX", 1.5, 1.28, -0.5),
      ...archWindow("posX", 1.5, 1.28, 0.5),
      // back windows
      ...archWindow("negZ", 1, 1.28, -1),
      ...archWindow("negZ", 1, 1.28, 0),
      ...archWindow("negZ", 1, 1.28, 1),
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
      ...gableRoof([0, 2, 0], [4, HIGH_GABLE, 1]),
      // side aisles
      { file: "proc:block", position: [0, 0, -1], scale: [4, 1, 1], tint: "stone" },
      // lean-to roofs: gable body spans x ±0.55 unscaled, so 3.62 ends it just
      // inside the ±2 facades (no ledge poking past the front); ridge cap sits
      // 0.02 behind the nave wall face (z-fight)
      ...gableRoof([0, 1, -0.48], [3.62, 0.4, 2.1]),
      { file: "proc:block", position: [0, 0, 1], scale: [4, 1, 1], tint: "stone" },
      ...gableRoof([0, 1, 0.48], [3.62, 0.4, 2.1]),
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
      // aisle arcades: generated bays (proc:arch-bay) half-buried in the wall —
      // a blind arcade in verde di Prato, piers standing ~0.1 proud and the
      // wall face showing as the recess inside each arch
      { file: "proc:arch-bay", position: [-1, 0, -1.5], rotationY: Math.PI / 2, tint: "verde" },
      { file: "proc:arch-bay", position: [0, 0, -1.5], rotationY: Math.PI / 2, tint: "verde" },
      { file: "proc:arch-bay", position: [1, 0, -1.5], rotationY: Math.PI / 2, tint: "verde" },
      { file: "proc:arch-bay", position: [-1, 0, 1.5], rotationY: -Math.PI / 2, tint: "verde" },
      { file: "proc:arch-bay", position: [0, 0, 1.5], rotationY: -Math.PI / 2, tint: "verde" },
      { file: "proc:arch-bay", position: [1, 0, 1.5], rotationY: -Math.PI / 2, tint: "verde" },
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
      // High gable at y-scale 0.75: apex 2.03 vs the old 1.89 — a steeper,
      // taller nave; civic breaks the skyline.
      ...gableRoof([0, 1.2, 0], [2, 0.75 * HIGH_GABLE, 1.3], { rotationY: Math.PI / 2 }),
      // facade
      { file: TOWN + "wall-door.glb", position: [0, 0, 0.52], rotationY: -Math.PI / 2, tint: "mint" },
      // half-size oculus, scaled to fit inside the gable triangle
      { file: TOWN + "wall-window-round.glb", position: [0, 1.05, 0.52], rotationY: -Math.PI / 2, scale: [1, 0.5, 0.5], tint: "mint" },
      // side windows
      { file: TOWN + "wall-window-round.glb", position: [0.17, 0.1, -0.45], tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [0.17, 0.1, 0.45], tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [-0.17, 0.1, -0.45], rotationY: Math.PI, tint: "mint" },
      { file: TOWN + "wall-window-round.glb", position: [-0.17, 0.1, 0.45], rotationY: Math.PI, tint: "mint" },
      // bell lantern on the ridge, raised to straddle the taller high-gable
      // ridge (apex 2.03)
      { file: "proc:block", position: [0, 1.75, 0.35], scale: [0.32, 0.6, 0.32], tint: "stone" },
      hipRoof([0, 2.35, 0.35], [0.55, 0.55, 0.55]),
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
      hipRoof([0, 1, 0], [1, 0.45, 1]),
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
      hipRoof([-0.4, 1, -0.3], [1, 0.35, 1]),
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
      hipRoof([-0.4, 1, -0.3], [1, 0.35, 1]),
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
      // one gable over all three bays (the kit needed two halves meeting at
      // x=0); x-scale keeps the halves' 0.075 verge over the ±1.5 walls
      ...gableRoof([0, 1, 0], [1.575 / 0.55, 0.6, 1.5]),
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
      ...gableRoof([0, 0.82, 0.75], [2.6, 0.2, 0.5]),
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
      ...gableRoof([0, 1, 0]),
      // oven chimney, scaled up (production tell); position compensates for
      // the shaft sitting at x 0.21-0.43 inside its cell
      { file: TOWN + "chimney.glb", position: [-0.08, 0.55, 0], scale: 1.25 },
      // projecting shop bay: gable end faces the street (service grammar),
      // apex 0.98 tucks under the main eave line
      { file: "proc:block", position: [0.45, 0, 0], scale: [0.4, 0.75, 0.5], tint: "facade" },
      ...gableRoof([0.45, 0.75, 0], [0.4, 0.4, 0.55]),
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
      hipRoof([0, 4, 0], [1, 2, 1]), // roof-high-point = the hip at twice the height
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
  // Per-cell colonnade: one generated arcade bay per cell (proc:arch-bay —
  // piers + arch + a solid top band that reads as the cornice). Bays are 1 kit
  // wide and tile flush: authored spanning ±0.5 on Z opening on ±X, so a +90°
  // yaw runs them along the drag with the arches facing out; the along
  // machinery adds its own +90° for Z runs. Drag a run like a road.
  colonnade: {
    segment: {
      along: [{ file: "proc:arch-bay", rotationY: Math.PI / 2, scale: [1, 1.4, 1] }],
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
  return hasExtensions(buildingId) || isSegment(buildingId);
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
