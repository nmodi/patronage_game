// Map overlay view: the gathering field as heat plus formed freeform plazas
// (city/gathering.ts), Civ-style. One draped mesh — a shared-vertex grid quad
// following the terrain via the registered ground sampler — carrying a
// DynamicTexture painted per cell (the sky's unlit emissive recipe, plus
// alpha from the same canvas). Built lazily on first show, like the placement
// grid: the ground sampler registers after the renderers are constructed.
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

import { CELL_SIZE, GATHER_FORM, GRID_SIZE } from "~/game/constants";
import { computeGathering } from "~/game/city/gathering";
import type { TileMap } from "~/game/grid";
import { worldGroundY } from "./groundLevel";

const LIFT = 0.035; // above road quads (0.0115) and plaza pads, below eye-catching
const PX = 4; // canvas pixels per cell — enough for a crisp 1px region border
// Heat as quantized bands (Civ-style): a continuous alpha wash saturates flat
// in any built-up quarter, and discrete steps read far better over textured
// terrain. `min` is a multiple of GATHER_FORM. A mature city runs the field to
// ~13× GATHER_FORM (demo p50 ≈ 2×, p90 ≈ 9×), so the upper bands spread across
// that range to give in-city structure; only the palest band is below the
// formable line — the first color step is the actionable edge. Exported so the
// legend mirrors the map's own colors.
export const HEAT_BANDS = [
  { min: 0.5, rgb: "234,205,130", alpha: 0.15 }, // warming, not yet formable
  { min: 1, rgb: "228,158,66", alpha: 0.3 }, // formable (field ≥ GATHER_FORM)
  { min: 2.5, rgb: "219,112,45", alpha: 0.4 },
  { min: 6, rgb: "196,62,38", alpha: 0.5 }, // heart of the city
] as const;
// Formed plazas: organic gold vs authored slate — the legend's two swatches.
export const ORGANIC_RGB = "224,168,60";
export const AUTHORED_RGB = "127,155,179";
const FILL_ALPHA = 0.5;

