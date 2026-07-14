import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import {
  BUILDING_METADATA_BY_ID,
  isDiagonalRotation,
  rotatedFootprint,
  yawOfRotation,
  type BuildingId,
} from "~/game/buildings";
import { CELL_SIZE, GRID_SIZE } from "~/game/constants";
import { rotateSlotCell } from "~/game/display";
import { gridToWorld, type Tile, type TileMap } from "~/game/grid";
import type { Artwork, BuildingMetadata, BuildingType } from "~/game/types";
import {
  createBuildingBatcher,
  expectsModel,
  hasModel,
  type PlacedBuilding,
} from "./assetLibrary";
import {
  createDisplayArt,
  MAX_FACADE_CANVASES,
  PLINTH_HEIGHT,
  type DisplayArtHandle,
} from "./displayArt";
import {
  doorLocalSide,
  effectiveFullRotation,
  effectiveRotation,
  getBlendGroup,
  getFrontDirection,
  getModelFit,
  hasExtensions,
  isSegment,
  localSideForGrid,
  reactsToNeighbors,
  type BlendSides,
  type GridSide,
  type SegmentMask,
} from "./modelManifest";
import { createDirtPathOverlay } from "./dirtPathOverlay";
import { getApronMaterial } from "./paths";
import { createRoadRenderer } from "./roadRenderer";
import { createSmokePlume, type SmokePlume } from "./smoke";

const GRID_ALPHA_IDLE = 0;
const GRID_ALPHA_PLACING = 0.8;
const GRID_COLOR = "#ffffff";

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
  placed: PlacedBuilding | null;
  apron: Mesh | null;
  marker: Mesh | null;
  smoke: SmokePlume | null;
  /** Displayed-work meshes (plinths, statues, facade canvases). */
  art: DisplayArtHandle[];
  buildingId: BuildingId;
  isActive: boolean;
  /** Neighbor signature — colonnade extension ends or row-house blend sides
   * ("" when the building ignores neighbors); change → rebuild. */
  extendKey: string;
  /** Displayed-works signature (slot→artworkId); change → rebuild the art. */
  displayKey: string;
};

/** Stable per-origin signature of which works sit in which slots. */
function displaySignature(bySlot: Map<number, Artwork> | undefined): string {
  if (!bySlot || bySlot.size === 0) return "";
  return [...bySlot.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slot, w]) => `${slot}:${w.id}`)
    .join("|");
}

// Tile types that count as a wall to visually connect to (not roads/decor).
const SOLID_TYPES = new Set<BuildingType>(["city", "residential", "artist", "service", "materials"]);

/**
 * Which ends of the model's local X axis (its long axis) abut a solid
 * building. Local +X faces grid [+x, −y, −x, +y] for quarter rotations 0-3.
 */
