import type { BuildingId } from "~/game/buildings";

import { BIF_OPENING, DOOR_T, SHUTTER_T, SILL_H, WIN_OPENING, WIN_SILL_T, WIN_T, procRoofFile } from "./proceduralPieces";

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
  opts: { rotationY?: number; buried?: boolean; tint?: string } = {}
): Part[] => [
  // (the roof part never takes opts.tint — tiles stay terracotta city-wide)
  { file: procRoofFile("roof-gable", scale), position, scale, tint: "roof", rotationY: opts.rotationY, buried: opts.buried },
  { file: "proc:gable-end", position, scale, tint: opts.tint ?? "facade", rotationY: opts.rotationY, buried: opts.buried },
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
  // (cream/sand/white/ochre stucco retired with the texture pass — every
  // facade palette entry is a STONE_TINTS pattern now)
  stone: "#ddd8ca", // pale stone — trim-scale parts (pilasters, lantern, plastered gables)
  verde: "#58634c", // verde di Prato marble — the Duomo's green banding
  // Lighter verde for the bifora frames: tints multiply, so over the warm
  // SURROUND stone the plain verde landed near-black; this lands sage.
  // Blue-leaning multiplier: the warm SURROUND base it multiplies over eats
  // the blue channel, so a neutral green here rendered yellow-olive.
  verdeLight: "#6b878e",
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
  // (shutter retired July 2026 — the louvre leaf is generated now, proc:shutter,
  // and carries its own neutral-brown base color directly.)
};
// Texture-swap tints: a colormap variant instead of a diffuse multiply, for
// accents baked into the atlas that a whole-material multiply can't isolate.
// ("mint" retired July 2026 — the kit's atlas-textured facade panels are gone,
// every fitting is generated; religious verde is Part.tint on proc pieces now.)
const TEXTURE_TINTS: Record<string, { file: string; diffuse?: string }> = {
  // Market-stall awning fabrics: the retint left both fabric-red and roof-red as
  // the same terracotta, so awnings read as rooftops. These variants recolor
  // only the two awning swatch columns (see make-stall-cloth.py) — stall-red.glb
  // takes the red column, stall-green.glb the green — so one variant paints two
  // fabrics; the pair gives blue/gold and crimson/green across the booths.
  cloth1: { file: "colormap-cloth1" },
  cloth2: { file: "colormap-cloth2" },
};
// Facade palette per build-menu category; a building's pick is position-hashed.
// Every entry is a STONE_TINTS pattern id (render/wallTexture.ts) since the
// texture pass took the whole roster to drawn masonry — routed down the
// texture path in getTintedPair rather than through TINT_COLORS. Repeats
// weight the position-hashed pick; category identity rides the mix (houses
// patchy-through-rubble, workshops brick-forward, suppliers rough rubble,
// services smooth plaster, civic its own pale dressed ashlar).
const FACADE_PALETTES: Record<string, string[]> = {
  // patchy (bare stone through broken plaster) is the loudest pattern, so it
  // lands on one house in six.
  residential: ["rubble", "ashlar", "brick", "plaster", "rubble", "ashlar", "plaster", "patchy"],
  service: ["plaster", "ashlar", "plaster", "brick"],
  artist: ["brick", "plaster", "brick", "ashlar"],
  materials: ["rubble", "plaster", "rubble", "brick"],
  city: ["civic"],
};
// Minor city-wide roof variation: ~1 in 3 roofs is slightly sun-faded.
const ROOF_PALETTE: (string | undefined)[] = [undefined, undefined, "roofFaded"];

// A window = a generated pietra-serena surround (proc:surround-rect, the
// batch-1 fitting the brief asked an artist for) around a dark reveal plate,
// with a generated glazed leaf (proc:shutter) recessed inside the frame — the
// Tuscan street look: stone frames, slate glass behind wood muntins, plaster.
//
// Nothing here may share a plane with anything else. proc:block's wall face is
// at ±0.5, so the stack is: wall 0.5 → jamb back 0.5005 (the deeper sill dips
// into the wall) → reveal front 0.505 → leaf back 0.506 → leaf front 0.513 →
// frame front 0.5145 — everything within ~0.015 of the wall, near-flush trim.
// The reveal is a hair larger than the opening so its edges bury inside the
// frame ring, and the leaf a hair smaller so the clearance reads as its gap.
const WIN_W = WIN_OPENING.w;
const WIN_H = WIN_OPENING.h;
const REVEAL_T = 0.03;
const REVEAL_PLANE = 0.49; // block face 0.5 → reveal front 0.505
const SHUTTER_BACK = 0.006; // leaf back, just proud of the reveal front
const SURROUND_OUT = 0.5005 + WIN_T / 2; // jamb back kisses the wall
const DOOR_OUT = 0.5005 + DOOR_T / 2; // same near-flush stack as the windows

