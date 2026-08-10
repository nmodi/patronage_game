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
import { rotateSlotCell } from "~/game/art/display";
import { gridToWorld, type Tile, type TileMap } from "~/game/grid";
import type { Artwork, BuildingMetadata, BuildingType } from "~/game/types";
import {
  createBuildingBatcher,
  desaturate,
  expectsModel,
  hasModel,
  type PlacedBuilding,
} from "./assetLibrary";
import {
  createDisplayArt,
  MAX_FACADE_CANVASES,
  PLINTH_HEIGHT,
  SLAB_HEIGHT,
  type DisplayArtHandle,
} from "./displayArt";
import {
  effectiveFullRotation,
  facadeHalfExtent,
  frontVector,
  getFrontDirection,
  getModelFit,
  hasExtensions,
  isSegment,
  reactsToNeighbors,
  type SegmentMask,
} from "./modelManifest";
import { createDirtPathOverlay } from "./dirtPathOverlay";
import { footprintGroundRange, worldGroundY } from "./groundLevel";
import { getApronMaterial } from "./paths";
import { createRoadRenderer } from "./roadRenderer";
import { createSmokePlume, type SmokePlume } from "./smoke";

const GRID_ALPHA_IDLE = 0;
const GRID_ALPHA_PLACING = 0.8;
const GRID_COLOR = "#ffffff";

// Placement grid, draped over the ground: polylines with a vertex per cell
// so lines follow the elevation field (straight 2-point lines would bury
// under hills). Built lazily on first show — the ground sampler registers
// after this renderer is constructed.
function createGridLines(scene: Scene) {
  const halfGrid = (GRID_SIZE * CELL_SIZE) / 2;
  const lines: Vector3[][] = [];
  for (let i = 0; i <= GRID_SIZE; i += 1) {
    const p = -halfGrid + i * CELL_SIZE;
    const row: Vector3[] = [];
    const col: Vector3[] = [];
    for (let j = 0; j <= GRID_SIZE; j += 1) {
      const q = -halfGrid + j * CELL_SIZE;
      row.push(new Vector3(q, 0.02 + worldGroundY(q, p), p));
      col.push(new Vector3(p, 0.02 + worldGroundY(p, q), q));
    }
    lines.push(row, col);
  }
  const grid = MeshBuilder.CreateLineSystem("grid", { lines, useVertexAlpha: true }, scene);
  grid.color = Color3.FromHexString(GRID_COLOR);
  grid.alpha = GRID_ALPHA_IDLE;
  grid.isPickable = false;
  return grid;
}

