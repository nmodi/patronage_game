import "@babylonjs/core/Culling/ray";

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { BUILDING_METADATA_BY_ID, type BuildingId } from "~/game/buildings";
import { useGameStore, type GridPos } from "~/stores/useGameStore";

const GRID_SIZE = 20;
const CELL_SIZE = 1;

export function createPlacementController(scene: Scene) {
  let ghostMesh: Mesh | null = null;
  let ghostBuildingId: BuildingId | null = null;
  let isMouseDown = false;
  let lastPlacedPosition: GridPos | null = null;

  const validMat = new StandardMaterial("ghost-valid", scene);
  validMat.diffuseColor = Color3.White();
  validMat.alpha = 0.45;

  const invalidMat = new StandardMaterial("ghost-invalid", scene);
  invalidMat.diffuseColor = Color3.FromHexString("#ff4d4d");
  invalidMat.alpha = 0.45;

  const groundPlane = Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up());

  function handleMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest("[data-hud]")) return;
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
    if (ghostBuildingId === buildingId && ghostMesh) return ghostMesh;
    ghostMesh?.dispose();
    ghostBuildingId = buildingId;
    const metadata = BUILDING_METADATA_BY_ID[buildingId];
    if (!metadata) {
      ghostMesh = null;
      return null;
    }
    const { width, height, depth } = metadata.size;
    const mesh =
      metadata.type === "road"
        ? MeshBuilder.CreateGround("ghost", { width: width * CELL_SIZE, height: depth * CELL_SIZE }, scene)
        : MeshBuilder.CreateBox("ghost", { width: width * CELL_SIZE, height, depth: depth * CELL_SIZE }, scene);
    mesh.isPickable = false;
    ghostMesh = mesh;
    return mesh;
  }

  function clearGhost() {
    ghostMesh?.dispose();
    ghostMesh = null;
    ghostBuildingId = null;
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
    const ghost = ensureGhost(selectedBuilding);
    if (!ghost) return;

    if (distance === null) {
      ghost.isVisible = false;
      return;
    }
    const hit = ray.origin.add(ray.direction.scale(distance));

    const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
    const gridX = Math.floor((hit.x + halfGrid) / CELL_SIZE);
    const gridY = Math.floor((hit.z + halfGrid) / CELL_SIZE);

    if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) {
      ghost.isVisible = false;
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
    const height = metadata.size.height ?? 0.2;
    const yPos = metadata.type === "road" ? 0.001 : height / 2;

    ghost.isVisible = true;
    ghost.position.set(xPos, yPos, zPos);
    ghost.material = canPlaceHere ? validMat : invalidMat;

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