/** One window on a local face, `along` = its offset across that wall. Scale is
 * local and applies before rotationY, so the leaf's own Z (its width) narrows
 * whichever world axis the face turns it onto. `wall` is the face plane's
 * distance from the origin (the houses' 0.5 by default) — the depth stack
 * (reveal/leaf/frame) rides it like archWindow's does. */
function windowOn(face: LocalSide, y: number, along: number, wall = 0.5): Part[] {
  const sign = face === "posX" || face === "posZ" ? 1 : -1;
  const onX = face === "posX" || face === "negX";
  const revealPlane = wall + (REVEAL_PLANE - 0.5);
  const surroundOut = wall + (SURROUND_OUT - 0.5);
  const shutterOut = wall + SHUTTER_BACK + SHUTTER_T / 2;
  const reveal: Part = {
    file: "proc:block",
    tint: "reveal",
    scale: onX ? [REVEAL_T, WIN_H + 0.02, WIN_W + 0.02] : [WIN_W + 0.02, WIN_H + 0.02, REVEAL_T],
    position: onX
      ? [sign * revealPlane, y + 0.29, along]
      : [along, y + 0.29, sign * revealPlane],
  };
  const rotationY = { posX: 0, negX: Math.PI, posZ: -Math.PI / 2, negZ: Math.PI / 2 }[face];
  const surround: Part = {
    file: "proc:surround-rect",
    position: onX
      ? [sign * surroundOut, y + 0.3 - SILL_H, along]
      : [along, y + 0.3 - SILL_H, sign * surroundOut],
    rotationY,
  };
  // Generated leaf, authored to the opening: base at its bottom edge, so it
  // just lands on the opening bottom plus the clearance gap.
  const leaf: Part = {
    file: "proc:shutter",
    position: onX
      ? [sign * shutterOut, y + 0.305, along]
      : [along, y + 0.305, sign * shutterOut],
    rotationY,
  };
  return [reveal, surround, leaf];
}

/** Arched pietra-serena window for the stone buildings (the palazzo reference):
 * generated voussoir surround + dark reveal, no shutters. The civic prefabs'
 * wall faces aren't at ±0.5, so `wall` is the face plane's distance from the
 * origin and `yOpen` the opening bottom's absolute height. */
const ARCH_WIN_S = 1.25; // palazzo windows run grander than house ones
function archWindow(
  face: LocalSide,
  wall: number,
  yOpen: number,
  along: number,
  s = ARCH_WIN_S,
  tint?: string // surround only — the chapel's verde trim; reveal/leaf keep theirs
): Part[] {
  const sign = face === "posX" || face === "posZ" ? 1 : -1;
  const onX = face === "posX" || face === "negX";
  const rotationY = { posX: 0, negX: Math.PI, posZ: -Math.PI / 2, negZ: Math.PI / 2 }[face];
  const out = wall + 0.004 + (WIN_SILL_T / 2) * s; // sill = deepest course; frame back kisses the wall
  const rev = wall - 0.01; // reveal front wall+0.005, just behind the leaf back

  // The reveal covers the opening to just past its apex; taller or wider and
  // its top corners poke out past the voussoir ring's outer arc.
  const w = (WIN_OPENING.w + 0.015) * s;
  const h = (WIN_OPENING.h + 0.075) * s;
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
    tint,
  };
  // Louvred leaf under the springline (the semicircular lunette above stays
  // dark reveal), the same proc:shutter the house windows use, at the
  // surround's own scale. Its back rides the UNSCALED reveal-front line
  // (REVEAL_T doesn't scale with s), so small-s lancets don't sink behind it.
  const leafOut = wall + SHUTTER_BACK + (SHUTTER_T / 2) * s;
  const leaf: Part = {
    file: "proc:shutter",
    scale: s,
    position: onX
      ? [sign * leafOut, yOpen + 0.005 * s, along]
      : [along, yOpen + 0.005 * s, sign * leafOut],
    rotationY,
  };
  return [reveal, surround, leaf];
}

/** Bifora (proc:bifora) — the fancier window: two dark arched lights split
 * by a colonnette under one grand voussoir arch, roundel in the spandrel
 * (Giotto's campanile, the palazzo piano nobile). Same contract as archWindow:
 * `wall` = face plane distance, `yOpen` = opening bottom's absolute height. */
