import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { CELL_SIZE } from "~/game/constants";
import { gridToWorld, type Tile, type TileMap } from "~/game/grid";
import { ROAD_DIAG_NE, ROAD_DIAG_NW } from "~/game/placement/roadStretch";
import { bridgeLiftAt, bridgeStep } from "./bridgeProfile";
import { cellGroundY, worldGroundY } from "./groundLevel";
import {
  getApronMaterial,
  getDirtPadMaterial,
  getDirtRibbonMaterial,
  getPavedRibbonMaterial,
  getPavingMaterial,
  getRoadMaterial,
  ROAD_TEX_VARIANTS,
} from "./paths";
import { prepareThinInstanceHost } from "./thinInstanceHost";

type RoadBatch = { mesh: Mesh; tiles: Map<string, Tile>; dirty: boolean };

/** Thin-instance renderer for paved roads, bridge decks, and bridge parapets. */
export function createRoadRenderer(scene: Scene) {
  function createRoadBatch(name: string): RoadBatch {
    const mesh = MeshBuilder.CreateGround(name, { width: CELL_SIZE, height: CELL_SIZE }, scene);
    mesh.material = getRoadMaterial(scene);
    prepareThinInstanceHost(mesh);
    mesh.setEnabled(false);
    return { mesh, tiles: new Map(), dirty: false };
  }

  // Paved streets carry a few texture seed variants hashed by cell position so
  // long runs don't repeat one tile texture — one batch per variant.
  const pavedRoads = Array.from({ length: ROAD_TEX_VARIANTS }, (_, i) => {
    const b = createRoadBatch(`paved-road-batch-${i}`);
    b.mesh.material = getRoadMaterial(scene, i);
    return b;
  });
  const pavedRibbons = Array.from({ length: ROAD_TEX_VARIANTS }, (_, i) => {
    const b = createRoadBatch(`paved-ribbon-batch-${i}`);
    b.mesh.material = getPavedRibbonMaterial(scene, i);
    return b;
  });
  // Freeform plaza paving: directionless slab fill (always cardinal — paving
  // never sets rotation), variant-hashed like streets so fields don't repeat.
  const pavingBatches = Array.from({ length: ROAD_TEX_VARIANTS }, (_, i) => {
    const b = createRoadBatch(`plaza-paving-batch-${i}`);
    b.mesh.material = getPavingMaterial(scene, i);
    return b;
  });
  const dirtRibbons = createRoadBatch("dirt-ribbon-batch");
  dirtRibbons.mesh.material = getDirtRibbonMaterial(scene);
  const bridges = createRoadBatch("bridge-deck-batch");

  // Junction pads: where a diagonal ribbon meets a cardinal street, the ribbon
  // cell renders as mottled stone (or packed earth for dirt lanes) instead of
  // 45° slabs overlapping straight ones. Two shapes (see junctionKind): a
  // convex hexagonal plate — the 45° ribbon strip through the cell, with
  // perpendicular end cuts exactly flush with the neighbor ribbons' brick
  // ends, widened to take in the two cell corners the strip misses, which
  // cover a crossing street's bare corners — for cells a street passes
  // through, and a plain strip (the ribbon quad's own transform) everywhere
  // else, so lane-side junctions keep the lane's silhouette. The hexagon is
  // modeled along the NE diagonal; NW instances take a 90° yaw.
  type RoadPads = { hex: Mesh; strip: Mesh };
  function createPadHexHost(name: string, material: StandardMaterial): Mesh {
    const c = CELL_SIZE / 2;
    const e = c * (Math.SQRT2 / 2);
    // Counter-clockwise in the xz plane (CreateGround's visible-from-above
    // winding): strip end corners at ±(c±e), the two kept cell corners between.
    const pts: Array<[number, number]> = [
      [c - e, c + e],
      [-c, c],
      [-(c + e), -(c - e)],
      [e - c, -(c + e)],
      [c, -c],
      [c + e, c - e],
    ];
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    for (const [px, pz] of pts) {
      positions.push(px, 0, pz);
      normals.push(0, 1, 0);
      uvs.push((px + c + e) / (2 * (c + e)), (pz + c + e) / (2 * (c + e)));
    }
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5];
    data.applyToMesh(mesh);
    mesh.material = material;
    prepareThinInstanceHost(mesh);
    mesh.setEnabled(false);
    return mesh;
  }
  function createPadHosts(name: string, material: StandardMaterial): RoadPads {
    const strip = MeshBuilder.CreateGround(
      `${name}-strip`,
      { width: CELL_SIZE, height: CELL_SIZE },
      scene
    );
    strip.material = material;
    prepareThinInstanceHost(strip);
    strip.setEnabled(false);
    return { hex: createPadHexHost(`${name}-hex`, material), strip };
  }
  const stonePads = createPadHosts("junction-pad-batch", getApronMaterial(1, 1, scene));
  const dirtPads = createPadHosts("dirt-junction-pad-batch", getDirtPadMaterial(scene));
  const bridgeDeckY = 0.025;
  const parapetHeight = 0.09;
  const parapetMaterial = new StandardMaterial("bridge-parapet-mat", scene);
  parapetMaterial.diffuseColor = Color3.FromHexString("#cbbfa3");
  parapetMaterial.specularColor = Color3.Black();
  const parapets = MeshBuilder.CreateBox(
    "bridge-parapet-batch",
    { width: CELL_SIZE, height: parapetHeight, depth: 0.05 },
    scene
  );
  parapets.material = parapetMaterial;
  prepareThinInstanceHost(parapets);
  parapets.setEnabled(false);

  // Under-deck arch masonry: per cell, two piers dropping through the water to
  // the bed with a segmental arch between them, so a bridge run reads as a
  // stone arcade from the side instead of a floating deck. Authored with
  // travel along local X (arch profile on the ±Z faces, water passing through
  // along Z); instances yaw with the tile like the rails do. Spandrel faces
  // sit at ±0.24 — flush with the parapets' outer face.
  const arches = (() => {
    const c = CELL_SIZE / 2;
    const d = c - 0.01;
    const top = bridgeDeckY - 0.005;
    const bot = -0.38; // below the river bed (-0.35) so the footing edge hides
    const r = 0.15;
    const spring = 0.005 - r; // crown just under the deck; springline underwater
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    type P = [number, number, number];
    // Perimeter-ordered quad; winding resolved against the outward normal so
    // no face can come out inverted.
    const quad = (pts: P[], n: P) => {
      const base = positions.length / 3;
      for (const p of pts) {
        positions.push(...p);
        normals.push(...n);
      }
      const [p0, p1, p2] = pts;
      const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
      const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
      const cross =
        (ay * bz - az * by) * n[0] + (az * bx - ax * bz) * n[1] + (ax * by - ay * bx) * n[2];
      if (cross > 0) indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const N = 12;
    const arc: Array<[number, number]> = [];
    for (let i = 0; i <= N; i++) {
      const a = Math.PI - (i / N) * Math.PI;
      arc.push([r * Math.cos(a), spring + r * Math.sin(a)]);
    }
    for (const s of [-1, 1] as const) {
      const z = s * d;
      const n: P = [0, 0, s];
      quad([[-c, bot, z], [-r, bot, z], [-r, top, z], [-c, top, z]], n);
      quad([[r, bot, z], [c, bot, z], [c, top, z], [r, top, z]], n);
      for (let i = 0; i < N; i++) {
        const [x0, y0] = arc[i];
        const [x1, y1] = arc[i + 1];
        quad([[x0, y0, z], [x1, y1, z], [x1, top, z], [x0, top, z]], n);
      }
    }
    // Intrados: the arch's underside barrel, normals toward the arc centre.
    for (let i = 0; i < N; i++) {
      const [x0, y0] = arc[i];
      const [x1, y1] = arc[i + 1];
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2 - spring;
      const len = Math.hypot(mx, my);
      quad([[x0, y0, -d], [x1, y1, -d], [x1, y1, d], [x0, y0, d]], [-mx / len, -my / len, 0]);
    }
    // Pier inner walls below the springline, and the end faces at the cell edge.
    for (const s of [-1, 1] as const) {
      const x = s * r;
      quad([[x, bot, -d], [x, bot, d], [x, spring, d], [x, spring, -d]], [-s, 0, 0]);
    }
    for (const s of [-1, 1] as const) {
      const x = s * c;
      quad([[x, bot, -d], [x, bot, d], [x, top, d], [x, top, -d]], [s, 0, 0]);
    }
    const mesh = new Mesh("bridge-arch-batch", scene);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.indices = indices;
    data.applyToMesh(mesh);
    mesh.material = parapetMaterial;
    prepareThinInstanceHost(mesh);
    mesh.setEnabled(false);
    return mesh;
  })();

  // Cardinal dirt (rotation null) has no thin-instance batch — it renders through
  // the raster overlay. Diagonal dirt can't (the raster is grid-axis-aligned), so
  // it gets its own ribbon batch; paved diagonals likewise split off so their
  // ribbon texture can carry √2-corrected slab courses.
  const texVariant = (t: Tile) =>
    (((t.position.x * 31 + t.position.y * 17) % ROAD_TEX_VARIANTS) + ROAD_TEX_VARIANTS) %
    ROAD_TEX_VARIANTS;
  const batchFor = (t: Tile): RoadBatch | null =>
    t.buildingId === "plaza_paving"
      ? pavingBatches[texVariant(t)]
      : t.buildingId === "dirt_path"
      ? t.rotation != null
        ? dirtRibbons
        : null
      : t.buildingId === "bridge"
        ? bridges
        : t.rotation != null
          ? pavedRibbons[texVariant(t)]
          : pavedRoads[texVariant(t)];

  function update(key: string, previous?: Tile, next?: Tile) {
    if (previous?.type === "road") {
      const batch = batchFor(previous);
      if (batch?.tiles.delete(key)) batch.dirty = true;
    }
    if (next?.type === "road") {
      const batch = batchFor(next);
      if (batch) {
        batch.tiles.set(key, next);
        batch.dirty = true;
      }
    }
    // Junction pads depend on neighbors outside a ribbon's own batch (a cardinal
    // dirt path can flip a paved ribbon cell into a junction and vice versa), so
    // any road edit re-flushes every ribbon batch.
    if (previous?.type === "road" || next?.type === "road") {
      for (const b of pavedRibbons) b.dirty = true;
      dirtRibbons.dirty = true;
    }
  }

  const opposite = (r: number | undefined) =>
    r === ROAD_DIAG_NE ? ROAD_DIAG_NW : r === ROAD_DIAG_NW ? ROAD_DIAG_NE : undefined;

  // Classify a diagonal ribbon cell's junction state. "hex" when a cardinal
  // street passes THROUGH the cell (road 4-neighbors on opposite sides of one
  // axis — the cell must cover the street's full width, bare corners included).
  // "strip" for every other contact — a road on one side (terminal mouth, a
  // street-end elbow), or an opposite-diagonal neighbor at either parity
  // (bowties) — where the pad keeps the lane's own ribbon silhouette instead
  // of paving the whole cell. Same-rotation lane-mates and staircase steps
  // match neither, so no false pad.
  function junctionKind(tiles: TileMap, tile: Tile): "none" | "strip" | "hex" {
    const { x, y } = tile.position;
    const road = (dx: number, dy: number) => {
      const n = tiles[`${x + dx},${y + dy}`];
      return n?.type === "road" && n.rotation == null;
    };
    const e = road(1, 0);
    const w = road(-1, 0);
    const n = road(0, 1);
    const s = road(0, -1);
    if ((e && w) || (n && s)) return "hex";
    if (e || w || n || s) return "strip";
    const opp = opposite(tile.rotation);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const t = tiles[`${x + dx},${y + dy}`];
      if (t?.type === "road" && t.rotation === opp) return "strip";
    }
    return "none";
  }

  // Pads sit above every street surface (bricks and ribbon overhangs terminate
  // under their edges). Same-line pads abut exactly, but lane-mate and bowtie
  // pads overlap, so a 3×3 grid parity staggers y — injective on any
  // neighborhood that can overlap — instead of z-fighting at one height.
  const padY = (gx: number, gy: number) => 0.0125 + ((gx % 3) + (gy % 3) * 3) * 0.0002;
  const padQuatNE = Quaternion.Identity();
  const padQuatNW = Quaternion.RotationYawPitchRoll(Math.PI / 2, 0, 0);
  const padScale = Vector3.One();

  function setInstances(mesh: Mesh, list: number[]) {
    if (list.length > 0) {
      mesh.thinInstanceSetBuffer("matrix", new Float32Array(list), 16, true);
      mesh.setEnabled(true);
    } else {
      mesh.thinInstanceSetBuffer("matrix", null);
      mesh.setEnabled(false);
    }
  }

  // Pad matrices accumulate across the paved-ribbon variant batches (each holds
  // only its hash slice of the ribbon cells), so the caller sets the pad
  // buffers once after every contributing batch has flushed.
  type PadAcc = { hex: number[]; strip: number[] };
  function flushRoadBatch(batch: RoadBatch, diagY: number, tiles: TileMap, pads: PadAcc | null) {
    if (!batch.dirty) return;
    if (batch.tiles.size === 0) {
      batch.mesh.thinInstanceSetBuffer("matrix", null);
      batch.mesh.setEnabled(false);
      batch.dirty = false;
      return;
    }
    // Pad counts vary, so accumulate into lists rather than pre-sized arrays.
    const matrices: number[] = [];
    const scratch: number[] = new Array(16);
    const matrix = Matrix.Identity();
    // Diagonal ribbon pieces: consecutive staircase centers are √2·CELL_SIZE
    // apart, so a √2-long quad abuts exactly; diagY (above the cardinal 0.01)
    // keeps junction/cross-row overlaps from coplanar shimmer.
    const diagScale = new Vector3(Math.SQRT2, 1, 1);
    const rampScale = new Vector3(1, 1, 1);
    const diagQuat = new Quaternion();
    const diagPos = new Vector3();
    for (const tile of batch.tiles.values()) {
      const { x, z } = gridToWorld(tile.position.x, tile.position.y);
      if (tile.rotation === ROAD_DIAG_NE || tile.rotation === ROAD_DIAG_NW) {
        // NE = grid dir (1,1) → world (+x,+z): θ = −π/4 under the codebase yaw
        // convention (+X → (cos θ, 0, −sin θ)); NW mirrors to +π/4.
        const theta = tile.rotation === ROAD_DIAG_NE ? -Math.PI / 4 : Math.PI / 4;
        Quaternion.RotationYawPitchRollToRef(theta, 0, 0, diagQuat);
        const kind = pads ? junctionKind(tiles, tile) : "none";
        if (kind !== "none") {
          diagPos.set(
            x,
            padY(tile.position.x, tile.position.y) + cellGroundY(tile.position.x, tile.position.y),
            z
          );
          if (kind === "hex") {
            const quat = tile.rotation === ROAD_DIAG_NE ? padQuatNE : padQuatNW;
            Matrix.ComposeToRef(padScale, quat, diagPos, matrix);
            matrix.copyToArray(scratch, 0);
            pads!.hex.push(...scratch);
          } else {
            // The strip pad: the suppressed ribbon's own transform, in mottle —
            // hugs the lane silhouette, ends flush with the neighbor bricks.
            Matrix.ComposeToRef(diagScale, diagQuat, diagPos, matrix);
            matrix.copyToArray(scratch, 0);
            pads!.strip.push(...scratch);
          }
          continue;
        }
        // Diagonal ribbons chord along their travel direction (the proven
        // bridge yaw+roll composition); the quad's cross-axis stays level.
        // ponytail: cross-slope tilt skipped on diagonals — narrow incidence,
        // add the full plane fit like the cardinal branch if it reads badly.
        const dzy = tile.rotation === ROAD_DIAG_NE ? 1 : -1;
        const run = (Math.SQRT2 / 2) * CELL_SIZE;
        const g0 = worldGroundY(x - run * Math.SQRT1_2, z - dzy * run * Math.SQRT1_2);
        const g1 = worldGroundY(x + run * Math.SQRT1_2, z + dzy * run * Math.SQRT1_2);
        const climb = Math.atan2(g1 - g0, 2 * run);
        Quaternion.RotationYawPitchRollToRef(theta, 0, climb, diagQuat);
        diagPos.set(x, diagY + worldGroundY(x, z), z);
        Matrix.ComposeToRef(diagScale, diagQuat, diagPos, matrix);
        matrix.copyToArray(scratch, 0);
        matrices.push(...scratch);
      } else {
        // Cardinal quads fit the local ground plane: sampled slopes along
        // both axes tilt the quad so streets hug the hillside; flat ground
        // keeps the cheap translation.
        const half = CELL_SIZE / 2;
        const gradX = (worldGroundY(x + half, z) - worldGroundY(x - half, z)) / CELL_SIZE;
        const gradZ = (worldGroundY(x, z + half) - worldGroundY(x, z - half)) / CELL_SIZE;
        const center = worldGroundY(x, z);
        if (gradX !== 0 || gradZ !== 0) {
          // Roll raises the +x edge (the bridge convention), pitch the +z edge.
          Quaternion.RotationYawPitchRollToRef(0, -Math.atan(gradZ), Math.atan(gradX), diagQuat);
          diagPos.set(x, 0.01 + center, z);
          rampScale.set(Math.hypot(1, gradX), 1, Math.hypot(1, gradZ));
          Matrix.ComposeToRef(rampScale, diagQuat, diagPos, matrix);
        } else {
          Matrix.TranslationToRef(x, 0.01 + center, z, matrix);
        }
        matrix.copyToArray(scratch, 0);
        matrices.push(...scratch);
      }
    }
    setInstances(batch.mesh, matrices);
    batch.dirty = false;
  }

  function flushBridges(tiles: TileMap) {
    if (!bridges.dirty) return;
    if (bridges.tiles.size === 0) {
      bridges.mesh.thinInstanceSetBuffer("matrix", null);
      bridges.mesh.setEnabled(false);
      parapets.thinInstanceSetBuffer("matrix", null);
      parapets.setEnabled(false);
      setInstances(arches, []);
      bridges.dirty = false;
      return;
    }

    const deckMatrices = new Float32Array(bridges.tiles.size * 16);
    const railMatrices: number[] = [];
    const archMatrices: number[] = [];
    const matrix = Matrix.Identity();
    const rail: number[] = new Array(16);
    const scale = new Vector3();
    const quat = new Quaternion();
    const pos = new Vector3();
    let offset = 0;
    // Bridge sides stay open where a road or civic footprint continues the path.
    const openAt = (x: number, y: number) => {
      const type = tiles[`${x},${y}`]?.type;
      return type === "road" || type === "city";
    };

    for (const tile of bridges.tiles.values()) {
      const { x: gx, y: gy } = tile.position;
      const { x, z } = gridToWorld(gx, gy);
      const inset = CELL_SIZE / 2 - 0.035;
      const diagonal = tile.rotation === ROAD_DIAG_NE || tile.rotation === ROAD_DIAG_NW;

      // Every deck-riding piece shares one chord transform: the cell's deck
      // runs from lift0 to lift1 along the run (Rialto hump, bridgeProfile.ts),
      // as a straight chord — adjacent cells share edge samples, so the chords
      // form a continuous polyline arch. Yaw maps local +X onto the travel
      // direction (+X → (cos θ, 0, −sin θ)), roll climbs the chord, and the
      // x-stretch keeps the horizontal footprint at one cell.
      const [sx, sy] = bridgeStep(tiles, tile);
      const stepLen = Math.hypot(sx, sy) * CELL_SIZE;
      const ux = (sx * CELL_SIZE) / stepLen;
      const uz = (sy * CELL_SIZE) / stepLen;
      const half = stepLen / 2;
      // Terrace height joins the hump so land causeways ride their terrace
      // and chords stay continuous across a level step.
      const liftAt = (wx: number, wz: number) => bridgeLiftAt(tiles, wx, wz) + worldGroundY(wx, wz);
      const lift0 = liftAt(x - ux * half, z - uz * half);
      const lift1 = liftAt(x + ux * half, z + uz * half);
      const liftMid = (lift0 + lift1) / 2;
      const climb = Math.atan2(lift1 - lift0, 2 * half);
      const chordScale = Math.hypot(2 * half, lift1 - lift0) / CELL_SIZE;
      const yaw = Math.atan2(-uz, ux);
      Quaternion.RotationYawPitchRollToRef(yaw, 0, climb, quat);

      // +0.0015 above the cardinal deck plane on diagonals: the √2 quad
      // overhangs its cell (~0.104 wu) and would coplanar-overlap a cardinal
      // deck it joins.
      const deckY = bridgeDeckY + liftMid + (diagonal ? 0.0015 : 0);
      scale.set(chordScale, 1, 1);
      pos.set(x, deckY, z);
      Matrix.ComposeToRef(scale, quat, pos, matrix);
      matrix.copyToArray(deckMatrices, offset);
      offset += 16;

      // Arch masonry: stretched up so its top follows the lifted deck (base
      // stays sunk at −0.38 in the bed) and rolled with the chord so cell tops
      // stair evenly along the slope. The arch profile stretches with it —
      // arches grow taller toward the crown of the hump.
      const masonryY = 1 + liftMid / 0.4;
      scale.set(chordScale, masonryY, 1);
      pos.set(x, 0.95 * liftMid, z);
      Matrix.ComposeToRef(scale, quat, pos, matrix);
      matrix.copyToArray(rail, 0);
      archMatrices.push(...rail);

      // Long-side rails ride the chord at ±inset off the travel line; world
      // side normal for s = ±1 is s·(−uz, 0, ux). Suppressed where the
      // neighbor on that side is a same-rotation bridge (multi-lane interior).
      const railY = deckY + parapetHeight / 2;
      scale.set(chordScale, 1, 1);
      for (const s of [-1, 1]) {
        if (diagonal) {
          // ponytail: no end-cap rails at 45° — diagonal ends read fine bare,
          // and openAt's cardinal offsets don't map onto a 45° dead end.
          // Multi-lane lanes offset +x (roadStretch), so the lane-mate check
          // stays on the x neighbor.
          const neighbor = tiles[`${gx + Math.sign(s * Math.sin(yaw))},${gy}`];
          if (neighbor?.buildingId === "bridge" && neighbor.rotation === tile.rotation) continue;
        } else if (openAt(gx + Math.round(-s * uz), gy + Math.round(s * ux))) continue;
        pos.set(x - s * uz * inset, railY, z + s * ux * inset);
        Matrix.ComposeToRef(scale, quat, pos, matrix);
        matrix.copyToArray(rail, 0);
        railMatrices.push(...rail);
      }

      // End-cap rails on a cardinal dead end sit at the run's edge, where the
      // hump has already fallen back to road level — they stay flat.
      if (!diagonal) {
        for (const s of [-1, 1]) {
          const ex = gx + s * sx;
          const ey = gy + s * sy;
          if (openAt(ex, ey)) continue;
          Matrix.RotationYToRef(sy === 0 ? Math.PI / 2 : 0, matrix);
          matrix.setTranslationFromFloats(
            x + s * ux * inset,
            bridgeDeckY + parapetHeight / 2 + cellGroundY(gx, gy),
            z + s * uz * inset
          );
          matrix.copyToArray(rail, 0);
          railMatrices.push(...rail);
        }
      }
    }

    bridges.mesh.thinInstanceSetBuffer("matrix", deckMatrices, 16, true);
    bridges.mesh.setEnabled(true);
    if (railMatrices.length > 0) {
      parapets.thinInstanceSetBuffer("matrix", new Float32Array(railMatrices), 16, true);
      parapets.setEnabled(true);
    } else {
      parapets.thinInstanceSetBuffer("matrix", null);
      parapets.setEnabled(false);
    }
    setInstances(arches, archMatrices);
    bridges.dirty = false;
  }

  /** Flush after any map edit because adjacent civic/road cells affect bridge rails. */
  function flush(tiles: TileMap) {
    for (const b of pavedRoads) flushRoadBatch(b, 0.0115, tiles, null);
    for (const b of pavingBatches) flushRoadBatch(b, 0.0115, tiles, null);
    // update() dirties all ribbon batches together, so a dirty check on any of
    // them decides whether the pad buffers rebuild this flush.
    const stoneDirty = pavedRibbons.some((b) => b.dirty);
    const stoneAcc: { hex: number[]; strip: number[] } = { hex: [], strip: [] };
    for (const b of pavedRibbons) flushRoadBatch(b, 0.0115, tiles, stoneAcc);
    if (stoneDirty) {
      setInstances(stonePads.hex, stoneAcc.hex);
      setInstances(stonePads.strip, stoneAcc.strip);
    }
    const dirtDirty = dirtRibbons.dirty;
    const dirtAcc: { hex: number[]; strip: number[] } = { hex: [], strip: [] };
    flushRoadBatch(dirtRibbons, 0.009, tiles, dirtAcc);
    if (dirtDirty) {
      setInstances(dirtPads.hex, dirtAcc.hex);
      setInstances(dirtPads.strip, dirtAcc.strip);
    }
    if (bridges.tiles.size > 0) bridges.dirty = true;
    flushBridges(tiles);
  }

  function disposeBatches(batches: RoadBatch[]) {
    for (const b of batches) b.mesh.dispose();
  }

  function dispose() {
    disposeBatches(pavedRoads);
    disposeBatches(pavingBatches);
    disposeBatches(pavedRibbons);
    dirtRibbons.mesh.dispose();
    stonePads.hex.dispose();
    stonePads.strip.dispose();
    dirtPads.hex.dispose();
    dirtPads.strip.dispose();
    bridges.mesh.dispose();
    parapets.dispose();
    arches.dispose();
    parapetMaterial.dispose();
  }

  return { update, flush, dispose };
}
