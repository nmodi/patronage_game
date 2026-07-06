import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";

import { CELL_SIZE, GRID_SIZE } from "~/game/constants";
import type { BuildingId } from "~/game/buildings";

registerBuiltInLoaders();

/** One kit piece placed relative to the footprint center, in kit units (1 unit = 1 cell). */
type Part = {
  file: string;
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
};

type ModelDef = {
  /** Composed prefab. Mutually exclusive with `variants`. */
  parts?: Part[];
  /** Single-piece alternatives picked by position hash (trees etc.). */
  variants?: Part[];
  /** Fraction of the footprint the composed bounding box fills. Default 0.9. */
  fit?: number;
  /** "quarter" = random 90° steps, "free" = any angle. Seeded by grid position. */
  randomRotate?: "quarter" | "free";
  randomScale?: [number, number];
};

const TOWN = "/models/town/";
const NATURE = "/models/nature/";

/** size×size grid of paving tiles centered on the footprint. */
function paving(size: number): Part[] {
  const parts: Part[] = [];
  const start = -(size - 1) / 2;
  for (let x = 0; x < size; x += 1)
    for (let z = 0; z < size; z += 1)
      parts.push({ file: TOWN + "road.glb", position: [start + x, 0, start + z] });
  return parts;
}

// Flat-color material tints per file (Nature Kit has no texture; defaults are teal/orange).
const MATERIAL_TINTS: Record<string, Record<string, string>> = {
  [NATURE + "tree_default.glb"]: { leafsGreen: "#6b7d46", woodBark: "#7a5a40" },
  [NATURE + "tree_fat.glb"]: { leafsGreen: "#75854d", woodBark: "#7a5a40" },
  [NATURE + "tree_oak.glb"]: { leafsGreen: "#5f7540", woodBark: "#6f523a" },
  [NATURE + "tree_pineTallA.glb"]: { leafsDark: "#3f5c35", woodBarkDark: "#6f523a" },
  [NATURE + "tree_pineTallB.glb"]: { leafsDark: "#44613a", woodBarkDark: "#6f523a" },
};

export const MODEL_MANIFEST: Partial<Record<BuildingId, ModelDef>> = {
  cottage: {
    parts: [
      { file: TOWN + "wall-block.glb", position: [0, 0, 0] },
      { file: TOWN + "roof-gable.glb", position: [0, 1, 0] },
    ],
    fit: 0.82,
    randomRotate: "quarter",
  },
  townhouse: {
    parts: [
      { file: TOWN + "wall-block.glb", position: [0, 0, 0] },
      { file: TOWN + "wall-block.glb", position: [0, 1, 0] },
      { file: TOWN + "banner-red.glb", position: [0, 1, 0] },
      { file: TOWN + "roof-gable.glb", position: [0, 2, 0] },
    ],
    fit: 0.82,
    randomRotate: "quarter",
  },
  workshop: {
    parts: [
      { file: TOWN + "wall-block.glb", position: [0, 0, 0] },
      { file: TOWN + "roof-flat.glb", position: [0, 1, 0] },
      { file: TOWN + "chimney.glb", position: [0, 0.55, 0] },
    ],
    fit: 0.82,
    randomRotate: "quarter",
  },
  pigment_trader: {
    parts: [
      { file: TOWN + "wall-block.glb", position: [0, 0, 0] },
      { file: TOWN + "banner-green.glb", position: [0, 0.25, 0] },
      { file: TOWN + "roof-point.glb", position: [0, 1, 0] },
    ],
    fit: 0.82,
    randomRotate: "quarter",
  },
  market: {
    parts: [
      { file: TOWN + "stall-red.glb", position: [-0.5, 0, -0.5], rotationY: Math.PI },
      { file: TOWN + "stall-green.glb", position: [0.5, 0, -0.5], rotationY: Math.PI },
      { file: TOWN + "stall.glb", position: [-0.5, 0, 0.5] },
      { file: TOWN + "cart.glb", position: [0.5, 0, 0.5], rotationY: Math.PI / 2 },
    ],
    fit: 0.95,
  },
  town_center_plaza: {
    // Fountain with a central column (mockup: obelisk rising from the water);
    // the rest stays open paving so future citizens/stalls have room.
    parts: [
      ...paving(5),
      { file: TOWN + "fountain-round-detail.glb", position: [0, 0.02, 0], scale: 1.2 },
      { file: TOWN + "pillar-stone.glb", position: [0, 0.05, 0], scale: 1.6 },
    ],
    fit: 1,
  },
  plaza: {
    parts: [
      ...paving(3),
      { file: TOWN + "fountain-round-detail.glb", position: [0, 0.02, 0], scale: 0.7 },
      { file: TOWN + "lantern.glb", position: [-1.35, 0.02, -1.35] },
      { file: TOWN + "lantern.glb", position: [1.35, 0.02, -1.35] },
      { file: TOWN + "lantern.glb", position: [-1.35, 0.02, 1.35] },
      { file: TOWN + "lantern.glb", position: [1.35, 0.02, 1.35] },
    ],
    fit: 1,
  },
  road: {
    parts: [{ file: TOWN + "road.glb", position: [0, 0, 0] }],
    fit: 1,
  },
  tree: {
    variants: [
      { file: NATURE + "tree_default.glb" },
      { file: NATURE + "tree_fat.glb" },
      { file: NATURE + "tree_oak.glb" },
    ],
    fit: 0.8,
    randomRotate: "free",
    randomScale: [0.85, 1.15],
  },
};

