import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Scene } from "@babylonjs/core/scene";

import { mulberry32 } from "~/game/random";

// Masonry facades for the whole roster (residences first, the rest of the
// city since the texture pass, July 2026): coursed-stone textures in the warm
// gold-tan of Tuscan rubble walls, applied per building through the tint layer
// (see STONE_TINTS in getTintedPair). Authored in final colour — every
// pattern's average sits under the stucco walls' ~#dcd0b6, since the scene
// lights a sun-facing wall at ~1.9x and only *brighter* than the kit clips
// (kitbashing.md). One canvas per pattern, city-wide; per-building variety
// comes from the position-hashed palette pick, not from the texture itself.
// Textured walls must keep unit-scale faces — storeys via proc:block@1xN,
// plans as unit columns (the cathedral rule) — or the courses stretch.

const SIZE = 256;

type Drawer = (ctx: CanvasRenderingContext2D, size: number) => void;

// The brief is *subtlety*: creamy warm stone with narrow tone spreads and
// joints only a step darker than the stones, so a house reads as quiet
// sandstone at street zoom rather than a bold masonry diagram (an earlier,
// more neutral pass of these read gray).
const RUBBLE_TONES = ["#dccaa4", "#d5c197", "#e0d2b0", "#cdb88c", "#d9c8a4", "#c8ae80"];
// Rounded stones expose a lot of mortar, so its hue dominates the wall at
// distance — keep it as warm as the stones or the whole house reads grey.
const RUBBLE_MORTAR = "#cdbc90";
// Brick and ashlar read almost solid — one tone with a whisper of variation
// visible only up close — with joints just a step darker, not drawn lines.
const BRICK_TONES = ["#d5c096", "#d8c49b", "#d2bc91", "#d7c39a", "#d3bf94"];
const BRICK_JOINT = "#c4b189";
const ASHLAR_TONES = ["#d9c8a2", "#dccca8", "#d6c49d", "#dac9a4", "#d7c6a0"];
const ASHLAR_JOINT = "#c6b48d";
// The cathedral's flanks: the residences' rubble courses shifted decidedly
// brown — Santa Croce's medieval walls behind the white marble screen front.
const FLANK_TONES = ["#c9ab80", "#bf9f74", "#d1b48c", "#b39367", "#c5a87c", "#aa8a5e"];
const FLANK_MORTAR = "#b69c73";
// Civic dressed ashlar: the flat pale-stone tint (#ddd8ca) become masonry —
// large smooth blocks, cooler and paler than the residences' gold-tan, for the
// palazzo and chapel (Palazzo Medici's upper registers).
// Warmed like everything else in this file: a neutral pale grey here rendered
// as concrete under the scene's cool light — pale must still mean warm.
const CIVIC_TONES = ["#ddd5bc", "#d8d0b6", "#e2dbc4", "#d5cdb2", "#dfd8bf"];
const CIVIC_JOINT = "#c9c1a7";

/** One face of proc:block = one storey = the full 0..1 UV tile, so `rows` is
 * courses per storey. Bands fit the canvas exactly and every stone stays
 * inside its band (half a joint at the canvas edges), which is what makes the
 * texture tile both ways; courses wrap horizontally by drawing each stone at
 * x and x±size. */
