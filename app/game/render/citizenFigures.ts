import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

// Decorative citizen figures. This module owns everything about what a citizen
// *looks like* — geometry, colors, and how a locomotion state becomes a pose.
// citizens.ts owns the walk graph and feeds each figure a FigureLocomotion.
//
// The FigureFactory / CitizenFigure seam is deliberate: a later pass can add a
// createKenneyFigureFactory (loading rigged GLB characters + AnimationGroups)
// beside createPrimitiveFigureFactory without touching citizens.ts. A rigged
// figure would map `moving`/`speed` onto AnimationGroup play state instead of
// the procedural bob/sway below — which is why the pose math lives *inside* the
// figure, not in the walk loop.

export type FigureLocomotion = {
  x: number;
  y: number;
  z: number;
  yaw: number; // smoothed heading, radians (0 = +Z, the figure's front)
  stridePhase: number; // radians; one full gait cycle per 2π; advances with distance
  moving: boolean; // false when standing still
  speed: number; // world units per second (future rigs scale animation speed with this)
};

export interface CitizenFigure {
  update(loco: FigureLocomotion, dt: number): void;
  dispose(): void;
}

export interface FigureFactory {
  create(): CitizenFigure;
  dispose(): void;
}

// Renaissance-muted cloth: terracotta, brown, tan, ivory, sage, dusty indigo, wine.
const ROBE_COLORS = ["#a8503a", "#7a5c44", "#b3936a", "#ded3ba", "#8c9178", "#5c6274", "#7d4a4f"];
// Headwear / cape / basket accents — the robe palette plus a charcoal brown.
const ACCENT_COLORS = [...ROBE_COLORS, "#4f4038"];
const SKIN_COLOR = "#c9a07e";

const CITIZEN_SCALE = 1.75; // person size tuned by eye against kit anchors (townhouse story)

// Pose amplitudes (world units / radians, applied at the scaled root).
const BOB_AMP = 0.01; // vertical rise per footfall
const SWAY_AMP = 0.05; // ~3° side-to-side weight shift
const LEAN = 0.04; // ~2.3° constant forward lean while walking
const GAIT_EASE = 8; // how fast bob/sway fade in/out on start/stop (per second)

// Three material slots every figure is painted from. Parts are tagged with a slot's
// placeholder material before merging; each clone maps the palette onto those slots.
type Slots = { robe: Material; accent: Material; skin: Material };

type PartOpts = {
  slot: Material;
  y: number;
  z?: number;
  rotX?: number;
  rotZ?: number;
  scaleY?: number;
};

// Builds one flat-shaded part, assigns its slot material, positions it. Flat-shading
// happens per-part *before* the merge so the merged submeshes keep clean facet
// normals (convertToFlatShadedMesh on an already-merged multimesh is fussy about
// submesh boundaries).
function makePart(mesh: Mesh, opts: PartOpts): Mesh {
  mesh.position.y = opts.y;
  if (opts.z !== undefined) mesh.position.z = opts.z;
  if (opts.rotX !== undefined) mesh.rotation.x = opts.rotX;
  if (opts.rotZ !== undefined) mesh.rotation.z = opts.rotZ;
  if (opts.scaleY !== undefined) mesh.scaling.y = opts.scaleY;
  mesh.convertToFlatShadedMesh();
  mesh.material = opts.slot;
  return mesh;
}

function robe(scene: Scene, slots: Slots, diameterBottom = 0.14): Mesh {
  return makePart(
    MeshBuilder.CreateCylinder(
      "c-robe",
      { height: 0.19, diameterBottom, diameterTop: 0.085, tessellation: 6 },
      scene
    ),
    { slot: slots.robe, y: 0.095 }
  );
}

function head(scene: Scene, slots: Slots): Mesh {
  return makePart(MeshBuilder.CreateSphere("c-head", { diameter: 0.08, segments: 3 }, scene), {
    slot: slots.skin,
    y: 0.245,
  });
}

