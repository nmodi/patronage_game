import { AssetContainer } from "@babylonjs/core/assetContainer";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

/** Generated stand-ins for the Kenney pieces whose baked atlas detail we can't
 * use. A tint multiplies a whole part at once, and the kit bakes rival details
 * onto one material: `wall-block` is 56 of 76 triangles of corner quoin, and
 * `roof-gable` carries its gable wall + stray stone on the tile material — so a
 * pink house got a brown gable and no tint could separate them. Florence's
 * stucco housing has plain corners anyway, and a flat-colored box is a box:
 * there's no art in one, and it stretches to 8x invisibly where the manifest
 * abuses it as a crate/slab/nave.
 *
 * Loaded through the ordinary `proc:` file path (see getContainer) with named
 * PBR materials, so material conversion, MATERIAL_TINTS, tinting, desaturation,
 * batching and blend stretch all treat these like any untextured Nature Kit file.
 *
 * Every piece carries **vertex colors**, which multiply under the part tint the
 * same way the atlas texture does for kit pieces. That is not decoration: what
 * the kit sells as "one flat cream" is really a baked gradient, and dropping it
 * is what made the first cut of these pieces glow (see STUCCO_AO).
 */

export const PROC_PREFIX = "proc:";

/** Envelopes of the kit pieces being replaced, measured from the GLBs. */
export const BLOCK_ENVELOPE = { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] } as const;
export const ROOF_ENVELOPE = { min: [-0.55, 0, -0.535], max: [0.55, 0.571, 0.535] } as const;
/** roof-point.glb: a square pyramid on the same 1.1 base. roof-high-point is the
 * identical piece at twice the height, so a y-scale of 2 covers it too. */
export const HIP_ENVELOPE = { min: [-0.55, 0, -0.55], max: [0.55, 0.5, 0.55] } as const;

/** The roof's *core* fills ROOF_ENVELOPE exactly; the tile barrels sit half-proud
 * of it and lap past the eave, so the built piece overhangs its envelope by about
 * a tile radius. That is deliberate — real coppi stand off the sheathing, nothing
 * stacks on a roof, and the alternative (normalizing the whole thing back into the
 * envelope) squashes the core out from under the gable end and z-fights it. Every
 * roof ref squashes Y (houses use 0.6), so this reads as a few hundredths on screen. */
export const ROOF_TILE_BULGE = 0.07;

// Roof cross-section: ridge along X at z = 0, slopes falling to ±Z.
const ROOF_HALF_X = 0.55;
const ROOF_HALF_Z = 0.535;
const ROOF_H = 0.571;
// Hip: the same base, four slopes meeting at a point.
const HIP_HALF = 0.55;
const HIP_H = 0.5;
/** Gable wall sits on the wall plane; the roof's 0.035 verge overhangs it. */
const GABLE_HALF_Z = 0.5;
const GABLE_THICKNESS = 0.03;
/** Keeps the gable's slope edges strictly under the roof core's, which occludes
 * them. Both are straight lines and the gable is already inset at the eave
 * (0.5 < 0.535), so clearing the ridge clears the whole edge. */
const GABLE_CLEARANCE = 0.97;

/** Barrel tiles: courses across the ridge x rows down each slope. Real coppi run
 * about 1:2.5 long-to-wide and a cottage slope takes three or four of them.
 * These two are the *house* roof — every other roof derives its own counts from
 * them (see procRoofFile) rather than inheriting them. */
export const COURSES = 14;
const ROWS = 4;

/** The tile the whole city matches: one coppo as the houses render it, at the
 * manifest's ROOF_SCALE (a 0.6 y-squash). Kit units. */
const TILE_W = (2 * ROOF_HALF_X) / COURSES;
const TILE_L = Math.hypot(ROOF_H * 0.6, ROOF_HALF_Z) / ROWS;

/** Piece id for a roof at a given part scale, tile counts riding in the id
 * (`proc:roof-gable@51x7`). The geometry is generated at that density, so a
 * stretched ref gets *more* tiles instead of fatter ones — 14 fixed courses
 * smeared over the cathedral's 3.6x aisles is what read as corrugation. Only the
 * part's own scale is compensated: a `stretch: true` building still scales X and
 * Z apart, but that is a few percent, not 3.6x.
 *
 * ponytail: counts are uncapped — the nave, the largest ref, is ~900 tiles /
 * ~20k tris, built once and thin-instanced across the city. Clamp if a new ref
 * ever asks for a scale that dwarfs it. */
export function procRoofFile(
  kind: "roof-gable" | "roof-hip",
  [sx, sy, sz]: [number, number, number]
) {
  const [h, halfZ] = kind === "roof-hip" ? [HIP_H, HIP_HALF] : [ROOF_H, ROOF_HALF_Z];
  const courses = Math.max(1, Math.round((2 * ROOF_HALF_X * sx) / TILE_W));
  const rows = Math.max(1, Math.round(Math.hypot(h * sy, halfZ * sz) / TILE_L));
  return `${PROC_PREFIX}${kind}@${courses}x${rows}`;
}
/** Each row laps the row below it; LAP lifts it clear so the shared barrel
 * surface doesn't z-fight, and reads as the tile's lip. */
const ROW_OVERLAP = 1.25;
const LAP = 0.005;

/** Per-tile shade, multiplied onto the tile base color as vertex colors. Real
 * roofs vary in hue as well as value, so a few of these cool off rather than
 * just darken. All are <= 1: the base color is the PALEST tile (see TILE_BASE).
 *
 * The spread is a ratio of ~0.8, borrowed from the kit's own tiles: wider than
 * that reads as a patchwork rather than a roof. */
