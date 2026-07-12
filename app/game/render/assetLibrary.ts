import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";

import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";

import { CELL_SIZE } from "~/game/constants";
import { BUILDING_METADATA_BY_ID, type BuildingId } from "~/game/buildings";
import {
  FACADE_PALETTES,
  MATERIAL_TINTS,
  MODEL_MANIFEST,
  ROOF_PALETTE,
  TEXTURE_TINTS,
  TINT_COLORS,
  TOWN,
  effectiveRotation,
  hashPosition,
  segmentParts,
  type BlendSides,
  type ModelDef,
  type Part,
  type SegmentMask,
} from "./modelManifest";
import {
  SCATTER_FILES,
  scatterEnvironment as buildEnvironmentScatter,
} from "./environmentScatter";
import { disposePathMaterials, getPadMaterial, getPlazaMaterial } from "./paths";

registerBuiltInLoaders();

// Active/inactive material pairs, shared by every clone of a container.
const materialPairs = new Map<Material, { on: Material; off: Material }>();
// Tinted twins of a base pair, per (on-material, tint id) — see Part.tint.
const tintedPairs = new Map<Material, Map<string, { on: Material; off: Material }>>();

// Colormap variants beyond the base/desat pair (e.g. mint quoins), by file stem.
const variantColormaps = new Map<string, { on: Texture; off: Texture }>();
function getVariantColormaps(scene: Scene, stem: string) {
  let v = variantColormaps.get(stem);
  if (!v) {
    v = {
      on: new Texture(`${TOWN}Textures/${stem}.png`, scene, false, false),
      off: new Texture(`${TOWN}Textures/${stem}-desat.png`, scene, false, false),
    };
    variantColormaps.set(stem, v);
  }
  return v;
}

function getTintedPair(pair: { on: Material; off: Material }, tintId: string) {
  let byTint = tintedPairs.get(pair.on);
  if (!byTint) tintedPairs.set(pair.on, (byTint = new Map()));
  let tinted = byTint.get(tintId);
  if (!tinted) {
    const texTint = TEXTURE_TINTS[tintId];
    const color = Color3.FromHexString(TINT_COLORS[texTint?.diffuse ?? tintId] ?? "#ffffff");
    const on = (pair.on as StandardMaterial).clone(`${pair.on.name}~${tintId}`);
    on.diffuseColor = on.diffuseColor.multiply(color);
    // Clone keeps the desat colormap texture, so inactive tinted buildings gray
    // out the same way untinted ones do, just under their tint.
    const off = (pair.off as StandardMaterial).clone(`${pair.off.name}~${tintId}`);
    off.diffuseColor = off.diffuseColor.multiply(color);
    // Texture-swap tints replace the colormap so a baked-in swatch (quoins) can
    // be recolored without touching the rest of the wall via a diffuse multiply.
    if (texTint && on.diffuseTexture) {
      const variant = getVariantColormaps(on.getScene(), texTint.file);
      on.diffuseTexture = variant.on;
      off.diffuseTexture = variant.off;
    }
    byTint.set(tintId, (tinted = { on, off }));
  }
  return tinted;
}
const containers = new Map<string, AssetContainer>();
const containerLoads = new Map<string, Promise<AssetContainer | null>>();
// Shared gamma-space colormaps. The loader's own albedo textures are sRGB buffers meant
// for the PBR pipeline; sampling them from StandardMaterial renders too dark.
let townColormap: Texture | null = null;
let desatColormap: Texture | null = null;

function getColormaps(scene: Scene) {
  if (!townColormap) {
    // invertY=false to match the glTF loader's UV orientation
    townColormap = new Texture(TOWN + "Textures/colormap.png", scene, false, false);
    desatColormap = new Texture(TOWN + "Textures/colormap-desat.png", scene, false, false);
  }
  return { on: townColormap, off: desatColormap! };
}

