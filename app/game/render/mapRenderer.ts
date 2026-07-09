import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { BUILDING_METADATA_BY_ID, rotatedFootprint, type BuildingId } from "~/game/buildings";
import { CELL_SIZE, GRID_SIZE } from "~/game/constants";
import type { BuildingMetadata, BuildingType } from "~/game/types";
import type { Tile } from "~/stores/useGameStore";
import {
  hasExtensions,
  hasModel,
  instantiateBuilding,
  setBuildingActive,
  type BuildingModel,
} from "./assetLibrary";
import { getApronMaterial, getDirtRoadMaterial, getRoadMaterial } from "./paths";
import { createSmokePlume, type SmokePlume } from "./smoke";

const GRID_ALPHA_IDLE = 0;
const GRID_ALPHA_PLACING = 0.8;
const GRID_COLOR = "#ffffff";

export function gridToWorld(
  gridX: number,
  gridY: number,
  metadata?: BuildingMetadata,
  rotation?: number
) {
  const footprint = metadata ? rotatedFootprint(metadata, rotation) : { width: 1, depth: 1 };
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
  grid.color = Color3.FromHexString(GRID_COLOR);
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
  box: Mesh | null;
  model: BuildingModel | null;
  apron: Mesh | null;
  marker: Mesh | null;
  smoke: SmokePlume | null;
  buildingId: BuildingId;
  isActive: boolean;
  /** Neighbor-extension signature ("" when not extendable); change → rebuild. */
  extendKey: string;
};

// Tile types that count as a wall to visually connect to (not roads/decor).
const SOLID_TYPES = new Set<BuildingType>(["city", "residential", "artist", "service", "materials"]);

/**
 * Which ends of the model's local X axis (its long axis) abut a solid
 * building. Local +X faces grid [+x, −y, −x, +y] for quarter rotations 0-3.
 */
function computeExtend(tile: Tile, metadata: BuildingMetadata, tiles: Record<string, Tile>) {
  const { width, depth } = rotatedFootprint(metadata, tile.rotation);
  const { x, y } = tile.position;
  const solidAt = (cx: number, cy: number) => {
    const type = tiles[`${cx},${cy}`]?.type;
    return type != null && SOLID_TYPES.has(type);
  };
  // The long axis runs along grid x when the rotation is even (local X unrotated
  // or flipped), along grid y when odd.
  const odd = ((tile.rotation ?? 0) % 4 + 4) % 4 % 2 === 1;
  let low = false; // grid-min side of the long axis
  let high = false;
  if (!odd) {
    for (let dy = 0; dy < depth; dy += 1) {
      low ||= solidAt(x - 1, y + dy);
      high ||= solidAt(x + width, y + dy);
    }
  } else {
    for (let dx = 0; dx < width; dx += 1) {
      low ||= solidAt(x + dx, y - 1);
      high ||= solidAt(x + dx, y + depth);
    }
  }
  // Map grid sides onto local ±X: local +X faces +x, −y, −x, +y for r=0..3.
  const r = (((tile.rotation ?? 0) % 4) + 4) % 4;
  const posXSide = [high, low, low, high][r]; // +x / −y / −x / +y
  const negXSide = [low, high, high, low][r];
  return { negX: negXSide, posX: posXSide };
}

