import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";

const textures = new WeakMap<Scene, DynamicTexture>();

function getPuffTexture(scene: Scene) {
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

export type SmokePlume = ReturnType<typeof createSmokePlume>;

export function createSmokePlume(scene: Scene, position: Vector3) {
  const system = new ParticleSystem("smoke", 30, scene);
  system.particleTexture = getPuffTexture(scene);
  system.emitter = position.clone();
  system.minEmitBox = new Vector3(-0.02, 0, -0.02);
  system.maxEmitBox = new Vector3(0.02, 0, 0.02);
  system.color1 = new Color4(0.75, 0.73, 0.7, 0.3);
  system.color2 = new Color4(0.65, 0.63, 0.6, 0.22);
  system.colorDead = new Color4(0.7, 0.68, 0.66, 0);
  system.minSize = 0.12;
  system.maxSize = 0.22;
  system.addSizeGradient(0, 0.4);
  system.addSizeGradient(1, 1.6);
  system.minLifeTime = 1.4;
  system.maxLifeTime = 2.4;
  system.emitRate = 4;
  system.direction1 = new Vector3(-0.06, 1, -0.06);
  system.direction2 = new Vector3(0.1, 1, 0.1);
  system.minEmitPower = 0.25;
  system.maxEmitPower = 0.45;
  system.blendMode = ParticleSystem.BLENDMODE_STANDARD;

  return {
    setActive(active: boolean) {
      if (active && !system.isStarted()) system.start();
      else if (!active && system.isStarted()) system.stop();
    },
    dispose() {
      system.dispose(false); // shared texture stays
    },
  };
}