type TileMeshEntry = {
  box: Mesh | null;
  placed: PlacedBuilding | null;
  apron: Mesh | null;
  /** Foundation skirt on sloped ground (hillside podium); null when flat. */
  skirt: Mesh | null;
  /** Ground height the building base sits at (highest footprint sample). */
  seatY: number;
  marker: Mesh | null;
  smoke: SmokePlume | null;
  /** Displayed-work meshes (plinths, statues, facade canvases). */
  art: DisplayArtHandle[];
  buildingId: BuildingId;
  isActive: boolean;
  /** Neighbor signature — colonnade extension ends or segment caps
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

  // Built lazily on first show so the draped lines see the ground sampler.
  let gridLines: ReturnType<typeof createGridLines> | null = null;

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

  // Foundation stone for hillside podium skirts (one shared material).
  const skirtMaterial = new StandardMaterial("skirt-mat", scene);
  skirtMaterial.diffuseColor = Color3.FromHexString("#b3a58a");
  skirtMaterial.specularColor = Color3.Black();

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

  function createBoxMesh(tile: Tile, metadata: BuildingMetadata, seatY: number) {
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
    mesh.position.set(x, y + seatY, z);
    mesh.rotation.y = yawOfRotation(tile.rotation);
    return mesh;
  }

  // Flagstone ground over the full footprint, so `paved` buildings visually
  // join adjacent plazas/roads instead of showing a grass rim of fit slack.
  // ponytail: stays full-color when the building is inactive — it's just ground.
  function createApron(tile: Tile, metadata: BuildingMetadata, seatY: number): Mesh | null {
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
    apron.position.set(x, 0.005 + seatY, z);
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
  function buildDisplayArt(tile: Tile, metadata: BuildingMetadata, seatY: number): DisplayArtHandle[] {
    const slots = metadata.displaySlots;
    if (!slots) return [];
    const originKey = `${tile.position.x},${tile.position.y}`;
    const bySlot = displayedByOrigin.get(originKey);
    const r = effectiveFullRotation(tile.buildingId, tile.position, tile.rotation);
    const center = gridToWorld(tile.position.x, tile.position.y, metadata, tile.rotation);
    // Everything on the footprint shares the building's seat height.
    const gY = seatY;
    const art: DisplayArtHandle[] = [];

    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i]!;
      if (slot.kind !== "plinth" || !slot.cell) continue;
      const { x: dx, y: dy } = rotateSlotCell(slot.cell, metadata.footprint, r);
      const { x, z } = gridToWorld(tile.position.x + dx, tile.position.y + dy);
      const pedestal: DisplayArtHandle = { mesh: displayArt.createPlinth() };
      pedestal.mesh.position.set(x, 0.02 + gY, z);
      shadowGenerator.addShadowCaster(pedestal.mesh);
      art.push(pedestal);
      const work = bySlot?.get(i);
      if (work) {
        const statue = displayArt.createStatue(
          work,
          (m) => shadowGenerator.addShadowCaster(m),
          (footX, footZ) => {
            // Reclining-wide piece (statueFit): the round pedestal becomes a
            // low slab under its footprint, and the statue re-seats on it.
            // The facing rotation below aims the long axis at the footprint
            // center (end-on); a quarter turn lays it parallel to the host's
            // edge so the figure presents in profile, snapped to eighth
            // turns — square with the grid or on the 45° diagonal (the kit's
            // diagonal-building language), never in between, where the
            // rectangular slab reads as crooked against the paved tiles (the
            // round pedestal never showed its rotation).
            const eighth = Math.PI / 4;
            statue.rotation.y = Math.round((statue.rotation.y + Math.PI / 2) / eighth) * eighth;
            const slab = displayArt.createSlab(footX, footZ);
            slab.position.set(x, 0.02 + gY, z);
            slab.rotation.y = statue.rotation.y;
            shadowGenerator.addShadowCaster(slab);
            shadowGenerator.removeShadowCaster(pedestal.mesh);
            pedestal.mesh.dispose();
            pedestal.mesh = slab; // handle mutation — teardown disposes the slab
            statue.position.y = 0.02 + gY + SLAB_HEIGHT;
          }
        );
        statue.position.set(x, 0.02 + gY + PLINTH_HEIGHT, z);
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
      const [dirX, dirZ] = frontVector(front, yawOfRotation(r));
      const half = facadeHalfExtent(front, metadata.footprint);
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
        const ex = center.x + dirX * standDist + dirZ * off;
        const ez = center.z + dirZ * standDist - dirX * off;
        // Easels stand off the footprint — sample the terrace under their feet.
        easel.mesh.position.set(ex, 0.02 + worldGroundY(ex, ez), ez);
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
    segment?: SegmentMask
  ): TileMeshEntry {
    const { x, z } = gridToWorld(tile.position.x, tile.position.y, metadata, tile.rotation);
    // Seat on the highest ground under the footprint (walls never bury); a
    // stone podium skirt covers the downhill gap. Decorations (trees, statues)
    // just stand on the ground under their center instead.
    const { width, depth } = rotatedFootprint(metadata, tile.rotation);
    const decoration = metadata.type === "decoration";
    const range = decoration
      ? { seat: worldGroundY(x, z), min: worldGroundY(x, z) }
      : footprintGroundRange(x, z, (width * CELL_SIZE) / 2, (depth * CELL_SIZE) / 2);
    const seatY = range.seat;
    let skirt: Mesh | null = null;
    if (!decoration && range.seat - range.min > 0.03) {
      skirt = MeshBuilder.CreateBox(
        `skirt-${tile.buildingId}`,
        { width: width * CELL_SIZE + 0.06, height: 0.9, depth: depth * CELL_SIZE + 0.06 },
        scene
      );
      skirt.material = skirtMaterial;
      skirt.isPickable = false;
      // Top just under the apron/base plane; bottom well inside the hill.
      skirt.position.set(x, seatY + 0.004 - 0.45, z);
      if (isDiagonalRotation(tile.rotation)) skirt.rotation.y = Math.PI / 4;
    }
    const apron = createApron(tile, metadata, seatY);
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
          tile.isActive,
          segment,
          seatY
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
      box = createBoxMesh(tile, metadata, seatY);
    }
    const art = buildDisplayArt(tile, metadata, seatY);
    return {
      box,
      placed,
      apron,
      skirt,
      seatY,
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
    entry.skirt?.dispose();
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
    const segment = isSegment(tile.buildingId) ? computeSegment(tile, renderedTiles) : null;
    // Rotation joins the key so a raze+rebuild race can never leave a stale
    // orientation (placed tiles never mutate rotation in place otherwise).
    const rotationKey = tile.rotation != null ? `r${tile.rotation}|` : "";
    const extendKey =
      rotationKey +
      (extend
        ? `${extend.negX ? "n" : ""}${extend.posX ? "p" : ""}`
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
      nextEntry = createEntry(tile, metadata, extend ?? undefined, segment ?? undefined);
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
      marker.position.set(x, markerHeight(nextEntry, metadata) + nextEntry.seatY, z);
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
      // Only cardinal dirt uses the raster overlay; diagonal dirt (rotation set)
      // renders through roadRenderer's ribbon batch. It still enters occupiedCells
      // below, so adjoining cardinal dirt drops its rim against the ribbon.
      const wasDirt = previous?.buildingId === "dirt_path" && previous.rotation == null;
      const isDirt = next?.buildingId === "dirt_path" && next.rotation == null;
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
    // Neighbor-reactive buildings (colonnade extensions, linear segments)
    // recompute against the new tiles; unchanged extend/segment keys early-out in
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
    if (placing && !gridLines) gridLines = createGridLines(scene);
    if (gridLines) gridLines.alpha = placing ? GRID_ALPHA_PLACING : GRID_ALPHA_IDLE;
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
    gridLines?.dispose();
  }

  return { queueSync, syncDisplay, processSync, upgradeModels, dispose, setGridVisible };
}