function desaturate(color: Color3) {
  const luminance = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
  return Color3.Lerp(color, new Color3(luminance, luminance, luminance), 0.75).scale(0.85);
}

/** glTF loads PBR materials that need IBL to look right; the scene uses simple lights,
 * so convert everything to StandardMaterial and build the desaturated twin while at it. */
function convertMaterials(container: AssetContainer, file: string, scene: Scene) {
  const tints = MATERIAL_TINTS[file];
  for (const mesh of container.meshes) {
    const mat = mesh.material;
    if (!mat || !(mat instanceof PBRMaterial)) continue;

    let pair = materialPairs.get(mat);
    if (!pair) {
      const on = new StandardMaterial(`${mat.name}-std`, scene);
      const tint = tints?.[mat.name];
      on.diffuseColor = tint
        ? Color3.FromHexString(tint)
        : mat.albedoColor.toGammaSpace();
      if (mat.albedoTexture) on.diffuseTexture = getColormaps(scene).on;
      on.specularColor = Color3.Black();
      on.backFaceCulling = mat.backFaceCulling;
      // Kenney meshes are double-sided; in the RH scene the visible side is often the
      // backface, which gets zero diffuse light unless lighting flips with the normal.
      on.twoSidedLighting = true;

      const off = on.clone(`${mat.name}-std-off`);
      if (on.diffuseTexture) {
        off.diffuseTexture = getColormaps(scene).off;
        off.diffuseColor = off.diffuseColor.scale(0.9);
      } else {
        off.diffuseColor = desaturate(on.diffuseColor);
      }

      pair = { on, off };
      materialPairs.set(mat, pair);
      materialPairs.set(on, pair);
      materialPairs.set(off, pair);
    }
    mesh.material = pair.on;
  }
}

// Cache the in-flight promise, not just the resolved container: concurrent callers
// (e.g. StrictMode double-mount) must share one load instead of racing duplicate ones.
async function getContainer(file: string, scene: Scene) {
  let load = containerLoads.get(file);
  if (!load) {
    load = LoadAssetContainerAsync(file, scene).then((container) => {
      if (scene.isDisposed) {
        container.dispose();
        return null;
      }
      convertMaterials(container, file, scene);
      containers.set(file, container);
      return container;
    });
    containerLoads.set(file, load);
  }
  return load;
}

function addModelFiles(files: Set<string>, def: ModelDef | undefined) {
  if (!def) return;
  for (const part of segmentSpecParts(def) ?? def.parts ?? []) files.add(part.file);
  for (const part of def.variants ?? []) files.add(part.file);
  for (const part of def.extendNegX ?? []) files.add(part.file);
  for (const part of def.extendPosX ?? []) files.add(part.file);
}

/** All distinct parts referenced by a segment spec (for loading/hasModel). */
function segmentSpecParts(def: ModelDef): Part[] | null {
  const s = def.segment;
  if (!s) return null;
  return [...(s.core ?? []), ...s.along, ...(s.cap ? [s.cap] : [])];
}

// glTF parsing and material conversion run on the main thread. Keep only a few
// files in flight so loading a save does not turn into one long completion task.
async function preloadFiles(files: Iterable<string>, scene: Scene, onFileLoaded?: () => void) {
  const queue = [...new Set(files)];
  const workers = Math.min(4, queue.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (queue.length > 0) {
        const file = queue.pop();
        if (file) {
          await getContainer(file, scene);
          onFileLoaded?.();
        }
      }
    })
  );
}

/** Distinct model files a set of building types references (loading-progress denominator). */
export function countModelFiles(buildingIds: Iterable<BuildingId>) {
  const files = new Set<string>();
  for (const buildingId of buildingIds) addModelFiles(files, MODEL_MANIFEST[buildingId]);
  return files.size;
}

