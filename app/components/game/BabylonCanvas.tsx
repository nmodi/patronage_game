import { useEffect, useRef } from "react";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";

import { useGameStore } from "~/stores/useGameStore";
import { createTileRenderer } from "./mapRenderer";
import { createPlacementController } from "./placement";

const PAN_SPEED = 1;

export function BabylonCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);
    // ponytail: Scene defaults to preventDefault()-ing pointerdown/up, which suppresses the
    // browser's compat mousedown/mouseup events that placement.ts listens for on window.
    scene.preventDefaultOnPointerDown = false;
    scene.preventDefaultOnPointerUp = false;
    scene.useRightHandedSystem = true;
    scene.clearColor = Color4.FromColor3(Color3.FromHexString("#87CEEB"), 1);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = Color3.FromHexString("#87CEEB");
    scene.fogStart = 70;
    scene.fogEnd = 95;

    const camera = new ArcRotateCamera("camera", 0, 0, 10, Vector3.Zero(), scene);
    camera.setPosition(new Vector3(10, 10, 10));
    camera.fov = (50 * Math.PI) / 180;
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 60;
    camera.lowerBetaLimit = Math.PI / 3;
    camera.upperBetaLimit = Math.PI / 2 - 0.02;
    camera.inertia = 0.8;
    camera.panningInertia = 0.8;
    camera.panningSensibility = 300;
    camera.attachControl(true);

    const hemiLight = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.7;

    const dirLight = new DirectionalLight("dir", new Vector3(-1, -1, -1), scene);
    dirLight.position = new Vector3(5, 5, 5);
    dirLight.intensity = 1.5;

    const shadowGenerator = new ShadowGenerator(1024, dirLight);
    shadowGenerator.useBlurExponentialShadowMap = true;

    const ground = MeshBuilder.CreateGround("ground", { width: 10000, height: 10000 }, scene);
    ground.position.y = -0.01;
    ground.receiveShadows = true;
    const groundMat = new StandardMaterial("ground-mat", scene);
    groundMat.diffuseColor = Color3.FromHexString("#4a9460");
    groundMat.emissiveColor = Color3.FromHexString("#4a9460").scale(0.05);
    ground.material = groundMat;

    const tileRenderer = createTileRenderer(scene, shadowGenerator);
    const placementController = createPlacementController(scene);

    tileRenderer.sync(useGameStore.getState().map.tiles);
    const unsubscribe = useGameStore.subscribe((state, prevState) => {
      if (state.map.tiles !== prevState.map.tiles) tileRenderer.sync(state.map.tiles);
      if (state.map.selectedBuilding !== prevState.map.selectedBuilding) {
        if (state.map.selectedBuilding) camera.detachControl();
        else camera.attachControl(true);
      }
    });

    function handleKeyDown(e: KeyboardEvent) {
      const forward = camera.target.subtract(camera.position);
      forward.y = 0;
      forward.normalize();
      const right = Vector3.Cross(forward, Vector3.Up()).normalize();

      switch (e.key.toLowerCase()) {
        case "w":
        case "arrowup":
          camera.target.addInPlace(forward.scale(PAN_SPEED));
          break;
        case "s":
        case "arrowdown":
          camera.target.addInPlace(forward.scale(-PAN_SPEED));
          break;
        case "a":
        case "arrowleft":
          camera.target.addInPlace(right.scale(-PAN_SPEED));
          break;
        case "d":
        case "arrowright":
          camera.target.addInPlace(right.scale(PAN_SPEED));
          break;
        default:
          return;
      }
    }
    window.addEventListener("keydown", handleKeyDown);

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);
    engine.runRenderLoop(() => scene.render());

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      unsubscribe();
      placementController.dispose();
      tileRenderer.dispose();
      engine.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full outline-none touch-none" />;
}
