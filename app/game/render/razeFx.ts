import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";

import { BUILDING_METADATA_BY_ID, rotatedFootprint } from "~/game/buildings";
import { CELL_SIZE } from "~/game/constants";
import { useGameStore } from "~/stores/useGameStore";
import { worldGroundY } from "./groundLevel";
import { gridToWorld } from "~/game/grid";
import { getPuffTexture } from "./smoke";

// Module-level handler slot so DOM callers (RazeConfirm) can trigger the
// effect without holding the scene; createRazeFx registers the implementation.
let handler: ((originKey: string) => void) | null = null;

/** Fire the demolition effect for a still-standing origin — call BEFORE removeTile. */
export function spawnRazeFx(originKey: string) {
  handler?.(originKey);
}

/**
 * Demolition feedback: a footprint-sized dust cloud where the building stood.
 * Cosmetic-only, real time (plays while paused, like UI feedback). A sink-out
 * clone was tried and cut — the building sliding into the ground read comical.
 */
export function createRazeFx(scene: Scene) {
  handler = (originKey: string) => {
    const state = useGameStore.getState();
    const tile = state.map.tiles[originKey];
    if (!tile || tile.type === "road") return; // roads are flat ribbons — no body to dust
    const metadata = BUILDING_METADATA_BY_ID[tile.buildingId];
    if (!metadata) return;

    const { x, z } = gridToWorld(tile.position.x, tile.position.y, metadata, tile.rotation);
    const { width, depth } = rotatedFootprint(metadata, tile.rotation);
    const halfW = (width * CELL_SIZE) / 2;
    const halfD = (depth * CELL_SIZE) / 2;

    const dust = new ParticleSystem("raze-dust", 192, scene);
    dust.particleTexture = getPuffTexture(scene);
    dust.emitter = new Vector3(x, worldGroundY(x, z) + 0.08, z);
    // The burst is the whole effect (the building itself vanishes in a frame),
    // so it fills the volume the building occupied, not just a ground skirt.
    dust.minEmitBox = new Vector3(-halfW, 0, -halfD);
    dust.maxEmitBox = new Vector3(halfW, 0.6, halfD);
    dust.color1 = new Color4(0.72, 0.66, 0.56, 0.85);
    dust.color2 = new Color4(0.6, 0.55, 0.47, 0.7);
    dust.colorDead = new Color4(0.65, 0.6, 0.52, 0);
    dust.minSize = 0.35;
    dust.maxSize = 0.6;
    dust.addSizeGradient(0, 0.5);
    dust.addSizeGradient(1, 2.2);
    dust.minLifeTime = 0.8;
    dust.maxLifeTime = 1.4;
    dust.direction1 = new Vector3(-0.5, 0.4, -0.5);
    dust.direction2 = new Vector3(0.5, 1, 0.5);
    dust.minEmitPower = 0.4;
    dust.maxEmitPower = 0.9;
    dust.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    dust.emitRate = 0;
    dust.manualEmitCount = Math.min(192, 48 + width * depth * 24);
    dust.targetStopDuration = 1.5; // past max lifetime, so stopping can't cut live puffs
    // NOT disposeOnStop: that path calls dispose() with its default
    // disposeTexture=true, destroying the SHARED puff texture (smoke.ts) — the
    // first raze then kills every later burst and the chimney smoke with it.
    dust.onStoppedObservable.add(() => queueMicrotask(() => dust.dispose(false)));
    dust.start();
  };

  return {
    dispose() {
      handler = null;
    },
  };
}
