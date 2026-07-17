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

Nine pieces are generated in code (`app/game/render/proceduralPieces.ts`) rather than loaded, entering through the `proc:` branch in `getContainer` so material conversion, tinting, desaturation, batching and blend stretch treat them like any kit file:

| piece | replaces | refs |
|---|---|---|
| `proc:block` | `wall-block.glb` (12 tris vs 76 — the quoins were the other 56) | 47 |
| `proc:roof-gable` | `roof-gable.glb`, `roof-gable-end.glb`, `roof-high-gable.glb` — barrel coppi, lapped rows + ridge cap | 13 |
| `proc:gable-end` | *new* — the stucco triangle split out of the roof, tinted `"facade"` | 13 |
| `proc:roof-hip` | `roof-point.glb`, `roof-high-point.glb` — coppi up the fall line, cut at the hips, hip ridges over the cut | 6 |

**Batch-1 fittings** (July 2026): the artist-brief pieces, generated instead of commissioned — the curve test turned out to be passable in code: an arched head reads as voussoirs at 6 flat facets (alternating vertex shades are the joints), an arcade bay at 8. Boxes + hexahedron "wedge" fans, one named flat material per piece (`stone` = pietra serena grey #b3ada1, `wood`), so `Part.tint` recolors a whole fitting — verde trim works exactly as §1 predicted (`tint: "verde"` on the cathedral's arcade bays, `TINT_COLORS.verde`'s first refs). The dark interior stays the manifest's separate reveal part so a tinted surround never greens it; `TINT_COLORS.reveal` was darkened to `#453d33` because at the old value a shutterless window's reveal blew out to pale tan under the ~1.9× sun and read as an empty niche.

| piece | what | used by |
|---|---|---|
| `proc:surround-rect` | stone frame + projecting sill around the 0.18×0.40 opening | every house window (`windowOn`), around the reveal + louvre leaf |
| `proc:surround-arch` | same jambs/sill, 6-facet voussoir ring head | palazzo piano nobile ×9 (`archWindow` — surround + reveal, no shutters) |
| `proc:door-frame` | jambs + eared lintel + threshold, 0.4×0.75 opening | house fronts (`houseFront`) |
| `proc:door-leaf` | planked wood leaf + 2 rails, 0.39×0.74 (clearance gap), its own file so it tints apart from the frame | house fronts, recessed in the frame |
| `proc:arch-bay` | 1×1 arcade bay: half-pier each end, imposts, 8-facet fan running to the bay's own rim (solid spandrels, corners exact) so rows tile seamlessly | palazzo loggia ×5, colonnade (one per cell); the cathedral's verde blind arcade used it too until the marble pass swapped it for window rows (`wall-arch.glb`: **0 refs**) |

**No kit roof is left** (only the obelisk's stone cap still uses `roof-point`, and it is not a roof). That makes `TILE_BASE` the whole city's roofline in one constant — the roofs are deliberately browner and less saturated than Kenney's orange tile (hue 19 / saturation 34 vs the kit's 14 / 48), matching Florence rather than the kit. `ROOF_PALETTE` only varies it now: a ~8% cool wash on one roof in three.

**Tile density follows the ref's stretch.** Counts ride in the piece id (`proc:roof-gable@51x7`, built by `procRoofFile`) so a stretched ref renders *more* tiles rather than fatter ones — a coppo is the same size on a cottage and on the cathedral's 3.6×-stretched aisle. Only the part's own scale is compensated; a `stretch: true` building still scales X/Z apart by a few percent. Manifest refs go through the `gableRoof()` / `hipRoof()` helpers, which pick the id and (for gables) pair the roof with its gable end at the same transform.

They carry **vertex colours**, which multiply under the part tint exactly as the atlas texture does for kit pieces. That is load-bearing, not decoration: see kitbashing.md, "Colour: the kit's flat colours are not flat."

Verified by `proceduralPieces.check.ts` (in `npm test`). Its assertions encode the two bugs that shipped *green* under the first cut's bounds-only checks — the stucco average and the tile-brightness ceiling. Don't loosen them without reading why they're there.

---

## Open work

### 1. Migrate the remaining panels to loose fittings

**The surrounds now exist** (July 2026 — generated, see the batch-1 table above), so this migration is unblocked and partially done: every house window carries a real `proc:surround-rect` (frame + reveal + louvre leaf), house doors are `proc:door-frame` + `proc:door-leaf` (the extracted `door.glb` leaf is unreferenced), the palazzo's nine shuttered panels became `archWindow()` arched surrounds, and `proc:arch-bay` retired `wall-arch.glb` (0 refs — it arcades the palazzo loggia and colonnade; the cathedral's blind arcade version gave way to window rows in the marble pass). What's left:

- **Migrate the remaining full-face panel refs** to the same fitting pattern — 36 refs (was 53 before the marble pass took the cathedral and bell tower panel-free, July 2026): `wall-window-shutters.glb` (17), `wall-window-round.glb` (11 — needs a round/oculus surround piece or the arch surround), `wall-door.glb` (8), spread over the chapel, tavern, plazas, bakery, market stall and workshops.
- Only after that migration can `make-mint-quoins.py`, `colormap-mint.png`, `colormap-mint-desat.png`, the `mint` entry and the remaining panel files go — and with them the last corner-quoin z-fight flicker (both fighting surfaces are panels; retiring the panels retires the fight).
- The palazzo's top floor still wears the kit's salmon-framed `wall-window-round` panels directly above the new white stone arches — the mixed language is visible and is the natural next migration target.
- **A grander door for landmark buildings** (July 2026, from the bell tower rebuild): the campanile reuses the house-scale `proc:door-frame`/`proc:door-leaf`, which reads modest on a five-storey marble tower. Wants a taller arched portal fitting in the same loose-fitting pattern — voussoir arch over the frame (the `surround-arch` wedge fan at door scale) + a double planked leaf — shared by the bell tower, the cathedral portals when they migrate, and the future Town Hall.

### 2. The commission

**Batch 1 is done in code** — see the fittings table in "What's built". The curve test the brief was designed around (arched head, arcade bay) turned out passable with 6–8 flat facets, which at this art style's play distance reads as intentional low-poly voussoirs. [artist-brief.md](artist-brief.md) stays as the spec that piece dimensions trace back to, and as the template if a later quality pass wants hand-modeled replacements — the generated pieces fill the same envelopes, so swaps are drop-in.

What still genuinely needs an artist — curved tracery and organic forms no box or wedge fan gets near:

| batch | pieces | unblocks |
|---|---|---|
| **2** | bifora window, rose window | housing tiers 3–5 facade language, the cathedral front |
| **3** | dome + drum + lantern (the kit has no dome; kitbashing.md's tree-canopy recipe is proven but unused — the cathedral has none), vine/ivy set (wall ivy + vine-on-post; vineyard rows currently stretch tree canopies) | the skyline icon; organic decoration |

**Trap** (also stated in the brief): `convertMaterials` force-swaps the shared colormap into *any* textured material. An artist's own texture is silently discarded. Flat named materials only.

**Milestone it**: pay per batch, verify in-engine, ask for full commercial rights / work-for-hire (Fiverr's default licence is often limited). The filter question for a candidate is whether they engage with the envelope numbers at all.

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