function drawCourses(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed: number,
  opts: {
    rows: number;
    minW: number; // stone width range, as a fraction of the canvas
    maxW: number;
    gap: number; // joint thickness in px
    joint: string;
    tones: string[];
    radius: number; // corner rounding, as a fraction of the course height
    jitter: number; // per-stone height loss, as a fraction of the course height
  }
) {
  const rand = mulberry32(seed);
  ctx.fillStyle = opts.joint;
  ctx.fillRect(0, 0, size, size);
  const bandH = size / opts.rows;
  for (let r = 0; r < opts.rows; r++) {
    const y = r * bandH;
    // Random course start so the verticals never align between courses.
    let x = -rand() * opts.maxW * size;
    while (x < size) {
      const w = (opts.minW + rand() * (opts.maxW - opts.minW)) * size;
      const shrink = rand() * opts.jitter * bandH;
      const h = bandH - opts.gap - shrink;
      const rad = Math.min(opts.radius * bandH, (w - opts.gap) / 2, h / 2);
      ctx.fillStyle = opts.tones[Math.floor(rand() * opts.tones.length)]!;
      for (const dx of [0, -size, size]) {
        ctx.beginPath();
        ctx.roundRect(x + dx + opts.gap / 2, y + (opts.gap + shrink) / 2, w - opts.gap, h, rad);
        ctx.fill();
      }
      x += w;
    }
  }
}

