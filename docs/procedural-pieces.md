# Procedural kit pieces — state of play

*July 2026. Where the generated-pieces work stands and what's left.*

Companion to [kitbashing.md](kitbashing.md), which holds the **how and why** (the colour rules, the gotchas, the traps). This file is the **resumable part**: what's built, what's open, what each open piece costs, and how to check your work. Read kitbashing.md's "Generated pieces (`proc:`)" section before touching any of this — most of the expensive lessons are there, not here.

---

## Why any of this exists

A `Part.tint` is one diffuse multiply applied to a whole part, and the Kenney kit bakes **rival details onto one material**. That single fact drives everything below. Three concrete symptoms, all the same root cause:

1. Every cottage wore orange corner quoins, because `wall-block` was 56 of its 76 triangles quoin — on the stucco's material. Florentine stucco housing has plain corners; the bars were Kenney's, not a design choice.
2. A pink house got a brown gable, because `roof-gable` baked its gable *wall* onto the tile material.
3. Roofs were flat-shaded polygons — terracotta coloured, not terracotta textured.

The fix was not to commission art. **The pieces that needed fixing were cubes**, and a flat-colored box has no art in one — it stretches to 8× invisibly, which is what 28 of the 47 `wall-block` refs (crates, slabs, canvases, a nave) were already doing. Commissioning is still the right call for the *curved* pieces (§2).

## What's built

Four pieces are generated in code (`app/game/render/proceduralPieces.ts`) rather than loaded, entering through the `proc:` branch in `getContainer` so material conversion, tinting, desaturation, batching and blend stretch treat them like any kit file:

| piece | replaces | refs |
|---|---|---|
| `proc:block` | `wall-block.glb` (12 tris vs 76 — the quoins were the other 56) | 47 |
| `proc:roof-gable` | `roof-gable.glb`, `roof-gable-end.glb`, `roof-high-gable.glb` — barrel coppi, lapped rows + ridge cap | 13 |
| `proc:gable-end` | *new* — the stucco triangle split out of the roof, tinted `"facade"` | 13 |
| `proc:roof-hip` | `roof-point.glb`, `roof-high-point.glb` — coppi up the fall line, cut at the hips, hip ridges over the cut | 6 |

**No kit roof is left** (only the obelisk's stone cap still uses `roof-point`, and it is not a roof). That makes `TILE_BASE` the whole city's roofline in one constant — the roofs are deliberately browner and less saturated than Kenney's orange tile (hue 19 / saturation 34 vs the kit's 14 / 48), matching Florence rather than the kit. `ROOF_PALETTE` only varies it now: a ~8% cool wash on one roof in three.

**Tile density follows the ref's stretch.** Counts ride in the piece id (`proc:roof-gable@51x7`, built by `procRoofFile`) so a stretched ref renders *more* tiles rather than fatter ones — a coppo is the same size on a cottage and on the cathedral's 3.6×-stretched aisle. Only the part's own scale is compensated; a `stretch: true` building still scales X/Z apart by a few percent. Manifest refs go through the `gableRoof()` / `hipRoof()` helpers, which pick the id and (for gables) pair the roof with its gable end at the same transform.

They carry **vertex colours**, which multiply under the part tint exactly as the atlas texture does for kit pieces. That is load-bearing, not decoration: see kitbashing.md, "Colour: the kit's flat colours are not flat."

Verified by `proceduralPieces.check.ts` (in `npm test`). Its assertions encode the two bugs that shipped *green* under the first cut's bounds-only checks — the stucco average and the tile-brightness ceiling. Don't loosen them without reading why they're there.

---

## Open work

### 1. Procedural panels — the last quoins, and the flicker

**The symptom.** Every panelled corner still shows a salmon bar, and the bars **flicker as the camera moves**. Removing the block's quoins ended the *doubling* but not this: a panel is a full-face slab carrying a quoin at each of *its own* corners, so at a building corner two perpendicular panels each claim the same ~0.1×0.1 wedge and z-fight over it. **Both fighting surfaces are panels** — nothing about the block, the tint, or the texture can reach it.

**Scope.** 77 refs across four files:

| file | refs | notes |
|---|---|---|
| `wall-window-shutters.glb` | 33 | ~30% of its area is quoin |
| `wall-window-round.glb` | 24 | 18 of them are `tint: "mint"` |
| `wall-door.glb` | 14 | 5 are `tint: "mint"` |
| `wall-arch.glb` | 6 | all 6 `mint`; **not actually an arch** — see §2 |

**The entanglement — read this before starting.** `TEXTURE_TINTS.mint` swaps in a recoloured atlas (`scripts/make-mint-quoins.py`) so the terracotta quoin swatch reads verde di Prato green. Those 29 mint refs are *panels*, and they are now the **only** source of a religious building's green trim. Generate the panels without a replacement and the Duomo, chapel and campanile go plain white. So this pass is really two jobs:

- generate the panels (no baked quoins), **and**
- give religious buildings their green back as **real parts** — `TINT_COLORS.verde` (`#58634c`) is already defined and currently **unused** (0 refs); it's the one line of speculative code left from a cathedral-pilaster plan that got dropped. Either it earns its place here or it should be deleted.

Only once both land can `make-mint-quoins.py`, `colormap-mint.png`, `colormap-mint-desat.png` and the `mint` entry go.

