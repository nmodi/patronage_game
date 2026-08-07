import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import { ART_IMAGES, STATUE_MODELS } from "~/game/art/artImages";
import { STATUE_DISPLAY_HEIGHT, statueFit } from "~/game/art/display";
import { hashString } from "~/game/random";
import type { Artwork } from "~/game/types";
import { getContainer } from "./assetLibrary";
import { createStatueMesh } from "./citizenFigures";

// Visuals for displayed works (Phase 9): a stone plinth + marble statue
// for plinth slots, a gilt-framed procedural canvas for painting slots. These
// are individual meshes (not thin-instanced) — counts are tiny and each canvas
// is unique per artwork. Mirrors the create-visual shape of smoke.ts.

export const MAX_FACADE_CANVASES = 2; // filled painting slots beyond this are popup-only
export const PLINTH_HEIGHT = 0.16; // pedestal base→top; the statue stands on top
export const SLAB_HEIGHT = 0.08; // wide-statue slab base→top (reclining pieces sit low)
const STATUE_SCALE = 2.6; // ~1.5× a citizen — heroic but under a cottage's height

// Warm Renaissance grounds/pigments for the procedural canvases.
const CANVAS_PALETTE = ["#7a5c44", "#a8503a", "#8c9178", "#4f6b7a", "#b3936a", "#6b5335"];

export type DisplayArtHandle = { mesh: Mesh; dispose?: () => void };

