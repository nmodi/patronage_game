import "@babylonjs/core/Culling/ray";

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { BUILDING_METADATA_BY_ID, type BuildingId } from "~/game/buildings";
import { CELL_SIZE, GRID_SIZE } from "~/game/constants";
import { useGameStore, type GameState, type GridPos } from "~/stores/useGameStore";
import { instantiateBuilding, overrideMaterials, type BuildingModel } from "./assetLibrary";

const GROUND_PLANE = Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up());

export function pickGridCell(scene: Scene): GridPos | null {
  if (!scene.activeCamera) return null;
  const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, scene.activeCamera);
  const distance = ray.intersectsPlane(GROUND_PLANE);
  if (distance === null) return null;

  const hit = ray.origin.add(ray.direction.scale(distance));
  const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
  const gridX = Math.floor((hit.x + halfGrid) / CELL_SIZE);
  const gridY = Math.floor((hit.z + halfGrid) / CELL_SIZE);

  if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) return null;
  return { x: gridX, y: gridY };
}

export function createPlacementController(scene: Scene) {
  let ghostBox: Mesh | null = null;
  let ghostModel: BuildingModel | null = null;
  let ghostModelBaseY = 0;
  let ghostBuildingId: BuildingId | null = null;
  let ghostRotation: number | null = null; // quarter turns; null = seeded random
  let ghostIsValid = true;
  let pendingClick = false;
  let roadAnchor: GridPos | null = null;
  let roadPreviewMeshes: Mesh[] = [];
  let lastSelectedBuilding: BuildingId | null = null;

  const validMat = new StandardMaterial("ghost-valid", scene);
  validMat.diffuseColor = Color3.White();
  validMat.emissiveColor = new Color3(0.3, 0.3, 0.3);
  validMat.alpha = 0.45;

  const invalidMat = new StandardMaterial("ghost-invalid", scene);
  invalidMat.diffuseColor = Color3.FromHexString("#ff4d4d");
  invalidMat.emissiveColor = new Color3(0.3, 0.1, 0.1);
  invalidMat.alpha = 0.45;

  function handleMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    // Element, not HTMLElement: SVG icons inside HUD buttons are SVGElement.
    if (event.target instanceof Element && event.target.closest("[data-hud]")) return;
    pendingClick = true;
  }
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      roadAnchor = null;
      clearRoadPreview();
      useGameStore.getState().setSelectedBuilding(null);
      return;
    }
    if (event.key.toLowerCase() === "r" && ghostModel) {
      ghostRotation = ((ghostRotation ?? 0) + 1) % 4;
      ghostModel.root.rotation.y = (Math.PI / 2) * ghostRotation;
    }
  }
  window.addEventListener("mousedown", handleMouseDown);
  window.addEventListener("keydown", handleKeyDown);

  function ensureGhost(buildingId: BuildingId) {
    if (ghostBuildingId === buildingId && (ghostBox || ghostModel)) return true;
    clearGhost();
    ghostBuildingId = buildingId;
    const metadata = BUILDING_METADATA_BY_ID[buildingId];
    if (!metadata) return false;

    const model = instantiateBuilding(
      buildingId,
      metadata.footprint ?? { width: 1, depth: 1 },
      { x: 0, y: 0 },
      scene
    );
    if (model) {
      overrideMaterials(model, validMat);
      ghostModel = model;
      ghostModelBaseY = model.root.position.y;
      ghostIsValid = true;
      return true;
    }

    const { width, height, depth } = metadata.size;
    const mesh =
      metadata.type === "road"
        ? MeshBuilder.CreateGround("ghost", { width: width * CELL_SIZE, height: depth * CELL_SIZE }, scene)
        : MeshBuilder.CreateBox("ghost", { width: width * CELL_SIZE, height, depth: depth * CELL_SIZE }, scene);
    mesh.isPickable = false;
    ghostBox = mesh;
    return true;
  }

  function clearGhost() {
    ghostBox?.dispose();
    ghostBox = null;
    ghostModel?.root.dispose();
    ghostModel = null;
    ghostBuildingId = null;
  }

  function clearRoadPreview() {
    for (const mesh of roadPreviewMeshes) mesh.dispose();
    roadPreviewMeshes = [];
  }

  function setGhostVisible(visible: boolean) {
    ghostBox?.setEnabled(visible);
    ghostModel?.root.setEnabled(visible);
  }

  // Hover tooltip source: track which placed building the pointer is over
  // whenever we're not in placement mode. Roads are skipped as noise.
  function updateHoveredTile(state: GameState) {
    const cell = pickGridCell(scene);
    const tile = cell ? state.map.tiles[`${cell.x},${cell.y}`] : undefined;
    const key = tile && tile.type !== "road" ? `${tile.origin.x},${tile.origin.y}` : null;
    if (state.hoveredTileKey !== key) state.setHoveredTile(key);
  }

  function buildRoadStretch(anchor: GridPos, hover: GridPos) {
    const dx = hover.x - anchor.x;
    const dy = hover.y - anchor.y;
    const positions: GridPos[] = [];

    if (Math.abs(dx) >= Math.abs(dy)) {
      const step = dx >= 0 ? 1 : -1;
      for (let x = anchor.x; x !== hover.x + step; x += step) {
        positions.push({ x, y: anchor.y });
      }
    } else {
      const step = dy >= 0 ? 1 : -1;
      for (let y = anchor.y; y !== hover.y + step; y += step) {
        positions.push({ x: anchor.x, y });
      }
    }

    return positions;
  }

  function canPlaceRoadStretch(state: GameState, positions: GridPos[], buildingId: BuildingId) {
    const metadata = BUILDING_METADATA_BY_ID[buildingId];
    if (!metadata || metadata.type !== "road" || positions.length === 0) return false;
    if (state.florins < metadata.baseCost * positions.length) return false;

    const seen = new Set<string>();
    for (const position of positions) {
      if (position.x < 0 || position.x >= GRID_SIZE || position.y < 0 || position.y >= GRID_SIZE) {
        return false;
      }
      const key = `${position.x},${position.y}`;
      if (seen.has(key) || state.map.tiles[key]) return false;
      seen.add(key);
    }
    return true;
  }

  function ensureRoadPreviewCount(count: number) {
    while (roadPreviewMeshes.length > count) {
      roadPreviewMeshes.pop()?.dispose();
    }
    while (roadPreviewMeshes.length < count) {
      const mesh = MeshBuilder.CreateGround(
        `road-preview-${roadPreviewMeshes.length}`,
        { width: CELL_SIZE, height: CELL_SIZE },
        scene
      );
      mesh.isPickable = false;
      roadPreviewMeshes.push(mesh);
    }
  }

  function updateRoadPreview(positions: GridPos[], canPlace: boolean) {
    ensureRoadPreviewCount(positions.length);
    const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
    for (let i = 0; i < roadPreviewMeshes.length; i += 1) {
      const mesh = roadPreviewMeshes[i];
      const position = positions[i];
      if (!position) {
        mesh.setEnabled(false);
        continue;
      }
      mesh.position.set(
        position.x * CELL_SIZE - halfGrid + CELL_SIZE / 2,
        0.004,
        position.y * CELL_SIZE - halfGrid + CELL_SIZE / 2
      );
      mesh.material = canPlace ? validMat : invalidMat;
      mesh.setEnabled(true);
    }
  }

  function updateRoadPlacement(state: GameState, buildingId: BuildingId, currentPosition: GridPos) {
    const positions = roadAnchor ? buildRoadStretch(roadAnchor, currentPosition) : [currentPosition];
    const canPlace = canPlaceRoadStretch(state, positions, buildingId);
    updateRoadPreview(positions, canPlace);

    if (!pendingClick) return;
    pendingClick = false;

    if (!roadAnchor) {
      if (canPlace) roadAnchor = { ...currentPosition };
      return;
    }

    if (!canPlace) return;
    if (state.placeTiles(positions, buildingId)) {
      roadAnchor = null;
      clearRoadPreview();
    }
  }

  const observer = scene.onBeforeRenderObservable.add(() => {
    const state = useGameStore.getState();
    const selectedBuilding = state.map.selectedBuilding;

    if (selectedBuilding !== lastSelectedBuilding) {
      roadAnchor = null;
      ghostRotation = null;
      clearRoadPreview();
      lastSelectedBuilding = selectedBuilding;
    }

    if (!selectedBuilding) {
      clearGhost();
      pendingClick = false;
      updateHoveredTile(state);
      return;
    }
    if (state.hoveredTileKey) state.setHoveredTile(null);
    const metadata = BUILDING_METADATA_BY_ID[selectedBuilding];
    if (!metadata) return;

    const currentPosition = pickGridCell(scene);
    if (!currentPosition) {
      setGhostVisible(false);
      clearRoadPreview();
      pendingClick = false;
      return;
    }

    if (metadata.type === "road") {
      clearGhost();
      updateRoadPlacement(state, selectedBuilding, currentPosition);
      return;
    }

    clearRoadPreview();
    roadAnchor = null;
    if (!ensureGhost(selectedBuilding)) return;

    const footprint = metadata.footprint ?? { width: 1, depth: 1 };
    const fitsFootprint =
      currentPosition.x + footprint.width <= GRID_SIZE && currentPosition.y + footprint.depth <= GRID_SIZE;
    let areaFree = false;
    if (fitsFootprint) {
      areaFree = true;
      for (let dx = 0; dx < footprint.width && areaFree; dx += 1) {
        for (let dy = 0; dy < footprint.depth; dy += 1) {
          if (state.getTileAt({ x: currentPosition.x + dx, y: currentPosition.y + dy })) {
            areaFree = false;
            break;
          }
        }
      }
    }
    const canAfford = state.florins >= metadata.baseCost;
    const canPlaceHere = fitsFootprint && areaFree && canAfford;

    const xOffset = ((footprint.width - 1) * CELL_SIZE) / 2;
    const zOffset = ((footprint.depth - 1) * CELL_SIZE) / 2;
    const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
    const xPos = currentPosition.x * CELL_SIZE - halfGrid + CELL_SIZE / 2 + xOffset;
    const zPos = currentPosition.y * CELL_SIZE - halfGrid + CELL_SIZE / 2 + zOffset;

    setGhostVisible(true);
    if (ghostModel) {
      ghostModel.root.position.set(xPos, ghostModelBaseY, zPos);
      if (canPlaceHere !== ghostIsValid) {
        overrideMaterials(ghostModel, canPlaceHere ? validMat : invalidMat);
        ghostIsValid = canPlaceHere;
      }
    } else if (ghostBox) {
      const height = metadata.size.height ?? 0.2;
      ghostBox.position.set(xPos, height / 2, zPos);
      ghostBox.material = canPlaceHere ? validMat : invalidMat;
    }

    if (pendingClick && canPlaceHere) {
      state.placeTile(currentPosition, selectedBuilding, ghostRotation ?? undefined);
    }
    pendingClick = false;
  });

  function dispose() {
    window.removeEventListener("mousedown", handleMouseDown);
    window.removeEventListener("keydown", handleKeyDown);
    scene.onBeforeRenderObservable.remove(observer);
    clearGhost();
    clearRoadPreview();
    validMat.dispose();
    invalidMat.dispose();
  }

  return { dispose };
}