const TILE_SHADES: [number, number, number][] = [
  [1.0, 1.0, 1.0],
  [0.94, 0.92, 0.9],
  [0.88, 0.84, 0.8],
  [0.83, 0.79, 0.77],
  [0.97, 0.99, 1.0],
  [0.9, 0.87, 0.83],
  [0.86, 0.88, 0.91],
  [0.99, 0.96, 0.92],
];
/** The core shows in the valleys between barrels — dark, so it reads as the gap. */
const CORE_SHADE = 0.72;

/** The city's roof colour, and its palest tile — TILE_SHADES only darkens from
 * here, and every roof in the city is a generated piece now, so this one value
 * is the whole roofline. Florence's roofs are browner and less saturated than
 * Kenney's tile (hue 14, saturation 48) — this is that colour at the same
 * lightness (hue 19, saturation 34), a tenth of the way back toward the kit's
 * orange. It has to stay under TILE_RANGE.palest. */
const TILE_BASE = "#855641";
/** palest: the clip ceiling, measured off the kit's palest tile. This scene
 * lights a sun-facing slope at ~1.9x, so a tile brighter than this clips red and
 * lands on pale sand — that is physics, not taste, and it is what makes TILE_BASE
 * a *ceiling* rather than an average. darkest: the design floor, below which a
 * roof reads as mud rather than terracotta (the kit's own darkest tile, #a9583f,
 * used to be this — the roofs are deliberately browner than Kenney's now). */
export const TILE_RANGE = { palest: "#c36e54", darkest: "#6f4a38" };

/** Kenney bakes an ambient-occlusion ramp into the stucco: the wall runs #c6bba4
 * at its base to #f3e4c9 at the top, and the ratio is flat across channels (~.82).
 * The panels still on the buildings carry the same ramp, so matching it is what
 * keeps a panelled face and a plain face the same wall. */
const STUCCO_AO = 0.817;

/** The roof's core cross-section, shared by the roof and its gable end. */
const ROOF_PROFILE: [number, number][] = [
  [-ROOF_HALF_Z, 0],
  [ROOF_HALF_Z, 0],
  [0, ROOF_H],
];

function hashShade(...ks: number[]): [number, number, number] {
  let h = 2166136261;
  for (const k of ks) h = Math.imul(h ^ (k + 0x9e37), 16777619);
  return TILE_SHADES[(h >>> 0) % TILE_SHADES.length]!;
}

/** Winding is unchecked — every procedural material renders double-sided, as the
 * Kenney meshes do. */
function meshFrom(
  name: string,
  positions: number[],
  indices: number[],
  shade: number,
  scene: Scene
): Mesh {
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  // Unused (these materials carry no texture) but MergeMeshes requires every
  // source to declare the same attributes, and MeshBuilder primitives have UVs.
  data.uvs = new Array((2 * positions.length) / 3).fill(0);
  data.colors = Array.from({ length: (4 * positions.length) / 3 }, (_, i) =>
    i % 4 === 3 ? 1 : shade
  );
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  return mesh;
}

/** Extrude a convex profile (ZY plane) along X. */
function prism(
  name: string,
  profile: [number, number][],
  x0: number,
  x1: number,
  capped: boolean,
  shade: number,
  scene: Scene
): Mesh {
  const n = profile.length;
  const positions: number[] = [];
  for (const [z, y] of profile) positions.push(x0, y, z);
  for (const [z, y] of profile) positions.push(x1, y, z);
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, n + j, i, n + j, n + i);
  }
  if (capped) {
    for (let i = 1; i < n - 1; i++) {
      indices.push(0, i + 1, i);
      indices.push(n, n + i, n + i + 1);
    }
  }
  return meshFrom(name, positions, indices, shade, scene);
}

/** Paint per-vertex UVs from position (and face normal, for meshes that need
 * a per-face mapping). Like the shading, runs before flat-shading, which
 * splits the verts but carries their UVs along. */