/** Load only model files referenced by placed/selected building types. */
export async function preloadBuildingModels(
  buildingIds: Iterable<BuildingId>,
  scene: Scene,
  onFileLoaded?: () => void
) {
  const files = new Set<string>();
  for (const buildingId of buildingIds) addModelFiles(files, MODEL_MANIFEST[buildingId]);
  await preloadFiles(files, scene, onFileLoaded);
}

/** Wilderness is decorative, so it deliberately streams after the playable city. */
export async function preloadEnvironmentModels(scene: Scene) {
  await preloadFiles(SCATTER_FILES, scene);
}

function getPadPair(width: number, depth: number, style: "plaza" | undefined, scene: Scene) {
  // Plaza paving drawers are square-only; only the mottled stone supports rects.
  const on = style === "plaza" ? getPlazaMaterial(width, scene) : getPadMaterial(width, depth, scene);
  let pair = materialPairs.get(on);
  if (!pair) {
    // Dim the flagstones when the building goes inactive (market short on workers).
    const off = on.clone(`${on.name}-off`);
    off.diffuseColor = new Color3(0.6, 0.6, 0.6);
    pair = { on, off };
    materialPairs.set(on, pair);
    materialPairs.set(off, pair);
  }
  return pair;
}

function instantiatePart(
  part: Part,
  parent: TransformNode
): { roots: TransformNode[]; meshes: AbstractMesh[] } {
  const container = containers.get(part.file);
  if (!container) return { roots: [], meshes: [] };
  const entries = container.instantiateModelsToScene((name) => name, false, {
    doNotInstantiate: true, // clones own their material slot, needed for active/inactive swaps
  });
  const roots: TransformNode[] = [];
  const meshes: AbstractMesh[] = [];
  for (const node of entries.rootNodes) {
    const root = node as TransformNode; // glTF roots are always meshes
    root.parent = parent;
    root.position.set(...(part.position ?? [0, 0, 0]));
    if (part.rotationY) {
      root.rotationQuaternion = null; // glTF roots carry a quaternion that overrides .rotation
      root.rotation.set(0, part.rotationY, 0);
    }
    if (typeof part.scale === "number") root.scaling.setAll(part.scale);
    else if (part.scale) root.scaling.set(...part.scale);
    roots.push(root);
    for (const mesh of root.getChildMeshes(false)) meshes.push(mesh);
  }
  return { roots, meshes };
}

/** True when the building has a manifest entry whose files are all loaded. */
export function hasModel(buildingId: BuildingId) {
  const def = MODEL_MANIFEST[buildingId];
  if (!def) return false;
  const parts = segmentSpecParts(def) ?? def.parts ?? def.variants ?? [];
  return parts.length > 0 && parts.every((part) => containers.has(part.file));
}

export type BuildingModel = {
  root: TransformNode;
  meshes: AbstractMesh[];
  /** Batch key per mesh, parallel to `meshes`: source file + mesh index within
   * its part instance (`pad:<size>` for the paving pad). Lets the batcher map
   * each cloned mesh back to a shared thin-instance host. */
  meshKeys: string[];
  /** World-space height after fitting, for markers/labels. */
  height: number;
  /** Add to the tile-center position: recenters prefabs whose composed
   * bounding box isn't symmetric around the parts' origin (e.g. palazzo). */
  offsetX: number;
  offsetZ: number;
};

/** Move a part's faces along one local axis: faces with a target land exactly
 * on it, faces without stay anchored where they are. `boundMin/Max` are the
 * part's kit-space bounds on that axis (building-root space, pre-rotation). */