function armNubs(scene: Scene, slots: Slots, rotX = 0): Mesh[] {
  const opts = { height: 0.07, diameter: 0.028, tessellation: 5 };
  const left = makePart(MeshBuilder.CreateCylinder("c-arm-l", opts, scene), {
    slot: slots.robe,
    y: 0.165,
    rotX,
    rotZ: -0.18,
  });
  left.position.x = -0.072;
  const right = makePart(MeshBuilder.CreateCylinder("c-arm-r", opts, scene), {
    slot: slots.robe,
    y: 0.165,
    rotX,
    rotZ: 0.18,
  });
  right.position.x = 0.072;
  return [left, right];
}

// Each builder returns the parts for one variant. Front = local +Z; every variant
// carries a front/back asymmetry so it reads directionally when yawed to face travel.
type VariantBuilder = (scene: Scene, slots: Slots) => Mesh[];

const VARIANTS: VariantBuilder[] = [
  // A — Hooded friar: cone hood tipped back so the point trails and the face reads forward.
  (scene, slots) => [
    robe(scene, slots),
    head(scene, slots),
    makePart(
      MeshBuilder.CreateCylinder(
        "c-hood",
        { height: 0.08, diameterBottom: 0.105, diameterTop: 0.015, tessellation: 6 },
        scene
      ),
      { slot: slots.accent, y: 0.255, rotX: -0.35 }
    ),
  ],
  // B — Wide-brim hat: brim dipped forward + crown.
  (scene, slots) => [
    robe(scene, slots),
    ...armNubs(scene, slots),
    head(scene, slots),
    makePart(
      MeshBuilder.CreateCylinder("c-brim", { height: 0.02, diameter: 0.15, tessellation: 6 }, scene),
      { slot: slots.accent, y: 0.283, rotX: 0.1 }
    ),
    makePart(
      MeshBuilder.CreateCylinder(
        "c-crown",
        { height: 0.04, diameterBottom: 0.075, diameterTop: 0.055, tessellation: 6 },
        scene
      ),
      { slot: slots.accent, y: 0.305 }
    ),
  ],
  // C — Headscarf: fuller skirt + kerchief tail knotted behind.
  (scene, slots) => [
    robe(scene, slots, 0.16),
    head(scene, slots),
    makePart(MeshBuilder.CreateSphere("c-scarf", { diameter: 0.095, segments: 3 }, scene), {
      slot: slots.accent,
      y: 0.253,
      scaleY: 0.75,
    }),
    makePart(MeshBuilder.CreateBox("c-tail", { width: 0.035, height: 0.05, depth: 0.018 }, scene), {
      slot: slots.accent,
      y: 0.215,
      z: -0.048,
      rotX: 0.4,
    }),
  ],
  // D — Caped townsman, bare head: shoulder capelet + hair cap covering the back of the skull.
  (scene, slots) => [
    robe(scene, slots),
    makePart(
      MeshBuilder.CreateCylinder(
        "c-cape",
        { height: 0.06, diameterBottom: 0.13, diameterTop: 0.095, tessellation: 6 },
        scene
      ),
      { slot: slots.accent, y: 0.185 }
    ),
    head(scene, slots),
    makePart(MeshBuilder.CreateSphere("c-hair", { diameter: 0.086, segments: 3 }, scene), {
      slot: slots.accent,
      y: 0.262,
      z: -0.012,
      scaleY: 0.6,
    }),
  ],
  // E — Basket carrier: arms forward cradling a basket at the belly (strongest front cue).
  (scene, slots) => [
    robe(scene, slots, 0.16),
    ...armNubs(scene, slots, -0.5),
    head(scene, slots),
    makePart(MeshBuilder.CreateSphere("c-scarf2", { diameter: 0.095, segments: 3 }, scene), {
      slot: slots.accent,
      y: 0.253,
      scaleY: 0.75,
    }),
    makePart(
      MeshBuilder.CreateCylinder(
        "c-basket",
        { height: 0.035, diameterBottom: 0.05, diameterTop: 0.062, tessellation: 6 },
        scene
      ),
      { slot: slots.accent, y: 0.135, z: 0.07 }
    ),
  ],
];

function makeMat(scene: Scene, name: string, hex: string): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = Color3.FromHexString(hex);
  mat.specularColor = Color3.Black();
  return mat;
}

/**
 * A statically-posed figure for masterwork statues (Phase 9): one variant, all
 * three material slots collapsed onto `material`. Reuses the citizen silhouette
 * as the generic statue until custom low-poly sculptures exist. Caller owns
 * placement, scaling, and disposal (the material is shared, not disposed here).
 */