function biforaWindow(
  face: LocalSide,
  wall: number,
  yOpen: number,
  along: number,
  s = 1,
  tint?: string // surround only, like archWindow's
): Part[] {
  const sign = face === "posX" || face === "posZ" ? 1 : -1;
  const onX = face === "posX" || face === "negX";
  const rotationY = { posX: 0, negX: Math.PI, posZ: -Math.PI / 2, negZ: Math.PI / 2 }[face];
  const out = wall + 0.004 + (WIN_SILL_T / 2) * s;
  const rev = wall - 0.01;
  // Reveal to just past the intrados apex (h + w/2); BIF_BORDER is sized so
  // the top corners stay inside the faceted outer ring.
  const w = (BIF_OPENING.w + 0.015) * s;
  const h = (BIF_OPENING.h + BIF_OPENING.w / 2 + 0.005) * s;
  const reveal: Part = {
    file: "proc:block",
    tint: "reveal",
    scale: onX ? [REVEAL_T, h, w] : [w, h, REVEAL_T],
    position: onX ? [sign * rev, yOpen - 0.005, along] : [along, yOpen - 0.005, sign * rev],
  };
  const frame: Part = {
    file: "proc:bifora",
    scale: s,
    position: onX
      ? [sign * out, yOpen - SILL_H * s, along]
      : [along, yOpen - SILL_H * s, sign * out],
    rotationY,
    tint,
  };
  // No glazed leaves — the lights stay dark reveal, the campanile's open voids.
  return [reveal, frame];
}

/** Stone doorway + planked leaf on any local face (the batch-1 door fittings,
 * generalized from houseFront's +X-only stack). `wall` is the face plane's
 * distance from the origin; `scale` narrows/shortens like HOUSE_DOOR_SCALE
 * (keep its x at 1 so the frame/leaf depth stack holds). */
function doorOn(
  face: LocalSide,
  along: number,
  wall = 0.5,
  scale: number | [number, number, number] = 1
): Part[] {
  const sign = face === "posX" || face === "posZ" ? 1 : -1;
  const onX = face === "posX" || face === "negX";
  const rotationY = { posX: 0, negX: Math.PI, posZ: -Math.PI / 2, negZ: Math.PI / 2 }[face];
  const at = (out: number): [number, number, number] =>
    onX ? [sign * out, 0, along] : [along, 0, sign * out];
  return [
    { file: "proc:door-frame", position: at(wall + (DOOR_OUT - 0.5)), rotationY, scale },
    // Leaf sunk so its rail fronts stay behind the slimmed frame front; the
    // plank backs bury inside the wall, which never shows.
    { file: "proc:door-leaf", position: at(wall - 0.002), rotationY, scale },
  ];
}

/** Landmark portal (proc:portal-frame + proc:portal-leaf): voussoir-arched
 * stone frame + double bronze-panel doors with a dark tympanum filling the
 * lunette — self-contained, no reveal part. Same depth stack as the house
 * door (leaf recessed inside the frame), scaled by `s`. `tint` recolors the
 * stone surround only (cathedral/bell tower verde trim); the bronze doors
 * keep their color. */
function portalOn(face: LocalSide, wall: number, along: number, s = 1, tint?: string): Part[] {
  const sign = face === "posX" || face === "posZ" ? 1 : -1;
  const onX = face === "posX" || face === "negX";
  const rotationY = { posX: 0, negX: Math.PI, posZ: -Math.PI / 2, negZ: Math.PI / 2 }[face];
  const at = (out: number): [number, number, number] =>
    onX ? [sign * out, 0, along] : [along, 0, sign * out];
  return [
    { file: "proc:portal-frame", position: at(wall + 0.023 * s), scale: s, rotationY, tint },
    { file: "proc:portal-leaf", position: at(wall + 0.008 * s), scale: s, rotationY },
  ];
}

// Facade columns, shared by both house tiers so upper windows land directly over
// the door and the ground-floor window (the reference elevation). Three columns
// per face now that windows are smaller — a finer rhythm reads as wall texture
// where two big openings read as a face.
const DOOR_COL = -0.25;
const WIN_COL = 0.25;
const SIDE_COLS = [-0.3, 0, 0.3];
// The house scaleY squash (~0.57) makes the unit door read garage-wide; narrow
// it and drop the head to the window-head line. Width only via z — depth (x)
// stays so the fittings sit proud of the wall exactly as before.
const HOUSE_DOOR_SCALE: [number, number, number] = [1, 0.9, 0.72];
const houseFront = (upper: number | null): Part[] => [
  // Stone doorway + planked leaf recessed in it (batch-1 fittings — the kit's
  // extracted leaf alone never quite read as a door).
  ...doorOn("posX", DOOR_COL, 0.5, HOUSE_DOOR_SCALE),
  ...windowOn("posX", 0, WIN_COL),
  ...(upper == null
    ? []
    : [DOOR_COL, 0, WIN_COL].flatMap((c) => windowOn("posX", upper, c))),
];
const houseSides = (floors: number[]): Part[] =>
  floors.flatMap((y) =>
    SIDE_COLS.flatMap((c) => [...windowOn("posZ", y, c), ...windowOn("negZ", y, c)])
  );
// Back gable: no door, so the columns sit symmetrically.
const houseBack = (floors: number[]): Part[] =>
  floors.flatMap((y) => SIDE_COLS.flatMap((c) => windowOn("negX", y, c)));

