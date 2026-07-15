# Kitbashing Notes

Field notes from building the prefabs in `app/game/render/modelManifest.ts` (`MODEL_MANIFEST`). Source kits: Kenney Fantasy Town Kit + Nature Kit (CC0), GLBs in `public/models/`, plus generated pieces (below). Retint via `scripts/retint-colormap.py`.

## Generated pieces (`proc:`) — July 2026

Three pieces are built in code (`render/proceduralPieces.ts`) instead of loaded: **`proc:block`**, **`proc:roof-gable`**, **`proc:gable-end`**. They enter through the ordinary file path — `getContainer` branches on the `proc:` prefix and everything downstream (material conversion, `MATERIAL_TINTS`, tints, desaturation, batching, blend stretch) treats them as untextured Nature-Kit-style files. Each fills the envelope of the kit piece it replaces, because the manifest's positions and `fit` values are tuned to those bounds — exactly for the block, and *core*-only for the roof, whose tiles stand proud of it (`ROOF_TILE_BULGE`). `proceduralPieces.check.ts` enforces both.

**For what's still open** — the panels' surviving quoins, the flat roof family, the pieces worth commissioning — see [procedural-pieces.md](procedural-pieces.md). This section is the field notes; that one is the plan.

Why they exist — **a tint multiplies a whole part at once, and the kit bakes rival details onto one material**:

- `wall-block` was **56 of its 76 triangles corner quoin**, on the same material as the stucco. Quoins could never move independently of the facade — and Florence's stucco housing has plain corners anyway; the bars were Kenney's, not a design choice. `proc:block` is a plain 12-triangle cube.
- `roof-gable` carried **a gable wall (12 tris) and stray stone (~16 tris) on the tile material**, so a pink house got a brown gable and no tint could separate them. Split into `proc:roof-gable` (tile only, open-ended) + `proc:gable-end` (the stucco triangle, tinted `"facade"`).
- A flat-colored box is a box — no art in one, and it stretches to 8× invisibly, which is what 28 of the 47 `wall-block` refs (crates, slabs, canvases, a nave) were doing.

### Colour: the kit's flat colours are not flat

The single hardest-won lesson. **Sampling one pixel of a kit swatch and calling it the piece's colour is wrong**, and it looks wrong in a way no bounds check catches:

- The colormap is **16 unpadded 32px vertical gradient bands**, and every kit UV is a *point* sample into one. A wall's shading is the atlas gradient interpolated between two UV points — Kenney bakes an **ambient-occlusion ramp** into the stucco, `#c6bba4` at the footing to `#f3e4c9` at the eave (a flat ~0.82 ratio across channels; area-weighted average `#dcd0b6`). The first cut of `proc:block` replaced that whole ramp with a single value near its *brightest* band, so every wall in the city rendered at peak and read as glowing. Rebuilt as **vertex colors**, which multiply under `Part.tint` exactly as the texture does.
- **`proc:block` must match the kit's stucco average, not merely look nice** — the door/window panels are still Kenney-textured and carry that same ramp, so a block darker than the kit gives a house one colour on plain faces and another on panelled ones.
- The scene lights a sun-facing face at **~1.9×** (hemi 0.85 + directional 1.1), so anything appreciably brighter than the kit's own swatch **clips**. A roof base picked by eye at `#cf7a52` blew out red and rendered *pale sand* on every sunlit slope. `TILE_BASE` is therefore the kit's palest tile (`#c36e54`) and `TILE_SHADES` only ever darkens.
- Per-tile variation is bounded by the kit's own tile spread (`#a9583f`..`#c36e54`, ratio ~0.8). Wider reads as a patchwork, not a roof.
- Because these pieces author their own colours, they get **no `MATERIAL_TINTS` entry** — an entry there would silently override the piece and split the colour across two files.

Mipmaps are a red herring here: those unpadded bands look like a textbook bleed, but the UVs are point samples, so the derivative is ~0, the GPU always picks mip 0, and mipmaps never engage. Colour drift with camera distance is **fog** (`#e9c98f`), working as intended.

Gotchas found the hard way:

