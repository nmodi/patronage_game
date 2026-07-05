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
import { useGameStore, type GridPos } from "~/stores/useGameStore";
import { instantiateBuilding, overrideMaterials, type BuildingModel } from "./assetLibrary";

export function createPlacementController(scene: Scene) {
  let ghostBox: Mesh | null = null;
  let ghostModel: BuildingModel | null = null;
  let ghostModelBaseY = 0;
  let ghostBuildingId: BuildingId | null = null;
  let ghostIsValid = true;
  let isMouseDown = false;
  let lastPlacedPosition: GridPos | null = null;

  const validMat = new StandardMaterial("ghost-valid", scene);
  validMat.diffuseColor = Color3.White();
  validMat.emissiveColor = new Color3(0.3, 0.3, 0.3);
  validMat.alpha = 0.45;

  const invalidMat = new StandardMaterial("ghost-invalid", scene);
  invalidMat.diffuseColor = Color3.FromHexString("#ff4d4d");
  invalidMat.emissiveColor = new Color3(0.3, 0.1, 0.1);
  invalidMat.alpha = 0.45;

  const groundPlane = Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up());

  function handleMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    // Element, not HTMLElement: SVG icons inside HUD buttons are SVGElement.
    if (event.target instanceof Element && event.target.closest("[data-hud]")) return;
    isMouseDown = true;
    lastPlacedPosition = null;
  }
  function handleMouseUp() {
    isMouseDown = false;
    lastPlacedPosition = null;
  }
  window.addEventListener("mousedown", handleMouseDown);
  window.addEventListener("mouseup", handleMouseUp);

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

  function setGhostVisible(visible: boolean) {
    ghostBox?.setEnabled(visible);
    ghostModel?.root.setEnabled(visible);
  }

  const observer = scene.onBeforeRenderObservable.add(() => {
    const state = useGameStore.getState();
    const selectedBuilding = state.map.selectedBuilding;

    if (!selectedBuilding) {
      clearGhost();
      return;
    }
    const metadata = BUILDING_METADATA_BY_ID[selectedBuilding];
    if (!metadata) return;

    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, scene.activeCamera);
    const distance = ray.intersectsPlane(groundPlane);
    if (!ensureGhost(selectedBuilding)) return;

    if (distance === null) {
      setGhostVisible(false);
      return;
    }
    const hit = ray.origin.add(ray.direction.scale(distance));

    const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
    const gridX = Math.floor((hit.x + halfGrid) / CELL_SIZE);
    const gridY = Math.floor((hit.z + halfGrid) / CELL_SIZE);

    if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) {
      setGhostVisible(false);
      return;
    }

    const footprint = metadata.footprint ?? { width: 1, depth: 1 };
    const fitsFootprint = gridX + footprint.width <= GRID_SIZE && gridY + footprint.depth <= GRID_SIZE;
    let areaFree = false;
    if (fitsFootprint) {
      areaFree = true;
      for (let dx = 0; dx < footprint.width && areaFree; dx += 1) {
        for (let dy = 0; dy < footprint.depth; dy += 1) {
          if (state.getTileAt({ x: gridX + dx, y: gridY + dy })) {
            areaFree = false;
            break;
          }
        }
      }
    }
    const canPlaceHere = fitsFootprint && areaFree;

    const xOffset = ((footprint.width - 1) * CELL_SIZE) / 2;
    const zOffset = ((footprint.depth - 1) * CELL_SIZE) / 2;
    const xPos = gridX * CELL_SIZE - halfGrid + CELL_SIZE / 2 + xOffset;
    const zPos = gridY * CELL_SIZE - halfGrid + CELL_SIZE / 2 + zOffset;

    setGhostVisible(true);
    if (ghostModel) {
      ghostModel.root.position.set(xPos, ghostModelBaseY, zPos);
      if (canPlaceHere !== ghostIsValid) {
        overrideMaterials(ghostModel, canPlaceHere ? validMat : invalidMat);
        ghostIsValid = canPlaceHere;
      }
    } else if (ghostBox) {
      const height = metadata.size.height ?? 0.2;
      const yPos = metadata.type === "road" ? 0.001 : height / 2;
      ghostBox.position.set(xPos, yPos, zPos);
      ghostBox.material = canPlaceHere ? validMat : invalidMat;
    }

    if (isMouseDown && canPlaceHere) {
      const currentPosition: GridPos = { x: gridX, y: gridY };
      const isRoad = metadata.type === "road";
      const hasPlacedDuringDrag =
        isRoad && lastPlacedPosition && lastPlacedPosition.x === gridX && lastPlacedPosition.y === gridY;
      const canPlaceThisDrag = (isRoad && !hasPlacedDuringDrag) || (!isRoad && !lastPlacedPosition);

      if (canPlaceThisDrag) {
        state.placeTile(currentPosition, selectedBuilding);
        const placedTile = state.getTileAt(currentPosition);
        if (
          placedTile &&
          placedTile.buildingId === selectedBuilding &&
          placedTile.isOrigin &&
          placedTile.origin.x === currentPosition.x &&
          placedTile.origin.y === currentPosition.y
        ) {
          lastPlacedPosition = currentPosition;
        }
      }
    }
  });

  function dispose() {
    window.removeEventListener("mousedown", handleMouseDown);
    window.removeEventListener("mouseup", handleMouseUp);
    scene.onBeforeRenderObservable.remove(observer);
    clearGhost();
    validMat.dispose();
    invalidMat.dispose();
  }

  return { dispose };
}