// Active/inactive material pairs, shared by every clone of a container.
const materialPairs = new Map<Material, { on: Material; off: Material }>();
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

/** Load every manifest + scatter model up front so instantiation can stay synchronous. */
export async function preloadModels(scene: Scene) {
  const files = new Set<string>([...SCATTER_CYPRESS, ...SCATTER_OLIVE]);
  for (const def of Object.values(MODEL_MANIFEST)) {
    for (const part of def.parts ?? []) files.add(part.file);
    for (const part of def.variants ?? []) files.add(part.file);
  }
  await Promise.all([...files].map((file) => getContainer(file, scene)));
}

function hashPosition(x: number, y: number) {
  return (((x * 73856093) ^ (y * 19349663)) >>> 0) % 4096;
}

function instantiatePart(part: Part, parent: TransformNode, scene: Scene): AbstractMesh[] {
  const container = containers.get(part.file);
  if (!container) return [];
  const entries = container.instantiateModelsToScene((name) => name, false, {
    doNotInstantiate: true, // clones own their material slot, needed for active/inactive swaps
  });
  const meshes: AbstractMesh[] = [];
  for (const node of entries.rootNodes) {
    const root = node as TransformNode; // glTF roots are always meshes
    root.parent = parent;
    root.position.set(...(part.position ?? [0, 0, 0]));
    if (part.rotationY) {
      root.rotationQuaternion = null; // glTF roots carry a quaternion that overrides .rotation
      root.rotation.set(0, part.rotationY, 0);
    }
    if (part.scale) root.scaling.setAll(part.scale);
    for (const mesh of root.getChildMeshes(false)) meshes.push(mesh);
  }
  return meshes;
}

/** True when the building has a manifest entry whose files are all loaded. */
export function hasModel(buildingId: BuildingId) {
  const def = MODEL_MANIFEST[buildingId];
  if (!def) return false;
  const parts = def.parts ?? def.variants ?? [];
  return parts.length > 0 && parts.every((part) => containers.has(part.file));
}

export type BuildingModel = {
  root: TransformNode;
  meshes: AbstractMesh[];
  /** World-space height after fitting, for markers/labels. */
  height: number;
};

/**
 * Build the model for a building, scaled to its footprint with the base at y=0.
 * Returns null when the building has no manifest entry (caller falls back to a box).
 */