export function createDisplayArt(scene: Scene) {
  let marble: StandardMaterial | null = null;
  function marbleMat(): Material {
    if (!marble) {
      marble = new StandardMaterial("statue-marble", scene);
      marble.diffuseColor = Color3.FromHexString("#e6e1d4");
      marble.specularColor = new Color3(0.01, 0.01, 0.01); // near-matte — carved stone, not polished
    }
    return marble;
  }

  let bronze: StandardMaterial | null = null;
  function bronzeMat(): Material {
    if (!bronze) {
      bronze = new StandardMaterial("statue-bronze", scene);
      bronze.diffuseColor = Color3.FromHexString("#472819"); // dark reddish-brown patinated bronze (Donatello's David)
      bronze.specularColor = new Color3(0.5, 0.33, 0.22); // warm reddish metal highlight
      bronze.specularPower = 48; // tight, glossy — reads as cast metal vs matte marble
    }
    return bronze;
  }

  let stone: StandardMaterial | null = null;
  function stoneMat(): Material {
    if (!stone) {
      stone = new StandardMaterial("plinth-stone", scene);
      stone.diffuseColor = Color3.FromHexString("#877f6a"); // aged stone — matte, reads darker than the statue marble
      stone.specularColor = Color3.Black();
    }
    return stone;
  }

  // ponytail: procedural stone pedestal — a round, squat column base (wide
  // foot → pinched waist → overhanging cap), low-poly via 16-gon cylinders.
  // Swap to a kit clone only if it ever needs to pixel-match a specific piece —
  // that costs a container-clone export + load-order handling.
  function createPlinth(): Mesh {
    const base = MeshBuilder.CreateCylinder("plinth-base", { height: 0.05, diameterBottom: 0.46, diameterTop: 0.42, tessellation: 16 }, scene);
    base.position.y = 0.025;
    const waist = MeshBuilder.CreateCylinder("plinth-waist", { height: 0.06, diameter: 0.3, tessellation: 16 }, scene);
    waist.position.y = 0.08;
    const cap = MeshBuilder.CreateCylinder("plinth-cap", { height: 0.05, diameterBottom: 0.44, diameterTop: 0.42, tessellation: 16 }, scene);
    cap.position.y = 0.135;
    const merged = Mesh.MergeMeshes([base, waist, cap], true, true)!;
    merged.material = stoneMat();
    merged.isPickable = false;
    return merged; // base at y=0, top ≈ PLINTH_HEIGHT (0.16)
  }

  // Low masonry slab for wide/reclining statues (footprint from the loaded
  // model via statueFit) — the round pedestal can't carry a 2:1 piece.
  function createSlab(footX: number, footZ: number): Mesh {
    const foot = MeshBuilder.CreateBox("slab-foot", { width: footX + 0.14, depth: footZ + 0.14, height: 0.03 }, scene);
    foot.position.y = 0.015;
    const cap = MeshBuilder.CreateBox("slab-cap", { width: footX + 0.06, depth: footZ + 0.06, height: SLAB_HEIGHT - 0.03 }, scene);
    cap.position.y = 0.03 + (SLAB_HEIGHT - 0.03) / 2;
    const merged = Mesh.MergeMeshes([foot, cap], true, true)!;
    merged.material = stoneMat();
    merged.isPickable = false;
    return merged; // base at y=0, top = SLAB_HEIGHT
  }

  // Titles with a real low-poly scan (artImages.ts) load it into a holder mesh
  // the caller can position immediately; unmapped titles keep the procedural
  // variants. onLoaded fires per streamed-in mesh (the caller's shadow-caster
  // registration can't see children added after addShadowCaster). onWide fires
  // instead of nothing when the loaded piece is reclining-wide (statueFit) —
  // the holder is already fit-rescaled; the caller swaps its pedestal for a
  // createSlab(footX, footZ) and re-seats the statue at SLAB_HEIGHT.
  function createStatue(
    artwork: Artwork,
    onLoaded?: (mesh: AbstractMesh) => void,
    onWide?: (footX: number, footZ: number) => void
  ): Mesh {
    const mat = artwork.material === "bronze" ? bronzeMat() : marbleMat(); // undefined = marble
    const modelUrl = STATUE_MODELS[artwork.name];
    if (modelUrl) {
      const holder = new Mesh(`statue-${artwork.id}`, scene);
      holder.scaling.setAll(STATUE_DISPLAY_HEIGHT); // GLB is normalized to height 1, feet at origin
      void getContainer(modelUrl, scene).then((container) => {
        if (!container || holder.isDisposed()) return;
        const entries = container.instantiateModelsToScene((name) => name, false, {
          doNotInstantiate: true,
        });
        for (const node of entries.rootNodes) {
          node.parent = holder;
          for (const mesh of (node as TransformNode).getChildMeshes(false)) {
            mesh.material = mat;
            mesh.isPickable = false;
            onLoaded?.(mesh);
          }
        }
        // Measure yaw-free (the caller has already turned the holder to face
        // its host) so a long piece's x/z don't smear across both axes.
        const yaw = holder.rotation.y;
        holder.rotation.y = 0;
        holder.computeWorldMatrix(true);
        const { min, max } = holder.getHierarchyBoundingVectors(true);
        holder.rotation.y = yaw;
        const s0 = holder.scaling.x;
        const nx = (max.x - min.x) / s0;
        const nz = (max.z - min.z) / s0;
        const fit = statueFit(nx, (max.y - min.y) / s0, nz);
        if (fit.wide) {
          holder.scaling.setAll(fit.scale);
          onWide?.(nx * fit.scale, nz * fit.scale);
        }
      });
      return holder; // feet at local y=0
    }
    const statue = createStatueMesh(scene, hashString(artwork.id) % 5, mat);
    statue.scaling.setAll(STATUE_SCALE);
    return statue; // feet at local y=0
  }

  // A framed painting on a free-standing stand — the painting analog of the
  // plinth+statue. A wall-flush canvas gets lost against the busy low-poly kit
  // facades (loggias, arcades, dominant roofs); a stand in the open always
  // reads. The stone stand carries a gilt-framed procedural canvas facing the
  // viewer (the stand's local +Z points at the host wall — see mapRenderer yaw).
  function createPainting(artwork: Artwork): DisplayArtHandle {
    const tex = new DynamicTexture(`painting-${artwork.id}`, { width: 192, height: 240 }, scene, true);
    const ctx = tex.getContext();
    const h = hashString(artwork.id);
    const pick = (shift: number) => CANVAS_PALETTE[(h >>> shift) % CANVAS_PALETTE.length]!;

    ctx.fillStyle = "#b8912f"; // gilt frame
    ctx.fillRect(0, 0, 192, 240);
    ctx.fillStyle = "#5b4326"; // umber inner rebate
    ctx.fillRect(12, 12, 168, 216);
    ctx.fillStyle = pick(0); // ground
    ctx.fillRect(22, 22, 148, 196);
    // A hashed focal disc (halo / face / sun) high in the composition.
    ctx.fillStyle = pick(5);
    ctx.beginPath();
    ctx.arc(60 + (h % 72), 92, 26 + (h % 12), 0, Math.PI * 2);
    ctx.fill();
    // A foreground band (floor / robe / horizon) across the lower third.
    ctx.fillStyle = pick(11);
    ctx.fillRect(22, 150, 148, 68);
    // A hashed accent shape for variety.
    if (h & 1) {
      ctx.fillStyle = pick(17);
      ctx.beginPath();
      ctx.moveTo(96, 72);
      ctx.lineTo(150, 156);
      ctx.lineTo(42, 156);
      ctx.closePath();
      ctx.fill();
    }
    tex.update();

    // Titles with a real pixelated painting (artImages.ts) overdraw the
    // procedural interior once the PNG loads; the procedural fill above stays
    // as the loading state and the fallback for unmapped titles.
    const imageUrl = ART_IMAGES[artwork.name];
    if (imageUrl) {
      const img = document.createElement("img");
      img.onload = () => {
        if (!tex.getInternalTexture()) return; // disposed before the PNG arrived
        (ctx as CanvasRenderingContext2D).imageSmoothingEnabled = false; // keep pixels crisp at 148x196
        ctx.drawImage(img, 22, 22, 148, 196);
        tex.update();
      };
      img.src = imageUrl;
    }

    const mat = new StandardMaterial(`painting-mat-${artwork.id}`, scene);
    mat.diffuseTexture = tex;
    mat.specularColor = Color3.Black();
    mat.emissiveColor = new Color3(0.12, 0.12, 0.12); // a touch of self-light so it reads in shade
    mat.backFaceCulling = true;

    // Stone easel: a foot + two splayed legs + a ledge, plus a thin board back so
    // the painting reads solid (not hollow) from behind. Base at y=0 (caller
    // grounds it). Viewer is on −Z, so the canvas sits on −Z, in front of the
    // legs, and leans its top back toward them (+X).
    const foot = MeshBuilder.CreateBox("easel-foot", { width: 0.34, height: 0.04, depth: 0.16 }, scene);
    foot.position.y = 0.02;
    const legL = MeshBuilder.CreateBox("easel-leg", { width: 0.04, height: 0.66, depth: 0.04 }, scene);
    legL.position.set(-0.14, 0.35, 0);
    legL.rotation.z = 0.32;
    const legR = legL.clone("easel-leg-r");
    legR.position.x = 0.14;
    legR.rotation.z = -0.32;
    const crossbar = MeshBuilder.CreateBox("easel-bar", { width: 0.3, height: 0.035, depth: 0.04 }, scene);
    crossbar.position.y = 0.34;
    const back = MeshBuilder.CreateBox("easel-back", { width: 0.5, height: 0.62, depth: 0.02 }, scene);
    back.position.set(0, 0.5, -0.03);
    back.rotation.x = 0.08;
    const stand = Mesh.MergeMeshes([foot, legL, legR, crossbar, back], true, true)!;
    stand.material = stoneMat();
    stand.isPickable = false;

    const canvas = MeshBuilder.CreatePlane(`painting-${artwork.id}`, { width: 0.5, height: 0.62 }, scene);
    canvas.material = mat;
    canvas.isPickable = false;
    canvas.position.set(0, 0.5, -0.05); // in front of the easel legs, faces the viewer
    canvas.rotation.x = 0.08; // lean the top back onto the easel
    canvas.parent = stand;

    return {
      mesh: stand,
      dispose() {
        canvas.dispose();
        stand.dispose();
        mat.dispose();
        tex.dispose();
      },
    };
  }

  function dispose() {
    marble?.dispose();
    bronze?.dispose();
    stone?.dispose();
  }

  return { createPlinth, createSlab, createStatue, createPainting, dispose };
}
