import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

import { CELL_SIZE } from "~/game/constants";
import { segmentDir, segmentLength, segmentNormal, type RoadSegment } from "~/game/roadSegment";
import { getDirtRibbonMaterial, getRoadMaterial } from "./paths";

// Freeform-road renderer (design doc, Roads → non-grid placement). Draws each
// RoadSegment as a real width-w ribbon at its true angle — the smooth
// continuous geometry the cell-quad renderer (roadRenderer.ts) can't express
// off the 8 octants. It reads only `roads`, never the tile map, so it never
// double-draws with the cell renderer (legacy grid roads stay on that path).
// One merged mesh per material bucket, rebuilt on any road change (cheap at the
// cozy scale — tens of segments); UVs run u along length, v across width so the
// paving slabs match the plazas/streets (STONES_PER_CELL, paths.ts).

type Bucket = "paved" | "dirt" | "bridge";

// Deck heights: just above the ground apron/road decals; bridges ride higher.
const DECK_Y: Record<Bucket, number> = { paved: 0.013, dirt: 0.012, bridge: 0.026 };
const PARAPET_HEIGHT = 0.09;
const PARAPET_INSET = 0.035;

function bucketOf(id: string): Bucket {
  if (id === "dirt_path") return "dirt";
  if (id === "bridge") return "bridge";
  return "paved";
}

/** Accumulates triangles into flat arrays for one VertexData.applyToMesh. */
class MeshBuilder2 {
  positions: number[] = [];
  indices: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];

  /** A flat quad (p0→p1→p2→p3, CCW seen from +y) with per-corner UVs. */
  quad(
    p: [number, number, number][],
    uv: [number, number][],
    normal: [number, number, number] = [0, 1, 0]
  ) {
    const base = this.positions.length / 3;
    for (let i = 0; i < 4; i += 1) {
      this.positions.push(p[i][0], p[i][1], p[i][2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.uvs.push(uv[i][0], uv[i][1]);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  applyTo(mesh: Mesh) {
    const data = new VertexData();
    data.positions = this.positions;
    data.indices = this.indices;
    data.normals = this.normals;
    data.uvs = this.uvs;
    data.applyToMesh(mesh, true);
  }

  get empty() {
    return this.positions.length === 0;
  }
}

/** Push one road ribbon (deck quad) into a builder. Square end-caps: each end is
 * extended by half-width so butt joints at a shared node overlap and leave no
 * gap at any angle. */
function pushRibbon(b: MeshBuilder2, seg: RoadSegment, y: number) {
  const dir = segmentDir(seg);
  const n = segmentNormal(seg);
  const hw = seg.width / 2;
  const len = segmentLength(seg) + seg.width; // extended by hw at each end
  const ax = seg.a.x - dir.x * hw;
  const az = seg.a.z - dir.z * hw;
  const bx = seg.b.x + dir.x * hw;
  const bz = seg.b.z + dir.z * hw;
  const uLen = len / CELL_SIZE;
  const vW = seg.width / CELL_SIZE;
  b.quad(
    [
      [ax + n.x * hw, y, az + n.z * hw],
      [bx + n.x * hw, y, bz + n.z * hw],
      [bx - n.x * hw, y, bz - n.z * hw],
      [ax - n.x * hw, y, az - n.z * hw],
    ],
    [
      [0, 0],
      [uLen, 0],
      [uLen, vW],
      [0, vW],
    ]
  );
}

/** Two vertical parapet rails along a bridge segment's outer edges. */
function pushParapets(b: MeshBuilder2, seg: RoadSegment, deckY: number) {
  const dir = segmentDir(seg);
  const n = segmentNormal(seg);
  const hw = seg.width / 2;
  const off = hw - PARAPET_INSET;
  const top = deckY + PARAPET_HEIGHT;
  const ax = seg.a.x - dir.x * hw;
  const az = seg.a.z - dir.z * hw;
  const bx = seg.b.x + dir.x * hw;
  const bz = seg.b.z + dir.z * hw;
  const uLen = (segmentLength(seg) + seg.width) / CELL_SIZE;
  for (const s of [-1, 1]) {
    const ox = n.x * off * s;
    const oz = n.z * off * s;
    // Vertical strip; a face normal isn't critical at this scale — use +y-ish.
    b.quad(
      [
        [ax + ox, deckY, az + oz],
        [bx + ox, deckY, bz + oz],
        [bx + ox, top, bz + oz],
        [ax + ox, top, az + oz],
      ],
      [
        [0, 0],
        [uLen, 0],
        [uLen, 1],
        [0, 1],
      ],
      [n.x * s, 0, n.z * s]
    );
  }
}

/** Rebuild a single-segment ribbon into `mesh` — the placement ghost preview.
 * Rides a hair above committed decks so it reads over an existing road. */
export function applySegmentGeometry(mesh: Mesh, seg: RoadSegment, y = 0.035) {
  const b = new MeshBuilder2();
  if (segmentLength(seg) >= 1e-6) pushRibbon(b, seg, y);
  b.applyTo(mesh);
}

export function createRoadRibbonRenderer(scene: Scene) {
  const paved = new Mesh("road-ribbon-paved", scene);
  paved.material = getRoadMaterial(scene);
  const dirt = new Mesh("road-ribbon-dirt", scene);
  dirt.material = getDirtRibbonMaterial(scene);
  const bridge = new Mesh("road-ribbon-bridge", scene);
  bridge.material = getRoadMaterial(scene);
  const parapets = new Mesh("road-ribbon-parapets", scene);
  const parapetMat = new StandardMaterial("road-ribbon-parapet-mat", scene);
  parapetMat.diffuseColor = Color3.FromHexString("#cbbfa3");
  parapetMat.specularColor = Color3.Black();
  parapetMat.backFaceCulling = false;
  parapets.material = parapetMat;

  const meshes = { paved, dirt, bridge, parapets };
  for (const m of Object.values(meshes)) m.isPickable = false;

  function update(roads: RoadSegment[]) {
    const builders: Record<Bucket, MeshBuilder2> = {
      paved: new MeshBuilder2(),
      dirt: new MeshBuilder2(),
      bridge: new MeshBuilder2(),
    };
    const parapetBuilder = new MeshBuilder2();

    for (const seg of roads) {
      if (segmentLength(seg) < 1e-6) continue;
      const bucket = bucketOf(seg.buildingId);
      pushRibbon(builders[bucket], seg, DECK_Y[bucket]);
      if (bucket === "bridge") pushParapets(parapetBuilder, seg, DECK_Y.bridge);
    }

    const apply = (mesh: Mesh, b: MeshBuilder2) => {
      if (b.empty) {
        mesh.setEnabled(false);
        return;
      }
      b.applyTo(mesh);
      mesh.setEnabled(true);
    };
    apply(paved, builders.paved);
    apply(dirt, builders.dirt);
    apply(bridge, builders.bridge);
    apply(parapets, parapetBuilder);
  }

  function dispose() {
    for (const m of Object.values(meshes)) m.dispose();
    parapetMat.dispose();
  }

  return { update, dispose };
}