export function createGatheringOverlay(scene: Scene) {
  let mesh: Mesh | null = null;
  let texture: DynamicTexture | null = null;
  let drawn: { tiles: TileMap; seed: string | null } | null = null;

  function build() {
    const size = GRID_SIZE * PX;
    texture = new DynamicTexture("gathering-overlay-tex", { width: size, height: size }, scene, false);
    texture.hasAlpha = true;
    texture.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);

    const half = (GRID_SIZE * CELL_SIZE) / 2;
    const n = GRID_SIZE + 1;
    const positions = new Float32Array(n * n * 3);
    const uvs = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const x = -half + i * CELL_SIZE;
        const z = -half + j * CELL_SIZE;
        const v = (j * n + i) * 3;
        positions[v] = x;
        positions[v + 1] = LIFT + worldGroundY(x, z);
        positions[v + 2] = z;
        uvs[(j * n + i) * 2] = i / GRID_SIZE;
        // DynamicTexture canvases draw row 0 at v=1: flip so canvas row j is
        // grid row j (cell (x,y) paints at pixel (x·PX, y·PX)).
        uvs[(j * n + i) * 2 + 1] = 1 - j / GRID_SIZE;
      }
    }
    const indices = new Uint32Array(GRID_SIZE * GRID_SIZE * 6);
    let k = 0;
    for (let j = 0; j < GRID_SIZE; j += 1) {
      for (let i = 0; i < GRID_SIZE; i += 1) {
        const a = j * n + i;
        indices[k++] = a;
        indices[k++] = a + 1;
        indices[k++] = a + n;
        indices[k++] = a + 1;
        indices[k++] = a + n + 1;
        indices[k++] = a + n;
      }
    }

    mesh = new Mesh("gathering-overlay", scene);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.uvs = uvs;
    data.applyToMesh(mesh);
    mesh.isPickable = false;
    mesh.applyFog = false;

    const mat = new StandardMaterial("gathering-overlay-mat", scene);
    mat.emissiveTexture = texture;
    mat.diffuseTexture = texture;
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    mesh.material = mat;
  }

  function draw(tiles: TileMap, mapSeed: string | null) {
    const ctx = texture!.getContext() as CanvasRenderingContext2D;
    const size = GRID_SIZE * PX;
    ctx.clearRect(0, 0, size, size);
    const { field, plazas, plazaCells } = computeGathering(tiles, mapSeed);

    // Heat: highest band the cell clears, if any.
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const f = field[y * GRID_SIZE + x]! / GATHER_FORM;
        let band: (typeof HEAT_BANDS)[number] | null = null;
        for (const b of HEAT_BANDS) {
          if (f >= b.min) band = b;
        }
        if (!band) continue;
        ctx.fillStyle = `rgba(${band.rgb},${band.alpha})`;
        ctx.fillRect(x * PX, y * PX, PX, PX);
      }
    }

    // Premade plaza buildings (Town Center Plaza + retired Plaza/Small Plaza
    // in old saves) highlight like authored plazas — they're placed hubs.
    const PREMADE = new Set(["town_center_plaza", "plaza", "small_plaza"]);
    const premadeOrigin = new Map<string, string>(); // cell key → origin key
    for (const [key, tile] of Object.entries(tiles)) {
      if (PREMADE.has(tile.buildingId)) premadeOrigin.set(key, `${tile.origin.x},${tile.origin.y}`);
    }
    ctx.fillStyle = `rgba(${AUTHORED_RGB},${FILL_ALPHA})`;
    for (const key of premadeOrigin.keys()) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      ctx.fillRect(x * PX, y * PX, PX, PX);
    }
    ctx.fillStyle = `rgba(${AUTHORED_RGB},1)`;
    for (const [key, origin] of premadeOrigin) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      if (premadeOrigin.get(`${x},${y - 1}`) !== origin) ctx.fillRect(x * PX, y * PX, PX, 1);
      if (premadeOrigin.get(`${x},${y + 1}`) !== origin) ctx.fillRect(x * PX, y * PX + PX - 1, PX, 1);
      if (premadeOrigin.get(`${x - 1},${y}`) !== origin) ctx.fillRect(x * PX, y * PX, 1, PX);
      if (premadeOrigin.get(`${x + 1},${y}`) !== origin) ctx.fillRect(x * PX + PX - 1, y * PX, 1, PX);
    }

    // Formed plazas: solid-ish fill plus a crisp border on region edges.
    for (let index = 0; index < plazas.length; index += 1) {
      const plaza = plazas[index]!;
      const rgb = plaza.organic ? ORGANIC_RGB : AUTHORED_RGB;
      ctx.fillStyle = `rgba(${rgb},${FILL_ALPHA})`;
      for (const cell of plaza.cells) {
        const [x, y] = cell.split(",").map(Number) as [number, number];
        ctx.fillRect(x * PX, y * PX, PX, PX);
      }
      ctx.fillStyle = `rgba(${rgb},1)`;
      for (const cell of plaza.cells) {
        const [x, y] = cell.split(",").map(Number) as [number, number];
        if (plazaCells.get(`${x},${y - 1}`) !== index) ctx.fillRect(x * PX, y * PX, PX, 1);
        if (plazaCells.get(`${x},${y + 1}`) !== index) ctx.fillRect(x * PX, y * PX + PX - 1, PX, 1);
        if (plazaCells.get(`${x - 1},${y}`) !== index) ctx.fillRect(x * PX, y * PX, 1, PX);
        if (plazaCells.get(`${x + 1},${y}`) !== index) ctx.fillRect(x * PX + PX - 1, y * PX, 1, PX);
      }
    }
    texture!.update();
  }

  /** Show/hide + redraw when the map changed underneath. Cheap when hidden. */
  function sync(tiles: TileMap, mapSeed: string | null, visible: boolean) {
    if (!visible) {
      mesh?.setEnabled(false);
      return;
    }
    if (!mesh) build();
    mesh!.setEnabled(true);
    if (drawn && drawn.tiles === tiles && drawn.seed === mapSeed) return;
    draw(tiles, mapSeed);
    drawn = { tiles, seed: mapSeed };
  }

  function dispose() {
    texture?.dispose();
    (mesh?.material as StandardMaterial | null)?.dispose();
    mesh?.dispose();
    mesh = null;
    texture = null;
  }

  return { sync, dispose };
}