// Long workshop hall: two bays, 3x2 footprint. Walls/openings are shared by
// both workshop types; roofs are per-workshop (the painter runs the full
// gable with a dormer, the sculptor crosses a head-house over the +X bay) so
// the two silhouettes differ. Props stay within x ±1.04 / z ≤ 0.84 so
// scaleZ ≥ scaleX still holds and the hall's fitted height is unchanged —
// the yard just borrows footprint depth from the hall.
// The +X bay block is per-workshop (painter: plain unit; sculptor: one @1x2
// column spanning bay + head-house, so no stacked-ramp seam at y=1).
const WORKSHOP_WALLS: Part[] = [
  { file: "proc:block", position: [-0.5, 0, 0], tint: "facade" },
  // stone door on the front bay, surround-framed windows on the other faces
  // (same generated fittings as the houses; the hall spans x ±1, faces z ±0.5)
  ...doorOn("posZ", -0.5),
  ...windowOn("posZ", 0, 0),
  ...windowOn("posZ", 0, 0.5),
  ...windowOn("negZ", 0, -0.5),
  ...windowOn("negZ", 0, 0),
  ...windowOn("negZ", 0, 0.5),
  ...windowOn("posX", 0, -0.25, 1),
  ...windowOn("posX", 0, 0.25, 1),
  ...windowOn("negX", 0, -0.25, 1),
  ...windowOn("negX", 0, 0.25, 1),
];
// One gable over both bays. The kit had no piece this long, so the hall was two
// half-gables meeting at x=0 (caps outward); a generated roof just spans it. The
// x-scale is what keeps the houses' 0.05 verge over the ±1 walls.
const WORKSHOP_HALL_ROOF = gableRoof([0, 1, 0], [1.05 / 0.55, 0.6, 1]);
// The sculptor roofs only the -X bay: its head-house takes the +X bay and buries
// this roof's inner gable end in its wall.
const WORKSHOP_BAY_ROOF = gableRoof([-0.5, 1, 0]);

