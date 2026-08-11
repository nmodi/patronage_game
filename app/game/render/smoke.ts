import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";

const textures = new WeakMap<Scene, DynamicTexture>();

export function getPuffTexture(scene: Scene) {
  let texture = textures.get(scene);
  if (texture) return texture;
  texture = new DynamicTexture("smoke-puff", 32, scene, false);
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  texture.update();
  texture.hasAlpha = true;
  textures.set(scene, texture);
  return texture;
}

const EMIT_PER_CHIMNEY = 4;
// ponytail: one global cap — with many active chimneys each plume statistically
// thins out instead of the city accumulating particle systems. Raise the cap
// (and capacity ≥ cap × max lifetime) if plumes ever look starved.
const MAX_EMIT_RATE = 80;

type SharedSmoke = {
  positions: Vector3[];
  refresh(): void;
};

// All chimneys share one ParticleSystem: each spawned particle picks a random
// active chimney, so per-building feedback (no smoke when inactive) is kept
// without a system-per-building.
const shared = new WeakMap<Scene, SharedSmoke>();

function getSharedSmoke(scene: Scene): SharedSmoke {
  let smoke = shared.get(scene);
  if (smoke) return smoke;

  const system = new ParticleSystem("smoke", 240, scene);
  system.particleTexture = getPuffTexture(scene);
  system.emitter = Vector3.Zero();
  system.color1 = new Color4(0.75, 0.73, 0.7, 0.3);
  system.color2 = new Color4(0.65, 0.63, 0.6, 0.22);
  system.colorDead = new Color4(0.7, 0.68, 0.66, 0);
  system.minSize = 0.12;
  system.maxSize = 0.22;
  system.addSizeGradient(0, 0.4);
  system.addSizeGradient(1, 1.6);
  system.minLifeTime = 1.4;
  system.maxLifeTime = 2.4;
  system.direction1 = new Vector3(-0.06, 1, -0.06);
  system.direction2 = new Vector3(0.1, 1, 0.1);
  system.minEmitPower = 0.25;
  system.maxEmitPower = 0.45;
  system.blendMode = ParticleSystem.BLENDMODE_STANDARD;

  const positions: Vector3[] = [];
  system.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    const p = positions[Math.floor(Math.random() * positions.length)];
    if (!p) return;
    positionToUpdate.set(
      p.x + (Math.random() - 0.5) * 0.04,
      p.y,
      p.z + (Math.random() - 0.5) * 0.04
    );
  };

  smoke = {
    positions,
    refresh() {
      system.emitRate = Math.min(EMIT_PER_CHIMNEY * positions.length, MAX_EMIT_RATE);
      if (positions.length > 0 && !system.isStarted()) system.start();
      else if (positions.length === 0 && system.isStarted()) system.stop();
    },
  };
  shared.set(scene, smoke);
  return smoke;
}

export type SmokePlume = ReturnType<typeof createSmokePlume>;

/** A handle registering one chimney with the scene's shared smoke system. */
export function createSmokePlume(scene: Scene, position: Vector3) {
  const smoke = getSharedSmoke(scene);
  const pos = position.clone();
  let registered = false;
  function setRegistered(on: boolean) {
    if (on === registered) return;
    registered = on;
    if (on) smoke.positions.push(pos);
    else smoke.positions.splice(smoke.positions.indexOf(pos), 1);
    smoke.refresh();
  }

  return {
    setActive(active: boolean) {
      setRegistered(active);
    },
    dispose() {
      setRegistered(false);
    },
  };
}
