import "@babylonjs/core/Culling/ray";

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import {
  BUILDING_METADATA_BY_ID,
  footprintMask,
  rotatedFootprint,
  type BuildingId,
} from "~/game/buildings";
import { CELL_SIZE } from "~/game/constants";
import { plinthSlotAt } from "~/game/display";
import { gridToWorld, worldToGrid, worldToGridFloat, type GridPos } from "~/game/grid";
import { canPlaceAt, planLinearPlacement } from "~/game/placementRules";
import { getRazeImpact } from "~/game/raze";
import { findRoadSnap } from "~/game/roadSnap";
import { buildRoadStretch, ROAD_DIAG_NE, type RoadRotation } from "~/game/roadStretch";
import { RAZE_TOOL, useGameStore, type GameState } from "~/stores/useGameStore";
import {
  instantiateBuilding,
  overrideMaterials,
  type BuildingModel,
} from "./assetLibrary";
import {
  effectiveRotation as resolveRotation,
  getFrontDirection,
  usesQuarterRotation,
} from "./modelManifest";

const GROUND_PLANE = Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up());

function pickGroundPoint(scene: Scene): { x: number; z: number } | null {
  if (!scene.activeCamera) return null;
  const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, scene.activeCamera);
  const distance = ray.intersectsPlane(GROUND_PLANE);
  if (distance === null) return null;

  const hit = ray.origin.add(ray.direction.scale(distance));
  return { x: hit.x, z: hit.z };
}

