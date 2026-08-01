import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { Scene } from "@babylonjs/core/scene";
// Side-effect registrations required by the tree-shaken post-process build.
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";

/** Create and configure the Babylon scene independently of React/store lifecycle. */
export function createRenderScene(canvas: HTMLCanvasElement) {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: import.meta.env.DEV,
    stencil: true,
  });
  if (import.meta.env.DEV && window.location.search.includes("synccompile")) {
    engine.getCaps().parallelShaderCompile = undefined;
  }

  const scene = new Scene(engine);
  // Babylon normally suppresses compatibility mouse events needed by placement.ts.
  scene.preventDefaultOnPointerDown = false;
  scene.preventDefaultOnPointerUp = false;
  scene.useRightHandedSystem = true;
  // Matches the skydome's just-above-horizon band so fogged geometry dissolves into sky.
  const horizonColor = Color3.FromHexString("#b3c6f1");
  scene.clearColor = Color4.FromColor3(horizonColor, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = horizonColor;
  scene.fogStart = 90;
  scene.fogEnd = 115;

  // Kenney day sky, a 2:1 equirect panorama — standard sphere UVs are equirectangular,
  // so an inside-out sphere is the whole skybox.
  const sky = CreateSphere("sky", { diameter: 1000, sideOrientation: Mesh.BACKSIDE }, scene);
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.applyFog = false;
  const skyMaterial = new StandardMaterial("skyMat", scene);
  // invertY=false: Babylon's default flip puts the panorama's below-horizon half at the zenith.
  skyMaterial.emissiveTexture = new Texture("/sky/skybox-day.png", scene, false, false);
  skyMaterial.disableLighting = true;
  skyMaterial.diffuseColor = Color3.Black();
  skyMaterial.specularColor = Color3.Black();
  sky.material = skyMaterial;

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

  // &cam=x,z[,radius[,alpha[,beta]]] frames a location for dev screenshots.
  const cameraFlag =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get("cam");
  if (cameraFlag) {
    const [x, z, radius, alpha, beta] = cameraFlag.split(",").map(Number);
    camera.target = new Vector3(x || 0, 0, z || 0);
    if (radius) camera.radius = radius;
    camera.alpha = Number.isFinite(alpha) ? alpha : Math.PI / 4;
    camera.beta = Number.isFinite(beta) ? beta : Math.PI / 3.2;
  }

  const hemisphericLight = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemisphericLight.intensity = 0.85;
  // Warm ground bounce so walls facing away from the sun stay readable instead of
  // silhouetting to black (groundColor defaults to black).
  hemisphericLight.groundColor = Color3.FromHexString("#9c8468");
  const directionalLight = new DirectionalLight("dir", new Vector3(-1, -1, -1), scene);
  directionalLight.position = new Vector3(5, 5, 5);
  directionalLight.intensity = 1.1;

  const shadowGenerator = new ShadowGenerator(2048, directionalLight);
  shadowGenerator.useBlurExponentialShadowMap = true;
  const shadowMap = shadowGenerator.getShadowMap();
  if (shadowMap) shadowMap.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;

  // Warm Renaissance grade; configure before pipelines so shaders compile once.
  const curves = new ColorCurves();
  curves.globalHue = 25;
  curves.globalDensity = 10;
  curves.globalSaturation = 3;
  curves.shadowsHue = 25;
  curves.shadowsDensity = 5;
  scene.imageProcessingConfiguration.colorCurves = curves;
  scene.imageProcessingConfiguration.colorCurvesEnabled = true;

  if (!window.location.search.includes("nofx")) {
    try {
      const ssao = new SSAO2RenderingPipeline(
        "ssao",
        scene,
        { ssaoRatio: 0.75, blurRatio: 1 },
        [camera]
      );
      ssao.radius = 0.6;
      ssao.totalStrength = 1.25;
      ssao.base = 0.05;
      ssao.samples = 16;
      ssao.maxZ = 120;
      ssao.minZAspect = 0.2;
      ssao.expensiveBlur = true;
    } catch (error) {
      console.warn("SSAO unavailable, skipping:", error);
    }

    const pipeline = new DefaultRenderingPipeline("upgrade", true, scene, [camera]);
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType =
      ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.contrast = 1.1;
    scene.imageProcessingConfiguration.exposure = 1.05;
    scene.imageProcessingConfiguration.vignetteEnabled = true;
    scene.imageProcessingConfiguration.vignetteWeight = 1.4;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.85;
    pipeline.bloomWeight = 0.15;
    pipeline.bloomKernel = 64;
    pipeline.bloomScale = 0.5;
    pipeline.sharpenEnabled = true;
    pipeline.sharpen.edgeAmount = 0.25;
    pipeline.sharpen.colorAmount = 1;
    pipeline.fxaaEnabled = true;
  }

  return { engine, scene, camera, shadowGenerator };
}
