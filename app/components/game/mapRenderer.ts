import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { BUILDING_METADATA_BY_ID, type BuildingId } from "~/game/buildings";
import type { BuildingMetadata, BuildingType } from "~/game/types";
import type { Tile } from "~/stores/useGameStore";

const GRID_SIZE = 20;
const CELL_SIZE = 1;
const GRID_ALPHA_IDLE = 0.1;
const GRID_ALPHA_PLACING = 0.8;
const GRID_COLOR_IDLE = "#ffffff";
const GRID_COLOR_PLACING = "#ffffff";

function gridToWorld(gridX: number, gridY: number, metadata?: BuildingMetadata) {
  const footprint = metadata?.footprint ?? { width: 1, depth: 1 };
  const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
  const xOffset = ((footprint.width - 1) * CELL_SIZE) / 2;
  const zOffset = ((footprint.depth - 1) * CELL_SIZE) / 2;
  const x = gridX * CELL_SIZE - halfGrid + CELL_SIZE / 2 + xOffset;
  const z = gridY * CELL_SIZE - halfGrid + CELL_SIZE / 2 + zOffset;
  const height = metadata?.size.height ?? 0.2;
  const y = metadata?.type === "road" ? 0.001 : height / 2;
  return { x, y, z };
}

// Grid lines only need building once; drawn directly instead of pulling in @babylonjs/materials.
function createGridLines(scene: Scene) {
  const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
  const lines: Vector3[][] = [];
  for (let i = 0; i <= GRID_SIZE; i += 1) {
    const p = -halfGrid + i * CELL_SIZE;
    lines.push([new Vector3(-halfGrid, 0.01, p), new Vector3(halfGrid, 0.01, p)]);
    lines.push([new Vector3(p, 0.01, -halfGrid), new Vector3(p, 0.01, halfGrid)]);
  }
  const grid = MeshBuilder.CreateLineSystem("grid", { lines, useVertexAlpha: true }, scene);
  grid.color = Color3.FromHexString(GRID_COLOR_IDLE);
  grid.alpha = GRID_ALPHA_IDLE;
  grid.isPickable = false;
  return grid;
}

function desaturate(color: Color3) {
  const luminance = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
  const gray = new Color3(luminance, luminance, luminance);
  return Color3.Lerp(color, gray, 0.75);
}

type TileMeshEntry = {
  mesh: Mesh;
  marker: Mesh | null;
  buildingId: BuildingId;
};

export function createTileRenderer(scene: Scene, shadowGenerator: ShadowGenerator) {
  const materialCache = new Map<string, StandardMaterial>();
  const active = new Map<string, TileMeshEntry>();

  const gridLines = createGridLines(scene);

  function getMaterial(color: string, type: BuildingType, inactive: boolean) {
    const key = `${color}:${type}:${inactive ? "inactive" : "active"}`;
    let mat = materialCache.get(key);
    if (mat) return mat;
    mat = new StandardMaterial(`mat-${key}`, scene);
    const baseColor = Color3.FromHexString(color);
    mat.diffuseColor = inactive ? desaturate(baseColor) : baseColor;
    mat.specularColor = type === "road" ? Color3.Black() : new Color3(0.2, 0.2, 0.2);
    materialCache.set(key, mat);
    return mat;
  }

  function createMesh(tile: Tile, metadata: BuildingMetadata) {
    const { width, height, depth } = metadata.size;
    const mesh =
      metadata.type === "road"
        ? MeshBuilder.CreateGround(
            `tile-${tile.buildingId}`,
            { width: width * CELL_SIZE, height: depth * CELL_SIZE },
            scene
          )
        : MeshBuilder.CreateBox(
            `tile-${tile.buildingId}`,
            { width: width * CELL_SIZE, height, depth: depth * CELL_SIZE },
            scene
          );
    mesh.material = getMaterial(metadata.color, metadata.type, !tile.isActive);
    mesh.receiveShadows = true;
    if (metadata.type !== "road") shadowGenerator.addShadowCaster(mesh);
    const { x, y, z } = gridToWorld(tile.position.x, tile.position.y, metadata);
    mesh.position.set(x, y, z);
    return mesh;
  }

  function disposeEntry(entry: TileMeshEntry) {
    entry.marker?.dispose();
    entry.mesh.dispose();
  }

  function sync(tiles: Record<string, Tile>) {
    const origins = new Map<string, Tile>();
    for (const tile of Object.values(tiles)) {
      if (tile.isOrigin) origins.set(`${tile.position.x},${tile.position.y}`, tile);
    }

    for (const [key, entry] of active) {
      if (!origins.has(key)) {
        disposeEntry(entry);
        active.delete(key);
      }
    }

    for (const [key, tile] of origins) {
      const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
      if (!metadata) continue;

      let entry = active.get(key);
      if (!entry || entry.buildingId !== tile.buildingId) {
        if (entry) disposeEntry(entry);
        entry = { mesh: createMesh(tile, metadata), marker: null, buildingId: tile.buildingId };
        active.set(key, entry);
      } else {
        entry.mesh.material = getMaterial(metadata.color, metadata.type, !tile.isActive);
      }

      const needsMarker = !tile.isActive && metadata.type !== "road";
      if (needsMarker && !entry.marker) {
        const marker = MeshBuilder.CreatePlane(`marker-${key}`, { width: 0.35, height: 0.18 }, scene);
        const markerMat = new StandardMaterial(`marker-mat-${key}`, scene);
        markerMat.diffuseColor = Color3.FromHexString("#d97706");
        markerMat.emissiveColor = Color3.FromHexString("#d97706");
        markerMat.alpha = 0.9;
        marker.material = markerMat;
        marker.isPickable = false;
        marker.parent = entry.mesh;
        marker.position.set(0, 0.5, 0);
        entry.marker = marker;
      } else if (!needsMarker && entry.marker) {
        entry.marker.dispose();
        entry.marker = null;
      }
    }
  }

  function setGridVisible(placing: boolean) {
    gridLines.alpha = placing ? GRID_ALPHA_PLACING : GRID_ALPHA_IDLE;
    gridLines.color = Color3.FromHexString(placing ? GRID_COLOR_PLACING : GRID_COLOR_IDLE);
  }

  function dispose() {
    for (const entry of active.values()) disposeEntry(entry);
    active.clear();
    for (const mat of materialCache.values()) mat.dispose();
    materialCache.clear();
    gridLines.dispose();
  }

  return { sync, dispose, setGridVisible };
}
