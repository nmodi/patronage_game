import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import type { Artwork } from "~/game/types";
import { createStatueMesh } from "./citizenFigures";

// Visuals for displayed masterworks (Phase 9): a stone plinth + marble statue
// for plinth slots, a gilt-framed procedural canvas for painting slots. These
// are individual meshes (not thin-instanced) — counts are tiny and each canvas
// is unique per artwork. Mirrors the create-visual shape of smoke.ts.

export const MAX_FACADE_CANVASES = 2; // filled painting slots beyond this are popup-only
export const PLINTH_HEIGHT = 0.16; // pedestal base→top; the statue stands on top
const STATUE_SCALE = 2.6; // ~1.5× a citizen — heroic but under a cottage's height

// Warm Renaissance grounds/pigments for the procedural canvases.
const CANVAS_PALETTE = ["#7a5c44", "#a8503a", "#8c9178", "#4f6b7a", "#b3936a", "#6b5335"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type DisplayArtHandle = { mesh: Mesh; dispose?: () => void };

export function createDisplayArt(scene: Scene) {
  let marble: StandardMaterial | null = null;
  function marbleMat(): Material {
    if (!marble) {
      marble = new StandardMaterial("statue-marble", scene);
      marble.diffuseColor = Color3.FromHexString("#e6e1d4");
      marble.specularColor = new Color3(0.12, 0.12, 0.12); // faint stone sheen
    }
    return marble;
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

  function createStatue(artworkId: string): Mesh {
    const statue = createStatueMesh(scene, hash(artworkId) % 5, marbleMat());
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
    const h = hash(artwork.id);
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
    stone?.dispose();
  }

  return { createPlinth, createStatue, createPainting, dispose };
}