export function pickGridCell(scene: Scene): GridPos | null {
  const point = pickGroundPoint(scene);
  return point ? worldToGrid(point.x, point.z) : null;
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
  let mouseHeld = false; // raze drag-sweep: keep clearing cells while the button is down
  let inspectClick = false; // a completed idle click (not a camera-orbit drag) awaiting resolution
  let downX = 0;
  let downY = 0;
  let downOnHud = false;
  let roadAnchor: GridPos | null = null;
  let roadPreviewMeshes: Mesh[] = [];
  let lastSelectedBuilding: BuildingId | typeof RAZE_TOOL | null = null;
  let shiftHeld = false; // Shift = snap the building ghost to a nearby road

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
    downX = event.clientX;
    downY = event.clientY;
    // Element, not HTMLElement: SVG icons inside HUD buttons are SVGElement.
    downOnHud = event.target instanceof Element && !!event.target.closest("[data-hud]");
    if (downOnHud) return;
    pendingClick = true;
    mouseHeld = true;
  }
  function handleMouseUp(event: MouseEvent) {
    if (event.button !== 0) return;
    mouseHeld = false;
    if (downOnHud) return;
    // With no tool active the camera keeps pointer control, so an inspect is a
    // near-stationary click — an orbit drag moves the cursor and is ignored.
    // Tools consume their own clicks (place/raze), so skip inspect for them.
    if (useGameStore.getState().map.selectedBuilding) return;
    if (event.target instanceof Element && event.target.closest("[data-hud]")) return;
    if (Math.hypot(event.clientX - downX, event.clientY - downY) < 5) inspectClick = true;
  }
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Shift") shiftHeld = true;
    if (event.key.toLowerCase() === "r" && ghostModel) {
      // 8-step cycle, +45° per press: 0→4→1→5→2→6→3→7→0 (4-7 = quarter + 45°).
      // Recreated next frame by ensureGhost: footprints change with rotation,
      // so the model needs a refit, not just a spin.
      const r = ghostRotation ?? 0;
      ghostRotation = r < 4 ? r + 4 : (r - 3) % 4;
    }
  }
  function handleKeyUp(event: KeyboardEvent) {
    if (event.key === "Shift") shiftHeld = false;
  }
  function handleBlur() {
    shiftHeld = false; // alt-tab with Shift down must not leave snap stuck on
  }
  window.addEventListener("mousedown", handleMouseDown);
  window.addEventListener("mouseup", handleMouseUp);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", handleBlur);

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

  function updateRoadPreview(positions: GridPos[], canPlace: boolean, rotation?: RoadRotation) {
    ensureRoadPreviewCount(positions.length);
    for (let i = 0; i < roadPreviewMeshes.length; i += 1) {
      const mesh = roadPreviewMeshes[i];
      const position = positions[i];
      if (!position) {
        mesh.setEnabled(false);
        continue;
      }
      const world = gridToWorld(position.x, position.y);
      mesh.position.set(world.x, 0.004, world.z);
      // Diagonal stretches preview with the final ribbon transform; reset is
      // required because these pooled quads also serve the raze highlight.
      if (rotation) {
        mesh.rotation.y = rotation === ROAD_DIAG_NE ? -Math.PI / 4 : Math.PI / 4;
        mesh.scaling.set(Math.SQRT2, 1, 1);
      } else {
        mesh.rotation.y = 0;
        mesh.scaling.setAll(1);
      }
      mesh.material = canPlace ? validMat : invalidMat;
      mesh.setEnabled(true);
    }
  }

  function updateRoadPlacement(state: GameState, buildingId: BuildingId, currentPosition: GridPos) {
    const width = BUILDING_METADATA_BY_ID[buildingId]?.roadWidth ?? 1;
    // Diagonals are paved-roads-only: dirt_path autotiling and bridge parapets
    // are cardinal, and this function also serves linear decorations
    // (fence/stone_wall/colonnade) whose segment renderer is cardinal.
    const allowDiagonal = buildingId === "path" || buildingId === "road" || buildingId === "avenue";
    const { positions, rotation } = buildRoadStretch(
      roadAnchor ?? currentPosition,
      currentPosition,
      width,
      allowDiagonal
    );
    // Cells still needing placing (and paying for); null = blocked or unaffordable.
    const newCells = planLinearPlacement(state, positions, buildingId)?.positions ?? null;
    updateRoadPreview(positions, newCells !== null, rotation);

    if (!pendingClick) return;
    pendingClick = false;

    if (!roadAnchor) {
      // Anchoring on an existing road is fine (newCells just starts empty).
      if (newCells) roadAnchor = { ...currentPosition };
      return;
    }

    if (!newCells) return;
    if (newCells.length === 0 || state.placeTiles(newCells, buildingId, rotation)) {
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
      if (inspectClick) {
        inspectClick = false;
        const cell = pickGridCell(scene);
        const tile = cell ? state.map.tiles[`${cell.x},${cell.y}`] : undefined;
        const metadata = tile ? BUILDING_METADATA_BY_ID[tile.buildingId] : undefined;
        if (tile && metadata?.displaySlots) {
          const key = `${tile.origin.x},${tile.origin.y}`;
          const r = resolveRotation(tile.buildingId, tile.origin, tile.rotation);
          const slotIndex = plinthSlotAt(
            metadata.displaySlots,
            metadata.footprint,
            r,
            cell!.x - tile.origin.x,
            cell!.y - tile.origin.y
          );
          // A direct click on a filled plinth cell jumps to that work's detail.
          const filled =
            slotIndex != null &&
            state.artworks.some(
              (w) => w.displayedAt?.key === key && w.displayedAt.slot === slotIndex
            );
          state.setInspectTarget({ key, slot: filled ? slotIndex : undefined });
        } else {
          state.setInspectTarget(null); // click on empty ground closes the panel
        }
      }
      return;
    }

    if (selectedBuilding === RAZE_TOOL) {
      clearGhost();
      roadAnchor = null;
      updateHoveredTile(state); // tooltip names the target and shows the salvage value
      const cell = pickGridCell(scene);
      const tile = cell ? state.getTileAt(cell) : undefined;

      // Red footprint highlight over the doomed structure (the road-preview
      // quads with invalidMat, repurposed).
      const cells: GridPos[] = [];
      if (tile) {
        const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
        const offsets = metadata
          ? footprintMask(metadata, tile.rotation).cells
          : [{ x: 0, y: 0 }];
        for (const offset of offsets) {
          cells.push({ x: tile.origin.x + offset.x, y: tile.origin.y + offset.y });
        }
      }
      updateRoadPreview(cells, false);

      if (tile && (pendingClick || mouseHeld)) {
        const originKey = `${tile.origin.x},${tile.origin.y}`;
        const impact = getRazeImpact(state.artists, state.commissions, state.artworks, originKey);
        if (impact.needsConfirmation) {
          // Costly demolitions confirm via the RazeConfirm popover — and only
          // on a deliberate click; a drag-sweep passes over them.
          if (pendingClick) state.setRazeTarget(originKey);
        } else {
          state.removeTile(tile.origin);
        }
      }
      pendingClick = false;
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

    roadAnchor = null;
    // Quarter-rotating buildings face a fixed default until the player presses
    // R; the shown rotation is stored on placement so the building matches.
    let effectiveRotation = ghostRotation ?? (usesQuarterRotation(selectedBuilding) ? 0 : null);
    // Shift: snap flush against a nearby road, auto-facing it (45° against
    // diagonal ribbons). Purely an assist — no candidate falls through to the
    // free cursor placement, and releasing Shift restores it exactly.
    let placeOrigin = currentPosition;
    let snapped = false;
    if (shiftHeld) {
      const point = pickGroundPoint(scene);
      const snap = point
        ? findRoadSnap(state, worldToGridFloat(point.x, point.z), selectedBuilding, effectiveRotation)
        : null;
      if (snap) {
        placeOrigin = snap.origin;
        if (snap.rotation != null) effectiveRotation = snap.rotation;
        snapped = true;
      }
    }
    if (!ensureGhost(selectedBuilding, effectiveRotation)) return;

    const canPlaceHere = canPlaceAt(
      state,
      placeOrigin,
      selectedBuilding,
      effectiveRotation ?? undefined
    );

    // While snapped, mark the claimed cells (diamond masks read poorly from
    // the model alone) with the pooled preview quads.
    if (snapped) {
      const cells = footprintMask(metadata, effectiveRotation ?? undefined).cells.map((c) => ({
        x: placeOrigin.x + c.x,
        y: placeOrigin.y + c.y,
      }));
      updateRoadPreview(cells, canPlaceHere);
    } else {
      clearRoadPreview();
    }

    const { x: xPos, z: zPos } = gridToWorld(
      placeOrigin.x,
      placeOrigin.y,
      metadata,
      effectiveRotation ?? undefined
    );

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
        // front is local, so the facade half-extent is the local axis it
        // points along — exact at every rotation, 45° included.
        const half =
          ((front[0] !== 0 ? metadata.footprint.width : metadata.footprint.depth) * CELL_SIZE) / 2;
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
      state.placeTile(placeOrigin, selectedBuilding, effectiveRotation ?? undefined);
    }
    pendingClick = false;
  });

  function dispose() {
    window.removeEventListener("mousedown", handleMouseDown);
    window.removeEventListener("mouseup", handleMouseUp);
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    window.removeEventListener("blur", handleBlur);
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