function uvByPosition(
  mesh: Mesh,
  uv: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => [number, number]
) {
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const norm = mesh.getVerticesData(VertexBuffer.NormalKind)!;
  const uvs: number[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    uvs.push(...uv(pos[i]!, pos[i + 1]!, pos[i + 2]!, norm[i]!, norm[i + 1]!, norm[i + 2]!));
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
}

/** Paint per-vertex shade from position. Runs before flat-shading, which splits
 * the verts but carries their colors along. */
function shadeByPosition(mesh: Mesh, shade: (x: number, y: number, z: number) => number) {
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const colors: number[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const s = shade(pos[i]!, pos[i + 1]!, pos[i + 2]!);
    colors.push(s, s, s, 1);
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
}

function buildBlock(scene: Scene, _courses: number, storeys: number) {
  const mesh = MeshBuilder.CreateBox("proc-block", { width: 1, height: storeys, depth: 1 }, scene);
  // CreateBox centers on the origin; the kit's blocks sit on their base so
  // parts stack by integer y.
  mesh.bakeTransformIntoVertices(Matrix.Translation(0, storeys / 2, 0));
  // The kit's ramp, rebuilt: dark at the footing, full at the eave. A box only
  // has verts at its ends, so this interpolates across the face for free — and a
  // multi-storey block runs ONE continuous ramp over the whole wall (no dark
  // seam where two stacked blocks used to meet — see the townhouse).
  shadeByPosition(mesh, (_x, y) => STUCCO_AO + (1 - STUCCO_AO) * (y / storeys));
  // CreateBox's UVs rotate 90° on the ±X faces, which stands a facade
  // texture's stone courses on end on a house's front. Remap by face normal
  // so v is world height on every wall — and the ±X mapping matches
  // proc:gable-end's, so courses continue up the gable. v = raw y, so a
  // multi-storey block's texture WRAPS once per storey (same course size as a
  // cottage) instead of stretching one canvas over the whole wall.
  uvByPosition(mesh, (x, y, z, nx, _ny, nz) =>
    Math.abs(nx) > 0.5 ? [z + 0.5, y] : Math.abs(nz) > 0.5 ? [x + 0.5, y] : [x + 0.5, z + 0.5]
  );
  return { mesh, material: "stucco", color: "#f3e4c9" };
}

function barrel(
  name: string,
  diameter: number,
  height: number,
  shade: number[],
  scene: Scene
) {
  const c = new Color4(shade[0], shade[1], shade[2], 1);
  return MeshBuilder.CreateCylinder(
    name,
    { height, diameter, tessellation: 6, faceColors: [c, c, c] },
    scene
  );
}

/** Tiled gable roof. The core matches ROOF_ENVELOPE exactly and is NOT
 * normalized — see ROOF_TILE_BULGE. */
function buildRoofMesh(scene: Scene, courses: number, rows: number): Mesh {
  // Open-ended core: the ends are closed by proc:gable-end at the wall plane,
  // inset behind the verge, so this piece stays pure tile.
  const parts = [
    prism("proc-roof-core", ROOF_PROFILE, -ROOF_HALF_X, ROOF_HALF_X, false, CORE_SHADE, scene),
  ];
  const step = (2 * ROOF_HALF_X) / courses;
  const slope = Math.hypot(ROOF_H, ROOF_HALF_Z);
  const tilt = Math.atan2(ROOF_H, ROOF_HALF_Z);
  const rowLen = slope / rows;

  for (const s of [-1, 1]) {
    for (let i = 0; i < courses; i++) {
      for (let j = 0; j < rows; j++) {
        const tile = barrel(`proc-coppo-${s}-${i}-${j}`, step, rowLen * ROW_OVERLAP, hashShade(s, i, j), scene);
        // Axis laid in the slope plane, running ridge to eave; half the barrel
        // stands proud of the plane, which is the coppi read.
        tile.rotation.x = -s * (Math.PI / 2 - tilt);
        // Walk down the slope from the ridge, then lift clear of the row below.
        // Each row starts at its own line and laps ROW_OVERLAP past it, over the
        // row beneath — so the top row's head lands exactly on the ridge and the
        // bottom row's foot overhangs the eave.
        const d = j * rowLen + (rowLen * ROW_OVERLAP) / 2;
        const lift = (rows - 1 - j) * LAP;
        tile.position.set(
          -ROOF_HALF_X + (i + 0.5) * step,
          ROOF_H - (d * ROOF_H) / slope + (lift * ROOF_HALF_Z) / slope,
          s * ((d * ROOF_HALF_Z) / slope + (lift * ROOF_H) / slope)
        );
        tile.bakeCurrentTransformIntoVertices();
        parts.push(tile);
      }
    }
  }
  // Ridge cap (colmo): both slopes' top rows die on the ridge, leaving the joint
  // open. Real roofs cover it with a course laid along the ridge — and it hides
  // the seam where the two slopes' tiles meet.
  for (let i = 0; i < courses; i++) {
    const cap = barrel(`proc-colmo-${i}`, step * 1.2, step * 1.02, hashShade(9, i, 0), scene);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(-ROOF_HALF_X + (i + 0.5) * step, ROOF_H + (rows - 1) * LAP, 0);
    cap.bakeCurrentTransformIntoVertices();
    parts.push(cap);
  }

  const mesh = Mesh.MergeMeshes(parts, true, true)!;
  mesh.name = "proc-roof-gable";
  return mesh;
}

function buildRoofGable(scene: Scene, courses: number, rows: number) {
  return { mesh: buildRoofMesh(scene, courses, rows), material: "tile", color: TILE_BASE };
}

/** Tiled hip (roof-point): four slopes to a point. Coppi run straight up the
 * fall line as they really do — the slope is a triangle, so each row keeps only
 * the tiles whose centre is still inside it and the hip ridges cover the cut,
 * which is also how a real hip is finished. */
function buildRoofHipMesh(scene: Scene, courses: number, rows: number): Mesh {
  // Core pyramid: apex + 4 base corners, one triangle per slope. No base — it
  // sits on a wall, same as the gable's open core.
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const positions = [0, HIP_H, 0];
  for (const [cx, cz] of corners) positions.push(cx * HIP_HALF, 0, cz * HIP_HALF);
  const indices: number[] = [];
  for (let i = 0; i < 4; i++) indices.push(0, 1 + i, 1 + ((i + 1) % 4));
  const parts = [meshFrom("proc-hip-core", positions, indices, CORE_SHADE, scene)];

  const step = (2 * HIP_HALF) / courses;
  const slope = Math.hypot(HIP_H, HIP_HALF);
  const tilt = Math.atan2(HIP_H, HIP_HALF);
  const rowLen = slope / rows;

  for (let f = 0; f < 4; f++) {
    const yaw = Matrix.RotationY((f * Math.PI) / 2);
    for (let i = 0; i < courses; i++) {
      const x = -HIP_HALF + (i + 0.5) * step;
      for (let j = 0; j < rows; j++) {
        // Same walk as the gable's +Z slope, apex standing in for the ridge.
        const d = j * rowLen + (rowLen * ROW_OVERLAP) / 2;
        const lift = (rows - 1 - j) * LAP;
        const y = HIP_H - (d * HIP_H) / slope + (lift * HIP_HALF) / slope;
        const z = (d * HIP_HALF) / slope + (lift * HIP_H) / slope;
        // The slope narrows to the apex as |x| <= z, so this drops the tiles the
        // hip cuts off — including the whole top row, where the faces meet.
        if (Math.abs(x) > z) continue;
        const tile = barrel(`proc-coppo-hip-${f}-${i}-${j}`, step, rowLen * ROW_OVERLAP, hashShade(f, i, j), scene);
        tile.rotation.x = -(Math.PI / 2 - tilt);
        tile.rotation.y = (f * Math.PI) / 2; // pitch first, then onto this face
        tile.position.copyFrom(Vector3.TransformCoordinates(new Vector3(x, y, z), yaw));
        tile.bakeCurrentTransformIntoVertices();
        parts.push(tile);
      }
    }
  }
  // Hip ridges: a course down each arris, covering where two slopes' cut tiles
  // meet. Overlong so it laps past the eave tiles' overhang; the four converge
  // into a finial at the apex, which is what closes the point.
  for (const [cx, cz] of corners) {
    const foot = new Vector3(cx * HIP_HALF, 0, cz * HIP_HALF);
    const apex = new Vector3(0, HIP_H, 0);
    const axis = apex.subtract(foot);
    const cap = barrel(`proc-hip-ridge-${cx}-${cz}`, step * 1.5, axis.length() * 1.08, hashShade(9, cx, cz), scene);
    cap.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
      Vector3.Up(),
      axis.normalize(),
      new Quaternion()
    );
    cap.position.copyFrom(foot.add(apex).scale(0.5));
    cap.bakeCurrentTransformIntoVertices();
    parts.push(cap);
  }

  const mesh = Mesh.MergeMeshes(parts, true, true)!;
  mesh.name = "proc-roof-hip";
  return mesh;
}

function buildRoofHip(scene: Scene, courses: number, rows: number) {
  return { mesh: buildRoofHipMesh(scene, courses, rows), material: "tile", color: TILE_BASE };
}

/** The stucco triangles closing the roof's open ends: base on the wall top, edges
 * out to the wall plane it closes, apex just under the roof core's ridge so the
 * core occludes it. Flat at the wall's top shade — its base meets the *bright*
 * end of the block's ramp, so ramping it too would draw a dark line at the eave. */
function buildGableEnd(scene: Scene) {
  const t = GABLE_THICKNESS;
  const profile: [number, number][] = [
    [-GABLE_HALF_Z, 0],
    [GABLE_HALF_Z, 0],
    [0, ROOF_H * GABLE_CLEARANCE],
  ];
  const ends = [-1, 1].map((s) =>
    prism(`proc-gable-${s}`, profile, s * GABLE_HALF_Z - t, s * GABLE_HALF_Z + t, true, 1, scene)
  );
  const mesh = Mesh.MergeMeshes(ends, true, true)!;
  mesh.name = "proc-gable-end";
  // Planar UVs so a facade texture can dress the gable: u across the wall, v
  // continuing the storey below's courses. The 0.6 bakes in the manifest's
  // default ROOF_SCALE y-squash, so a stone course is the same world height on
  // the gable as on the wall under it. Refs at other roof scales carry
  // non-textured tints, where these UVs never show.
  uvByPosition(mesh, (_x, y, z) => [z + 0.5, y * 0.6]);
  return { mesh, material: "stucco", color: "#f3e4c9" };
}

// ---------------------------------------------------------------------------
// Batch-1 fittings: the artist-brief pieces (docs/artist-brief.md), generated.
// Chunky flat-faceted stone — boxes plus low-count wedge fans, which covers the
// brief's two curves: an arched head reads as voussoirs at 6 facets, an arcade
// bay at 8. One material per piece so Part.tint recolors a whole fitting
// (religious verde trim); the dark interior stays the manifest's separate
// reveal part, exactly so that tint never greens it.

/** Pietra serena — the grey stone of Florentine surrounds, a step darker than
 * stucco so a frame reads on colored plaster, and light enough that a verde
 * tint multiplied over it still reads green rather than black. */
const STONE = "#b3ada1";
/** Warm limestone for the residence/palazzo surrounds — a step off the sandstone
 * facade so a frame still reads as trim, but without the grey pietra-serena clash
 * against warm stucco. Kept under the wall texture's average: the ~1.9x sun used
 * to clip the old #c9bda1 to pure white, ringing every window (the overhead-view
 * bullseye read). The cathedral arcade (proc:arch-bay) keeps STONE: it's only
 * ever shown verde-tinted, and STONE's lightness is tuned for that multiply. */
const SURROUND = "#bcae90";
/** Door wood, between the nature kit's fence tans (#9a7b57 / #6f523a). */
const WOOD = "#8a6b4d";

/** The window opening every surround frames; the manifest's reveal +
 * shutter-leaf stack (windowOn) derives from it. Sized against real Florentine
 * elevations — a window is ~15% of a house facade's width, not the 27% the
 * first cut used, which read as bullseyes from the overhead camera. */
export const WIN_OPENING = { w: 0.13, h: 0.34 } as const;
/** Sill course height; windowOn subtracts it to land the opening at storey+0.3. */
export const SILL_H = 0.04;
export const DOOR_OPENING = { w: 0.3, h: 0.75 } as const;
/** Landmark portal: the door part of the opening; a semicircular arch of
 * radius w/2 springs at h, so the frame's inner apex is h + w/2. */
export const PORTAL_OPENING = { w: 0.42, h: 0.85 } as const;
const BORDER = 0.025; // jamb/head border around a window opening
const ARCH_BORDER = 0.04; // voussoirs run deeper than the jambs they spring from
const ARCH_SEGS = 6;
export const DOOR_T = 0.02; // door-frame depth (local x); the threshold bulges past it
const SILL_T = 0.032;
/** Window-surround depth — much slimmer than the door's: trim reads as a shadow
 * line on the wall, not a box standing off it. The manifest's stack rides both. */
export const WIN_T = 0.014;
export const WIN_SILL_T = 0.022;
const DOOR_B = 0.05;

/** Box with a uniform vertex shade (grey scalar or a full colour — the glazed
 * leaf carries two hues on one material this way), spanning the given extents. */
function shadedBox(
  name: string,
  [x0, x1]: readonly [number, number],
  [y0, y1]: readonly [number, number],
  [z0, z1]: readonly [number, number],
  shade: number | Color4,
  scene: Scene
) {
  const c = typeof shade === "number" ? new Color4(shade, shade, shade, 1) : shade;
  const box = MeshBuilder.CreateBox(
    name,
    { width: x1 - x0, height: y1 - y0, depth: z1 - z0, faceColors: [c, c, c, c, c, c] },
    scene
  );
  box.bakeTransformIntoVertices(Matrix.Translation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  return box;
}

/** Hexahedron between two ZY quads at x = ±t — a voussoir or fan segment.
 * Adjacent segments' touching radial faces are interior to the merged solid,
 * so they never show (same overlap rule the roof barrels rely on). */
function wedge(
  name: string,
  quad: [number, number][], // 4 [z, y] corners: inner0, inner1, outer1, outer0
  t: number,
  shade: number,
  scene: Scene
) {
  const positions: number[] = [];
  for (const x of [-t, t]) for (const [z, y] of quad) positions.push(x, y, z);
  const indices: number[] = [];
  const q = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, a, c, d);
  q(0, 1, 2, 3);
  q(4, 7, 6, 5);
  q(0, 4, 5, 1);
  q(1, 5, 6, 2);
  q(2, 6, 7, 3);
  q(3, 7, 4, 0);
  return meshFrom(name, positions, indices, shade, scene);
}

/** [z, y] on a circle of radius r about (0, cy); angle 0 = right spring point,
 * π = left. */
const arcPt = (r: number, a: number, cy: number): [number, number] => [
  r * Math.cos(a),
  cy + r * Math.sin(a),
];

/** Sill + jambs shared by both window surrounds. The sill projects sideways and
 * stands deeper than the frame; per-course shades read as stone joints. */
function surroundBase(scene: Scene): Mesh[] {
  const t = WIN_T / 2;
  const hw = WIN_OPENING.w / 2;
  return [
    shadedBox(
      "sill",
      [-WIN_SILL_T / 2, WIN_SILL_T / 2],
      [0, SILL_H],
      [-(hw + BORDER + 0.02), hw + BORDER + 0.02],
      0.88,
      scene
    ),
    shadedBox("jamb-l", [-t, t], [SILL_H, SILL_H + WIN_OPENING.h], [-(hw + BORDER), -hw], 1, scene),
    shadedBox("jamb-r", [-t, t], [SILL_H, SILL_H + WIN_OPENING.h], [hw, hw + BORDER], 1, scene),
  ];
}

function buildSurroundRect(scene: Scene) {
  const t = WIN_T / 2;
  const hw = WIN_OPENING.w / 2;
  const head = shadedBox(
    "head",
    [-t, t],
    [SILL_H + WIN_OPENING.h, SILL_H + WIN_OPENING.h + BORDER],
    [-(hw + BORDER), hw + BORDER],
    0.95,
    scene
  );
  const mesh = Mesh.MergeMeshes([...surroundBase(scene), head], true, true)!;
  mesh.name = "proc-surround-rect";
  return { mesh, material: "stone", color: SURROUND };
}

function buildSurroundArch(scene: Scene) {
  const t = WIN_T / 2;
  const hw = WIN_OPENING.w / 2;
  const spring = SILL_H + WIN_OPENING.h;
  const parts = surroundBase(scene);
  for (let i = 0; i < ARCH_SEGS; i++) {
    const a0 = (Math.PI * i) / ARCH_SEGS;
    const a1 = (Math.PI * (i + 1)) / ARCH_SEGS;
    parts.push(
      wedge(
        `vouss-${i}`,
        [
          arcPt(hw, a0, spring),
          arcPt(hw, a1, spring),
          arcPt(hw + ARCH_BORDER, a1, spring),
          arcPt(hw + ARCH_BORDER, a0, spring),
        ],
        t,
        i % 2 ? 0.88 : 1, // alternating wedge shades are the voussoir joints
        scene
      )
    );
  }
  const mesh = Mesh.MergeMeshes(parts, true, true)!;
  mesh.name = "proc-surround-arch";
  return { mesh, material: "stone", color: SURROUND };
}

function buildDoorFrame(scene: Scene) {
  const t = DOOR_T / 2;
  const hw = DOOR_OPENING.w / 2;
  const parts = [
    shadedBox(
      "threshold",
      [-SILL_T / 2, SILL_T / 2],
      [0, 0.02],
      [-(hw + DOOR_B), hw + DOOR_B],
      0.85,
      scene
    ),
    shadedBox("jamb-l", [-t, t], [0, DOOR_OPENING.h], [-(hw + DOOR_B), -hw], 1, scene),
    shadedBox("jamb-r", [-t, t], [0, DOOR_OPENING.h], [hw, hw + DOOR_B], 1, scene),
    // Lintel: deeper than the jambs and slightly eared past them (but under the
    // threshold's SILL_T/2, which stays the frame's deepest course).
    shadedBox(
      "lintel",
      [-0.013, 0.013],
      [DOOR_OPENING.h, DOOR_OPENING.h + 0.06],
      [-(hw + DOOR_B + 0.02), hw + DOOR_B + 0.02],
      0.94,
      scene
    ),
  ];
  const mesh = Mesh.MergeMeshes(parts, true, true)!;
  mesh.name = "proc-door-frame";
  return { mesh, material: "stone", color: SURROUND };
}

function buildDoorLeaf(scene: Scene) {
  // A hair inside the frame's 0.30x0.75 opening so the leaf's edges never share
  // a plane with the jambs; the clearance reads as the door gap.
  const W = DOOR_OPENING.w - 0.01;
  const H = DOOR_OPENING.h - 0.01;
  const T = 0.03;
  const SHADES = [1, 0.9, 0.96, 0.87, 0.94];
  const pw = W / SHADES.length;
  const parts: Mesh[] = [];
  for (let i = 0; i < SHADES.length; i++) {
    // Planks are contiguous (a real gap would show wall through the door);
    // alternate faces recess a touch, and the exposed side sliver is the seam.
    parts.push(
      shadedBox(
        `plank-${i}`,
        [-T / 2, T / 2 - (i % 2 ? 0.006 : 0)],
        [0, H],
        [-W / 2 + i * pw, -W / 2 + (i + 1) * pw],
        SHADES[i]!,
        scene
      )
    );
  }
  // Ledges (cross rails), sunk a hair into the proud planks.
  for (const [y0, y1] of [
    [0.1, 0.16],
    [0.57, 0.63],
  ] as const) {
    parts.push(
      shadedBox(
        `rail-${y0}`,
        [T / 2 - 0.004, T / 2 + 0.01],
        [y0, y1],
        [-W / 2 + 0.02, W / 2 - 0.02],
        0.8,
        scene
      )
    );
  }
  const mesh = Mesh.MergeMeshes(parts, true, true)!;
  mesh.name = "proc-door-leaf";
  // Recenter on x (the rails push the bounds forward) — every piece is
  // x/z-centered so the manifest picks faces by rotationY alone.
  mesh.refreshBoundingInfo();
  mesh.bakeTransformIntoVertices(
    Matrix.Translation(-mesh.getBoundingInfo().boundingBox.center.x, 0, 0)
  );
  return { mesh, material: "wood", color: WOOD };
}

/** Glazed casement leaf (proc:shutter — the id stays so every manifest ref
 * holds). Replaces the closed louvre with the Tuscan street reference: slate
 * sky-glass panes behind a sparse wood muntin grid (centre mullion + two
 * transoms → 2×3 panes) inside a thin casement frame. Authored to the
 * generated opening — WIN_OPENING minus the clearance gap, base at y=0. Two
 * hues ride one white material as coloured vertex tints; per-pane brightness
 * varies so the glass reads as reflections, not a flat plate. */
export const SHUTTER_T = 0.007; // total depth; the manifest's stack rides it
const GLASS = Color3.FromHexString("#5f6b7a"); // slate sky-reflection blue
const MUNTIN = Color3.FromHexString("#8d7f6b"); // grey-tan casement wood
// One brightness per pane (2 cols × 3 rows, bottom-up) — a hair of sky sparkle.
const PANE_SHADES = [0.86, 1, 0.93, 0.8, 1.04, 0.9];

function buildShutter(scene: Scene) {
  const hw = (WIN_OPENING.w - 0.01) / 2;
  const H = WIN_OPENING.h - 0.01;
  const xMid = -SHUTTER_T / 2 + 0.0025; // glass in the back, woodwork proud
  const tint = (c: Color3, s: number) => new Color4(c.r * s, c.g * s, c.b * s, 1);
  const parts: Mesh[] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 2; col++)
      parts.push(
        shadedBox(
          `pane-${row}${col}`,
          [-SHUTTER_T / 2, xMid],
          [(row * H) / 3, ((row + 1) * H) / 3],
          [(col - 1) * hw, col * hw],
          tint(GLASS, PANE_SHADES[row * 2 + col]!),
          scene
        )
      );
  const wood = (name: string, y: readonly [number, number], z: readonly [number, number], s = 1) =>
    parts.push(shadedBox(name, [xMid, SHUTTER_T / 2], y, z, tint(MUNTIN, s), scene));
  wood("stile-l", [0, H], [-hw, -hw + 0.01], 0.96);
  wood("stile-r", [0, H], [hw - 0.01, hw], 0.96);
  wood("rail-b", [0, 0.012], [-hw, hw]);
  wood("rail-t", [H - 0.012, H], [-hw, hw]);
  wood("mullion", [0, H], [-0.004, 0.004]);
  wood("transom-1", [H / 3 - 0.004, H / 3 + 0.004], [-hw, hw]);
  wood("transom-2", [(2 * H) / 3 - 0.004, (2 * H) / 3 + 0.004], [-hw, hw]);
  const mesh = Mesh.MergeMeshes(parts, true, true)!;
  mesh.name = "proc-shutter";
  // White base: the vertex tints above ARE the colours (GLASS/MUNTIN the knobs).
  return { mesh, material: "glazing", color: "#ffffff" };
}

