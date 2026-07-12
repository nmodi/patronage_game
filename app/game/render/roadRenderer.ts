import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { CELL_SIZE } from "~/game/constants";
import { gridToWorld, type Tile, type TileMap } from "~/game/grid";
import { getRoadMaterial } from "./paths";

type RoadBatch = { mesh: Mesh; tiles: Map<string, Tile>; dirty: boolean };

/** Thin-instance renderer for paved roads, bridge decks, and bridge parapets. */
export function createRoadRenderer(scene: Scene) {
  function createRoadBatch(name: string): RoadBatch {
    const mesh = MeshBuilder.CreateGround(name, { width: CELL_SIZE, height: CELL_SIZE }, scene);
    mesh.material = getRoadMaterial(scene);
    mesh.isPickable = false;
    mesh.setEnabled(false);
    return { mesh, tiles: new Map(), dirty: false };
  }

  const pavedRoads = createRoadBatch("paved-road-batch");
  const bridges = createRoadBatch("bridge-deck-batch");
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
  parapets.isPickable = false;
  parapets.setEnabled(false);

  function update(key: string, previous?: Tile, next?: Tile) {
    if (previous?.type === "road" && previous.buildingId !== "dirt_path") {
      const batch = previous.buildingId === "bridge" ? bridges : pavedRoads;
      if (batch.tiles.delete(key)) batch.dirty = true;
    }
    if (next?.type === "road" && next.buildingId !== "dirt_path") {
      const batch = next.buildingId === "bridge" ? bridges : pavedRoads;
      batch.tiles.set(key, next);
      batch.dirty = true;
    }
  }

  function flushRoadBatch(batch: RoadBatch) {
    if (!batch.dirty) return;
    if (batch.tiles.size === 0) {
      batch.mesh.thinInstanceSetBuffer("matrix", null);
      batch.mesh.setEnabled(false);
      batch.dirty = false;
      return;
    }
    const matrices = new Float32Array(batch.tiles.size * 16);
    const matrix = Matrix.Identity();
    let offset = 0;
    for (const tile of batch.tiles.values()) {
      const { x, z } = gridToWorld(tile.position.x, tile.position.y);
      Matrix.TranslationToRef(x, 0.01, z, matrix);
      matrix.copyToArray(matrices, offset);
      offset += 16;
    }
    batch.mesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
    batch.mesh.setEnabled(true);
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
    let offset = 0;
    // Bridge sides stay open where a road or civic footprint continues the path.
    const openAt = (x: number, y: number) => {
      const type = tiles[`${x},${y}`]?.type;
      return type === "road" || type === "city";
    };

    for (const tile of bridges.tiles.values()) {
      const { x: gx, y: gy } = tile.position;
      const { x, z } = gridToWorld(gx, gy);
      Matrix.TranslationToRef(x, bridgeDeckY, z, matrix);
      matrix.copyToArray(deckMatrices, offset);
      offset += 16;

      const railY = bridgeDeckY + parapetHeight / 2;
      const inset = CELL_SIZE / 2 - 0.035;
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
    flushRoadBatch(pavedRoads);
    if (bridges.tiles.size > 0) bridges.dirty = true;
    flushBridges(tiles);
  }

  function dispose() {
    pavedRoads.mesh.dispose();
    bridges.mesh.dispose();
    parapets.dispose();
    parapetMaterial.dispose();
  }

  return { update, flush, dispose };
}