**The contract.** Panels are **+X face slabs**: x 0.4→0.5, full z ±0.5, y 0→1, base-center origin, and the manifest offsets them ~0.02 outward from the block they decorate. A generated panel must match that envelope or every `rotationY`-picked face drifts. It must also **carry the kit's stucco AO ramp** (`sample-kit-colour.py --by-height`), because a panel is a full-face slab — the wall behind it is not visible, so a panel that doesn't match the block gives one house two wall colours.

**Risk.** Low-to-medium. The quoin geometry disappears rather than being replaced, and the panel's remaining content (shutters, door, window reveal) is boxy. The green-trim half is the real design question.

### 2. Commission the curved pieces

This is where an artist actually earns the fee: curved and proportion-critical, no amount of box-stretching gets there.

- `wall-arch.glb` is a **flat pier strip** (x 0.4→0.5, **z 0.2→0.5 only**) — not an arch. The kit has no arch and no dome.
- The cathedral dome is a **renamed copy of `tree_default.glb`** — a tree canopy as the cupola (see kitbashing.md's dome recipe).
- Also wanted: `arcade-bay`, `wall-window-bifora` (housing tiers 3–5 want bifora windows; see the design doc's facade language).

**The contract** (verified by parsing the GLBs — hand these numbers to the artist):

| rule | value |
|---|---|
| format | binary `.glb`, glTF 2.0, **plus the `.blend` source** |
| scale | **1 unit = 1 cell.** A full block is exactly 1×1×1 |
| origin | **base-center**: `min.y = 0` exactly, x/z centered on 0 |
| up axis | Y-up. **Bake geometry into place** — the loader overwrites root transforms |
| materials | **2–4 flat-colour materials, named exactly** (`stone`, `trim`, `tile`, `wood`). No texture, no UV unwrap — colours are overridden in code |
| panels | +X face slab only: x 0.4→0.5, full z ±0.5, y 0→1 |
| detail | match `wall-block.glb` for chunk and tri budget. No bevels, no PBR maps (discarded at load) |

**Trap:** `convertMaterials` force-swaps the shared colormap into *any* textured material. An artist's own texture is silently discarded. Flat named materials only.

**The one move that matters: milestone it.** Pay for **one test piece first** — the arch exercises every rule. Verify it in-engine, then commission the rest. Ask for full commercial rights / work-for-hire; Fiverr's default licence is often limited. The filter question for a candidate is whether they engage with the envelope numbers at all.

---

## How to check your work

**Measure the kit before replacing it.** `scripts/sample-kit-colour.py` parses the GLB and samples `colormap.png` at each triangle's UV centroid, **area-weighted** — triangle *count* lies, because a quoin is many small triangles and a wall is two big ones.

```bash
# the baked AO ramp a generated piece must rebuild as vertex colours
python3 scripts/sample-kit-colour.py wall-block.glb --family stucco --by-height
#   ramp: #c6bba4 -> #f3e5c9   per-channel ratio 0.815, 0.817, 0.816
#   AREA-WEIGHTED AVERAGE  #dcd0b7      <- what proc:block must average

# what a roof may not be brighter than
python3 scripts/sample-kit-colour.py roof-gable.glb --family tile
```

These are the numbers hard-coded in `proceduralPieces.check.ts`; the script re-derives them independently, so if a constant there ever looks wrong, this settles it.

**Then look at it.** The checks are necessary and not sufficient — every colour bug in this work shipped with green tests:

```bash
npm run dev -- --port 5199
node ff.mjs shot.png "6,10,11"      # see .claude/skills/verify; &cam=x,z[,radius]
```

Use **headless Firefox**, not Chromium: Chromium falls back to SwiftShader and renders washed-out garbage that will lie to you about exactly the thing you're measuring. Firefox reports the real GPU.

Worth checking explicitly, because each has burned us once:
- a **tinted** (pink/sand) house — a gable/wall mismatch is invisible on cream
- a **sunlit** slope — the scene lights a facing surface at ~1.9×, and clipping only shows there
- a **row** of blended houses — blend stretch scales structural parts from their own bounds
- an **inactive** building — `proc:` pieces take the `desaturate()` path, not the `-desat.png` swap

## Things that look like good ideas and are not

- **Per-material `Part.tint`** (a record instead of a string). Looks like ~10 lines. It isn't: `buildHosts` parses the tint back out of the mesh key and applies it to every mesh of the file, so it means reworking the host builder. A detail that must move independently of its wall should be its own **part** (that's why `proc:gable-end` exists).
- **A `MATERIAL_TINTS` entry for a `proc:` piece.** They author their own colours — an entry there silently overrides the piece and splits the colour across two files.
- **Blaming mipmaps** for colour drift with camera distance. The unpadded 32px atlas bands look like a textbook bleed, but every kit UV is a point sample, so the derivative is ~0, the GPU always picks mip 0, and mipmaps never engage. Disabling them changes nothing (measured). The drift is fog (`#e9c98f`).
- **Textures + a `MATERIAL_TEXTURES` map.** 39 parts stretch ≥2×; the correct fix is triplanar, which costs a NodeMaterial and loses fog + the colour grade from `StandardMaterial`.
- **`quoin.glb` / `pilaster.glb` / `parapet-merlon.glb`.** Quoins we don't want; a pilaster is `proc:block` scaled to `[0.08, 1, 0.06]`; merlons wait for the Town Hall to exist.