// Landmark portal (bell tower, cathedral fronts, future Town Hall) — the
// grander door the house fittings only impersonated. Frame: chunkier jambs
// under an 8-facet voussoir ring off impost blocks, with a stone tympanum
// filling the lunette (so a portal needs no separate reveal part). Leaf:
// rectangular DOUBLE doors that read as METAL — raised bronze panels (the
// SMN/baptistery door language), not planks — stopping at the spring line.
const PORTAL_JAMB = 0.06;
const PORTAL_B = 0.07; // voussoir ring depth; overruns the jambs like ARCH_BORDER
const PORTAL_T = 0.045; // frame depth — heavier than the houses' DOOR_T
const PORTAL_SEGS = 8;
/** Aged bronze for the portal doors — grey-green patina, not the foundry
 * tint's warm ingot. Diffuse-only like everything else (no metal sheen); the
 * panel relief is what says "metal doors". */
const BRONZE = "#6e6753";

function buildPortalFrame(scene: Scene) {
  const t = PORTAL_T / 2;
  const hw = PORTAL_OPENING.w / 2;
  const spring = PORTAL_OPENING.h;
  const parts = [
    shadedBox(
      "threshold",
      [-0.03, 0.03],
      [0, 0.02],
      [-(hw + PORTAL_JAMB + 0.02), hw + PORTAL_JAMB + 0.02],
      0.85,
      scene
    ),
    shadedBox("jamb-l", [-t, t], [0, spring], [-(hw + PORTAL_JAMB), -hw], 1, scene),
    shadedBox("jamb-r", [-t, t], [0, spring], [hw, hw + PORTAL_JAMB], 1, scene),
    // Impost blocks the arch springs from, slightly proud of the jambs.
    shadedBox(
      "impost-l",
      [-t - 0.006, t + 0.006],
      [spring - 0.04, spring],
      [-(hw + PORTAL_JAMB + 0.015), -(hw - 0.012)],
      0.9,
      scene
    ),
    shadedBox(
      "impost-r",
      [-t - 0.006, t + 0.006],
      [spring - 0.04, spring],
      [hw - 0.012, hw + PORTAL_JAMB + 0.015],
      0.9,
      scene
    ),
  ];
  for (let i = 0; i < PORTAL_SEGS; i++) {
    const a0 = (Math.PI * i) / PORTAL_SEGS;
    const a1 = (Math.PI * (i + 1)) / PORTAL_SEGS;
    parts.push(
      wedge(
        `vouss-${i}`,
        [
          arcPt(hw, a0, spring),
          arcPt(hw, a1, spring),
          arcPt(hw + PORTAL_B, a1, spring),
          arcPt(hw + PORTAL_B, a0, spring),
        ],
        t,
        i % 2 ? 0.88 : 1,
        scene
      )
    );
  }
  // Stone tympanum filling the lunette — part of the FRAME so it reads as
  // carved stone over rectangular metal doors (bronze read as a void; matching
  // the doors read as one arch-tall door). Radius overruns the opening by
  // 0.015 to bury its rim inside the voussoir ring; the profile drops to
  // 0.835 so its foot tucks behind the leaf's slab top (0.84) with no gap.
  // Recessed inside the frame's depth: back at -0.018 clears the wall, front
  // at -0.004 stays 0.004 behind the leaf slab's front (no coplanar faces).
  const arc: [number, number][] = [];
  for (let i = 0; i <= PORTAL_SEGS; i++) {
    arc.push(arcPt(hw + 0.015, (Math.PI * i) / PORTAL_SEGS, spring));
  }
  arc.push([-(hw + 0.015), spring - 0.015], [hw + 0.015, spring - 0.015]);
  parts.push(prism("tympanum", arc, -0.018, -0.004, true, 0.92, scene));
  const mesh = Mesh.MergeMeshes(parts, true, true)!;
  mesh.name = "proc-portal-frame";
  return { mesh, material: "stone", color: SURROUND };
}

