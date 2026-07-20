import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { CELL_SIZE } from "~/game/constants";
import { gridToWorld, type Tile, type TileMap } from "~/game/grid";
import { ROAD_DIAG_NE, ROAD_DIAG_NW } from "~/game/roadStretch";
import {
  getApronMaterial,
  getDirtPadMaterial,
  getDirtRibbonMaterial,
  getPavedRibbonMaterial,
  getRoadMaterial,
} from "./paths";
import { prepareThinInstanceHost } from "./thinInstanceHost";

type RoadBatch = { mesh: Mesh; tiles: Map<string, Tile>; dirty: boolean };

/** Thin-instance renderer for paved roads, bridge decks, and bridge parapets. */
export function createRoadRenderer(scene: Scene) {
  function createRoadBatch(name: string): RoadBatch {
    const mesh = MeshBuilder.CreateGround(name, { width: CELL_SIZE, height: CELL_SIZE }, scene);
    mesh.material = getRoadMaterial(scene);
    prepareThinInstanceHost(mesh);
    mesh.setEnabled(false);
    return { mesh, tiles: new Map(), dirty: false };
  }

  const pavedRoads = createRoadBatch("paved-road-batch");
  const pavedRibbons = createRoadBatch("paved-ribbon-batch");
  pavedRibbons.mesh.material = getPavedRibbonMaterial(scene);
  const dirtRibbons = createRoadBatch("dirt-ribbon-batch");
  dirtRibbons.mesh.material = getDirtRibbonMaterial(scene);
  const bridges = createRoadBatch("bridge-deck-batch");

  // Junction pads: where a diagonal ribbon meets a cardinal street, the ribbon
  // cell renders as mottled stone (or packed earth for dirt lanes) instead of
  // 45° slabs overlapping straight ones. Two shapes (see junctionKind): a
  // convex hexagonal plate — the 45° ribbon strip through the cell, with
  // perpendicular end cuts exactly flush with the neighbor ribbons' brick
  // ends, widened to take in the two cell corners the strip misses, which
  // cover a crossing street's bare corners — for cells a street passes
  // through, and a plain strip (the ribbon quad's own transform) everywhere
  // else, so lane-side junctions keep the lane's silhouette. The hexagon is
  // modeled along the NE diagonal; NW instances take a 90° yaw.
  type RoadPads = { hex: Mesh; strip: Mesh };
  function createPadHexHost(name: string, material: StandardMaterial): Mesh {
    const c = CELL_SIZE / 2;
    const e = c * (Math.SQRT2 / 2);
    // Counter-clockwise in the xz plane (CreateGround's visible-from-above
    // winding): strip end corners at ±(c±e), the two kept cell corners between.
    const pts: Array<[number, number]> = [
      [c - e, c + e],
      [-c, c],
      [-(c + e), -(c - e)],
      [e - c, -(c + e)],
      [c, -c],
      [c + e, c - e],
    ];
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    for (const [px, pz] of pts) {
      positions.push(px, 0, pz);
      normals.push(0, 1, 0);
      uvs.push((px + c + e) / (2 * (c + e)), (pz + c + e) / (2 * (c + e)));
    }
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5];
    data.applyToMesh(mesh);
    mesh.material = material;
    prepareThinInstanceHost(mesh);
    mesh.setEnabled(false);
    return mesh;
  }
  function createPadHosts(name: string, material: StandardMaterial): RoadPads {
    const strip = MeshBuilder.CreateGround(
      `${name}-strip`,
      { width: CELL_SIZE, height: CELL_SIZE },
      scene
    );
    strip.material = material;
    prepareThinInstanceHost(strip);
    strip.setEnabled(false);
    return { hex: createPadHexHost(`${name}-hex`, material), strip };
  }
  const stonePads = createPadHosts("junction-pad-batch", getApronMaterial(1, 1, scene));
  const dirtPads = createPadHosts("dirt-junction-pad-batch", getDirtPadMaterial(scene));
  const bridgeDeckY = 0.025;
  const parapetHeight = 0.09;
  const parapetMaterial = new StandardMaterial("bridge-parapet-mat", scene);
  parapetMaterial.diffuseColor = Color3.FromHexString("#cbbfa3");
  parapetMaterial.specularColor = Color3.Black();
  const parapets = MeshBuilder.CreateBox(
    "bridge-parapet-batch",
    { width: CELL_SIZE, height: parapetHeight, depth: 0.05 },
    scene
  );
  parapets.material = parapetMaterial;
  prepareThinInstanceHost(parapets);
  parapets.setEnabled(false);

  // Cardinal dirt (rotation null) has no thin-instance batch — it renders through
  // the raster overlay. Diagonal dirt can't (the raster is grid-axis-aligned), so
  // it gets its own ribbon batch; paved diagonals likewise split off so their
  // ribbon texture can carry √2-corrected slab courses.
  const batchFor = (t: Tile): RoadBatch | null =>
    t.buildingId === "dirt_path"
      ? t.rotation != null
        ? dirtRibbons
        : null
      : t.buildingId === "bridge"
        ? bridges
        : t.rotation != null
          ? pavedRibbons
          : pavedRoads;

  function update(key: string, previous?: Tile, next?: Tile) {
    if (previous?.type === "road") {
      const batch = batchFor(previous);
      if (batch?.tiles.delete(key)) batch.dirty = true;
    }
    if (next?.type === "road") {
      const batch = batchFor(next);
      if (batch) {
        batch.tiles.set(key, next);
        batch.dirty = true;
      }
    }
    // Junction pads depend on neighbors outside a ribbon's own batch (a cardinal
    // dirt path can flip a paved ribbon cell into a junction and vice versa), so
    // any road edit re-flushes both ribbon batches.
    if (previous?.type === "road" || next?.type === "road") {
      pavedRibbons.dirty = true;
      dirtRibbons.dirty = true;
    }
  }

  const opposite = (r: number | undefined) =>
    r === ROAD_DIAG_NE ? ROAD_DIAG_NW : r === ROAD_DIAG_NW ? ROAD_DIAG_NE : undefined;

  // Classify a diagonal ribbon cell's junction state. "hex" when a cardinal
  // street passes THROUGH the cell (road 4-neighbors on opposite sides of one
  // axis — the cell must cover the street's full width, bare corners included).
  // "strip" for every other contact — a road on one side (terminal mouth, a
  // street-end elbow), or an opposite-diagonal neighbor at either parity
  // (bowties) — where the pad keeps the lane's own ribbon silhouette instead
  // of paving the whole cell. Same-rotation lane-mates and staircase steps
  // match neither, so no false pad.
  function junctionKind(tiles: TileMap, tile: Tile): "none" | "strip" | "hex" {
    const { x, y } = tile.position;
    const road = (dx: number, dy: number) => {
      const n = tiles[`${x + dx},${y + dy}`];
      return n?.type === "road" && n.rotation == null;
    };
    const e = road(1, 0);
    const w = road(-1, 0);
    const n = road(0, 1);
    const s = road(0, -1);
    if ((e && w) || (n && s)) return "hex";
    if (e || w || n || s) return "strip";
    const opp = opposite(tile.rotation);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const t = tiles[`${x + dx},${y + dy}`];
      if (t?.type === "road" && t.rotation === opp) return "strip";
    }
    return "none";
  }

  // Pads sit above every street surface (bricks and ribbon overhangs terminate
  // under their edges). Same-line pads abut exactly, but lane-mate and bowtie
  // pads overlap, so a 3×3 grid parity staggers y — injective on any
  // neighborhood that can overlap — instead of z-fighting at one height.
  const padY = (gx: number, gy: number) => 0.0125 + ((gx % 3) + (gy % 3) * 3) * 0.0002;
  const padQuatNE = Quaternion.Identity();
  const padQuatNW = Quaternion.RotationYawPitchRoll(Math.PI / 2, 0, 0);
  const padScale = Vector3.One();

  function setInstances(mesh: Mesh, list: number[]) {
    if (list.length > 0) {
      mesh.thinInstanceSetBuffer("matrix", new Float32Array(list), 16, true);
      mesh.setEnabled(true);
    } else {
      mesh.thinInstanceSetBuffer("matrix", null);
      mesh.setEnabled(false);
    }
  }

  function flushRoadBatch(batch: RoadBatch, diagY: number, tiles: TileMap, pads: RoadPads | null) {
    if (!batch.dirty) return;
    if (batch.tiles.size === 0) {
      batch.mesh.thinInstanceSetBuffer("matrix", null);
      batch.mesh.setEnabled(false);
      if (pads) {
        setInstances(pads.hex, []);
        setInstances(pads.strip, []);
      }
      batch.dirty = false;
      return;
    }
    // Pad counts vary, so accumulate into lists rather than pre-sized arrays.
    const matrices: number[] = [];
    const hexMatrices: number[] = [];
    const stripMatrices: number[] = [];
    const scratch: number[] = new Array(16);
    const matrix = Matrix.Identity();
    // Diagonal ribbon pieces: consecutive staircase centers are √2·CELL_SIZE
    // apart, so a √2-long quad abuts exactly; diagY (above the cardinal 0.01)
    // keeps junction/cross-row overlaps from coplanar shimmer.
    const diagScale = new Vector3(Math.SQRT2, 1, 1);
    const diagQuat = new Quaternion();
    const diagPos = new Vector3();
    for (const tile of batch.tiles.values()) {
      const { x, z } = gridToWorld(tile.position.x, tile.position.y);
      if (tile.rotation === ROAD_DIAG_NE || tile.rotation === ROAD_DIAG_NW) {
        // NE = grid dir (1,1) → world (+x,+z): θ = −π/4 under the codebase yaw
        // convention (+X → (cos θ, 0, −sin θ)); NW mirrors to +π/4.
        const theta = tile.rotation === ROAD_DIAG_NE ? -Math.PI / 4 : Math.PI / 4;
        Quaternion.RotationYawPitchRollToRef(theta, 0, 0, diagQuat);
        const kind = pads ? junctionKind(tiles, tile) : "none";
        if (kind !== "none") {
          diagPos.set(x, padY(tile.position.x, tile.position.y), z);
          if (kind === "hex") {
            const quat = tile.rotation === ROAD_DIAG_NE ? padQuatNE : padQuatNW;
            Matrix.ComposeToRef(padScale, quat, diagPos, matrix);
            matrix.copyToArray(scratch, 0);
            hexMatrices.push(...scratch);
          } else {
            // The strip pad: the suppressed ribbon's own transform, in mottle —
            // hugs the lane silhouette, ends flush with the neighbor bricks.
            Matrix.ComposeToRef(diagScale, diagQuat, diagPos, matrix);
            matrix.copyToArray(scratch, 0);
            stripMatrices.push(...scratch);
          }
          continue;
        }
        diagPos.set(x, diagY, z);
        Matrix.ComposeToRef(diagScale, diagQuat, diagPos, matrix);
        matrix.copyToArray(scratch, 0);
        matrices.push(...scratch);
      } else {
        Matrix.TranslationToRef(x, 0.01, z, matrix);
        matrix.copyToArray(scratch, 0);
        matrices.push(...scratch);
      }
    }
    setInstances(batch.mesh, matrices);
    if (pads) {
      setInstances(pads.hex, hexMatrices);
      setInstances(pads.strip, stripMatrices);
    }
    batch.dirty = false;
  }

  function flushBridges(tiles: TileMap) {
    if (!bridges.dirty) return;
    if (bridges.tiles.size === 0) {
      bridges.mesh.thinInstanceSetBuffer("matrix", null);
      bridges.mesh.setEnabled(false);
      parapets.thinInstanceSetBuffer("matrix", null);
      parapets.setEnabled(false);
      bridges.dirty = false;
      return;
    }

    const deckMatrices = new Float32Array(bridges.tiles.size * 16);
    const railMatrices: number[] = [];
    const matrix = Matrix.Identity();
    const rail: number[] = new Array(16);
    const diagScale = new Vector3(Math.SQRT2, 1, 1);
    const diagQuat = new Quaternion();
    const diagPos = new Vector3();
    let offset = 0;
    // Bridge sides stay open where a road or civic footprint continues the path.
    const openAt = (x: number, y: number) => {
      const type = tiles[`${x},${y}`]?.type;
      return type === "road" || type === "city";
    };

    for (const tile of bridges.tiles.values()) {
      const { x: gx, y: gy } = tile.position;
      const { x, z } = gridToWorld(gx, gy);
      const railY = bridgeDeckY + parapetHeight / 2;
      const inset = CELL_SIZE / 2 - 0.035;

      if (tile.rotation === ROAD_DIAG_NE || tile.rotation === ROAD_DIAG_NW) {
        const theta = tile.rotation === ROAD_DIAG_NE ? -Math.PI / 4 : Math.PI / 4;
        Quaternion.RotationYawPitchRollToRef(theta, 0, 0, diagQuat);
        // +0.0015 above the cardinal deck: the √2 quad overhangs its cell
        // (~0.104 wu) and would coplanar-overlap a cardinal deck it joins.
        diagPos.set(x, bridgeDeckY + 0.0015, z);
        Matrix.ComposeToRef(diagScale, diagQuat, diagPos, matrix);
        matrix.copyToArray(deckMatrices, offset);
        offset += 16;
        // Rails run along the ribbon's long (local ±z) sides; world side normal
        // for s = ±1 is s·(sinθ, 0, cosθ). The √2 x-scale abuts same-lane rails
        // like the deck. Suppress a multi-lane bridge's interior rail: lanes
        // offset +x (roadStretch), so skip side s where a same-rotation bridge
        // cell sits at gx + sign(s·sinθ).
        // ponytail: no end-cap rails at 45° — diagonal ends read fine bare, and
        // openAt's cardinal offsets don't map onto a 45° dead end.
        const sin = Math.sin(theta);
        const cos = Math.cos(theta);
        for (const s of [-1, 1]) {
          const neighbor = tiles[`${gx + Math.sign(s * sin)},${gy}`];
          if (neighbor?.buildingId === "bridge" && neighbor.rotation === tile.rotation) continue;
          diagPos.set(x + s * sin * inset, railY, z + s * cos * inset);
          Matrix.ComposeToRef(diagScale, diagQuat, diagPos, matrix);
          matrix.copyToArray(rail, 0);
          railMatrices.push(...rail);
        }
        continue;
      }

      Matrix.TranslationToRef(x, bridgeDeckY, z, matrix);
      matrix.copyToArray(deckMatrices, offset);
      offset += 16;

      if (!openAt(gx, gy - 1)) {
        Matrix.TranslationToRef(x, railY, z - inset, matrix);
        matrix.copyToArray(rail, 0);
        railMatrices.push(...rail);
      }
      if (!openAt(gx, gy + 1)) {
        Matrix.TranslationToRef(x, railY, z + inset, matrix);
        matrix.copyToArray(rail, 0);
        railMatrices.push(...rail);
      }
      for (const side of [-1, 1]) {
        if (openAt(gx + side, gy)) continue;
        Matrix.RotationYToRef(Math.PI / 2, matrix);
        matrix.setTranslationFromFloats(x + side * inset, railY, z);
        matrix.copyToArray(rail, 0);
        railMatrices.push(...rail);
      }
    }

    bridges.mesh.thinInstanceSetBuffer("matrix", deckMatrices, 16, true);
    bridges.mesh.setEnabled(true);
    if (railMatrices.length > 0) {
      parapets.thinInstanceSetBuffer("matrix", new Float32Array(railMatrices), 16, true);
      parapets.setEnabled(true);
    } else {
      parapets.thinInstanceSetBuffer("matrix", null);
      parapets.setEnabled(false);
    }
    bridges.dirty = false;
  }

  /** Flush after any map edit because adjacent civic/road cells affect bridge rails. */
  function flush(tiles: TileMap) {
    flushRoadBatch(pavedRoads, 0.0115, tiles, null);
    flushRoadBatch(pavedRibbons, 0.0115, tiles, stonePads);
    flushRoadBatch(dirtRibbons, 0.009, tiles, dirtPads);
    if (bridges.tiles.size > 0) bridges.dirty = true;
    flushBridges(tiles);
  }

  function dispose() {
    pavedRoads.mesh.dispose();
    pavedRibbons.mesh.dispose();
    dirtRibbons.mesh.dispose();
    stonePads.hex.dispose();
    stonePads.strip.dispose();
    dirtPads.hex.dispose();
    dirtPads.strip.dispose();
    bridges.mesh.dispose();
    parapets.dispose();
    parapetMaterial.dispose();
  }

  return { update, flush, dispose };
}