- **Flat-shade everything** (`convertToFlatShadedMesh`, done once in `buildProceduralContainer`). Profile extrusions share vertices, so `ComputeNormals` averages them into a smooth gradient and the piece reads as a washed-out blob beside the flat-shaded kit.
- `MergeMeshes` needs every source to declare the **same vertex attributes** — hand-built `VertexData` must carry dummy `uvs` *and* `colors` arrays or it can't merge with `MeshBuilder` primitives.
- **The roof is not normalized into its envelope.** Its *core* fills `ROOF_ENVELOPE` and the barrels stand proud of it (`ROOF_TILE_BULGE`) — correct for real coppi, and every roof ref squashes Y anyway. Fitting the whole assembly back into the envelope instead (the first cut) squashes the core out from under the gable end and z-fights it, and forces the gable to chase a *measured* post-fit core.
- **`proc:gable-end` is deliberately not `structural`, even on the blending row houses.** `stretchPartToTargets` scales each structural part from *its own* bounds to the shared edge, and the gable is necessarily smaller than the roof hiding it — any triangle strictly inside the roof's cross-section has a smaller bbox, so there is no geometry that makes the two stretch alike. It stretched further than the roof and walked out through the tiles. It doesn't need to stretch: only the neighbour-facing side does, and that gable is buried in the neighbour.

**Still flat:** only `roof-gable` was replaced. `roof-gable-end` (workshops, tavern), `roof-high-gable` (cathedral nave, chapel), `roof-point` (palazzo, all three suppliers, obelisk) and `roof-high-point` (bell tower) are still the untiled kit pieces — so houses have tile courses and everything else does not. The cathedral shows it worst: tiled aisle roofs directly under a flat nave roof. Deliberate scope, not an oversight.

## Piece geometry conventions (Fantasy Town Kit)

