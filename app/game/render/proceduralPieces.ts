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

function buildBlock(scene: Scene) {
  const mesh = MeshBuilder.CreateBox("proc-block", { size: 1 }, scene);
  // CreateBox centers on the origin; the kit's blocks sit on their base so
  // parts stack by integer y.
  mesh.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  // The kit's ramp, rebuilt: dark at the footing, full at the eave. A box only
  // has verts at y=0 and y=1, so this interpolates across the face for free.
  shadeByPosition(mesh, (_x, y) => STUCCO_AO + (1 - STUCCO_AO) * y);
  // CreateBox's UVs rotate 90° on the ±X faces, which stands a facade
  // texture's stone courses on end on a house's front. Remap by face normal
  // so v is world height on every wall — and the ±X mapping matches
  // proc:gable-end's, so courses continue up the gable.
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
  const [courses, rows] = counts ? counts.split("x").map(Number) : [COURSES, ROWS];
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
