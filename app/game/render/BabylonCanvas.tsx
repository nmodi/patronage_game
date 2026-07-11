import { useEffect, useRef, useState } from "react";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";

import type { BuildingId } from "~/game/buildings";
import { getWater } from "~/game/water";
import { RAZE_TOOL, useGameStore } from "~/stores/useGameStore";
import {
  countModelFiles,
  disposeAssetLibrary,
  preloadBuildingModels,
  preloadEnvironmentModels,
  scatterEnvironment,
} from "./assetLibrary";
import { createCitizens } from "./citizens";
import { createTileRenderer } from "./mapRenderer";
import { createPlacementController } from "./placement";
import { createTerrain } from "./terrain";
import { createWaterVisuals } from "./waterMesh";

const PAN_SPEED = 10; // world units per second
const ROTATE_SPEED = 1.5; // radians per second

export function BabylonCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadPhase, setLoadPhase] = useState<"loading" | "fading" | "hidden">("loading");

  // Unmount on a timer rather than transitionend — opacity transitions run on
  // the compositor and their end event is unreliable in hidden/headless tabs.
  useEffect(() => {
    if (loadPhase !== "fading") return;
    const timer = window.setTimeout(() => setLoadPhase("hidden"), 600);
    return () => window.clearTimeout(timer);
  }, [loadPhase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Readback is only needed by the development screenshot workflow. Keeping the
    // back buffer in production costs both GPU memory and frame time.
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: import.meta.env.DEV, stencil: true });
    const scene = new Scene(engine);
    // ponytail: dev-only hooks for headless screenshot verification (see memory: dev-verification-workflow)
    if (import.meta.env.DEV) {
      (window as unknown as { __scene: Scene }).__scene = scene;
      // Scripted placement/assertions in headless checks drive the store directly.
      (window as unknown as { __store: typeof useGameStore }).__store = useGameStore;
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
    // Keep the fog ~10wu past max zoom (upperRadiusLimit) so the city never fogs out.
    scene.fogStart = 90;
    scene.fogEnd = 115;

    const camera = new ArcRotateCamera("camera", 0, 0, 10, Vector3.Zero(), scene);
    camera.setPosition(new Vector3(14, 12, 14));
    camera.fov = (50 * Math.PI) / 180;
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 80;
    camera.lowerBetaLimit = Math.PI / 3;
    camera.upperBetaLimit = Math.PI / 2 - 0.02;
    camera.inertia = 0.8;
    camera.panningInertia = 0.8;
    camera.panningSensibility = 300;
    camera.attachControl(true);
    // &cam=x,z[,radius[,alpha[,beta]]] (dev): frame a spot for headless screenshots.
    const camFlag = import.meta.env.DEV && new URLSearchParams(window.location.search).get("cam");
    if (camFlag) {
      const [cx, cz, cr, ca, cb] = camFlag.split(",").map(Number);
      camera.target = new Vector3(cx || 0, 0, cz || 0);
      if (cr) camera.radius = cr;
      camera.alpha = Number.isFinite(ca) ? ca : Math.PI / 4;
      camera.beta = Number.isFinite(cb) ? cb : Math.PI / 3.2;
    }

    const hemiLight = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.7;

    const dirLight = new DirectionalLight("dir", new Vector3(-1, -1, -1), scene);
    dirLight.position = new Vector3(5, 5, 5);
    dirLight.intensity = 1.5;

    const shadowGenerator = new ShadowGenerator(2048, dirLight);
    shadowGenerator.useBlurExponentialShadowMap = true;
    // Light and casters are static between placements — render the shadow map
    // only when the tile renderer says casters changed, not every frame.
    const shadowMap = shadowGenerator.getShadowMap();
    if (shadowMap) shadowMap.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;

    // Warm Renaissance grade: push the whole frame toward golden hour.
    // Curves go on the scene config *before* the pipeline is built so the
    // image-processing shader compiles with them from the start (setting
    // colorCurvesEnabled after breaks under &synccompile's serial compiles).
    const curves = new ColorCurves();
    curves.globalHue = 25; // orange target hue
    curves.globalDensity = 10; // strength of the shift toward it
    curves.globalSaturation = 3; // slight richness lift
    curves.shadowsHue = 25; // keep shadows warm too, so they don't fight the grade
    curves.shadowsDensity = 5;
    scene.imageProcessingConfiguration.colorCurves = curves;
    scene.imageProcessingConfiguration.colorCurvesEnabled = true;

    const tileRenderer = createTileRenderer(scene, shadowGenerator);
    const placementController = createPlacementController(scene);
    const citizens = createCitizens(scene);

    let disposed = false;
    // Terrain waits for store hydration: the run's mapSeed shapes it (river
    // valley, coast), and it isn't known until the persisted state loads. The
    // loading screen covers the gap; demo mode hydrates immediately.
    let terrain: ReturnType<typeof createTerrain> | null = null;
    let waterVisuals: ReturnType<typeof createWaterVisuals> | null = null;
    let envModelsReady = false;
    let treeScatter: ReturnType<typeof scatterEnvironment> | null = null;

    // A "dry" archetype has no water anywhere — render it exactly like the
    // pre-water plain (and like old riverless saves).
    function wetWater() {
      const water = getWater(useGameStore.getState().mapSeed);
      return water && water.archetype !== "dry" ? water : null;
    }

    function initWorld() {
      if (disposed || terrain) return;
      const water = wetWater();
      // Raw mapSeed, not wetWater(): dry-archetype maps still get seeded hills
      // and scatter; only pre-water saves and ?demo (null) keep the classic look.
      terrain = createTerrain(scene, water, useGameStore.getState().mapSeed);
      if (water) waterVisuals = createWaterVisuals(scene, water, terrain.surfaceAt);
      maybeScatter();
    }

    // Wilderness scatter needs both the environment models and the terrain
    // (its height field and the river to keep out of).
    function maybeScatter() {
      if (disposed || !envModelsReady || !terrain || treeScatter) return;
      const water = wetWater();
      const avoid = water
        ? (x: number, z: number) => water.riverDistance(x, z) < 3 || water.seaDistance(x, z) > -3
        : undefined;
      treeScatter = scatterEnvironment(terrain.heightAt, terrain.rand, avoid);
    }
    let tileFrame: number | null = null;
    let environmentTimer: number | null = null;
    const pendingModelIds = new Set<BuildingId>();
    let modelLoadRunning = false;

    // Loading-screen bookkeeping. The bar tracks model files (the dominant wall
    // time); tile geometry only gates the hide. The gate waits for store
    // hydration because the effect's initial queueMap runs before game.tsx
    // calls rehydrate() and may see a near-empty map that finishes instantly.
    // Demo mode never rehydrates — its tiles are seeded before mount.
    let filesTotal = 0;
    let filesLoaded = 0;
    let loadFinished = false;
    let hydrated =
      new URLSearchParams(window.location.search).has("demo") ||
      useGameStore.persist.hasHydrated();
    if (hydrated) initWorld();

    function updateLoadProgress() {
      if (loadFinished || disposed) return;
      setLoadProgress(filesTotal === 0 ? 0 : filesLoaded / filesTotal);
    }

    function maybeFinishLoading() {
      if (loadFinished || disposed) return;
      if (hydrated && tileFrame == null && pendingModelIds.size === 0 && !modelLoadRunning) {
        loadFinished = true;
        setLoadProgress(1);
        setLoadPhase("fading");
      }
    }

    const offHydration = useGameStore.persist.onFinishHydration(() => {
      hydrated = true;
      initWorld();
      maybeFinishLoading();
    });

    // Construct a handful of origin entries per frame. A large persisted city
    // becomes visible immediately rather than blocking the first canvas paint.
    function flushTileWork() {
      if (disposed) return;
      if (tileRenderer.processSync(16)) {
        tileFrame = null;
        maybeFinishLoading();
      } else {
        tileFrame = window.requestAnimationFrame(flushTileWork);
      }
    }

    function scheduleTileWork() {
      if (tileFrame == null) tileFrame = window.requestAnimationFrame(flushTileWork);
    }

    function queueModels(ids: Iterable<BuildingId>) {
      for (const id of ids) pendingModelIds.add(id);
      void loadPendingModels();
    }

    async function loadPendingModels() {
      if (modelLoadRunning) return;
      modelLoadRunning = true;
      while (!disposed && pendingModelIds.size > 0) {
        const ids = new Set(pendingModelIds);
        pendingModelIds.clear();
        try {
          filesTotal += countModelFiles(ids);
          updateLoadProgress();
          await preloadBuildingModels(ids, scene, () => {
            filesLoaded += 1;
            updateLoadProgress();
          });
          if (disposed) return;
          // Only entries of the newly loaded types are upgraded from boxes.
          tileRenderer.upgradeModels(ids);
          placementController.refresh();
          scheduleTileWork();
        } catch (error) {
          console.error("Model preload failed:", error);
        }
      }
      modelLoadRunning = false;
      maybeFinishLoading();
    }

    function queueMap(tiles: ReturnType<typeof useGameStore.getState>["map"]["tiles"]) {
      // queueSync reports only the building ids among changed tiles, so ticks
      // that merely touch worker state no longer trigger a full-map scan here.
      const changedBuildingIds = tileRenderer.queueSync(tiles);
      scheduleTileWork();
      if (changedBuildingIds.size > 0) queueModels(changedBuildingIds);
    }

    const initialTiles = useGameStore.getState().map.tiles;
    queueMap(initialTiles);
    citizens.sync(initialTiles);

    // The environment is intentionally non-blocking: it loads after the city
    // had a chance to paint. Emission is thin-instance batches — cheap enough
    // to build in one go once the models are in.
    environmentTimer = window.setTimeout(() => {
      void preloadEnvironmentModels(scene)
        .then(() => {
          if (disposed) return;
          envModelsReady = true;
          maybeScatter();
        })
        .catch((error) => console.error("Environment preload failed:", error));
    }, 750);

    // &ghost=<buildingId> (dev): enter placement mode with the pointer parked
    // near canvas center. Loading is on demand just like the normal palette.
    const ghostId = import.meta.env.DEV && new URLSearchParams(window.location.search).get("ghost");
    if (ghostId) {
      scene.pointerX = engine.getRenderWidth() / 2;
      scene.pointerY = engine.getRenderHeight() * 0.72;
      useGameStore.getState().setSelectedBuilding(ghostId as BuildingId);
    }

    const unsubscribe = useGameStore.subscribe((state, prevState) => {
      if (state.map.tiles !== prevState.map.tiles) {
        queueMap(state.map.tiles);
        citizens.sync(state.map.tiles);
      }
      if (state.map.selectedBuilding !== prevState.map.selectedBuilding) {
        // Only detach pointer drag (it fights placement); wheel zoom stays live.
        if (state.map.selectedBuilding) camera.inputs.attached.pointers.detachControl();
        else camera.inputs.attached.pointers.attachControl(true);
        tileRenderer.setGridVisible(!!state.map.selectedBuilding);
        if (state.map.selectedBuilding && state.map.selectedBuilding !== RAZE_TOOL) {
          queueModels([state.map.selectedBuilding]);
        }
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
      if (tileFrame != null) window.cancelAnimationFrame(tileFrame);
      if (environmentTimer != null) window.clearTimeout(environmentTimer);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("resize", handleResize);
      offHydration();
      unsubscribe();
      placementController.dispose();
      citizens.dispose();
      tileRenderer.dispose();
      treeScatter?.dispose();
      waterVisuals?.dispose();
      disposeAssetLibrary();
      engine.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full outline-none touch-none"
        style={{ backgroundColor: "#e9c98f" }}
      />
      {loadPhase !== "hidden" && (
        <div
          className={`absolute inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-[#e9c98f] transition-opacity duration-500 ${
            loadPhase === "fading" ? "opacity-0 pointer-events-none" : ""
          }`}
        >
          <h1 className="font-serif text-5xl tracking-wide text-[#6b3f22]">Patronage</h1>
          <div className="h-2 w-64 overflow-hidden rounded-full bg-[#c9a06a]">
            <div
              className="h-full rounded-full bg-[#b3542e] transition-[width] duration-300"
              style={{ width: `${Math.round(loadProgress * 100)}%` }}
            />
          </div>
          <p className="text-sm text-[#8a6a45]">Preparing the city…</p>
        </div>
      )}
    </div>
  );
}
