import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Material } from "@babylonjs/core/Materials/material";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { RegisterMaterialPlugin } from "@babylonjs/core/Materials/materialPluginManager";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { Scene } from "@babylonjs/core/scene";

import { mulberry32 } from "~/game/random";

// Drifting cloud shadows: every StandardMaterial multiplies its lit color by a
// scrolling soft noise texture sampled in world XZ, so ground, walls, and roofs
// darken together as a cloud passes. A material plugin instead of a second
// shadow-casting light: no invisible-caster hacks, no per-frame shadow-map
// re-render, and it rides thin instances for free (vPositionW is per-fragment).
// Cosmetic-only and real-time like the sky — it does not pause with the sim.

/** World units per texture repeat — blobs are ~0.1–0.25 uv, so shadows span
 * ~13–30wu, several city blocks. */
const CLOUD_SPAN = 130;
/** Drift in uv/s (≈0.5 wu/s ground speed, a slow summer sky). */
const WIND = [0.004, 0.0016] as const;
/** Cloud cores are authored slightly cool (blue survives the multiply better
 * than red), so shadowed ground reads sky-lit rather than dimmed. */
const CORE_TINT = "rgb(198, 205, 221)";
const TEX_SIZE = 512;

let offsetU = 0;
let offsetV = 0;
const textures = new WeakMap<Scene, DynamicTexture>();

/** Soft blob field, wrapped 3x3 like the wall/dirt drawers so it tiles.
 * "multiply" compositing lets overlapping lobes deepen naturally — a lone
 * fringe dips ~10%, a clustered core ~25%. */
function getCloudTexture(scene: Scene) {
  let tex = textures.get(scene);
  if (tex) return tex;
  tex = new DynamicTexture("cloud-shadows", { width: TEX_SIZE, height: TEX_SIZE }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const rand = mulberry32(7304);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  ctx.globalCompositeOperation = "multiply";
  for (let cluster = 0; cluster < 9; cluster += 1) {
    const cx = rand() * TEX_SIZE;
    const cy = rand() * TEX_SIZE;
    const lobes = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < lobes; i += 1) {
      const x = cx + (rand() - 0.5) * 0.22 * TEX_SIZE;
      const y = cy + (rand() - 0.5) * 0.16 * TEX_SIZE;
      const r = TEX_SIZE * (0.06 + rand() * 0.08);
      for (const dx of [-TEX_SIZE, 0, TEX_SIZE]) {
        for (const dy of [-TEX_SIZE, 0, TEX_SIZE]) {
          const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          g.addColorStop(0, CORE_TINT);
          g.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = g;
          ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }
      }
    }
  }
  tex.update();
  tex.wrapU = tex.wrapV = DynamicTexture.WRAP_ADDRESSMODE;
  textures.set(scene, tex);
  return tex;
}

class CloudShadowPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, "CloudShadow", 200, { CLOUDSHADOW: false });
    this._enable(true);
  }

  override getClassName() {
    return "CloudShadowPlugin";
  }

  override prepareDefines(defines: MaterialDefines) {
    defines["CLOUDSHADOW"] = true;
  }

  override getSamplers(samplers: string[]) {
    samplers.push("cloudShadowTex");
  }

  override getUniforms() {
    return {
      // Babylon 9 key is "ubo" (older docs say "ub" — that silently drops the
      // uniform and every StandardMaterial fails to compile).
      ubo: [{ name: "cloudShadowOffset", size: 2, type: "vec2" }],
      fragment: `#ifdef CLOUDSHADOW
uniform vec2 cloudShadowOffset;
#endif`,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer, scene: Scene) {
    uniformBuffer.updateFloat2("cloudShadowOffset", offsetU, offsetV);
    uniformBuffer.setTexture("cloudShadowTex", getCloudTexture(scene));
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef CLOUDSHADOW
uniform sampler2D cloudShadowTex;
#endif`,
      // Before fog, so a shadowed hill still dissolves cleanly into the
      // horizon band instead of carrying its darkening through the fog.
      CUSTOM_FRAGMENT_BEFORE_FOG: `#ifdef CLOUDSHADOW
color.rgb *= texture2D(cloudShadowTex, vPositionW.xz * ${(1 / CLOUD_SPAN).toFixed(6)} + cloudShadowOffset).rgb;
#endif`,
    };
  }
}

/** Call from scene setup, before other modules create materials. The sky dome
 * keeps its own light (a cloud SHADOW passing over the sky reads wrong), and
 * only StandardMaterials opt in — everything in the scene converts to
 * StandardMaterial at load (assetLibrary), so that is the whole world.
 * Registration must happen on EVERY scene create, not once: Babylon unregisters
 * all material plugins when an engine disposes (menu round-trips, React's dev
 * double-mount), and RegisterMaterialPlugin already dedupes by name. */
export function initCloudShadows(scene: Scene) {
  RegisterMaterialPlugin("CloudShadow", (material) =>
    material.getClassName() === "StandardMaterial" && material.name !== "skyMat"
      ? new CloudShadowPlugin(material)
      : null
  );
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  scene.onBeforeRenderObservable.add(() => {
    if (still) return;
    const dt = scene.getEngine().getDeltaTime() / 1000;
    offsetU = (offsetU + WIND[0] * dt) % 1;
    offsetV = (offsetV + WIND[1] * dt) % 1;
  });
}
