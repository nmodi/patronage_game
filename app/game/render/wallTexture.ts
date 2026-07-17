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

/** Giotto's campanile: white marble panelled with verde di Prato strips and
 * dusty-rose inlay lines — the Duomo's green-and-white banding at street zoom.
 * Drawn once per storey (proc:block wraps v per storey); the u edges carry
 * half-width strips so a full corner post assembles where two faces meet, and
 * the v edges half-bands so a full string course lands on every storey seam. */
function drawCampanile(ctx: CanvasRenderingContext2D, size: number) {
  marbleField(ctx, size, 7405);
  // The real tower is overwhelmingly white and its green runs VERTICALLY —
  // corner pilasters and panel edges — with only hairline horizontal courses.
  // Keep verde to ~10% of the face, nearly all of it in the verticals.
  const course = size * 0.014;
  const line = size * 0.01;
  // hairline storey course (v edges) with a rose accent inside it
  ctx.fillStyle = VERDE;
  ctx.fillRect(0, 0, size, course);
  ctx.fillRect(0, size - course, size, course);
  ctx.fillStyle = ROSE;
  ctx.fillRect(0, course, size, line);
  ctx.fillRect(0, size - course - line, size, line);
  // corner posts (u edges, half each side of the seam) …
  const corner = size * 0.025;
  ctx.fillStyle = VERDE;
  ctx.fillRect(0, 0, corner, size);
  ctx.fillRect(size - corner, 0, corner, size);
  // … paired pilaster lines at the thirds (a white pilaster edged in green)
  const pl = size * 0.009;
  const gap = size * 0.016;
  for (const cx of [size / 3, (2 * size) / 3]) {
    ctx.fillRect(cx - gap - pl, 0, pl, size);
    ctx.fillRect(cx + gap, 0, pl, size);
  }
  // a rose sliver up the middle of each bay (the inlaid panel strips)
  ctx.fillStyle = ROSE;
  ctx.globalAlpha = 0.75;
  for (const cx of [size / 6, size / 2, (5 * size) / 6]) {
    ctx.fillRect(cx - pl / 2, course + line + 6, pl, size - 2 * (course + line + 6));
  }
  ctx.globalAlpha = 1;
  // a small verde lozenge in the centre bay (the inlaid diamond motif)
  ctx.fillStyle = VERDE;
  lozenge(ctx, size / 2, size / 2, size * 0.055);
}

/** The cathedral's screen facade: the campanile language densified into the
 * Santa Maria Novella front — an upper row of verde-framed square panels with
 * alternating verde/rose lozenges over a lower **blind arcade** of round
 * arches (SMN's street register). Shares the campanile's corner strips and
 * hairline courses so tower and front read as one marble family. Canvas y=0
 * is the storey TOP (DynamicTexture invertY), so the arcade draws at y≈size. */
function drawScreen(ctx: CanvasRenderingContext2D, size: number) {
  marbleField(ctx, size, 8511);
  const course = size * 0.014;
  const line = size * 0.01;
  // storey courses + rose accents, as the campanile
  ctx.fillStyle = VERDE;
  ctx.fillRect(0, 0, size, course);
  ctx.fillRect(0, size - course, size, course);
  ctx.fillStyle = ROSE;
  ctx.fillRect(0, course, size, line);
  ctx.fillRect(0, size - course - line, size, line);
  // panel grid: verde lines splitting the tile into 3 columns x 2 rows
  ctx.fillStyle = VERDE;
  const corner = size * 0.012;
  ctx.fillRect(0, 0, corner, size);
  ctx.fillRect(size - corner, 0, corner, size);
  ctx.fillRect(size / 3 - line / 2, 0, line, size);
  ctx.fillRect((2 * size) / 3 - line / 2, 0, line, size);
  ctx.fillRect(0, size / 2 - line / 2, size, line);
  const inset = size * 0.03;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = VERDE;
  // upper row: framed square panels with alternating lozenges
  for (let col = 0; col < 3; col++) {
    const x0 = (col * size) / 3;
    const y0 = course + line;
    const y1 = size / 2;
    ctx.globalAlpha = 0.8;
    ctx.strokeRect(x0 + inset, y0 + inset, size / 3 - 2 * inset, y1 - y0 - 2 * inset);
    ctx.globalAlpha = 1;
    ctx.fillStyle = col % 2 === 0 ? VERDE : ROSE;
    lozenge(ctx, x0 + size / 6, (y0 + y1) / 2, size * 0.05);
  }
  // lower row: the blind arcade — six round arches with legs to the base course
  ctx.globalAlpha = 0.8;
  const w = size / 6;
  const yBase = size - course - line;
  for (let i = 0; i < 6; i++) {
    const cx = i * w + w / 2;
    const half = w / 2 - inset;
    const ySpring = size / 2 + inset + half;
    ctx.beginPath();
    ctx.moveTo(cx - half, yBase);
    ctx.lineTo(cx - half, ySpring);
    ctx.arc(cx, ySpring, half, Math.PI, 0);
    ctx.lineTo(cx + half, yBase);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Facade texture ids the residential palette picks from (modelManifest's
 * FACADE_PALETTES.residential). Membership here is what routes a tint id down
 * the texture path in getTintedPair — campanile is in no palette; the bell
 * tower names it directly (tint: "campanile"). */
export const STONE_TINTS: Record<string, Drawer> = {
  campanile: drawCampanile,
  // Direct part tint like campanile (no palette): the cathedral's marble front.
  screen: drawScreen,
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