function stretchPartToTargets(
  roots: TransformNode[],
  partRotationY: number | undefined,
  axis: "x" | "z",
  boundMin: number,
  boundMax: number,
  targetMin: number | null,
  targetMax: number | null
) {
  if (targetMin == null && targetMax == null) return;
  const extent = boundMax - boundMin;
  if (extent <= 0) return;
  const newMin = targetMin ?? boundMin;
  const newMax = targetMax ?? boundMax;
  const factor = (newMax - newMin) / extent;
  // A part's quarter-turn rotationY swaps which of its own scaling axes spans
  // the building axis; its position stays in parent (building) space.
  const odd = Math.abs(Math.round((partRotationY ?? 0) / (Math.PI / 2))) % 2 === 1;
  const scaleAxis = odd ? (axis === "x" ? "z" : "x") : axis;
  for (const partRoot of roots) {
    partRoot.scaling[scaleAxis] *= factor;
    partRoot.position[axis] = newMin + factor * (partRoot.position[axis] - boundMin);
  }
}

/**
 * Build the model for a building, scaled to its footprint with the base at y=0.
 * Returns null when the building has no manifest entry (caller falls back to a box).
 */
export function instantiateBuilding(
  buildingId: BuildingId,
  footprint: { width: number; depth: number },
  gridPos: { x: number; y: number },
  scene: Scene,
  rotation?: number, // player-chosen quarter turns; overrides seeded randomRotate
  extend?: { negX: boolean; posX: boolean }, // append extendNegX/PosX parts
  blend?: BlendSides, // local sides stretched to the footprint edge (row-houses)
  segmentMask?: SegmentMask // per-cell linear segment: build parts from neighbors
): BuildingModel | null {
  const def = MODEL_MANIFEST[buildingId];
  if (!def) return null;

  const hash = hashPosition(gridPos.x, gridPos.y);
  // Position-hashed tints, on shifted bits so they don't correlate with the
  // hash%4 rotation (or each other) — same cell always renders the same.
  const palette = FACADE_PALETTES[BUILDING_METADATA_BY_ID[buildingId].type];
  const facadeTint = palette ? palette[(hash >> 4) % palette.length] : undefined;
  const roofTint = ROOF_PALETTE[(hash >> 7) % ROOF_PALETTE.length];
  const resolveTint = (tint?: string) =>
    tint === "facade" ? facadeTint : tint === "roof" ? roofTint : tint;
  let parts = def.segment
    ? segmentParts(def.segment, segmentMask ?? { px: false, nx: false, pz: false, nz: false })
    : def.parts ?? (def.variants ? [def.variants[hash % def.variants.length]] : []);
  if (!def.segment) {
    if (extend?.negX && def.extendNegX) parts = [...parts, ...def.extendNegX];
    if (extend?.posX && def.extendPosX) parts = [...parts, ...def.extendPosX];
  }
  if (parts.length === 0 && !def.pad) return null;

  const root = new TransformNode(`model-${buildingId}-${gridPos.x}-${gridPos.y}`, scene);
  const buried = new Set<AbstractMesh>();
  type PartInstance = { part: Part; roots: TransformNode[]; meshes: AbstractMesh[] };
  const partInstances: PartInstance[] = [];
  for (const part of parts) {
    const { roots, meshes: partMeshes } = instantiatePart(part, root);
    if (part.buried) for (const mesh of partMeshes) buried.add(mesh);
    partInstances.push({ part, roots, meshes: partMeshes });
  }
  if (!def.pad && !partInstances.some((pi) => pi.meshes.length > 0)) {
    root.dispose();
    return null;
  }

  // Kit-space bounds of the stretchable parts, measured while the building
  // root is still at identity (only part transforms apply — the rotation below
  // doesn't touch them, so these stay valid in local space).
  const blendActive =
    blend != null && Boolean(blend.posX || blend.negX || blend.posZ || blend.negZ);
  const structuralBounds = new Map<PartInstance, { min: Vector3; max: Vector3 }>();
  if (blendActive) {
    root.computeWorldMatrix(true);
    for (const pi of partInstances) {
      if (!pi.part.structural) continue;
      let bounds: { min: Vector3; max: Vector3 } | null = null;
      for (const partRoot of pi.roots) {
        partRoot.computeWorldMatrix(true);
        const b = partRoot.getHierarchyBoundingVectors(true);
        if (!bounds) bounds = { min: b.min.clone(), max: b.max.clone() };
        else {
          bounds.min.minimizeInPlace(b.min);
          bounds.max.maximizeInPlace(b.max);
        }
      }
      if (bounds) structuralBounds.set(pi, bounds);
    }
  }

  let padMesh: Mesh | null = null;
  let padW = 0;
  let padD = 0;
  if (def.pad) {
    // Sets the design span too: the bounding fit below measures the pad, so
    // parts keep the same scale the old paving grid gave them.
    [padW, padD] = typeof def.pad === "number" ? [def.pad, def.pad] : def.pad;
    padMesh = CreateGround(`pad-${buildingId}`, { width: padW, height: padD }, scene);
    padMesh.parent = root;
    padMesh.position.y = 0.02;
    padMesh.material = getPadPair(padW, padD, def.padStyle, scene).on;
  }

  // meshes/meshKeys assemble late so blended prefabs can drop buried panels first.
  const meshes: AbstractMesh[] = [];
  const meshKeys: string[] = [];
  const collectMeshes = () => {
    for (const pi of partInstances) {
      const tint = resolveTint(pi.part.tint);
      pi.meshes.forEach((mesh, i) => {
        meshes.push(mesh);
        meshKeys.push(`${pi.part.file}#${i}${tint ? `~${tint}` : ""}`);
      });
    }
    if (padMesh) {
      meshes.push(padMesh);
      meshKeys.push(`pad:${padW}x${padD}:${def.padStyle ?? "flag"}`);
    }
  };

  // Rotate before fitting so rectangular prefabs fill the (rotated) footprint
  // the caller passes in — the bounding box below already reflects the turn.
  if (rotation != null || def.randomRotate === "quarter") {
    root.rotation.y = (Math.PI / 2) * effectiveRotation(buildingId, gridPos, rotation);
  } else if (def.randomRotate === "free") {
    root.rotation.y = (hash / 4096) * Math.PI * 2;
  }

  // Fit the composed bounding box into the footprint, base at y=0.
  root.computeWorldMatrix(true);
  const { min, max } = root.getHierarchyBoundingVectors(
    true,
    buried.size > 0 ? (mesh) => !buried.has(mesh as AbstractMesh) : null
  );
  const extentX = max.x - min.x;
  const extentZ = max.z - min.z;
  const fit = def.fit ?? 0.9;
  const scaleX = (footprint.width * CELL_SIZE * fit) / extentX || 1;
  const scaleZ = (footprint.depth * CELL_SIZE * fit) / extentZ || 1;
  const sy = def.scaleY ?? 1;

  // Recenter horizontally: the measured bounding box isn't necessarily
  // symmetric around the parts' origin, and the caller positions the root at
  // the tile center.
  const centerX = (min.x + max.x) / 2;
  const centerZ = (min.z + max.z) / 2;

  if (def.stretch) {
    // Fill both footprint axes. Extents are world-space (post-rotation), but
    // scaling is local, so odd quarter turns swap which axis each scale drives.
    collectMeshes();
    const scaleY = Math.min(scaleX, scaleZ) * sy;
    const odd = Math.round(root.rotation.y / (Math.PI / 2)) % 2 !== 0;
    root.scaling.set(odd ? scaleZ : scaleX, scaleY, odd ? scaleX : scaleZ);
    root.position.y = -min.y * scaleY;
    return {
      root,
      meshes,
      meshKeys,
      height: (max.y - min.y) * scaleY,
      offsetX: -centerX * scaleX,
      offsetZ: -centerZ * scaleZ,
    };
  }

  let scale = Math.min(scaleX, scaleZ);
  if (def.randomScale) {
    const [lo, hi] = def.randomScale;
    scale *= lo + (hash / 4096) * (hi - lo);
  }

  if (blendActive && blend) {
    // Row-house blending: the fit above measured the complete, untouched part
    // set, so the base scale/offsets are byte-identical with and without
    // neighbors — only now do the structural faces move. Target rectangle: the
    // footprint in kit units around the measured center (the caller recenters
    // by offsetX/Z, so a stretched face lands exactly on the tile boundary,
    // where the neighbor's own stretched face meets it), inverse-rotated from
    // world-aligned into local part space.
    const halfW = (footprint.width * CELL_SIZE) / 2 / scale;
    const halfD = (footprint.depth * CELL_SIZE) / 2 / scale;
    const cos = Math.cos(root.rotation.y);
    const sin = Math.sin(root.rotation.y);
    let fpMinX = Infinity;
    let fpMaxX = -Infinity;
    let fpMinZ = Infinity;
    let fpMaxZ = -Infinity;
    for (const wx of [centerX - halfW, centerX + halfW]) {
      for (const wz of [centerZ - halfD, centerZ + halfD]) {
        const lx = wx * cos - wz * sin;
        const lz = wx * sin + wz * cos;
        fpMinX = Math.min(fpMinX, lx);
        fpMaxX = Math.max(fpMaxX, lx);
        fpMinZ = Math.min(fpMinZ, lz);
        fpMaxZ = Math.max(fpMaxZ, lz);
      }
    }
    for (const [pi, bounds] of structuralBounds) {
      stretchPartToTargets(pi.roots, pi.part.rotationY, "x", bounds.min.x, bounds.max.x,
        blend.negX ? fpMinX : null, blend.posX ? fpMaxX : null);
      stretchPartToTargets(pi.roots, pi.part.rotationY, "z", bounds.min.z, bounds.max.z,
        blend.negZ ? fpMinZ : null, blend.posZ ? fpMaxZ : null);
    }
    // Panels on a blended face would sit buried inside the shared wall.
    for (const pi of partInstances) {
      if (pi.part.face && blend[pi.part.face]) {
        for (const partRoot of pi.roots) partRoot.dispose();
        pi.meshes = [];
      }
    }
  }

  collectMeshes();
  root.scaling.set(scale, scale * sy, scale);
  const height = (max.y - min.y) * scale * sy;
  const sink = (parts[0]?.sinkY ?? def.sinkY ?? 0) * height;
  root.position.y = -min.y * scale * sy - sink;
  // The pad is the prefab's lowest surface, so the base shift above lands it
  // at exactly y=0 — under the apron (0.005) and roads (0.01). Lift it to
  // 0.015 world so the paving actually shows.
  if (padMesh) padMesh.position.y = (0.015 - root.position.y) / (scale * sy);

  return {
    root,
    meshes,
    meshKeys,
    height: height - sink,
    offsetX: -centerX * scale,
    offsetZ: -centerZ * scale,
  };
}

