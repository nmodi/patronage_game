# Plan: population-scaled citizen crowds

*Planning doc — July 2026. Scales the decorative citizens (design doc G5) with the city's population, performantly.*

## Goal

Today the wandering citizens are pure ambience: `createCitizens` spawns
`min(16, ceil(walkableTiles / 8))` figures — count tied to road area, not to
population at all. The goal:

- **Low population (countable):** visual citizen count **matches population
  exactly**, preserving the illusion — 7 people housed, 7 people on the streets.
- **High population:** count grows **sublinearly** with a hard cap. Nobody
  counts 300 meeples; a lively-but-bounded crowd reads the same.
- **Performant:** draw calls and per-frame CPU stay flat-ish as the crowd grows.

This does **not** violate principle 1 (no citizen pathfinding): citizens remain
cosmetic random-walkers with no sim meaning. Population becomes an *input to
the count*, nothing more.

## Current state (what has to change and why)

| Piece | Today | Problem at scale |
|---|---|---|
| Count | `MAX_CITIZENS = 16`, derived from walkable tile count (`citizens.ts`) | No tie to population |
| Wiring | `citizens.sync(tiles)` called only when `map.tiles` changes (`BabylonCanvas.tsx`) | Population changes every tick but never reaches the citizen layer |
| Figures | Each citizen = `Mesh.clone` of a merged template with a per-clone `MultiMaterial` (3 submeshes: robe/accent/skin) — `citizenFigures.ts` | ~3 draw calls **per citizen** + a material object per clone. 120 citizens ≈ 360 draw calls; the rest of the city is batched thin instances, so the crowd would dominate the frame |
| Walk loop | O(n) per frame, allocates a fresh `loco` object per citizen per frame | Fine at 16; avoidable garbage at 100+ |

## Step 1 — Count curve (pure sim→visual mapping)

A pure function, colocated with the citizen layer and verified by a check file
(matching the `water.check.ts` / `tick.check.ts` pattern):

```ts
// crowdSize(population, walkableTileCount) → number of figures
```

- `population ≤ EXACT_MATCH_MAX` (20): **count = round(population)** — the
  countable regime. (Population drifts fractionally? It doesn't — it's integer
  ±1/month — but round defensively.)
- Above: `EXACT_MATCH_MAX + round(K * sqrt(population − EXACT_MATCH_MAX))`,
  K ≈ 2.5. Sample values: pop 50 → 34, pop 100 → 42, pop 400 → 69, pop 1000 → 98.
- Clamp to `CROWD_CAP` (~120, validated in Step 5) and to walkable capacity
  `floor(walkableTiles / 3)` — a big population on a two-lane hamlet must not
  read as a mob. Zero walkable tiles → zero citizens (as today).
- `crowd.check.ts` asserts: exact-match region, monotonic non-decreasing,
  both clamps, zero cases.

All constants live in one tuning block, like `XP_RATES`.

## Step 2 — Wiring population into the citizen layer

- Split the citizen API: `sync(tiles)` keeps rebuilding the walk network on
  map changes; new `setPopulation(n)` just retargets the count. Both funnel
  into one `retarget()` that spawns/despawns incrementally.