function buildPortalLeaf(scene: Scene) {
  const W = PORTAL_OPENING.w - 0.01;
  const H = PORTAL_OPENING.h - 0.01;
  const T = 0.03;
  // Dark base slab: shows between/around the panels as the deep framing —
  // and its center margin doubles where the two leaves meet, the door seam.
  const parts = [shadedBox("slab", [-T / 2, T / 2], [0, H], [-W / 2, W / 2], 0.78, scene)];
  // One column of 3 tall panels per leaf — 2 wide x 3 tall across the pair,
  // the classic double-door read (a finer grid stopped reading as doors).
  const COLS = 1;
  const ROWS_P = 3;
  const M = 0.014; // panel margin — the seam between leaves is 2 seam-side margins
  const lw = W / 2;
  const pw = (lw - M * (COLS + 1)) / COLS;
  const ph = (H - M * (ROWS_P + 1)) / ROWS_P;
  for (const s of [-1, 1]) {
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS_P; r++) {
        const z0 = s * (M + c * (pw + M));
        parts.push(
          shadedBox(
            `panel-${s}-${c}-${r}`,
            [T / 2, T / 2 + 0.008],
            [M + r * (ph + M), M + r * (ph + M) + ph],
            s > 0 ? [z0, z0 + pw] : [z0 - pw, z0],
            (c + r) % 2 ? 0.93 : 1,
            scene
          )
        );
      }
    }
  }
  // The lunette above is the frame's stone tympanum — the doors stop
  // rectangular at the spring line, like the real fronts.
  const mesh = Mesh.MergeMeshes(parts, true, true)!;
  mesh.name = "proc-portal-leaf";
  // Recenter on x (the panels push the bounds forward) — every piece is
  // x/z-centered so the manifest picks faces by rotationY alone.
  mesh.refreshBoundingInfo();
  mesh.bakeTransformIntoVertices(
    Matrix.Translation(-mesh.getBoundingInfo().boundingBox.center.x, 0, 0)
  );
  return { mesh, material: "bronze", color: BRONZE };
}