/** A building registered with the thin-instance batcher. */
export type PlacedBuilding = {
  /** World-space height after fitting, for markers/labels. */
  height: number;
  /** World-space top of the chimney part, when the prefab has one (smoke). */
  chimneyTop: Vector3 | null;
  setActive(active: boolean): void;
  dispose(): void;
};

/**
 * Renders placed buildings as thin-instance batches — one host mesh per
 * (source kit mesh × active state) instead of a clone per building, so draw
 * calls and shadow casters stay constant as the city grows. Layout reuses
 * `instantiateBuilding` verbatim: a transient clone is built, its meshes'
 * world matrices harvested into batches, and the clone disposed. Toggling
 * active moves a building's matrices between the on/off batches (shared
 * desaturated materials), preserving per-building inactive feedback.
 * Call `flush()` once per frame after placements/toggles to upload buffers.
 */
export function createBuildingBatcher(
  scene: Scene,
  onHostCreated?: (mesh: Mesh, castsShadow: boolean) => void
) {
  type Batch = { mesh: Mesh; instances: Map<object, number[]> };
  // `${meshKey}@on|off` → batch; hosts for both states are created together.
  const batches = new Map<string, Batch>();
  const builtMeshKeys = new Set<string>();
  const dirty = new Set<Batch>();

  function registerHost(meshKey: string, mesh: Mesh, state: "on" | "off", castsShadow: boolean) {
    mesh.isPickable = false;
    mesh.setEnabled(false);
    batches.set(`${meshKey}@${state}`, { mesh, instances: new Map() });
    onHostCreated?.(mesh, castsShadow);
  }

  /** Host meshes live unparented at identity with geometry in mesh-local space,
   * so instance matrices are exactly the harvested clone world matrices. */
  function buildHosts(meshKey: string) {
    if (builtMeshKeys.has(meshKey)) return;
    if (meshKey.startsWith("pad:")) {
      builtMeshKeys.add(meshKey);
      const [, sizeStr, style] = meshKey.split(":");
      const [width, depth] = sizeStr.split("x").map(Number);
      const pair = getPadPair(width, depth, style === "plaza" ? "plaza" : undefined, scene);
      const on = CreateGround(`batch-pad-${sizeStr}`, { width, height: depth }, scene);
      on.material = pair.on;
      const off = on.clone(`batch-pad-${sizeStr}-off`);
      off.makeGeometryUnique(); // thin-instance hosts can't share geometry (VAO clash)
      off.material = pair.off;
      // Flat paving pads don't cast — their shadow is just an offset dark rim.
      registerHost(meshKey, on, "on", false);
      registerHost(meshKey, off, "off", false);
      return;
    }
    // A `~tint` suffix picks tinted material twins; hosts are per (file, tint).
    const tintSep = meshKey.indexOf("~");
    const tintId = tintSep >= 0 ? meshKey.slice(tintSep + 1) : null;
    const baseKey = tintSep >= 0 ? meshKey.slice(0, tintSep) : meshKey;
    const file = baseKey.slice(0, baseKey.lastIndexOf("#"));
    const container = containers.get(file);
    if (!container) return; // not loaded yet; the caller skips this mesh
    // Build hosts for every mesh of the file at once — enumeration order
    // matches instantiatePart, which is what meshKey indices refer to.
    const entries = container.instantiateModelsToScene((name) => name, false, {
      doNotInstantiate: true,
    });
    const meshes: Mesh[] = [];
    for (const node of entries.rootNodes) {
      const root = node as TransformNode;
      for (const child of root.getChildMeshes(false)) meshes.push(child as Mesh);
    }
    meshes.forEach((mesh, i) => {
      const key = `${file}#${i}${tintId ? `~${tintId}` : ""}`;
      builtMeshKeys.add(key);
      mesh.parent = null;
      mesh.position.setAll(0);
      mesh.rotationQuaternion = null;
      mesh.rotation.setAll(0);
      mesh.scaling.setAll(1);
      // Thin-instance hosts must not share geometry: Babylon caches VAOs on the
      // geometry, so co-owning hosts (incl. the scatter's) would clobber each
      // other's instance-buffer bindings (GL "vertex buffer not big enough").
      mesh.makeGeometryUnique();
      let pair = mesh.material ? materialPairs.get(mesh.material) : undefined;
      if (pair && tintId) pair = getTintedPair(pair, tintId);
      const off = mesh.clone(`${mesh.name}-off`, null);
      off.makeGeometryUnique();
      if (pair) {
        mesh.material = pair.on;
        off.material = pair.off;
      }
      registerHost(key, mesh, "on", true);
      registerHost(key, off, "off", true);
    });
    for (const node of entries.rootNodes) node.dispose(); // leftover transform nodes
  }

  function getBatch(meshKey: string, active: boolean): Batch | null {
    buildHosts(meshKey);
    return batches.get(`${meshKey}@${active ? "on" : "off"}`) ?? null;
  }

  function place(
    buildingId: BuildingId,
    footprint: { width: number; depth: number },
    gridPos: { x: number; y: number },
    worldX: number,
    worldZ: number,
    rotation: number | undefined,
    extend: { negX: boolean; posX: boolean } | undefined,
    blend: BlendSides | undefined,
    active: boolean,
    segmentMask?: SegmentMask
  ): PlacedBuilding | null {
    const model = instantiateBuilding(buildingId, footprint, gridPos, scene, rotation, extend, blend, segmentMask);
    if (!model) return null;
    model.root.position.x = worldX + model.offsetX;
    model.root.position.z = worldZ + model.offsetZ;
    model.root.computeWorldMatrix(true);

    // Harvest final world matrices (and the chimney top for smoke), grouped by
    // batch key — a building can hold several copies of the same kit mesh.
    let chimneyTop: Vector3 | null = null;
    const matricesByKey = new Map<string, number[]>();
    model.meshes.forEach((mesh, i) => {
      const world = mesh.computeWorldMatrix(true);
      if (!chimneyTop && mesh.name.includes("chimney")) {
        chimneyTop = mesh.getBoundingInfo().boundingBox.maximumWorld.clone();
      }
      const key = model.meshKeys[i];
      let arr = matricesByKey.get(key);
      if (!arr) matricesByKey.set(key, (arr = []));
      world.copyToArray(arr, arr.length);
    });
    const height = model.height;
    model.root.dispose();

    const token = {};
    let state = active;
    function register() {
      for (const [key, arr] of matricesByKey) {
        const batch = getBatch(key, state);
        if (!batch) continue;
        batch.instances.set(token, arr);
        dirty.add(batch);
      }
    }
    function unregister() {
      for (const key of matricesByKey.keys()) {
        const batch = batches.get(`${key}@${state ? "on" : "off"}`);
        if (batch?.instances.delete(token)) dirty.add(batch);
      }
    }
    register();

    return {
      height,
      chimneyTop,
      setActive(next: boolean) {
        if (next === state) return;
        unregister();
        state = next;
        register();
      },
      dispose() {
        unregister();
      },
    };
  }

  /** Upload dirty batch buffers. Returns true when anything changed. */
  function flush(): boolean {
    if (dirty.size === 0) return false;
    for (const batch of dirty) {
      let total = 0;
      for (const arr of batch.instances.values()) total += arr.length;
      if (total === 0) {
        batch.mesh.thinInstanceSetBuffer("matrix", null);
        batch.mesh.setEnabled(false);
        continue;
      }
      const buffer = new Float32Array(total);
      let offset = 0;
      for (const arr of batch.instances.values()) {
        buffer.set(arr, offset);
        offset += arr.length;
      }
      batch.mesh.thinInstanceSetBuffer("matrix", buffer, 16, true);
      batch.mesh.setEnabled(true);
    }
    dirty.clear();
    return true;
  }

  function dispose() {
    for (const batch of batches.values()) batch.mesh.dispose();
    batches.clear();
    builtMeshKeys.clear();
    dirty.clear();
  }

  return { place, flush, dispose };
}

export function overrideMaterials(model: BuildingModel, material: Material) {
  for (const mesh of model.meshes) {
    mesh.material = material;
    mesh.isPickable = false;
  }
}

export function scatterEnvironment(
  heightAt: (x: number, z: number) => number,
  rand: () => number,
  avoid?: (x: number, z: number) => boolean
) {
  return buildEnvironmentScatter(containers, heightAt, rand, avoid);
}

export function disposeAssetLibrary() {
  disposePathMaterials();
  for (const container of containers.values()) container.dispose();
  containers.clear();
  containerLoads.clear();
  materialPairs.clear();
  tintedPairs.clear();
  townColormap?.dispose();
  townColormap = null;
  desatColormap?.dispose();
  desatColormap = null;
  for (const v of variantColormaps.values()) {
    v.on.dispose();
    v.off.dispose();
  }
  variantColormaps.clear();
}
