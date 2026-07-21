import { useEffect, useRef, useState } from "react";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { BuildingId } from "~/game/buildings";
import { GameTitle, NIGHT_SKY_BG, NightStars } from "~/game/ui/nightSky";
import { getWater } from "~/game/water";
import { deriveSimTiles } from "~/game/roadRaster";
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
import { createRenderScene } from "./sceneSetup";
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

    const { engine, scene, camera, shadowGenerator } = createRenderScene(canvas);

    // Dev-only hooks for headless screenshot and scripted placement checks.
    if (import.meta.env.DEV) {
      (window as unknown as { __scene: typeof scene }).__scene = scene;
      (window as unknown as { __store: typeof useGameStore }).__store = useGameStore;
    }

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
          if (!disposed) console.error("Model preload failed:", error);
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

    const initialMap = useGameStore.getState().map;
    queueMap(initialMap.tiles);
    tileRenderer.syncRoads(initialMap.roads);
    tileRenderer.syncDisplay(useGameStore.getState().artworks);
    // Citizens (and connectivity, via the store) walk the rasterized sim view,
    // so decorative meeples traverse freeform roads too.
    citizens.sync(deriveSimTiles(initialMap.tiles, initialMap.roads));
    citizens.setPopulation(useGameStore.getState().population);

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
        .catch((error) => {
          if (!disposed) console.error("Environment preload failed:", error);
        });
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
      }
      if (state.map.tiles !== prevState.map.tiles || state.map.roads !== prevState.map.roads) {
        tileRenderer.syncRoads(state.map.roads);
        citizens.sync(deriveSimTiles(state.map.tiles, state.map.roads));
      }
      if (state.population !== prevState.population) {
        citizens.setPopulation(state.population);
      }
      if (state.artworks !== prevState.artworks) {
        tileRenderer.syncDisplay(state.artworks);
        scheduleTileWork();
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
        style={{ backgroundColor: "var(--color-crest-blue-deep)" }}
      />
      {loadPhase !== "hidden" && (
        <div
          className={`absolute inset-0 z-[70] flex flex-col items-center justify-center gap-6 transition-opacity duration-500 ${
            loadPhase === "fading" ? "opacity-0 pointer-events-none" : ""
          }`}
          style={{ background: NIGHT_SKY_BG }}
        >
          <NightStars />
          <GameTitle />
          <div className="relative h-1.5 w-64 overflow-hidden rounded-full bg-parchment-deep">
            <div
              className="h-full rounded-full bg-sienna transition-[width] duration-300"
              style={{ width: `${Math.round(loadProgress * 100)}%` }}
            />
          </div>
          <p className="relative text-sm italic text-parchment/55">Preparing the city…</p>
        </div>
      )}
    </div>
  );
}