/** An irregular blob path — the outline of a patch of fallen plaster. */
function blobPath(cx: number, cy: number, r: number, rand: () => number) {
  const path = new Path2D();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const rr = r * (0.7 + rand() * 0.5);
    // Patches spread wider than tall, the way render sheds along a course.
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.8;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

/** Stucco render with the stone showing through where the plaster has fallen
 * away — the bridge between the stone houses and the stucco'd rest of town.
 * Patch centres stay clear of the edges so the plain field carries the seam. */
function drawPatchy(ctx: CanvasRenderingContext2D, size: number) {
  const rand = mulberry32(4102);
  ctx.fillStyle = "#ddd0b2";
  ctx.fillRect(0, 0, size, size);
  // Gentle mottle, wrapped 3x3 like drawDirtTexture so the field tiles.
  const mottle = ["#d6c8a9", "#e3d7bb", "#d0c2a2"];
  for (let i = 0; i < 14; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const rx = size * (0.05 + rand() * 0.15);
    const ry = rx * (0.4 + rand() * 0.6);
    const angle = rand() * Math.PI;
    ctx.fillStyle = mottle[i % mottle.length]!;
    ctx.globalAlpha = 0.1 + rand() * 0.15;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.ellipse(cx + dx, cy + dy, rx, ry, angle, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;

  for (const [cx, cy, r] of [
    [0.3, 0.72, 0.19],
    [0.72, 0.33, 0.14],
    [0.56, 0.86, 0.09],
  ] as const) {
    const patch = blobPath(cx * size, cy * size, r * size, rand);
    ctx.save();
    ctx.clip(patch);
    ctx.fillStyle = RUBBLE_MORTAR;
    ctx.fill(patch);
    // Small rubble inside the break, on the same 12-course grid throughout so
    // overlapping patches would still agree.
    const bandH = size / 12;
    const y0 = Math.floor(((cy - r) * size) / bandH) * bandH;
    for (let y = y0; y < (cy + r) * size; y += bandH) {
      let x = (cx - r) * size - rand() * 0.05 * size;
      while (x < (cx + r) * size) {
        const w = (0.04 + rand() * 0.05) * size;
        ctx.fillStyle = RUBBLE_TONES[Math.floor(rand() * RUBBLE_TONES.length)]!;
        ctx.beginPath();
        ctx.roundRect(x + 1.5, y + 1.5, w - 3, bandH - 3, bandH * 0.4);
        ctx.fill();
        x += w;
      }
    }
    ctx.restore();
    // The broken plaster edge, slightly darker than the field.
    ctx.strokeStyle = "#c4b493";
    ctx.lineWidth = 3;
    ctx.stroke(patch);
  }
}

/** Smooth cream stucco with faint trowel sweeps — reads solid at street zoom,
 * barely-there hand-finished texture up close. Broad low-alpha arcs in
 * near-base creams, wrapped 3x3 so the sheet tiles. */
function drawPlaster(ctx: CanvasRenderingContext2D, size: number) {
  const rand = mulberry32(5203);
  // Decidedly warm: the scene's light and fog cool colours a touch, so a
  // neutral cream here rendered light grey on the wall.
  ctx.fillStyle = "#e2d4ac";
  ctx.fillRect(0, 0, size, size);
  const tones = ["#e8dbb6", "#dbcca1", "#e5d7b0", "#decfa6"];
  for (let i = 0; i < 40; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = size * (0.04 + rand() * 0.1);
    const a0 = rand() * Math.PI * 2;
    ctx.strokeStyle = tones[i % tones.length]!;
    ctx.lineWidth = size * (0.01 + rand() * 0.02);
    ctx.globalAlpha = 0.05 + rand() * 0.07;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, r, a0, a0 + Math.PI * (0.6 + rand()));
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

// Marble inlay colours, shared by the campanile and screen-facade patterns —
// authored in final colour like the rest of the file: verde near the tinted
// pieces' rendered green, rose a muted terracotta-pink.
const VERDE = "#57604a";
const ROSE = "#b08a76";

/** Warm-white marble field with faint mottle, wrapped 3x3 so the sheet tiles.
 * Warm like drawPlaster's field, a step paler so it reads as marble beside the
 * stucco — a neutral near-white here rendered grey against the cream town. */
function marbleField(ctx: CanvasRenderingContext2D, size: number, seed: number) {
  const rand = mulberry32(seed);
  ctx.fillStyle = "#e6dcba";
  ctx.fillRect(0, 0, size, size);
  const tones = ["#ebe2c4", "#dfd3ac", "#e8dfc0"];
  for (let i = 0; i < 16; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const rx = size * (0.05 + rand() * 0.12);
    const ry = rx * (0.3 + rand() * 0.5);
    const angle = rand() * Math.PI;
    ctx.fillStyle = tones[i % tones.length]!;
    ctx.globalAlpha = 0.12 + rand() * 0.12;
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

/** The inlaid diamond motif; fills with the current fillStyle. */
function lozenge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.7, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.7, cy);
  ctx.closePath();
  ctx.fill();
}

/** Hexagon path (Giotto's relief-cycle medallions); caller fills. */
function hexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (k) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** Storey courses at the v edges — half-bands each side so a full string
 * course lands on every storey seam; optional rose accent lines inside. */
function storeyCourses(ctx: CanvasRenderingContext2D, size: number, course: number, line: number) {
  ctx.fillStyle = VERDE;
  ctx.fillRect(0, 0, size, course);
  ctx.fillRect(0, size - course, size, course);
  if (line) {
    ctx.fillStyle = ROSE;
    ctx.fillRect(0, course, size, line);
    ctx.fillRect(0, size - course - line, size, line);
  }
}

/** Giotto's campanile, polychrome register (July 2026 — replacing the
 * hairline-linework pattern, which averaged into a grey-green wash at the
 * ~40px a storey face fills at gameplay zoom): the real tower is pinker than
 * people remember — three tall panel bays per storey, rose fields framed in
 * verde with a white hexagon medallion (the relief cycle) floating in each.
 * The centre bay flips to a verde field so green stays in charge at distance
 * (the all-rose version smeared toward dusty salmon). Solid fields survive
 * the downscale where lines could not. Drawn once per storey (proc:block
 * wraps v per storey); u edges carry half corner posts so a full post
 * assembles where two faces meet, v edges half-courses (storeyCourses). */
function drawCampanile(ctx: CanvasRenderingContext2D, size: number) {
  marbleField(ctx, size, 7405);
  const course = size * 0.014;
  const line = size * 0.01;
  storeyCourses(ctx, size, course, line);
  const corner = size * 0.025;
  ctx.fillStyle = VERDE;
  ctx.fillRect(0, 0, corner, size);
  ctx.fillRect(size - corner, 0, corner, size);
  // three panel bays: verde / rose / verde, each framed and carrying a white
  // hexagon. The bifora sits over the CENTRE bay on every storey, so the
  // centre carries the rose (mostly hidden, peeking around the window) and
  // the two always-visible outer bays carry the verde — the first cut had it
  // the other way round and the tower read pink because its green was behind
  // glass. Outer hexagons get a small rose diamond as the polychrome accent.
  [size / 6, size / 2, (5 * size) / 6].forEach((cx, i) => {
    const pw = size * 0.2;
    const x0 = cx - pw / 2;
    const y0 = size * 0.16;
    const y1 = size * 0.84;
    ctx.fillStyle = i === 1 ? ROSE : VERDE;
    ctx.globalAlpha = i === 1 ? 0.82 : 0.72;
    ctx.fillRect(x0, y0, pw, y1 - y0);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = VERDE;
    ctx.lineWidth = size * 0.011;
    ctx.strokeRect(x0, y0, pw, y1 - y0);
    hexagon(ctx, cx, size / 2, size * 0.058);
    ctx.fillStyle = "#ece3c6";
    ctx.fill();
    if (i !== 1) {
      ctx.fillStyle = ROSE;
      lozenge(ctx, cx, size / 2, size * 0.026);
    }
  });
}

/** The cathedral's screen facade, San Miniato language (July 2026 — replacing
 * the SMN panel grid, whose 1.5px linework dissolved at the 60–90px the front
 * fills at gameplay zoom): few shapes, big ones. A five-arch blind arcade with
 * alternating SOLID verde tympana on the street register, under a row of
 * circle-in-square intarsia — roughly 4x the old line weight, a tenth the
 * element count. Shares the campanile's field, corner strips, and storey
 * courses so tower and front stay one marble family. Canvas y=0 is the storey
 * TOP (DynamicTexture invertY), so the arcade draws at y≈size. */
function drawScreen(ctx: CanvasRenderingContext2D, size: number) {
  marbleField(ctx, size, 8511);
  const course = size * 0.016;
  storeyCourses(ctx, size, course, 0);
  ctx.fillStyle = VERDE;
  const corner = size * 0.02;
  ctx.fillRect(0, 0, corner, size);
  ctx.fillRect(size - corner, 0, corner, size);
  // mid string course splitting the two registers
  ctx.fillRect(0, size / 2 - size * 0.008, size, size * 0.016);
  const lw = size * 0.018;
  ctx.strokeStyle = VERDE;
  ctx.lineWidth = lw;
  // upper register: three circle-in-square intarsia, centre lozenge rose
  for (let col = 0; col < 3; col++) {
    const cx = ((col + 0.5) * size) / 3;
    const cy = size * 0.27;
    const r = size * 0.082;
    ctx.strokeRect(cx - r * 1.4, cy - r * 1.4, r * 2.8, r * 2.8);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = col === 1 ? ROSE : VERDE;
    lozenge(ctx, cx, cy, r * 0.62);
  }
  // street register: five arches, every other tympanum filled solid — the
  // one figure on this front that still reads at gameplay distance
  const n = 5;
  const w = size / n;
  const yBase = size - course;
  const inset = size * 0.02;
  for (let i = 0; i < n; i++) {
    const cx = i * w + w / 2;
    const half = w / 2 - inset;
    const ySpring = size * 0.74;
    ctx.strokeStyle = VERDE;
    ctx.beginPath();
    ctx.moveTo(cx - half, yBase);
    ctx.lineTo(cx - half, ySpring);
    ctx.arc(cx, ySpring, half, Math.PI, 0);
    ctx.lineTo(cx + half, yBase);
    ctx.stroke();
    if (i % 2 === 0) {
      ctx.fillStyle = VERDE;
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      ctx.arc(cx, ySpring, half - lw, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

/** Facade texture ids the residential palette picks from (modelManifest's
 * FACADE_PALETTES.residential). Membership here is what routes a tint id down
 * the texture path in getTintedPair — campanile is in no palette; the bell
 * tower names it directly (tint: "campanile"). */
export const STONE_TINTS: Record<string, Drawer> = {
  campanile: drawCampanile,
  // Direct part tint like campanile (no palette): the cathedral's marble front.
  screen: drawScreen,
  // Direct part tint: plain white marble for the cathedral's pediment + aisle
  // shoulder wedges — field + hairline courses only. No vertical figure: the
  // gable's planar UVs tile u per unit (4x across the pediment), so anything
  // vertical repeats as stripes, and the wedge slope cuts figures badly (why
  // these parts left the campanile pattern when it went polychrome).
  marble: (ctx, size) => {
    marbleField(ctx, size, 7405);
    storeyCourses(ctx, size, size * 0.012, 0);
  },
  // Direct part tint like campanile (no palette): the cathedral's brown flanks.
  flank: (ctx, size) =>
    drawCourses(ctx, size, 404, {
      rows: 9, minW: 0.05, maxW: 0.14, gap: 3,
      joint: FLANK_MORTAR, tones: FLANK_TONES, radius: 0.45, jitter: 0.25,
    }),
  rubble: (ctx, size) =>
    drawCourses(ctx, size, 101, {
      rows: 9, minW: 0.05, maxW: 0.14, gap: 3,
      joint: RUBBLE_MORTAR, tones: RUBBLE_TONES, radius: 0.45, jitter: 0.25,
    }),
  // Roman brick: wide, flat courses — proportions like the road setts but
  // longer and much shorter, opus latericium rather than dressed stone.
  brick: (ctx, size) =>
    drawCourses(ctx, size, 202, {
      rows: 16, minW: 0.18, maxW: 0.4, gap: 2,
      joint: BRICK_JOINT, tones: BRICK_TONES, radius: 0.08, jitter: 0,
    }),
  ashlar: (ctx, size) =>
    drawCourses(ctx, size, 303, {
      rows: 6, minW: 0.22, maxW: 0.34, gap: 2,
      joint: ASHLAR_JOINT, tones: ASHLAR_TONES, radius: 0.04, jitter: 0,
    }),
  // Civic (city palette): larger dressed blocks in pale stone — fewer, wider
  // courses than the residences' ashlar so a palazzo reads finer, not busier.
  civic: (ctx, size) =>
    drawCourses(ctx, size, 505, {
      rows: 5, minW: 0.26, maxW: 0.4, gap: 2,
      joint: CIVIC_JOINT, tones: CIVIC_TONES, radius: 0.03, jitter: 0,
    }),
  patchy: drawPatchy,
  plaster: drawPlaster,
};

const stoneTextures = new Map<string, DynamicTexture>();

/** `desat` returns the inactive twin — same pattern, pixels run through the
 * same luminance lerp as assetLibrary's `desaturate()` — needed since the
 * stone tints spread beyond housing to buildings that do render inactive
 * (workshops, suppliers, services). */
export function getStoneTexture(tintId: string, scene: Scene, desat = false) {
  const key = desat ? `${tintId}~off` : tintId;
  let tex = stoneTextures.get(key);
  if (!tex) {
    tex = new DynamicTexture(`stone-${key}`, { width: SIZE, height: SIZE }, scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    STONE_TINTS[tintId]!(ctx, SIZE);
    if (desat) {
      const img = ctx.getImageData(0, 0, SIZE, SIZE);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const l = d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114;
        for (const c of [0, 1, 2]) d[i + c] = (d[i + c]! + (l - d[i + c]!) * 0.75) * 0.85;
      }
      ctx.putImageData(img, 0, 0);
    }
    tex.update();
    // Tile in v as well as u: the townhouse's 2-storey block maps v 0..2, so the
    // course canvas must repeat once per storey instead of clamping the top row
    // up the upper floor (which read as a smooth, different-looking second storey).
    tex.wrapU = tex.wrapV = DynamicTexture.WRAP_ADDRESSMODE;
    stoneTextures.set(key, tex);
  }
  return tex;
}

export function disposeWallTextures() {
  for (const tex of stoneTextures.values()) tex.dispose();
  stoneTextures.clear();
}