/** One arcade bay: half a pier at each end + a fan head, 1x1 in plan face-on.
 * Rows tile by offsetting copies one unit: neighbors complete each other's
 * piers, and the fan runs out to the bay's own rim (top edge AND corners), so
 * the spandrels are solid and tiled bays leave no gaps. */
function buildArchBay(scene: Scene) {
  const D = 0.1; // half-depth
  const PIER = 0.08; // half a pier at each end
  const R = 0.5 - PIER; // inner arc springs off the pier's inner face
  const SPRING = 0.5;
  const parts = [
    shadedBox("pier-l", [-D, D], [0, SPRING], [-0.5, -0.5 + PIER], 1, scene),
    shadedBox("pier-r", [-D, D], [0, SPRING], [0.5 - PIER, 0.5], 1, scene),
    // Impost blocks at the spring line, slightly proud all around; a tiled
    // row's imposts join into a continuous course across each shared pier.
    shadedBox(
      "impost-l",
      [-D - 0.02, D + 0.02],
      [SPRING - 0.05, SPRING],
      [-0.5, -0.5 + PIER + 0.02],
      0.88,
      scene
    ),
    shadedBox(
      "impost-r",
      [-D - 0.02, D + 0.02],
      [SPRING - 0.05, SPRING],
      [0.5 - PIER - 0.02, 0.5],
      0.88,
      scene
    ),
  ];
  // The angle list must include the 45°/135° corners or the fan chamfers them
  // and tiled bays open triangular gaps at the rim.
  const SEGS = 8;
  /** Where the ray at angle a exits the half-square rim above the spring line. */
  const rim = (a: number): [number, number] => {
    const m = 0.5 / Math.max(Math.abs(Math.cos(a)), Math.sin(a));
    return [m * Math.cos(a), SPRING + m * Math.sin(a)];
  };
  for (let i = 0; i < SEGS; i++) {
    const a0 = (Math.PI * i) / SEGS;
    const a1 = (Math.PI * (i + 1)) / SEGS;
    parts.push(
      wedge(
        `fan-${i}`,
        [arcPt(R, a0, SPRING), arcPt(R, a1, SPRING), rim(a1), rim(a0)],
        D,
        i % 2 ? 0.9 : 1,
        scene
      )
    );
  }
  const mesh = Mesh.MergeMeshes(parts, true, true)!;
  mesh.name = "proc-arch-bay";
  return { mesh, material: "stone", color: STONE };
}

