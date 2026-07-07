import { useEffect, useRef } from "react";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { Scene } from "@babylonjs/core/scene";

import { useGameStore } from "~/stores/useGameStore";
import { disposeAssetLibrary, preloadModels, scatterEnvironmentTrees } from "./assetLibrary";
import { createTileRenderer } from "./mapRenderer";
import { createPlacementController } from "./placement";
import { createTerrain } from "./terrain";

const PAN_SPEED = 10; // world units per second
const ROTATE_SPEED = 1.5; // radians per second

export function BabylonCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // preserveDrawingBuffer so canvas readback (screenshots) works
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    // ponytail: dev-only hooks for headless screenshot verification (see memory: dev-verification-workflow)
    if (import.meta.env.DEV) {
      (window as unknown as { __scene: Scene }).__scene = scene;
      // &synccompile: block on shader compiles so virtual-time captures don't miss meshes
      if (window.location.search.includes("synccompile")) {
        engine.getCaps().parallelShaderCompile = undefined;
      }
    }
    // ponytail: Scene defaults to preventDefault()-ing pointerdown/up, which suppresses the
    // browser's compat mousedown/mouseup events that placement.ts listens for on window.
    scene.preventDefaultOnPointerDown = false;
    scene.preventDefaultOnPointerUp = false;
    scene.useRightHandedSystem = true;
    scene.clearColor = Color4.FromColor3(Color3.FromHexString("#e9c98f"), 1);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = Color3.FromHexString("#e9c98f");
    scene.fogStart = 70;
    scene.fogEnd = 95;

    const camera = new ArcRotateCamera("camera", 0, 0, 10, Vector3.Zero(), scene);
    camera.setPosition(new Vector3(14, 12, 14));
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

    // Warm cinematic grade: slight saturation/contrast lift plus a gentle vignette
    const pipeline = new DefaultRenderingPipeline("grade", false, scene, [camera]);
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.contrast = 1.12;
    pipeline.imageProcessing.exposure = 1.02;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 1.4;
    pipeline.imageProcessing.vignetteColor = new Color4(0.35, 0.22, 0.08, 0);

    const terrain = createTerrain(scene);

    const tileRenderer = createTileRenderer(scene, shadowGenerator);
    const placementController = createPlacementController(scene);

    tileRenderer.sync(useGameStore.getState().map.tiles);
    let disposed = false;
    let treeScatter: { dispose: () => void } | null = null;
    preloadModels(scene)
      .catch((error) => console.error("Model preload failed:", error))
      .finally(() => {
        if (disposed) return;
        // Re-sync so anything placed before models finished loading swaps its fallback box.
        tileRenderer.sync(useGameStore.getState().map.tiles);
        treeScatter = scatterEnvironmentTrees(scene, terrain.heightAt, terrain.rand);
      });
    const unsubscribe = useGameStore.subscribe((state, prevState) => {
      if (state.map.tiles !== prevState.map.tiles) tileRenderer.sync(state.map.tiles);
      if (state.map.selectedBuilding !== prevState.map.selectedBuilding) {
        // Only detach pointer drag (it fights placement); wheel zoom stays live.
        if (state.map.selectedBuilding) camera.inputs.attached.pointers.detachControl();
        else camera.inputs.attached.pointers.attachControl(true);
        tileRenderer.setGridVisible(!!state.map.selectedBuilding);
      }
    });

    // Pan per-frame while keys are held instead of per keydown, so movement
    // isn't tied to the OS key-repeat rate.
    const heldKeys = new Set<string>();
    const handleKeyDown = (e: KeyboardEvent) => heldKeys.add(e.key.toLowerCase());
    const handleKeyUp = (e: KeyboardEvent) => heldKeys.delete(e.key.toLowerCase());
    const handleBlur = () => heldKeys.clear();
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    function panCamera() {
      if (heldKeys.size === 0) return;
      const step = (PAN_SPEED * engine.getDeltaTime()) / 1000;
      const forward = camera.target.subtract(camera.position);
      forward.y = 0;
      forward.normalize();
      const right = Vector3.Cross(forward, Vector3.Up()).normalize();

      if (heldKeys.has("w") || heldKeys.has("arrowup"))
        camera.target.addInPlace(forward.scale(step));
      if (heldKeys.has("s") || heldKeys.has("arrowdown"))
        camera.target.addInPlace(forward.scale(-step));
      if (heldKeys.has("a") || heldKeys.has("arrowleft"))
        camera.target.addInPlace(right.scale(-step));
      if (heldKeys.has("d") || heldKeys.has("arrowright"))
        camera.target.addInPlace(right.scale(step));

      const turn = (ROTATE_SPEED * engine.getDeltaTime()) / 1000;
      if (heldKeys.has("q")) camera.alpha += turn;
      if (heldKeys.has("e")) camera.alpha -= turn;
    }

    const handleResize = () => engine.resize();
    window.addEventListener("resize", handleResize);
    engine.runRenderLoop(() => {
      panCamera();
      scene.render();
    });

    return () => {
      disposed = true;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("resize", handleResize);
      unsubscribe();
      placementController.dispose();
      tileRenderer.dispose();
      treeScatter?.dispose();
      disposeAssetLibrary();
      engine.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full outline-none touch-none" />
    </div>
  );
}