- `BabylonCanvas.tsx` store subscription adds: population changed →
  `citizens.setPopulation(state.population)` (plus one call at boot after
  hydration). Population moves ±1/month, so steady-state churn is one figure
  at most per tick — spawn/despawn stays naturally gentle. Spawning at a
  random walkable tile (today's behavior) is fine; no fade needed at this
  scale. Despawn pops the newest figure, as today.
- Keep today's demolition self-heal (respawn anyone standing on a razed tile).

Ship checkpoint: Steps 1–2 alone (with the clone factory and a temporary cap
of ~40) are already a working, shippable slice. Step 3 raises the cap.

## Step 3 — Thin-instance figure rendering (the performance core)

`citizenFigures.ts` already documents the `FigureFactory`/`CitizenFigure` seam
as the place to swap rendering strategies without touching `citizens.ts`. Add
`createThinInstanceFigureFactory` behind that seam:

- **Geometry:** build each of the 5 variants as **3 single-material meshes**
  split by slot (robe parts / accent parts / skin parts) instead of one merged
  `MultiMaterial` mesh. Each becomes a thin-instance host via the existing
  `prepareThinInstanceHost` helper. **15 hosts = 15 draw calls total, for any
  crowd size** (vs 3 × N today).
- **Per-instance data:** a `"matrix"` buffer (16 floats/instance) on all three
  hosts of a variant, plus a `"color"` buffer (4 floats) on the robe and accent
  hosts for the two-tone palette. Skin stays a uniform material color — no
  color buffer on skin hosts. Per-figure size variety (±10% scale) bakes into
  the matrix.
- **Pose → matrix:** `figure.update(loco, dt)` composes one world matrix
  (yaw + lean + sway rotation, bob-offset translation, scale) with
  `Matrix.ComposeToRef` into scratch objects and writes it at the figure's
  instance index in its variant's shared `Float32Array` — same 16 floats for
  all three slot hosts, so one compose per figure per frame.
- **Flush:** add an optional `flush()` to `FigureFactory`, called once by the
  walk observer after the citizen loop — one
  `thinInstanceBufferUpdated("matrix")` per dirty host per frame (≤15 calls),
  never per figure. Buffers preallocate to the current cap and grow
  geometrically on retarget; count changes use `thinInstanceCount`.
- **Add/remove:** per-variant instance lists; removal swap-with-last and
  shrink — each `CitizenFigure` holds its (mutable) index, updated on swap.
  Citizens don't need stable indices.
- **Culling/shadows:** hosts get `alwaysSelectAsActiveMesh = true` — the crowd
  spans the whole city, per-frame bounding refresh buys nothing. Citizens cast
  no shadows today (the factory never touches the shadow generator); keep that.
- `createPrimitiveFigureFactory` stays: `createStatueMesh` (Phase 9 display
  statues) shares its variant builders, and the clone factory remains the
  simple reference implementation. The variant builders and pose math are the
  shared parts; only the merge/clone plumbing forks.

Rejected alternative: `InstancedMesh` per citizen — Babylon can't hardware-
instance a `MultiMaterial` mesh, so it needs the same 3-way slot split anyway,
and thin instances are cheaper per instance and already the codebase idiom
(roads, scatter, bridge parapets).

## Step 4 — Walk-loop hygiene

O(n) random walk is fine to a few hundred figures; just keep it allocation-free:

- Reuse a module-scope scratch `FigureLocomotion` object instead of building a
  fresh one per citizen per frame.
- `pickDestination`'s candidate array only allocates on cell arrival
  (~every 1–2 s per citizen) — leave it.
- No LOD/update-staggering unless Step 5 measurement demands it (it shouldn't
  at ≤120).

## Step 5 — Validate the cap, tune, verify

- Dev flag `&crowd=<n>` (alongside `&cam`/`&map`/`&pause`) to force the visual
  count regardless of population — for headless screenshots and perf runs.
- Measure with the Babylon engine stats on `?demo&crowd=120`: draw calls
  (expect +15 over baseline), frame time on a mid-tier profile. Raise or lower
  `CROWD_CAP` on evidence.
- Eyeball checks: low-pop city shows exactly `population` figures; pause still
  freezes the crowd; 3× speed still scales walk speed; razing under a citizen
  still respawns them.

## Step 6 — Docs

- Design doc: update the G5 "decorative citizens" line — count now scales with
  population (exact when countable, damped beyond), still cosmetic, no sim
  meaning.
- CLAUDE.md current-state blurb: mention population-scaled crowds + the
  thin-instance figure factory.
- Update the stale comment atop `citizens.ts` ("no tie to population").

## File touch list

| File | Change |
|---|---|
| `app/game/render/citizens.ts` | count curve + constants, `setPopulation`, incremental retarget, scratch loco, `flush()` call |
| `app/game/render/crowd.check.ts` (new) | count-curve assertions |
| `app/game/render/citizenFigures.ts` | slot-split variant builders (shared), `createThinInstanceFigureFactory`, optional `flush` on `FigureFactory` |
| `app/game/render/BabylonCanvas.tsx` | population subscription → `setPopulation` |
| dev-flag parsing site | `&crowd=` override |
| `docs/design-doc.md`, `CLAUDE.md` | doc updates |