// Bell tower shaft: slimmer than its unit cell so the crown and cap (which set
// the footprint fit) overhang it and the tower reads slender, Giotto-style.
const BT_W = 0.72;
const BT_WALL = BT_W / 2;
const BT_FACES: LocalSide[] = ["posX", "negX", "posZ", "negZ"];
// Cathedral west front: the marble screen slabs' face planes (shell wall at 2,
// slabs 0.06 thick). The nave slab rides 0.01 proud of the aisle wedges so
// their inner triangle tails (the aisle-slope profile crossing the nave zone)
// hide behind it instead of slicing through the nave bifore; nave fittings
// take CATH_NAVE, aisle fittings CATH_FRONT. CATH_BAYS = the five-bay window
// rhythm shared by the clerestory and both aisle rows.
const CATH_FRONT = 2.04;
const CATH_NAVE = 2.05;
const CATH_BAYS = [-1.6, -0.8, 0, 0.8, 1.6];

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
      { file: "proc:block", position: [0.5, 0, 0], tint: "facade" },
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
      // Head-house over the +X bay: bay + half-story as ONE @1x2 column (top
      // 1.55, one continuous ramp — stacked blocks drew a dark seam at y=1)
      // under its own cross-ridge gable rising above the hall ridge (apex
      // 1.84 vs 1.34) — T-silhouette vs the painter's long hall. It buries
      // the +X gable half entirely.
      { file: "proc:block@1x2", position: [0.5, 0, 0], scale: [1, 0.775, 1], tint: "facade" },
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
  // Palazzo, front facing +Z (toward the default camera). Three-story main
  // block under a low hip roof, two-story wing on +X under its own gable,
  // one-story annex on −X. Ground floor is recessed 0.5 behind the upper
  // floors with stone pillars along the front edge — an open loggia.
  palazzo: {
    front: [0, 1],
    parts: [
      // recessed ground floor (loggia interior wall); the entrance behind the
      // arcade is a quiet stone door — a portal there fought the arcade
      // (arch-in-arch, and at loggia height it filled the bays with stone);
      // portals stay landmark language (cathedral, bell tower, Town Hall).
      // Since the texture pass every textured wall is UNIT columns (the
      // cathedral rule): u stays 1:1 so the ashlar courses don't stretch, and
      // a multi-storey wall is ONE @1xN block — one continuous AO ramp, no
      // dark seam per storey.
      ...[-1, 0, 1].map(
        (x): Part => ({ file: "proc:block", position: [x, 0, -0.25], scale: [1, 1, 1.5], tint: "facade" })
      ),
      ...doorOn("posZ", -0.5, 0.5, [1, 1.05, 1.1]),
      // main block upper stories overhanging the loggia: four unit @1x2 columns
      ...[-1, 0].flatMap((x) =>
        [-0.5, 0.5].map(
          (z): Part => ({ file: "proc:block@1x2", position: [x, 1, z], tint: "facade" })
        )
      ),
      hipRoof([-0.5, 3, 0], [2, 1, 2]),
      // wing on +X, one story lower — two unit columns, nudged +x so its wall
      // never shares a plane with the main block's differently-ramped face
      // (the 0.01 slit at the junction reads as the architectural joint);
      // gables go flat stone: the gable end's planar UVs bake the 0.6 roof
      // squash, so textured courses would jump size at the eave
      ...[-0.5, 0.5].map(
        (z): Part => ({ file: "proc:block", position: [1.005, 1, z], scale: [0.99, 1, 1], tint: "facade" })
      ),
      ...gableRoof([1, 2, 0], [1, 1, 2], { tint: "stone" }),
      { file: TOWN + "chimney.glb", position: [0.5, 2.3, 0] },
      // one-story annex on −X, set slightly behind the colonnade line
      { file: "proc:block", position: [-2, 0, 0.25], tint: "facade" },
      ...gableRoof([-2, 1, 0.25], [1, 1, 1], { tint: "stone" }),
      ...doorOn("posZ", -2, 0.75),
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
      // piano nobile front: bifore (the Medici window — twin arched lights
      // under one arch) — four bays; the wider frames run wall-to-wall at five
      ...[-0.9, -0.3, 0.3, 0.9].flatMap((z) => biforaWindow("posZ", 1, 1.28, z)),
      // top floor (main block only): smaller arched windows flanking the
      // banner — the piano nobile's language a size down (round windows
      // read as portholes and were dropped)
      ...archWindow("posZ", 1, 2.35, -1, 0.9),
      ...archWindow("posZ", 1, 2.35, 0, 0.9),
      { file: TOWN + "banner-red.glb", position: [-0.5, 2, 0.66], rotationY: -Math.PI / 2 },
      // side windows: main block −X face (above the annex) and wing +X face
      ...biforaWindow("negX", 1.5, 1.28, -0.5),
      ...archWindow("negX", 1.5, 2.35, -0.5, 0.9),
      ...archWindow("negX", 1.5, 2.35, 0.5, 0.9),
      ...biforaWindow("posX", 1.5, 1.28, -0.5),
      ...biforaWindow("posX", 1.5, 1.28, 0.5),
      // back windows — the piano nobile's bifora rhythm carries around
      ...[-0.9, -0.3, 0.3, 0.9].flatMap((z) => biforaWindow("negZ", 1, 1.28, z)),
      ...archWindow("negZ", 1, 2.35, -1, 0.9),
      ...archWindow("negZ", 1, 2.35, 0, 0.9),
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
  // into the nave block, so only the outer slope shows). The Santa Croce
  // scheme: a campanile-marble SCREEN FACADE — thin slabs hung on the west
  // front plus the pediment — over a brown rubble shell (the real fronts are
  // exactly that, a marble screen on a medieval brick basilica). Three
  // generated portals, a tall arch holding the rose window's slot (the round
  // rose stays a batch-2 commission — procedural-pieces.md), and a five-bay
  // window rhythm: arched clerestories on the nave, arched-over-rectangular
  // rows on the aisle flanks.
  cathedral: {
    front: [1, 0],
    parts: [
      // nave 2.5 tall, aisles 1.75, in brown rubble (`flank`) — the marble is
      // only ever the screen front. One column per unit so the courses don't
      // stretch; @1x3 / @1x2 wrap v in near-equal course sizes (0.83 vs 0.875)
      // while keeping ONE continuous AO ramp per wall
      ...[-1.5, -0.5, 0.5, 1.5].flatMap((x): Part[] => [
        { file: "proc:block@1x3", position: [x, 0, 0], scale: [1, 2.5 / 3, 1], tint: "flank" },
        { file: "proc:block@1x2", position: [x, 0, -1], scale: [1, 0.875, 1], tint: "flank" },
        { file: "proc:block@1x2", position: [x, 0, 1], scale: [1, 0.875, 1], tint: "flank" },
      ]),
      // pediment in the campanile (vertical) pattern — the gable's planar UVs
      // (v = y*0.6) cut the screen grid mid-panel; verticals rise cleanly
      ...gableRoof([0, 2.5, 0], [4, HIGH_GABLE, 1], { tint: "campanile" }),
      // lean-to aisle roofs: gable body spans x ±0.55 unscaled, so 3.62 ends it
      // just inside the ±2 facades (no ledge poking past the front); ridge cap
      // sits 0.02 behind the nave wall face (z-fight)
      ...gableRoof([0, 1.75, -0.48], [3.62, 0.4, 2.1]),
      ...gableRoof([0, 1.75, 0.48], [3.62, 0.4, 2.1]),
      // the marble screen: one slab per front (nave + both aisles), faces at
      // CATH_FRONT. Storey-fitted UV wraps (@1x3 / @1x2, like the flanks) so
      // the panel grid completes exactly at each slab's top — a raw-height
      // slab cut the pattern mid-panel and the sections read as patchwork
      { file: "proc:block@1x3", position: [2.02, 0, 0], scale: [0.06, 2.5 / 3, 1], tint: "screen" },
      { file: "proc:block@1x2", position: [2.01, 0, -1], scale: [0.06, 0.875, 1], tint: "screen" },
      { file: "proc:block@1x2", position: [2.01, 0, 1], scale: [0.06, 0.875, 1], tint: "screen" },
      // marble wedges over the aisle slabs: gable-end triangles at the exact
      // lean-to profile, so the marble climbs the aisle slope and closes the
      // open slot between slab top and roof underside (SMN's sloped shoulder
      // sections). 0.005 proud of the slab plane so nothing coplanar fights.
      // Campanile (vertical) pattern — the slope cuts the screen grid badly.
      { file: "proc:gable-end", position: [2.015, 1.75, -0.48], scale: [0.06, 0.4, 2.1], tint: "campanile" },
      { file: "proc:gable-end", position: [2.015, 1.75, 0.48], scale: [0.06, 0.4, 2.1], tint: "campanile" },
      // giant-order pilasters proud of the screen, covering the section joints
      // (nave/aisle seams full height, outer corners to the aisle top) — the
      // grid mismatch between slab wraps hides behind them, SMN-style
      { file: "proc:block", position: [2.045, 0, -0.5], scale: [0.05, 2.5, 0.1], tint: "stone" },
      { file: "proc:block", position: [2.045, 0, 0.5], scale: [0.05, 2.5, 0.1], tint: "stone" },
      { file: "proc:block", position: [2.045, 0, -1.45], scale: [0.05, 1.75, 0.1], tint: "stone" },
      { file: "proc:block", position: [2.045, 0, 1.45], scale: [0.05, 1.75, 0.1], tint: "stone" },
      // three-portal facade, the center one grander — arched stone portals
      // with double bronze-panel doors (proc:portal-*). Center tops out at
      // 1.30, under the rose slot at 1.5; sides clear the seam pilasters.
      ...portalOn("posX", CATH_NAVE, 0, 1.15, "verdeLight"),
      ...portalOn("posX", CATH_FRONT, -1, 0.85, "verdeLight"),
      ...portalOn("posX", CATH_FRONT, 1, 0.85, "verdeLight"),
      // paired verde bifore over the center portal (replacing the single
      // arched slot) + two high on each aisle front; sizes run the sections'
      // clear spans between the pilasters. The apse end keeps its arch.
      ...biforaWindow("posX", CATH_NAVE, 1.5, -0.25, 1, "verdeLight"),
      ...biforaWindow("posX", CATH_NAVE, 1.5, 0.25, 1, "verdeLight"),
      ...[-1.25, -0.75, 0.75, 1.25].flatMap((z) =>
        biforaWindow("posX", CATH_FRONT, 1.05, z, 0.78, "verdeLight")
      ),
      ...archWindow("negX", 2, 1.5, 0, 1.3),
      // five arched clerestory windows per side above the aisle roofs
      // (aisle ridge lands at ~1.98 on the nave wall, so openings start above)
      ...CATH_BAYS.flatMap((x) => [
        ...archWindow("negZ", 0.5, 2.02, x, 0.75),
        ...archWindow("posZ", 0.5, 2.02, x, 0.75),
      ]),
      // aisle flanks: two window rows — rectangular street-level, arched above
      // (the blind arcade is gone; windows carry the rhythm now)
      ...CATH_BAYS.flatMap((x) => [
        ...windowOn("negZ", 0, x, 1.5),
        ...windowOn("posZ", 0, x, 1.5),
        ...archWindow("negZ", 1.5, 0.95, x, 0.75),
        ...archWindow("posZ", 1.5, 0.95, x, 0.75),
      ]),
    ],
    fit: 0.95,
    scaleY: 0.71,
    stretch: true,
  },
  // Small parish chapel, front facing +Z: single 1.5-story nave under a gable
  // (rotated so the ridge runs along Z), stone portal + a small lancet riding
  // the gable end like a tall church front, and a little bell lantern
  // straddling the ridge toward the facade. The verde-tinted arch surrounds
  // are the chapel's green trim now that the mint panels are gone — the
  // landmark portal language at parish scale.
  chapel: {
    front: [0, 1],
    parts: [
      // nave as two unit-depth columns so the civic ashlar's u stays 1:1 on
      // the long flanks (a single z-scaled block stretched the courses 2x)
      ...[-0.5, 0.5].map(
        (z): Part => ({ file: "proc:block", position: [0, 0, z], scale: [1.3, 1.2, 1], tint: "civic" })
      ),
      // High gable at y-scale 0.75: apex 2.03 vs the old 1.89 — a steeper,
      // taller nave; civic breaks the skyline. Gable ends flat stone (their
      // planar UVs bake the 0.6 roof squash — textured courses would jump)
      ...gableRoof([0, 1.2, 0], [2, 0.75 * HIGH_GABLE, 1.3], { rotationY: Math.PI / 2, tint: "stone" }),
      // facade: portal ring tops at 0.96, under the wall top at 1.2; a small
      // verde lancet on the gable end above it (outer face at z 1.03 — 0.03
      // thick at scale 2 over the ±1 ends), sized to clear the gable slopes
      ...portalOn("posZ", 1, 0, 0.85),
      ...archWindow("posZ", 1.03, 1.24, 0, 0.5, "verde"),
      // arched side windows (walls at x ±0.65), verde-trimmed
      ...archWindow("posX", 0.65, 0.4, -0.45, 0.7, "verde"),
      ...archWindow("posX", 0.65, 0.4, 0.45, 0.7, "verde"),
      ...archWindow("negX", 0.65, 0.4, -0.45, 0.7, "verde"),
      ...archWindow("negX", 0.65, 0.4, 0.45, 0.7, "verde"),
      // bell lantern on the ridge, raised to straddle the taller high-gable
      // ridge (apex 2.03)
      { file: "proc:block", position: [0, 1.75, 0.35], scale: [0.32, 0.6, 0.32], tint: "stone" },
      hipRoof([0, 2.35, 0.35], [0.55, 0.55, 0.55]),
    ],
    fit: 0.95,
    scaleY: 0.63,
    stretch: true,
  },
  // Pigment trader: a proper shop house — the 1.25-unit block (up from the old
  // 1-unit shed that read cottage-annex small) under the supplier-grammar low
  // hip, banner + stone door on the street, delivery yard tucked behind. Keep
  // every part within ±0.95 kit so the shop, not the yard, drives the fit.
  pigment_trader: {
    front: [1, 0],
    parts: [
      { file: "proc:block", position: [0, 0, 0], scale: [1.25, 1.25, 1.25], tint: "facade" },
      { file: TOWN + "banner-green.glb", position: [0.125, 0.45, 0] },
      // low hip, not a spire — spires read civic now
      hipRoof([0, 1.25, 0], [1.25, 0.5, 1.25]),
      // shop door under the banner, windows on the long sides (faces at ±0.625)
      ...doorOn("posX", 0, 0.625),
      ...windowOn("posZ", 0.3, -0.28, 0.625),
      ...windowOn("posZ", 0.3, 0.28, 0.625),
      ...windowOn("negZ", 0.3, -0.28, 0.625),
      ...windowOn("negZ", 0.3, 0.28, 0.625),
      // delivery yard along the back side: cart + pigment crates
      { file: TOWN + "cart.glb", position: [-0.15, 0, -0.85], rotationY: Math.PI / 2, scale: 0.55 },
      { file: "proc:block", position: [0.42, 0, -0.8], scale: 0.2 },
      { file: "proc:block", position: [0.65, 0, -0.78], scale: 0.15, rotationY: 0.5 },
    ],
    fit: 0.95,
    scaleY: 0.75,
    randomRotate: "quarter",
  },
  // Marble yard: low cutting shed under a squat hip roof (supplier grammar —
  // gables belong to houses), rough blocks, a finished column, cut-slab
  // stacks, and a hauling cart. The yard is the building; the shed serves it.
  // Shed grown to 1.35 kit (the old 1-unit shed read cottage-annex small) with
  // the yard pulled inside ±0.95, so the shed drives the fit.
  marble_supplier: {
    front: [1, 0],
    parts: [
      { file: "proc:block", position: [-0.28, 0, -0.28], scale: [1.35, 1.05, 1.35], tint: "facade" },
      hipRoof([-0.28, 1.05, -0.28], [1.35, 0.45, 1.35]),
      // shed door opening onto the yard (+X face at 0.395), window on the side
      ...doorOn("posX", -0.28, 0.395),
      ...windowOn("posZ", 0.15, -0.62, 0.395),
      ...windowOn("posZ", 0.15, 0.02, 0.395),
      ...windowOn("negZ", 0.15, -0.28, 0.955),
      { file: TOWN + "rock-large.glb", position: [0.55, 0, 0.55], scale: 0.6 },
      { file: TOWN + "rock-small.glb", position: [-0.3, 0, 0.8], scale: 0.8 },
      { file: TOWN + "pillar-stone.glb", position: [0.72, 0, -0.55], scale: 0.65 },
      // cut marble stock: stacked slabs + a cart
      { file: "proc:block", position: [0.15, 0, 0.8], scale: [0.34, 0.16, 0.25] },
      { file: "proc:block", position: [0.17, 0.16, 0.8], scale: [0.25, 0.12, 0.19], rotationY: 0.35 },
      { file: TOWN + "cart.glb", position: [0.62, 0, 0.08], rotationY: 0.5, scale: 0.6 },
    ],
    fit: 0.95,
    randomRotate: "quarter",
  },
  // Bronze foundry: same supplier grammar as the marble yard (low shed, squat
  // hip), but the yard is a casting works — a stone furnace block and stacks of
  // warm bronze ingots instead of pale marble slabs. No chimney smoke: smoke is
  // production-only (workshops/bakery), a foundry is a supplier.
  bronze_foundry: {
    front: [1, 0],
    parts: [
      { file: "proc:block", position: [-0.28, 0, -0.28], scale: [1.35, 1.05, 1.35], tint: "facade" },
      hipRoof([-0.28, 1.05, -0.28], [1.35, 0.45, 1.35]),
      ...doorOn("posX", -0.28, 0.395),
      ...windowOn("posZ", 0.15, -0.62, 0.395),
      ...windowOn("posZ", 0.15, 0.02, 0.395),
      ...windowOn("negZ", 0.15, -0.28, 0.955),
      // yard: a stout stone furnace + warm bronze ingot stacks + a hauling cart
      { file: "proc:block", position: [0.58, 0, 0.55], scale: [0.4, 0.6, 0.4], tint: "stone" },
      { file: "proc:block", position: [0.15, 0, 0.8], scale: [0.34, 0.14, 0.22], tint: "bronze" },
      { file: "proc:block", position: [0.18, 0.14, 0.78], scale: [0.24, 0.11, 0.18], rotationY: 0.4, tint: "bronze" },
      { file: TOWN + "cart.glb", position: [0.62, 0, 0.08], rotationY: 0.5, scale: 0.6 },
    ],
    fit: 0.95,
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
      // (walls at z ±0.75, far gable end at x −1.5)
      ...doorOn("posZ", -1, 0.75, [1, 1, 0.8]),
      ...windowOn("posZ", 0, -0.5, 0.75),
      ...windowOn("posZ", 0, 0, 0.75),
      ...windowOn("posZ", 0, 0.5, 0.75),
      ...windowOn("posZ", 0, 1, 0.75),
      ...windowOn("negZ", 0, -1, 0.75),
      ...windowOn("negZ", 0, -0.5, 0.75),
      ...windowOn("negZ", 0, 0, 0.75),
      ...windowOn("negZ", 0, 0.5, 0.75),
      ...windowOn("negZ", 0, 1, 0.75),
      ...windowOn("negX", 0, -0.3, 1.5),
      ...windowOn("negX", 0, 0.3, 1.5),
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
      // shop door on the bay front (face at 0.65, frame top 0.69 under the
      // bay's 0.75 wall), sign banner on the street-side wall
      ...doorOn("posX", 0, 0.65, [1, 0.85, 0.8]),
      { file: TOWN + "banner-green.glb", position: [0, 0.25, 0.02], rotationY: -Math.PI / 2 },
      ...windowOn("posZ", 0, -0.22),
      ...windowOn("posZ", 0, 0.22),
      ...windowOn("negZ", 0, -0.22),
      ...windowOn("negZ", 0, 0.22),
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
  // Freestanding campanile (Giotto's, at street zoom): a slim marble-panelled
  // shaft — five stretched-cube storeys in the campanile inlay texture
  // (wallTexture.ts) — with the palazzo's arched pietra-serena windows growing
  // up the shaft to a four-face belfry, under a projecting crown and shallow
  // tiled cap. Kit facade panels are gone; the fittings are all generated.
  bell_tower: {
    front: [1, 0],
    parts: [
      // one @1x5 shaft, not five stacked storeys: a single continuous AO ramp
      // (stacked blocks banded the marble with a dark line per storey) while
      // the campanile texture still wraps v once per storey
      { file: "proc:block@1x5", position: [0, 0, 0], scale: [BT_W, 1, BT_W], tint: "campanile" },
      // arched bronze-door portal at the base (wall face at BT_WALL); 0.75
      // keeps it ~60% of the 0.72 face and under the first window at 1.35
      ...portalOn("posX", BT_WALL, 0, 0.75, "verdeLight"),
      // bifore (twin lights under one arch) on every face, one per storey at
      // a uniform size — just under half the 0.72 face; verde frames, the
      // campanile's green-on-white marble language
      ...BT_FACES.flatMap((f) =>
        [1.35, 2.32, 3.28, 4.18].flatMap((y) => biforaWindow(f, BT_WALL, y, 0, 0.95, "verdeLight"))
      ),
      // projecting crown (Giotto's gallery, minus the balustrade) + shallow cap
      { file: "proc:block", position: [0, 4.97, 0], scale: [BT_W + 0.16, 0.13, BT_W + 0.16], tint: "stone" },
      hipRoof([0, 5.1, 0], [BT_W + 0.2, 0.5, BT_W + 0.2]),
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