export function instantiateBuilding(
  buildingId: BuildingId,
  footprint: { width: number; depth: number },
  gridPos: { x: number; y: number },
  scene: Scene,
  rotation?: number // player-chosen quarter turns; overrides seeded randomRotate
): BuildingModel | null {
  const def = MODEL_MANIFEST[buildingId];
  if (!def) return null;

  const hash = hashPosition(gridPos.x, gridPos.y);
  const parts = def.parts ?? (def.variants ? [def.variants[hash % def.variants.length]] : []);
  if (parts.length === 0) return null;

  const root = new TransformNode(`model-${buildingId}-${gridPos.x}-${gridPos.y}`, scene);
  const meshes: AbstractMesh[] = [];
  for (const part of parts) meshes.push(...instantiatePart(part, root, scene));
  if (meshes.length === 0) {
    root.dispose();
    return null;
  }

  // Fit the composed bounding box into the footprint, base at y=0.
  root.computeWorldMatrix(true);
  const { min, max } = root.getHierarchyBoundingVectors(true);
  const extentX = max.x - min.x;
  const extentZ = max.z - min.z;
  const fit = def.fit ?? 0.9;
  let scale =
    Math.min(
      (footprint.width * CELL_SIZE * fit) / extentX,
      (footprint.depth * CELL_SIZE * fit) / extentZ
    ) || 1;
  if (def.randomScale) {
    const [lo, hi] = def.randomScale;
    scale *= lo + (hash / 4096) * (hi - lo);
  }
  root.scaling.setAll(scale);
  root.position.y = -min.y * scale;

  if (rotation != null) root.rotation.y = (Math.PI / 2) * rotation;
  else if (def.randomRotate === "quarter") root.rotation.y = (Math.PI / 2) * (hash % 4);
  else if (def.randomRotate === "free") root.rotation.y = (hash / 4096) * Math.PI * 2;

  return { root, meshes, height: (max.y - min.y) * scale };
}

export function setBuildingActive(model: BuildingModel, active: boolean) {
  for (const mesh of model.meshes) {
    const pair = mesh.material && materialPairs.get(mesh.material);
    if (pair) mesh.material = active ? pair.on : pair.off;
  }
}

export function overrideMaterials(model: BuildingModel, material: Material) {
  for (const mesh of model.meshes) {
    mesh.material = material;
    mesh.isPickable = false;
  }
}

const SCATTER_CYPRESS = [NATURE + "tree_pineTallA.glb", NATURE + "tree_pineTallB.glb"];
const SCATTER_OLIVE = [NATURE + "tree_default.glb", NATURE + "tree_fat.glb", NATURE + "tree_oak.glb"];
const ENV_TREE_COUNT = 120;
const ENV_TREE_CLEARANCE = 4;
const ENV_TREE_DEPTH = 60;

/** Decorative trees on the hills outside the buildable grid. Instanced, no shadows. */
export function scatterEnvironmentTrees(
  scene: Scene,
  heightAt: (x: number, z: number) => number,
  rand: () => number
) {
  const roots: TransformNode[] = [];
  const buildHalfExtent = (GRID_SIZE * CELL_SIZE) / 2;
  const minDistance = buildHalfExtent + ENV_TREE_CLEARANCE;

  for (let attempts = 0; roots.length < ENV_TREE_COUNT && attempts < ENV_TREE_COUNT * 4; attempts += 1) {
    const angle = rand() * Math.PI * 2;
    const dist = minDistance + rand() * ENV_TREE_DEPTH;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (Math.max(Math.abs(x), Math.abs(z)) < minDistance) continue;
    const files = rand() < 0.4 ? SCATTER_CYPRESS : SCATTER_OLIVE;
    const container = containers.get(files[Math.floor(rand() * files.length)]);
    if (!container) continue;
    const entries = container.instantiateModelsToScene((name) => name, false);
    for (const node of entries.rootNodes) {
      const root = node as TransformNode;
      root.position.set(x, heightAt(x, z) - 0.1, z);
      root.scaling.setAll(1.4 + rand() * 1.3);
      root.rotationQuaternion = null;
      root.rotation.y = rand() * Math.PI * 2;
      for (const mesh of root.getChildMeshes(false)) mesh.isPickable = false;
      roots.push(root);
    }
  }
  return {
    dispose() {
      for (const root of roots) root.dispose();
    },
  };
}

export function disposeAssetLibrary() {
  for (const container of containers.values()) container.dispose();
  containers.clear();
  containerLoads.clear();
  materialPairs.clear();
  townColormap?.dispose();
  townColormap = null;
  desatColormap?.dispose();
  desatColormap = null;
}