export function createTileRenderer(scene: Scene, shadowGenerator: ShadowGenerator) {
  const materialCache = new Map<string, StandardMaterial>();
  const active = new Map<string, TileMeshEntry>();

  const gridLines = createGridLines(scene);

  // Shared by every inactive-building marker — they're all identical amber diamonds.
  const markerMaterial = new StandardMaterial("marker-mat", scene);
  markerMaterial.diffuseColor = Color3.FromHexString("#d97706");
  markerMaterial.emissiveColor = Color3.FromHexString("#d97706");
  markerMaterial.alpha = 0.9;

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

  function createBoxMesh(tile: Tile, metadata: BuildingMetadata) {
    const { width, height, depth } = metadata.size;
    // size is in world units, not cells — don't scale by CELL_SIZE.
    const mesh = MeshBuilder.CreateBox(
      `tile-${tile.buildingId}`,
      { width, height, depth },
      scene
    );
    mesh.material = getMaterial(metadata.color, metadata.type, !tile.isActive);
    mesh.receiveShadows = true;
    shadowGenerator.addShadowCaster(mesh);
    const { x, y, z } = gridToWorld(tile.position.x, tile.position.y, metadata, tile.rotation);
    mesh.position.set(x, y, z);
    return mesh;
  }

  function createRoadEntry(tile: Tile): TileMeshEntry {
    const mesh = MeshBuilder.CreateGround(
      `road-${tile.position.x}-${tile.position.y}`,
      { width: CELL_SIZE, height: CELL_SIZE },
      scene
    );
    mesh.material =
      tile.buildingId === "dirt_path" ? getDirtRoadMaterial(scene) : getRoadMaterial(scene);
    mesh.isPickable = false;
    const { x, z } = gridToWorld(tile.position.x, tile.position.y);
    mesh.position.set(x, 0.01, z);
    return { box: mesh, model: null, apron: null, marker: null, smoke: null, buildingId: tile.buildingId, isActive: true, extendKey: "" };
  }

  // Flagstone ground over the full footprint, so `paved` buildings visually
  // join adjacent plazas/roads instead of showing a grass rim of fit slack.
  // ponytail: stays full-color when the building is inactive — it's just ground.
  function createApron(tile: Tile, metadata: BuildingMetadata): Mesh | null {
    if (!metadata.paved) return null;
    const { width, depth } = rotatedFootprint(metadata, tile.rotation);
    const apron = MeshBuilder.CreateGround(
      `apron-${tile.buildingId}`,
      { width: width * CELL_SIZE, height: depth * CELL_SIZE },
      scene
    );
    apron.material = getApronMaterial(width, depth, scene);
    apron.isPickable = false;
    const { x, z } = gridToWorld(tile.position.x, tile.position.y, metadata, tile.rotation);
    apron.position.set(x, 0.005, z);
    return apron;
  }

  function createEntry(
    tile: Tile,
    metadata: BuildingMetadata,
    extend?: { negX: boolean; posX: boolean }
  ): TileMeshEntry {
    const apron = createApron(tile, metadata);
    const model = instantiateBuilding(
      tile.buildingId,
      rotatedFootprint(metadata, tile.rotation),
      tile.position,
      scene,
      tile.rotation,
      extend
    );
    if (model) {
      const { x, z } = gridToWorld(tile.position.x, tile.position.y, metadata, tile.rotation);
      model.root.position.x = x + model.offsetX;
      model.root.position.z = z + model.offsetZ;
      // ponytail: models cast onto the ground but don't receive — blur-ESM self-shadow
      // acne turns the glTF walls to mud; switch to PCF shadows if receiving ever matters
      for (const mesh of model.meshes) {
        // Flat paving pads don't cast — their shadow is just an offset dark rim.
        if (!mesh.name.startsWith("pad-")) shadowGenerator.addShadowCaster(mesh);
      }
      setBuildingActive(model, tile.isActive);

      let smoke: SmokePlume | null = null;
      const chimney = model.meshes.find((mesh) => mesh.name.includes("chimney"));
      if (chimney) {
        chimney.computeWorldMatrix(true);
        const top = chimney.getBoundingInfo().boundingBox.maximumWorld;
        smoke = createSmokePlume(scene, new Vector3(top.x - 0.08, top.y, top.z - 0.08));
        smoke.setActive(tile.isActive);
      }
      return { box: null, model, apron, marker: null, smoke, buildingId: tile.buildingId, isActive: tile.isActive, extendKey: "" };
    }
    return {
      box: createBoxMesh(tile, metadata),
      model: null,
      apron,
      marker: null,
      smoke: null,
      buildingId: tile.buildingId,
      isActive: tile.isActive,
      extendKey: "",
    };
  }

  function disposeEntry(entry: TileMeshEntry) {
    entry.marker?.dispose();
    entry.box?.dispose();
    entry.smoke?.dispose();
    entry.apron?.dispose();
    entry.model?.root.dispose();
  }

  function markerHeight(entry: TileMeshEntry, metadata: BuildingMetadata) {
    if (entry.model) return entry.model.height + 0.35;
    return metadata.size.height + 0.4;
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

      if (metadata.type === "road") {
        const existing = active.get(key);
        if (!existing || existing.buildingId !== tile.buildingId) {
          if (existing) disposeEntry(existing);
          active.set(key, createRoadEntry(tile));
        }
        continue;
      }

      // Neighbor-aware models (colonnade) rebuild when an abutting building
      // appears or disappears — the signature is compared every sync.
      const extend = hasExtensions(tile.buildingId) ? computeExtend(tile, metadata, tiles) : null;
      const extendKey = extend ? `${extend.negX ? "n" : ""}${extend.posX ? "p" : ""}` : "";

      let entry = active.get(key);
      const staleBox = entry?.box && hasModel(tile.buildingId); // placed before models finished loading
      if (!entry || entry.buildingId !== tile.buildingId || staleBox || entry.extendKey !== extendKey) {
        if (entry) disposeEntry(entry);
        entry = createEntry(tile, metadata, extend ?? undefined);
        entry.extendKey = extendKey;
        active.set(key, entry);
      } else if (entry.isActive !== tile.isActive) {
        entry.isActive = tile.isActive;
        if (entry.model) setBuildingActive(entry.model, tile.isActive);
        if (entry.box) entry.box.material = getMaterial(metadata.color, metadata.type, !tile.isActive);
        entry.smoke?.setActive(tile.isActive);
      }

      const needsMarker = !tile.isActive;
      if (needsMarker && !entry.marker) {
        const marker = MeshBuilder.CreatePlane(`marker-${key}`, { width: 0.35, height: 0.18 }, scene);
        marker.material = markerMaterial;
        marker.isPickable = false;
        const { x, z } = gridToWorld(tile.position.x, tile.position.y, metadata, tile.rotation);
        marker.position.set(x, markerHeight(entry, metadata), z);
        marker.billboardMode = 7; // BILLBOARDMODE_ALL
        entry.marker = marker;
      } else if (!needsMarker && entry.marker) {
        entry.marker.dispose();
        entry.marker = null;
      }
    }
  }

  function setGridVisible(placing: boolean) {
    gridLines.alpha = placing ? GRID_ALPHA_PLACING : GRID_ALPHA_IDLE;
  }

  function dispose() {
    for (const entry of active.values()) disposeEntry(entry);
    active.clear();
    for (const mat of materialCache.values()) mat.dispose();
    materialCache.clear();
    markerMaterial.dispose();
    gridLines.dispose();
  }

  return { sync, dispose, setGridVisible };
}