- `wall-block` is a full 1×1×1 cube (still used by nothing in the manifest — see `proc:block`; the file stays for the kit's sake).
- `wall-arch`, `wall-door`, `wall-window-*`, `banner-*` are **thin panels on the +X face** of a unit cell (x ≈ 0.4→0.5). Pick the face with `rotationY` 0 / π / ±π/2.
- Panel cells must be offset **~0.02 outward** from the block they decorate, or the panel is exactly coplanar with the block face and z-fights.
- All gable roofs (`roof-gable`, `roof-high-gable`) have their **ridge along X**.
- Per-axis scaling of blocks and roofs (e.g. `[4,1,1]` for a nave) is safe — the colormap UVs land on flat color patches, so there's no visible texture stretch.
- `wall-arch` is a flat pier strip (z 0.2–0.5 only), **not** an actual arch. The kit has no dome or curved-arch piece.

## Verifying geometry cheaply

Don't trial-and-error with screenshots. Parse the GLB accessor min/max (and raw vertex positions for things like ridge axis) with a few lines of node — tells you a piece's bounds, which face a panel sits on, where a ridge runs.

## Dome recipe (proven, screenshot-verified; currently unused)

- **Drum**: 4× `wall-rounded` (quarter-cylinder arc, r ≈ 0.47) at the same position, rotY 0 / ±π/2 / π.
- **Dome**: a *renamed copy* of nature `tree_default.glb` (single blob canopy: leafs y 0.8–1.71, widest r = 0.38 at y = 1.0). A copy is needed because `MATERIAL_TINTS` is per-file — tint the copy's leafs terracotta `#c0603f` without recoloring scattered trees. Avoid `tree_fat` — its side lobes poke through the drum.
- **Sizing**: scale so the widest band radius ≈ drum r, and position so the widest band sits at the drum rim. For a drum at y=D spanning 1 unit: `scale: 1.3, y: D + 1 - 1.3`. The widest band (local y = 1.0·scale) must land at the rim or the dome bulges through the drum wall mid-height.
- Town `tree.glb` canopy is a cone — not usable as a dome.

## Pieces that don't read as what they are

- `roof-window.glb` is a mono-pitch half-roof segment (ridge along Z at x=+0.5, dormer box on the −X slope). Floated over a gable slope as a dormer overlay it shows its open top edge/underside over the ridge from behind — unusable. Kitbash dormers as a mini `wall-block` + cross-ridge mini `roof-gable` buried into the slope instead (see the painter workshop).
- `plant_bush*` models look like **perched birds** at hill distance (splayed fronds). Environment scatter uses small sunken tree canopies (`scale ~0.5, sinkY 0.4`) as shrubs instead; plant models are placeable-only.
- `wall-half.glb` has a painted red band — reads as a barrier bar, not a stone wall. Low walls are kitbashed from `wall-block` scaled to a slab (`[2, 0.28, 0.14]`); heavily squashed blocks show the texture's terracotta corner quoins on narrow posts, which happens to read as trim.
- Thin flat pieces (`crops_dirtRow`) sunk even 0.15 below the analytic `hillHeight` vanish under the faceted terrain — place flat ground pieces at drop 0 and pre-filter for low slope.

## Materials & tinting

- Town GLBs reference `Textures/colormap.png` externally; the whole Mediterranean palette is one retinted PNG. Hue bands matter: kit roofs are *teal* (hue 158–190), foliage green is 130–158 — split exactly there or roofs turn olive.
- Nature Kit pieces are untextured flat PBR colors with **per-file material names**: trees `leafsGreen`/`woodBark` (pines: `leafsDark`/`woodBarkDark`), rocks `dirt` (body) + `grass` (moss) + sometimes `_defaultMat`, fences `wood`/`woodDark`, bushes a single `grass`. Tints keyed in `MATERIAL_TINTS`.
- glTF loads PBRMaterial, which renders near-black without IBL — assetLibrary converts everything to StandardMaterial. Use a fresh gamma-space `Texture(url, scene, false, false)` (the loader's own albedo textures are sRGB buffers → too dark on StandardMaterial) and set `twoSidedLighting = true` (Kenney meshes are double-sided; the visible side is often the backface).
- Inactive desaturation = a second material set from a pre-generated `colormap-desat.png` (flat-color nature materials gray-lerp instead).
- Per-building tints: `Part.tint` ("facade"/"roof" resolve from category palettes by position hash; other strings index `TINT_COLORS` directly, e.g. religious "mint"). The tint is a diffuse multiply on a cloned material pair and joins the batch mesh key. **One tint per part, applied to every material it has** — a detail that must move independently of its wall needs to be its own *part* (see `proc:gable-end`), not its own material. Don't reach for a per-material tint record: `buildHosts` parses the tint back out of the mesh key and applies it to every mesh of the file, so per-material tinting means reworking the host builder too.
- Accents baked into the atlas that a whole-material multiply can't isolate (the terracotta quoin swatch → religious mint) use a colormap **texture variant** instead (`TEXTURE_TINTS`, `scripts/make-mint-quoins.py`). Still load-bearing after `proc:block` dropped its quoins: the kit's door/window/arch panels are *still* atlas-textured, and they're where a religious building's green trim now comes from. Delete `mint` and the Duomo goes plain white.
- **Door/window/arch pieces are full-face panels** — a face with a window shows the panel, not the wall behind, so panels must carry the same tint as their wall or one building shows two wall colors. They also still carry the atlas's **baked quoins**, so a house keeps one salmon bar per panelled corner even though `proc:block` has none. (The old *doubled* bar — panel quoin 0.02 proud of block quoin — is gone.)
- **The surviving corner bars flicker**, and the panels are why: a panel is a full-face slab carrying a quoin at *each* of its own corners, so at a building corner two perpendicular panels each claim the same ~0.1×0.1 wedge of space and z-fight over it. Removing the block's quoins ended the doubling but not this — the two fighting surfaces are both panels. The fix is making the panels procedural (which also finally retires `make-mint-quoins.py`); nothing about the block or the tint can reach it.

## Design rules

- **No flat roofs** — every roof is pitched, even shallow. Flat kit pieces only as non-roof slabs (e.g. colonnade architrave).
- Placed-building variety is `hashPosition(x, y)`-keyed, deliberately not run-seeded — a building at a cell always looks the same regardless of placement order. Keep that.

## Kit sources

Kenney packs re-download from kenney.nl (zip URL embedded in the asset page HTML behind the donate dialog). Only a subset of the Nature Kit is in `public/models/nature/`; the full kit (July 2026 zip: kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip) also has fences, crops, bushes, flowers, and 4 `pineTall` variants — useful for future garden/farm decor.
