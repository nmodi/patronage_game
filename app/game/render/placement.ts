import "@babylonjs/core/Culling/ray";

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { BUILDING_METADATA_BY_ID, rotatedFootprint, type BuildingId } from "~/game/buildings";
import { CELL_SIZE, GRID_SIZE } from "~/game/constants";
import { getWaterCells } from "~/game/water";
import { useGameStore, type GameState, type GridPos } from "~/stores/useGameStore";
import {
  getFrontDirection,
  instantiateBuilding,
  overrideMaterials,
  usesQuarterRotation,
  type BuildingModel,
} from "./assetLibrary";

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
  let ghostBuiltRotation: number | null = null; // rotation the current ghost was fitted with
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

  // Facing arrow: flat triangle on the ground just outside the ghost's front
  // edge, pointing the way the building's entrance faces.
  const arrowMat = new StandardMaterial("ghost-arrow", scene);
  arrowMat.diffuseColor = Color3.FromHexString("#e8a33d");
  arrowMat.emissiveColor = new Color3(0.55, 0.38, 0.12);
  arrowMat.backFaceCulling = false;
  const arrow = MeshBuilder.CreateDisc("ghost-arrow", { radius: 0.24, tessellation: 3 }, scene);
  arrow.rotation.x = Math.PI / 2;
  arrow.bakeCurrentTransformIntoVertices(); // points along +X; only rotation.y varies below
  arrow.material = arrowMat;
  arrow.isPickable = false;
  arrow.setEnabled(false);

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
      // Recreated next frame by ensureGhost: rectangular footprints swap on odd
      // turns, so the model needs a refit, not just a spin.
      ghostRotation = ((ghostRotation ?? 0) + 1) % 4;
    }
  }
  window.addEventListener("mousedown", handleMouseDown);
  window.addEventListener("keydown", handleKeyDown);

  function ensureGhost(buildingId: BuildingId, rotation: number | null) {
    if (ghostBuildingId === buildingId && ghostBuiltRotation === rotation && (ghostBox || ghostModel)) {
      return true;
    }
    clearGhost();
    ghostBuildingId = buildingId;
    ghostBuiltRotation = rotation;
    const metadata = BUILDING_METADATA_BY_ID[buildingId];
    if (!metadata) return false;

    const model = instantiateBuilding(
      buildingId,
      rotatedFootprint(metadata, rotation ?? undefined),
      { x: 0, y: 0 },
      scene,
      rotation ?? undefined
    );
    if (model) {
      overrideMaterials(model, validMat);
      ghostModel = model;
      ghostModelBaseY = model.root.position.y;
      ghostIsValid = true;
      return true;
    }

    // size is in world units, not cells — don't scale by CELL_SIZE.
    const { width, height, depth } = metadata.size;
    const mesh =
      metadata.type === "road"
        ? MeshBuilder.CreateGround("ghost", { width, height: depth }, scene)
        : MeshBuilder.CreateBox("ghost", { width, height, depth }, scene);
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
    arrow.setEnabled(false);
  }

  function clearRoadPreview() {
    for (const mesh of roadPreviewMeshes) mesh.dispose();
    roadPreviewMeshes = [];
  }

  function setGhostVisible(visible: boolean) {
    ghostBox?.setEnabled(visible);
    ghostModel?.root.setEnabled(visible);
    if (!visible) arrow.setEnabled(false);
  }

  // Hover tooltip source: track which placed building the pointer is over
  // whenever we're not in placement mode. Roads are skipped as noise.
  function updateHoveredTile(state: GameState) {
    const cell = pickGridCell(scene);
    const tile = cell ? state.map.tiles[`${cell.x},${cell.y}`] : undefined;
    const key = tile && tile.type !== "road" ? `${tile.origin.x},${tile.origin.y}` : null;
    if (state.hoveredTileKey !== key) state.setHoveredTile(key);
  }

  function buildRoadStretch(anchor: GridPos, hover: GridPos, width: number) {
    const dx = hover.x - anchor.x;
    const dy = hover.y - anchor.y;
    const positions: GridPos[] = [];

    // No drag direction yet — a width×width block under the cursor, so the
    // ghost shows the road's true size before the axis is known.
    if (dx === 0 && dy === 0) {
      for (let wx = 0; wx < width; wx += 1) {
        for (let wy = 0; wy < width; wy += 1) {
          positions.push({ x: anchor.x + wx, y: anchor.y + wy });
        }
      }
      return positions;
    }

    // Extra width stamps on the positive side of the drag line, matching
    // footprint-origin semantics.
    if (Math.abs(dx) >= Math.abs(dy)) {
      const step = dx >= 0 ? 1 : -1;
      for (let x = anchor.x; x !== hover.x + step; x += step) {
        for (let w = 0; w < width; w += 1) positions.push({ x, y: anchor.y + w });
      }
    } else {
      const step = dy >= 0 ? 1 : -1;
      for (let y = anchor.y; y !== hover.y + step; y += step) {
        for (let w = 0; w < width; w += 1) positions.push({ x: anchor.x + w, y });
      }
    }

    return positions;
  }

  // A cell already carrying the same run may be overlapped (that's how stretches
  // join); only foreign tiles block. Roads join any road width; linear
  // decorations join only their own kind — and water blocks everything but
  // bridges (mirrors the store's placeTiles gate). Returns the cells that still
  // need placing (and paying for), or null if the stretch is blocked or unaffordable.
  function planRoadStretch(state: GameState, positions: GridPos[], buildingId: BuildingId) {
    const metadata = BUILDING_METADATA_BY_ID[buildingId];
    const isDrag = metadata && (metadata.type === "road" || metadata.linear);
    if (!isDrag || positions.length === 0) return null;

    const water = getWaterCells(state.mapSeed);
    const newCells: GridPos[] = [];
    for (const position of positions) {
      if (position.x < 0 || position.x >= GRID_SIZE || position.y < 0 || position.y >= GRID_SIZE) {
        return null;
      }
      const key = `${position.x},${position.y}`;
      const tile = state.map.tiles[key];
      const joinable = metadata.type === "road" ? tile?.type === "road" : tile?.buildingId === buildingId;
      if (!tile) {
        if (buildingId !== "bridge" && water.has(key)) return null;
        newCells.push(position);
      } else if (!joinable) return null;
    }
    if (state.florins < metadata.baseCost * newCells.length) return null;
    return newCells;
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
    const width = BUILDING_METADATA_BY_ID[buildingId]?.roadWidth ?? 1;
    const positions = buildRoadStretch(roadAnchor ?? currentPosition, currentPosition, width);
    const newCells = planRoadStretch(state, positions, buildingId);
    updateRoadPreview(positions, newCells !== null);

    if (!pendingClick) return;
    pendingClick = false;

    if (!roadAnchor) {
      // Anchoring on an existing road is fine (newCells just starts empty).
      if (newCells) roadAnchor = { ...currentPosition };
      return;
    }

    if (!newCells) return;
    if (newCells.length === 0 || state.placeTiles(newCells, buildingId)) {
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

    if (metadata.type === "road" || metadata.linear) {
      clearGhost();
      updateRoadPlacement(state, selectedBuilding, currentPosition);
      return;
    }

    clearRoadPreview();
    roadAnchor = null;
    // Quarter-rotating buildings face a fixed default until the player presses
    // R; the shown rotation is stored on placement so the building matches.
    const effectiveRotation = ghostRotation ?? (usesQuarterRotation(selectedBuilding) ? 0 : null);
    if (!ensureGhost(selectedBuilding, effectiveRotation)) return;

    const footprint = rotatedFootprint(metadata, effectiveRotation ?? undefined);
    const fitsFootprint =
      currentPosition.x + footprint.width <= GRID_SIZE && currentPosition.y + footprint.depth <= GRID_SIZE;
    // Decorations may overlap existing buildings; only their origin cell must be free.
    const canOverlap = metadata.type === "decoration";
    const water = getWaterCells(state.mapSeed);
    let areaFree = false;
    if (fitsFootprint) {
      areaFree = true;
      for (let dx = 0; dx < footprint.width && areaFree; dx += 1) {
        for (let dy = 0; dy < footprint.depth; dy += 1) {
          const cell = { x: currentPosition.x + dx, y: currentPosition.y + dy };
          // Free water cells block like occupied ones (store gate mirror).
          // Overlapping decorations skip occupied cells but still may not
          // claim water.
          if (water.has(`${cell.x},${cell.y}`) && !(canOverlap && state.getTileAt(cell))) {
            areaFree = false;
            break;
          }
          if (canOverlap && !(dx === 0 && dy === 0)) continue;
          if (state.getTileAt(cell)) {
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
      ghostModel.root.position.set(xPos + ghostModel.offsetX, ghostModelBaseY, zPos + ghostModel.offsetZ);
      if (canPlaceHere !== ghostIsValid) {
        overrideMaterials(ghostModel, canPlaceHere ? validMat : invalidMat);
        ghostIsValid = canPlaceHere;
      }
      const front = getFrontDirection(selectedBuilding);
      if (front) {
        // Rotate the local front by the ghost's yaw (+X → −Z for positive θ).
        const theta = ghostModel.root.rotation.y;
        const dirX = front[0] * Math.cos(theta) + front[1] * Math.sin(theta);
        const dirZ = -front[0] * Math.sin(theta) + front[1] * Math.cos(theta);
        const half = ((Math.abs(dirX) > 0.5 ? footprint.width : footprint.depth) * CELL_SIZE) / 2;
        arrow.position.set(xPos + dirX * (half + 0.3), 0.05, zPos + dirZ * (half + 0.3));
        arrow.rotation.y = Math.atan2(-dirZ, dirX);
        arrow.setEnabled(true);
      } else {
        arrow.setEnabled(false);
      }
    } else if (ghostBox) {
      const height = metadata.size.height ?? 0.2;
      ghostBox.position.set(xPos, height / 2, zPos);
      ghostBox.material = canPlaceHere ? validMat : invalidMat;
    }

    if (pendingClick && canPlaceHere) {
      state.placeTile(currentPosition, selectedBuilding, effectiveRotation ?? undefined);
    }
    pendingClick = false;
  });

  function dispose() {
    window.removeEventListener("mousedown", handleMouseDown);
    window.removeEventListener("keydown", handleKeyDown);
    scene.onBeforeRenderObservable.remove(observer);
    clearGhost();
    clearRoadPreview();
    arrow.dispose();
    arrowMat.dispose();
    validMat.dispose();
    invalidMat.dispose();
  }

  // A selected building may begin as a fallback box while its model streams.
  // Clearing it makes the next frame rebuild the preview from the loaded asset.
  function refresh() {
    clearGhost();
    ghostBuiltRotation = null;
  }

  return { dispose, refresh };
}