export function createStatueMesh(scene: Scene, variantIndex: number, material: Material): Mesh {
  const idx = ((variantIndex % VARIANTS.length) + VARIANTS.length) % VARIANTS.length;
  const slots: Slots = { robe: material, accent: material, skin: material };
  const parts = VARIANTS[idx]!(scene, slots);
  // One material → merge into a single-material mesh (no MultiMaterial).
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false)!;
  merged.material = material;
  merged.isPickable = false;
  return merged;
}

type Template = { mesh: Mesh; slots: Slots };

export function createPrimitiveFigureFactory(scene: Scene): FigureFactory {
  // Shared palette materials — one per color, reused across every citizen clone.
  const robeMats = ROBE_COLORS.map((hex, i) => makeMat(scene, `citizen-robe-${i}`, hex));
  const accentMats = ACCENT_COLORS.map((hex, i) => makeMat(scene, `citizen-accent-${i}`, hex));
  const skinMat = makeMat(scene, "citizen-skin", SKIN_COLOR);

  // Distinct placeholder slot materials — one set, tagged onto parts so the merge
  // groups geometry into three submeshes. Each clone maps palette colors onto these
  // slots by identity, so submaterial ordering never has to be assumed.
  const slots: Slots = {
    robe: makeMat(scene, "citizen-slot-robe", "#ffffff"),
    accent: makeMat(scene, "citizen-slot-accent", "#ffffff"),
    skin: makeMat(scene, "citizen-slot-skin", "#ffffff"),
  };

  const templates: Template[] = VARIANTS.map((build, vi) => {
    const parts = build(scene, slots);
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
    merged.name = `citizen-template-${vi}`;
    merged.isPickable = false;
    merged.setEnabled(false);
    return { mesh: merged, slots };
  });

  function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function create(): CitizenFigure {
    const template = pick(templates);
    const root = template.mesh.clone(`citizen-${Math.floor(Math.random() * 1e9)}`);
    root.setEnabled(true);
    root.isPickable = false;

    // Two-tone: a robe color and an accent that differs from it.
    const robeMat = pick(robeMats);
    let accentMat = pick(accentMats);
    let guard = 0;
    while (accentMat.diffuseColor.equals(robeMat.diffuseColor) && guard++ < 8) {
      accentMat = pick(accentMats);
    }
    // Map the palette onto whatever slot order the merge produced.
    const templateMulti = template.mesh.material as MultiMaterial;
    const clonePalette = new MultiMaterial(`citizen-mat-${root.uniqueId}`, scene);
    clonePalette.subMaterials = templateMulti.subMaterials.map((sub) => {
      if (sub === template.slots.robe) return robeMat;
      if (sub === template.slots.accent) return accentMat;
      return skinMat;
    });
    root.material = clonePalette;

    const scale = CITIZEN_SCALE * (0.9 + Math.random() * 0.2);
    root.scaling.setAll(scale);

    let gaitWeight = 0;

    return {
      update(loco: FigureLocomotion, dt: number) {
        const target = loco.moving ? 1 : 0;
        gaitWeight += (target - gaitWeight) * Math.min(1, dt * GAIT_EASE);
        const w = gaitWeight;
        const bob = BOB_AMP * Math.sin(2 * loco.stridePhase) * w;
        root.position.set(loco.x, loco.y + bob, loco.z);
        // Babylon applies rotation as YawPitchRoll(y, x, z): yaw first, then pitch
        // and roll in the already-yawed local frame, so z is true lateral sway and
        // x is true forward lean relative to the walk direction.
        root.rotation.set(LEAN * w, loco.yaw, SWAY_AMP * Math.sin(loco.stridePhase) * w);
      },
      dispose() {
        root.dispose();
        clonePalette.dispose();
      },
    };
  }

  function dispose() {
    for (const t of templates) {
      (t.mesh.material as MultiMaterial | null)?.dispose();
      t.mesh.dispose();
    }
    slots.robe.dispose();
    slots.accent.dispose();
    slots.skin.dispose();
    for (const m of robeMats) m.dispose();
    for (const m of accentMats) m.dispose();
    skinMat.dispose();
  }

  return { create, dispose };
}
