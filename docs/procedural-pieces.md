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

### 1. Migrate the remaining panels to loose fittings

**The plan changed under this section** — it used to call for *generating* full-face panels. The residences now do something better (`3829170`): the kit's door and shutter **leaves**, extracted as standalone models (`scripts/make-plain-openings.py` → `door.glb`, `shutters.glb`), sit directly on plain `proc:block` stucco (`windowOn()` in `modelManifest.ts`), with a proud dark plate standing in for the window opening. A fitting carries no wall of its own, so the old panel contract dissolves — no AO-ramp matching, no two-wall-colours risk, no full-face envelope. What's left:

- **Commission the real surrounds** (batch 1 in §2) — the openings the dark plate fakes. The `ponytail:` comment in `windowOn()` marks the swap site.
- **Migrate the remaining full-face panel refs** to the same fitting pattern once the surrounds exist — 68 refs across `wall-window-shutters.glb` (26), `wall-window-round.glb` (24), `wall-door.glb` (12), `wall-arch.glb` (6, taken by batch 1's arch bay), spread over the cathedral, palazzo, chapel, tavern, plazas, bakery and workshops. The extracted leaves (`door.glb`, `shutters.glb`) are a stopgap too — the kit door never quite read as a door, so batch 1 replaces them outright.
- **Verde trim becomes trivial**: a surround is one part, so a religious building's green is just `Part.tint: "verde"` on the whole surround — `TINT_COLORS.verde` (`#58634c`, currently 0 refs) finally earns its place instead of being deleted. No per-material tint machinery needed.

Only after the migration can `make-mint-quoins.py`, `colormap-mint.png`, `colormap-mint-desat.png`, the `mint` entry and the four panel files go — and with them the last corner-quoin z-fight flicker (both fighting surfaces are panels; retiring the panels retires the fight).

### 2. The commission

This is where an artist actually earns the fee: curved, tracery, organic — no amount of box-stretching gets there. **The send-ready request script is [artist-brief.md](artist-brief.md)**; it carries the piece specs and the full technical contract (fitting envelope, named flat materials, the no-textures rule) — keep it the single source of those numbers. Leaf/panel dimensions there are verified by parsing the GLBs (door leaf 0.4×0.75×0.05 at 196 tris, shutter pair 0.30×0.40 at 112, the kit window panel 278).

| batch | pieces | unblocks |
|---|---|---|
| **1 — test batch** (brief ready) | rectangular window (optional louvered shutter leaf, its own file), arched window (voussoir head), door — frame + wooden leaf as **two files** so they tint independently, tileable arch bay (`wall-arch.glb` is a flat pier strip — x 0.4→0.5, z 0.2→0.5 — not an arch; the kit has none) | the fitting migration in §1; religious verde trim; loggia/colonnade |
| **2** | bifora window, rose window | housing tiers 3–5 facade language, the cathedral front |
| **3** | dome + drum + lantern (the kit has no dome; kitbashing.md's tree-canopy recipe is proven but unused — the cathedral has none), vine/ivy set (wall ivy + vine-on-post; vineyard rows currently stretch tree canopies) | the skyline icon; organic decoration |

**Trap** (also stated in the brief): `convertMaterials` force-swaps the shared colormap into *any* textured material. An artist's own texture is silently discarded. Flat named materials only.

**The one move that matters: milestone it.** Pay for batch 1 alone — the arched window and arch bay are the curve test, the rectangular pieces test the envelope discipline — verify in-engine, then commission the rest. Ask for full commercial rights / work-for-hire; Fiverr's default licence is often limited. The filter question for a candidate is whether they engage with the envelope numbers at all.

**Deliberately not commissioned:**

- **Statues** — deferred for now (Phase 9's `createStatueMesh` placeholder stands); the strongest future candidate when display art gets its pass — figural work is the one category no box or lathe gets near.
- **Paintings** — never: the canvases are per-artwork procedural content (`displayArt.ts` DynamicTextures); fixed models would be a downgrade.
- **Boats** (G5 stretch, no gameplay pull yet), **waterwheel** (River & Waterfront set is future scope, and it's borderline procedural anyway — a 16-gon plus paddle boxes), **merlons** (boxy → procedural when the Town Hall lands).

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
- **Textures + a `MATERIAL_TEXTURES` map.** 39 parts stretch ≥2×; the correct fix is triplanar, which costs a NodeMaterial and loses fog + the colour grade from `StandardMaterial`. *(The residences' sandstone facades — `render/wallTexture.ts`, July 2026 — don't contradict this: the texture rides the residential **tint ids** in `getTintedPair`, not the material or piece, so only cottage/townhouse walls at ~1× scale ever see it; the stretched crate/slab/nave refs carry other tints or none.)*
- **`quoin.glb` / `pilaster.glb` / `parapet-merlon.glb`.** Quoins we don't want; a pilaster is `proc:block` scaled to `[0.08, 1, 0.06]`; merlons wait for the Town Hall to exist.