function computeExtend(tile: Tile, metadata: BuildingMetadata, tiles: Record<string, Tile>) {
  // Diagonal buildings never extend: the side machinery is cardinal (v1 scope).
  if (isDiagonalRotation(tile.rotation)) return { negX: false, posX: false };
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

const OPPOSITE_GRID_SIDE: Record<GridSide, GridSide> = {
  posX: "negX",
  negX: "posX",
  posY: "negY",
  negY: "posY",
};

/**
 * Local sides of a row-house that stretch to meet an abutting neighbor of the
 * same blend group (cottage ↔ townhouse). Blending is mutual and skips door
 * sides: a side only blends when the neighbor's facing side is door-free too,
 * so both houses agree regardless of placement order and no house ever
 * stretches into a neighbor's doorway. Rotation goes through
 * `effectiveRotation` — houses without a stored rotation render with a
 * position-seeded one, and the scan must match what actually renders.
 */
function computeBlend(
  tile: Tile,
  metadata: BuildingMetadata,
  tiles: Record<string, Tile>
): BlendSides {
  // Diagonal row-houses render isolated — no shared walls at 45° (v1 scope).
  if (isDiagonalRotation(tile.rotation)) return {};
  const group = getBlendGroup(tile.buildingId);
  const r = effectiveRotation(tile.buildingId, tile.position, tile.rotation);
  const door = doorLocalSide(tile.buildingId);
  const { width, depth } = rotatedFootprint(metadata, tile.rotation);
  const { x, y } = tile.position;
  const strips: Record<GridSide, { x: number; y: number }[]> = {
    negX: [],
    posX: [],
    negY: [],
    posY: [],
  };
  for (let dy = 0; dy < depth; dy += 1) {
    strips.negX.push({ x: x - 1, y: y + dy });
    strips.posX.push({ x: x + width, y: y + dy });
  }
  for (let dx = 0; dx < width; dx += 1) {
    strips.negY.push({ x: x + dx, y: y - 1 });
    strips.posY.push({ x: x + dx, y: y + depth });
  }
  const blend: BlendSides = {};
  for (const gridSide of Object.keys(strips) as GridSide[]) {
    const local = localSideForGrid(gridSide, r);
    if (local === door) continue;
    const facing = OPPOSITE_GRID_SIDE[gridSide];
    for (const cell of strips[gridSide]) {
      const neighbor = tiles[`${cell.x},${cell.y}`];
      if (!neighbor || getBlendGroup(neighbor.buildingId) !== group) continue;
      const origin = tiles[`${neighbor.origin.x},${neighbor.origin.y}`];
      if (!origin || isDiagonalRotation(origin.rotation)) continue; // no blending toward 45° houses
      const rn = effectiveRotation(origin.buildingId, origin.position, origin.rotation);
      if (localSideForGrid(facing, rn) === doorLocalSide(origin.buildingId)) continue;
      blend[local] = true;
      break;
    }
  }
  return blend;
}

/** Same-buildingId orthogonal neighbors of a linear segment tile (each cell is
 * its own 1×1 origin), driving its orientation and open-end caps. */
function computeSegment(tile: Tile, tiles: Record<string, Tile>): SegmentMask {
  const { x, y } = tile.position;
  const same = (cx: number, cy: number) => tiles[`${cx},${cy}`]?.buildingId === tile.buildingId;
  return { px: same(x + 1, y), nx: same(x - 1, y), pz: same(x, y + 1), nz: same(x, y - 1) };
}

export function createTileRenderer(scene: Scene, shadowGenerator: ShadowGenerator) {
  const materialCache = new Map<string, StandardMaterial>();
  const active = new Map<string, TileMeshEntry>();
  let renderedTiles: TileMap = {};
  const pendingOrigins = new Set<string>();
  const extensionOrigins = new Set<string>();
  // Kept incrementally so dirt-path redraws don't rescan and sort the entire map.
  const dirtCells = new Set<string>();
  const occupiedCells = new Set<string>();

  const gridLines = createGridLines(scene);

  const roadRenderer = createRoadRenderer(scene);
  const dirtOverlay = createDirtPathOverlay(scene);
  const displayArt = createDisplayArt(scene);
  // Origin key → (slot index → the work displayed there). Fed by syncDisplay.
  let displayedByOrigin = new Map<string, Map<number, Artwork>>();

  // Buildings share thin-instance batches per kit mesh; the batch hosts are the
  // only shadow casters, so the caster list stays constant as the city grows.
  // ponytail: models cast onto the ground but don't receive — blur-ESM self-shadow
  // acne turns the glTF walls to mud; switch to PCF shadows if receiving ever matters
  const batcher = createBuildingBatcher(scene, (mesh, castsShadow) => {
    if (castsShadow) shadowGenerator.addShadowCaster(mesh);
  });

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
    mesh.rotation.y = yawOfRotation(tile.rotation);
    return mesh;
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
    // Diagonal buildings: the quarter-frame dims above already carry the odd
    // swap, so a fixed 45° lands the apron parallel to the building at every
    // diagonal quarter. Corners spill onto unclaimed mask-gap cells; roads
    // (y 0.01) and buildings draw over them.
    if (isDiagonalRotation(tile.rotation)) apron.rotation.y = Math.PI / 4;
    return apron;
  }

  // Plinths (pedestal always, marble statue when filled) and facade painting
  // canvases (first MAX_FACADE_CANVASES filled slots). Built as individual
  // meshes, not thin instances — counts are tiny and each is unique per work.
  // ponytail: citizens may clip a plinth cell — the fountain keep-out
  // (citizens.ts) isn't extended to plinths; cosmetic, revisit if it reads badly.
  function buildDisplayArt(tile: Tile, metadata: BuildingMetadata): DisplayArtHandle[] {
    const slots = metadata.displaySlots;
    if (!slots) return [];
    const originKey = `${tile.position.x},${tile.position.y}`;
    const bySlot = displayedByOrigin.get(originKey);
    const r = effectiveFullRotation(tile.buildingId, tile.position, tile.rotation);
    const center = gridToWorld(tile.position.x, tile.position.y, metadata, tile.rotation);
    const art: DisplayArtHandle[] = [];

    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i]!;
      if (slot.kind !== "plinth" || !slot.cell) continue;
      const { x: dx, y: dy } = rotateSlotCell(slot.cell, metadata.footprint, r);
      const { x, z } = gridToWorld(tile.position.x + dx, tile.position.y + dy);
      const pedestal = displayArt.createPlinth();
      pedestal.position.set(x, 0.02, z);
      shadowGenerator.addShadowCaster(pedestal);
      art.push({ mesh: pedestal });
      const work = bySlot?.get(i);
      if (work) {
        const statue = displayArt.createStatue(work);
        statue.position.set(x, 0.02 + PLINTH_HEIGHT, z);
        statue.rotation.y = Math.atan2(center.x - x, center.z - z); // face the footprint center
        shadowGenerator.addShadowCaster(statue);
        art.push({ mesh: statue });
      }
    }

    // Facade canvases: first MAX_FACADE_CANVASES filled painting slots, hung on
    // the model's front wall.
    const front = getFrontDirection(tile.buildingId);
    const filled: Artwork[] = [];
    if (front && bySlot) {
      for (let i = 0; i < slots.length && filled.length < MAX_FACADE_CANVASES; i += 1) {
        if (slots[i]!.kind !== "painting") continue;
        const work = bySlot.get(i);
        if (work) filled.push(work);
      }
    }
    if (front && filled.length > 0) {
      const theta = yawOfRotation(r);
      const dirX = front[0] * Math.cos(theta) + front[1] * Math.sin(theta);
      const dirZ = -front[0] * Math.sin(theta) + front[1] * Math.cos(theta);
      // front is a local direction, so the facade half-extent is the local
      // axis it points along — exact at every rotation, 45° included.
      const half =
        ((front[0] !== 0 ? metadata.footprint.width : metadata.footprint.depth) * CELL_SIZE) / 2;
      // The painting stands free in the open just in front of the facade, so it
      // never hides in the busy kit relief; the stand carries its own height.
      const standDist = half * getModelFit(tile.buildingId) + 0.3;
      const yaw = Math.atan2(dirX, dirZ) + Math.PI; // canvas (+Z) faces outward, toward viewers
      // Flank the (centered) entrance instead of covering it: lay easels out from
      // a central door gap that scales with facade width, alternating sides and
      // walking outward, each tilted inward so it reads as presented, not flat-on.
      const spacing = 0.7;
      const doorGap = Math.max(spacing, half * 0.5);
      const TILT = 0.35; // ~20° inward
      filled.forEach((work, idx) => {
        const side = idx % 2 === 0 ? 1 : -1;
        const rank = Math.floor(idx / 2);
        const off = side * (doorGap + rank * spacing);
        const easel = displayArt.createPainting(work);
        easel.mesh.position.set(
          center.x + dirX * standDist + dirZ * off,
          0.02,
          center.z + dirZ * standDist - dirX * off
        );
        easel.mesh.rotation.y = yaw - side * TILT;
        art.push(easel);
      });
    }
    return art;
  }

  function createEntry(
    tile: Tile,
    metadata: BuildingMetadata,
    extend?: { negX: boolean; posX: boolean },
    blend?: BlendSides,
    segment?: SegmentMask
  ): TileMeshEntry {
    const apron = createApron(tile, metadata);
    const { x, z } = gridToWorld(tile.position.x, tile.position.y, metadata, tile.rotation);
    // A pad-bearing building (plaza, market) whose kit parts haven't streamed in
    // yet would otherwise batch as pad-only and never recover — the batched pad
    // makes `placed` non-null, so no box placeholder is created and
    // upgradeModels (which only revisits boxes) skips it forever. Fall back to
    // the box like any modelless building so the load→upgrade path rebuilds it
    // with its full model once the kit files arrive.
    const modelReady = hasModel(tile.buildingId) || !expectsModel(tile.buildingId);
    const placed = modelReady
      ? batcher.place(
          tile.buildingId,
          rotatedFootprint(metadata, tile.rotation),
          tile.position,
          x,
          z,
          tile.rotation,
          extend,
          blend,
          tile.isActive,
          segment
        )
      : null;
    let box: Mesh | null = null;
    let smoke: SmokePlume | null = null;
    if (placed) {
      // Smoke is exclusive to production buildings — a chimney on a civic
      // prefab (palazzo) is just architecture.
      if (placed.chimneyTop && (metadata.type === "artist" || tile.buildingId === "bakery")) {
        const top = placed.chimneyTop;
        smoke = createSmokePlume(scene, new Vector3(top.x - 0.08, top.y, top.z - 0.08));
        smoke.setActive(tile.isActive);
      }
    } else {
      box = createBoxMesh(tile, metadata);
    }
    const art = buildDisplayArt(tile, metadata);
    return {
      box,
      placed,
      apron,
      marker: null,
      smoke,
      art,
      buildingId: tile.buildingId,
      isActive: tile.isActive,
      extendKey: "",
      displayKey: "",
    };
  }

  function disposeEntry(entry: TileMeshEntry) {
    entry.marker?.dispose();
    entry.box?.dispose();
    entry.smoke?.dispose();
    entry.apron?.dispose();
    entry.placed?.dispose();
    for (const handle of entry.art) {
      shadowGenerator.removeShadowCaster(handle.mesh);
      if (handle.dispose) handle.dispose();
      else handle.mesh.dispose();
    }
  }

  function markerHeight(entry: TileMeshEntry, metadata: BuildingMetadata) {
    if (entry.placed) return entry.placed.height + 0.35;
    return metadata.size.height + 0.4;
  }

  // The shadow map renders on demand (REFRESHRATE_RENDER_ONCE); poke it when
  // casters change. Depth-shader compilation is forced first — a not-yet-ready
  // caster is silently skipped during the single render and would stay
  // shadowless until the next change. The microtask coalesces the per-entry
  // calls of a processSync batch into one compile+render.
  let shadowRefreshPending = false;
  function refreshShadows() {
    if (shadowRefreshPending) return;
    shadowRefreshPending = true;
    queueMicrotask(() => {
      shadowRefreshPending = false;
      if (scene.isDisposed) return;
      void shadowGenerator
        .forceCompilationAsync()
        .then(() => shadowGenerator.getShadowMap()?.resetRefreshCounter());
    });
  }

  function renderOrigin(key: string) {
    const tile = renderedTiles[key];
    const entry = active.get(key);
    if (!tile || !tile.isOrigin || tile.type === "road") {
      if (entry) {
        disposeEntry(entry);
        active.delete(key);
        refreshShadows();
      }
      extensionOrigins.delete(key);
      return;
    }

    const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
    if (!metadata) return;
    const extend = hasExtensions(tile.buildingId) ? computeExtend(tile, metadata, renderedTiles) : null;
    const blend = getBlendGroup(tile.buildingId) != null ? computeBlend(tile, metadata, renderedTiles) : null;
    const segment = isSegment(tile.buildingId) ? computeSegment(tile, renderedTiles) : null;
    // Rotation joins the key so a raze+rebuild race can never leave a stale
    // orientation (placed tiles never mutate rotation in place otherwise).
    const rotationKey = tile.rotation != null ? `r${tile.rotation}|` : "";
    const extendKey =
      rotationKey +
      (extend
        ? `${extend.negX ? "n" : ""}${extend.posX ? "p" : ""}`
        : blend
          ? `b${blend.posX ? 1 : 0}${blend.negX ? 1 : 0}${blend.posZ ? 1 : 0}${blend.negZ ? 1 : 0}`
          : segment
            ? `s${segment.px ? 1 : 0}${segment.nx ? 1 : 0}${segment.pz ? 1 : 0}${segment.nz ? 1 : 0}`
            : "");
    const displayKey = displaySignature(displayedByOrigin.get(key));
    let nextEntry = entry;
    const staleBox = nextEntry?.box && hasModel(tile.buildingId);
    if (
      !nextEntry ||
      nextEntry.buildingId !== tile.buildingId ||
      staleBox ||
      nextEntry.extendKey !== extendKey ||
      nextEntry.displayKey !== displayKey
    ) {
      if (nextEntry) disposeEntry(nextEntry);
      nextEntry = createEntry(tile, metadata, extend ?? undefined, blend ?? undefined, segment ?? undefined);
      nextEntry.extendKey = extendKey;
      nextEntry.displayKey = displayKey;
      active.set(key, nextEntry);
      refreshShadows();
    } else if (nextEntry.isActive !== tile.isActive) {
      nextEntry.isActive = tile.isActive;
      nextEntry.placed?.setActive(tile.isActive);
      if (nextEntry.box) nextEntry.box.material = getMaterial(metadata.color, metadata.type, !tile.isActive);
      nextEntry.smoke?.setActive(tile.isActive);
    }

    if (reactsToNeighbors(tile.buildingId)) extensionOrigins.add(key);
    else extensionOrigins.delete(key);

    const needsMarker = !tile.isActive;
    if (needsMarker && !nextEntry.marker) {
      const marker = MeshBuilder.CreatePlane(`marker-${key}`, { width: 0.35, height: 0.18 }, scene);
      marker.material = markerMaterial;
      marker.isPickable = false;
      const { x, z } = gridToWorld(tile.position.x, tile.position.y, metadata, tile.rotation);
      marker.position.set(x, markerHeight(nextEntry, metadata), z);
      marker.billboardMode = 7; // BILLBOARDMODE_ALL
      nextEntry.marker = marker;
    } else if (!needsMarker && nextEntry.marker) {
      nextEntry.marker.dispose();
      nextEntry.marker = null;
    }
  }

  /**
   * Rebuild the origin→slot→work index from the artworks list and queue any
   * origin whose displayed-works signature changed. Artwork changes don't touch
   * the tiles object, so this is the renderer's only channel for display edits.
   */
  function syncDisplay(artworks: Artwork[]) {
    const next = new Map<string, Map<number, Artwork>>();
    for (const w of artworks) {
      if (!w.displayedAt) continue;
      let bySlot = next.get(w.displayedAt.key);
      if (!bySlot) next.set(w.displayedAt.key, (bySlot = new Map()));
      bySlot.set(w.displayedAt.slot, w);
    }
    for (const key of new Set([...displayedByOrigin.keys(), ...next.keys()])) {
      if (displaySignature(displayedByOrigin.get(key)) !== displaySignature(next.get(key))) {
        pendingOrigins.add(key);
      }
    }
    displayedByOrigin = next;
  }

  /**
   * Queue only changed origins; callers spread construction over animation frames.
   * Returns the building ids present among changed tiles so the caller can
   * preload just those models instead of rescanning the whole map.
   */
  function queueSync(tiles: TileMap) {
    const changedKeys = new Set<string>();
    const topologyChangedKeys = new Set<string>();
    const changedBuildingIds = new Set<BuildingId>();
    for (const [key, tile] of Object.entries(renderedTiles)) {
      if (tiles[key] !== tile) changedKeys.add(key);
    }
    for (const [key, tile] of Object.entries(tiles)) {
      if (renderedTiles[key] !== tile) changedKeys.add(key);
    }
    if (changedKeys.size === 0) return changedBuildingIds;

    for (const key of changedKeys) {
      const previous = renderedTiles[key];
      const next = tiles[key];
      if (next && next.type !== "road") changedBuildingIds.add(next.buildingId);
      roadRenderer.update(key, previous, next);
      const wasOccupied = previous != null;
      const isOccupied = next != null;
      const wasDirt = previous?.buildingId === "dirt_path";
      const isDirt = next?.buildingId === "dirt_path";
      if (wasOccupied !== isOccupied || wasDirt !== isDirt) {
        topologyChangedKeys.add(key);
        if (isOccupied) occupiedCells.add(key);
        else occupiedCells.delete(key);
        if (isDirt) dirtCells.add(key);
        else dirtCells.delete(key);
      }
      if (previous && previous.type !== "road") {
        pendingOrigins.add(`${previous.origin.x},${previous.origin.y}`);
      }
      if (next && next.type !== "road") {
        pendingOrigins.add(`${next.origin.x},${next.origin.y}`);
      }
    }
    // Neighbor-reactive buildings (colonnade extensions, row-house blending)
    // recompute against the new tiles; unchanged extend/blend keys early-out in
    // renderOrigin without rebuilding, so this is a cheap per-edit rescan.
    for (const key of extensionOrigins) pendingOrigins.add(key);
    renderedTiles = tiles;
    roadRenderer.flush(renderedTiles);

    dirtOverlay.update(dirtCells, occupiedCells, topologyChangedKeys);
    return changedBuildingIds;
  }

  /** Builds at most `budget` entries. Returns true when the pending work is drained. */
  function processSync(budget = Number.POSITIVE_INFINITY) {
    let built = 0;
    while (pendingOrigins.size > 0 && built < budget) {
      const key = pendingOrigins.values().next().value as string;
      pendingOrigins.delete(key);
      renderOrigin(key);
      built += 1;
    }
    // Instance matrices changed → the on-demand shadow map needs a render.
    if (batcher.flush()) refreshShadows();
    // One dirt chunk per frame: each is a 512² canvas raster + GPU upload, too
    // heavy to run all at once during the initial map sync.
    const dirtDrained = dirtOverlay.process(1);
    return pendingOrigins.size === 0 && dirtDrained;
  }

  /** Swap placeholder boxes for just-loaded model types without rebuilding the map. */
  function upgradeModels(buildingIds: ReadonlySet<BuildingId>) {
    for (const [key, entry] of active) {
      if (entry.box && buildingIds.has(entry.buildingId)) pendingOrigins.add(key);
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
    roadRenderer.dispose();
    batcher.dispose();
    dirtOverlay.dispose();
    displayArt.dispose();
    gridLines.dispose();
  }

  return { queueSync, syncDisplay, processSync, upgradeModels, dispose, setGridVisible };
}