type Builder = (scene: Scene, courses: number, rows: number) => {
  mesh: Mesh;
  material: string;
  color: string;
};
const BUILDERS: Record<string, Builder> = {
  block: buildBlock,
  "gable-end": buildGableEnd,
  "roof-gable": buildRoofGable,
  "roof-hip": buildRoofHip,
  "surround-rect": buildSurroundRect,
  "surround-arch": buildSurroundArch,
  shutter: buildShutter,
  "door-frame": buildDoorFrame,
  "door-leaf": buildDoorLeaf,
  "portal-frame": buildPortalFrame,
  "portal-leaf": buildPortalLeaf,
  "arch-bay": buildArchBay,
};

export const PROC_FILES = Object.keys(BUILDERS).map((id) => PROC_PREFIX + id);

/** Build one piece, wrapped to look exactly like a loaded glTF container: a root
 * TransformNode over meshes carrying named PBRMaterials. The id may carry tile
 * counts (`proc:roof-gable@51x7`, see procRoofFile); bare ids build the house
 * roof's density. */
export function buildProceduralContainer(file: string, scene: Scene): AssetContainer {
  const [id, counts] = file.slice(PROC_PREFIX.length).split("@");
  const builder = BUILDERS[id!];
  if (!builder) throw new Error(`unknown procedural piece: ${file}`);
  // Roofs default to the house-tile density; the block defaults to a single
  // storey (its `rows` slot is storey count — `proc:block@1x2` for the townhouse).
  const [courses, rows] = counts
    ? (counts.split("x").map(Number) as [number, number])
    : id === "block"
      ? [1, 1]
      : [COURSES, ROWS];
  const { mesh, material, color } = builder(scene, courses!, rows!);
  // The kit is flat-shaded and these sit beside it. Profile extrusions share
  // vertices between faces, so ComputeNormals averages them into a smooth
  // gradient — split them back out or the piece reads as a washed-out blob.
  mesh.convertToFlatShadedMesh();

  const pbr = new PBRMaterial(material, scene);
  // Overridden by MATERIAL_TINTS at conversion; kept so the piece is still
  // sanely colored if an entry is missing.
  pbr.albedoColor = Color3.FromHexString(color).toLinearSpace();
  pbr.metallic = 0;
  pbr.roughness = 1;
  pbr.backFaceCulling = false;
  mesh.material = pbr;

  const root = new TransformNode(file, scene);
  mesh.parent = root;

  const container = new AssetContainer(scene);
  container.rootNodes.push(root);
  container.transformNodes.push(root);
  container.meshes.push(mesh);
  container.materials.push(pbr);
  container.removeAllFromScene();
  return container;
}
