import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { BUILDING_METADATA_BY_ID, rotatedFootprint } from "~/game/buildings";
import { CELL_SIZE } from "~/game/constants";
import { useGameStore } from "~/stores/useGameStore";
import { worldGroundY } from "./groundLevel";
import { gridToWorld } from "~/game/grid";
import { instantiateTransientModel } from "./mapRenderer";
import { getPuffTexture } from "./smoke";

// Module-level handler slot so DOM callers (RazeConfirm) can trigger the
// effect without holding the scene; createRazeFx registers the implementation.
let handler: ((originKey: string) => void) | null = null;

/** Fire the demolition effect for a still-standing origin — call BEFORE removeTile. */
export function spawnRazeFx(originKey: string) {
  handler?.(originKey);
}

const SINK_SECONDS = 0.45;

/**
 * Demolition feedback: the razed building's transient clone sinks into the
 * ground under a dust burst, covering the batched mesh's instant removal.
 * Cosmetic-only, real time (plays while paused, like UI feedback).
 */
export function createRazeFx(scene: Scene) {
  type Sinking = { root: TransformNode; baseY: number; depth: number; elapsed: number };
  const sinking: Sinking[] = [];

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (sinking.length === 0) return;
    const dt = scene.getEngine().getDeltaTime() / 1000;
    for (let i = sinking.length - 1; i >= 0; i -= 1) {
      const s = sinking[i];
      s.elapsed += dt;
      const t = Math.min(1, s.elapsed / SINK_SECONDS);
      s.root.position.y = s.baseY - s.depth * t * t; // ease-in: the collapse accelerates
      if (t >= 1) {
        s.root.dispose();
        sinking.splice(i, 1);
      }
    }
  });

  handler = (originKey: string) => {
    const state = useGameStore.getState();
    const tile = state.map.tiles[originKey];
    if (!tile || tile.type === "road") return; // roads are flat ribbons — no body to sink
    const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
    if (!metadata) return;

    const { x, z } = gridToWorld(tile.position.x, tile.position.y, metadata, tile.rotation);
    const { width, depth } = rotatedFootprint(metadata, tile.rotation);
    const halfW = (width * CELL_SIZE) / 2;
    const halfD = (depth * CELL_SIZE) / 2;

    const dust = new ParticleSystem("raze-dust", 96, scene);
    dust.particleTexture = getPuffTexture(scene);
    dust.emitter = new Vector3(x, worldGroundY(x, z) + 0.06, z);
    dust.minEmitBox = new Vector3(-halfW, 0, -halfD);
    dust.maxEmitBox = new Vector3(halfW, 0.15, halfD);
    dust.color1 = new Color4(0.66, 0.61, 0.52, 0.5);
    dust.color2 = new Color4(0.58, 0.54, 0.47, 0.4);
    dust.colorDead = new Color4(0.62, 0.58, 0.5, 0);
    dust.minSize = 0.16;
    dust.maxSize = 0.32;
    dust.addSizeGradient(0, 0.5);
    dust.addSizeGradient(1, 1.8);
    dust.minLifeTime = 0.5;
    dust.maxLifeTime = 0.9;
    dust.direction1 = new Vector3(-0.35, 0.5, -0.35);
    dust.direction2 = new Vector3(0.35, 0.9, 0.35);
    dust.minEmitPower = 0.3;
    dust.maxEmitPower = 0.7;
    dust.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    dust.emitRate = 0;
    dust.manualEmitCount = Math.min(96, 16 + width * depth * 10);
    dust.targetStopDuration = 1; // past max lifetime, so disposeOnStop can't cut live puffs
    dust.disposeOnStop = true;
    dust.start();

    const model = instantiateTransientModel(scene, tile, state.map.tiles);
    if (model) {
      for (const mesh of model.meshes) mesh.isPickable = false;
      sinking.push({
        root: model.root,
        baseY: model.root.position.y,
        depth: model.height + 0.1,
        elapsed: 0,
      });
    }
  };

  return {
    dispose() {
      handler = null;
      scene.onBeforeRenderObservable.remove(observer);
      for (const s of sinking) s.root.dispose();
      sinking.length = 0;
    },
  };
}
