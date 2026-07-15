import { AssetContainer } from "@babylonjs/core/assetContainer";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
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
/** Gable wall sits on the wall plane; the roof's 0.035 verge overhangs it. */
const GABLE_HALF_Z = 0.5;
const GABLE_THICKNESS = 0.03;
/** Keeps the gable's slope edges strictly under the roof core's, which occludes
 * them. Both are straight lines and the gable is already inset at the eave
 * (0.5 < 0.535), so clearing the ridge clears the whole edge. */
const GABLE_CLEARANCE = 0.97;

/** Barrel tiles: courses across the ridge x rows down each slope. Real coppi run
 * about 1:2.5 long-to-wide and a cottage slope takes three or four of them.
 * ponytail: ~3k tris/roof, one thin-instanced geometry for the whole city — raise
 * COURSES only if roofs start reading striped again. */
export const COURSES = 14;
const ROWS = 4;
/** Each row laps the row below it; LAP lifts it clear so the shared barrel
 * surface doesn't z-fight, and reads as the tile's lip. */
const ROW_OVERLAP = 1.25;
const LAP = 0.005;

/** Per-tile shade, multiplied onto the tile base color as vertex colors. Real
 * roofs vary in hue as well as value, so a few of these cool off rather than
 * just darken. All are <= 1: the base color is the PALEST tile, and it has to
 * be, because the scene lights a sun-facing slope at ~1.9x and anything brighter
 * than the kit's palest tile clips red and lands on pale sand. See TILE_BASE.
 *
 * The spread is bounded by the kit's own tiles (#a9583f..#c36e54, a ratio of
 * ~0.8): a wider range than that reads as a patchwork rather than a roof. */
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

/** The kit's palest roof tile, measured off colormap.png. Deliberately the
 * ceiling and not the average: TILE_SHADES only ever darkens, so the average
 * lands near the kit's (#bb684e) while no single tile can blow out. Authoring
 * this by eye is what turned sunlit roofs into pale sand. */
const TILE_BASE = "#c36e54";
/** The kit's darkest roof tile — the other end of the range the average must
 * stay inside. */
export const KIT_TILE_RANGE = { palest: TILE_BASE, darkest: "#a9583f" };

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

/** Extrude a convex profile (ZY plane) along X. Winding is unchecked — every
 * procedural material renders double-sided, as the Kenney meshes do. */
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
  return { mesh, material: "stucco", color: "#f3e4c9" };
}

/** Tiled roof. The core matches ROOF_ENVELOPE exactly and is NOT normalized —
 * see ROOF_TILE_BULGE. */
function buildRoofMesh(scene: Scene): Mesh {
  // Open-ended core: the ends are closed by proc:gable-end at the wall plane,
  // inset behind the verge, so this piece stays pure tile.
  const parts = [
    prism("proc-roof-core", ROOF_PROFILE, -ROOF_HALF_X, ROOF_HALF_X, false, CORE_SHADE, scene),
  ];
  const step = (2 * ROOF_HALF_X) / COURSES;
  const slope = Math.hypot(ROOF_H, ROOF_HALF_Z);
  const tilt = Math.atan2(ROOF_H, ROOF_HALF_Z);
  const rowLen = slope / ROWS;

  const barrel = (name: string, diameter: number, height: number, shade: number[]) => {
    const c = new Color4(shade[0], shade[1], shade[2], 1);
    return MeshBuilder.CreateCylinder(
      name,
      { height, diameter, tessellation: 6, faceColors: [c, c, c] },
      scene
    );
  };

  for (const s of [-1, 1]) {
    for (let i = 0; i < COURSES; i++) {
      for (let j = 0; j < ROWS; j++) {
        const tile = barrel(`proc-coppo-${s}-${i}-${j}`, step, rowLen * ROW_OVERLAP, hashShade(s, i, j));
        // Axis laid in the slope plane, running ridge to eave; half the barrel
        // stands proud of the plane, which is the coppi read.
        tile.rotation.x = -s * (Math.PI / 2 - tilt);
        // Walk down the slope from the ridge, then lift clear of the row below.
        // Each row starts at its own line and laps ROW_OVERLAP past it, over the
        // row beneath — so the top row's head lands exactly on the ridge and the
        // bottom row's foot overhangs the eave.
        const d = j * rowLen + (rowLen * ROW_OVERLAP) / 2;
        const lift = (ROWS - 1 - j) * LAP;
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
  for (let i = 0; i < COURSES; i++) {
    const cap = barrel(`proc-colmo-${i}`, step * 1.2, step * 1.02, hashShade(9, i, 0));
    cap.rotation.z = Math.PI / 2;
    cap.position.set(-ROOF_HALF_X + (i + 0.5) * step, ROOF_H + (ROWS - 1) * LAP, 0);
    cap.bakeCurrentTransformIntoVertices();
    parts.push(cap);
  }

  const mesh = Mesh.MergeMeshes(parts, true, true)!;
  mesh.name = "proc-roof-gable";
  return mesh;
}

function buildRoofGable(scene: Scene) {
  return { mesh: buildRoofMesh(scene), material: "tile", color: TILE_BASE };
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
  return { mesh, material: "stucco", color: "#f3e4c9" };
}

const BUILDERS: Record<string, (scene: Scene) => { mesh: Mesh; material: string; color: string }> = {
  block: buildBlock,
  "gable-end": buildGableEnd,
  "roof-gable": buildRoofGable,
};

export const PROC_FILES = Object.keys(BUILDERS).map((id) => PROC_PREFIX + id);

/** Build one piece, wrapped to look exactly like a loaded glTF container: a root
 * TransformNode over meshes carrying named PBRMaterials. */
export function buildProceduralContainer(file: string, scene: Scene): AssetContainer {
  const builder = BUILDERS[file.slice(PROC_PREFIX.length)];
  if (!builder) throw new Error(`unknown procedural piece: ${file}`);
  const { mesh, material, color } = builder(scene);
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
