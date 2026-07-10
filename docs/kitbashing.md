# Kitbashing Notes

Field notes from building the prefabs in `app/game/render/assetLibrary.ts` (`MODEL_MANIFEST`). Source kits: Kenney Fantasy Town Kit + Nature Kit (CC0), GLBs in `public/models/`. Retint via `scripts/retint-colormap.py`.

## Piece geometry conventions (Fantasy Town Kit)

- `wall-block` is a full 1×1×1 cube.
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

- `plant_bush*` models look like **perched birds** at hill distance (splayed fronds). Environment scatter uses small sunken tree canopies (`scale ~0.5, sinkY 0.4`) as shrubs instead; plant models are placeable-only.
- `wall-half.glb` has a painted red band — reads as a barrier bar, not a stone wall. Low walls are kitbashed from `wall-block` scaled to a slab (`[2, 0.28, 0.14]`); heavily squashed blocks show the texture's terracotta corner quoins on narrow posts, which happens to read as trim.
- Thin flat pieces (`crops_dirtRow`) sunk even 0.15 below the analytic `hillHeight` vanish under the faceted terrain — place flat ground pieces at drop 0 and pre-filter for low slope.

## Materials & tinting

- Town GLBs reference `Textures/colormap.png` externally; the whole Mediterranean palette is one retinted PNG. Hue bands matter: kit roofs are *teal* (hue 158–190), foliage green is 130–158 — split exactly there or roofs turn olive.
- Nature Kit pieces are untextured flat PBR colors with **per-file material names**: trees `leafsGreen`/`woodBark` (pines: `leafsDark`/`woodBarkDark`), rocks `dirt` (body) + `grass` (moss) + sometimes `_defaultMat`, fences `wood`/`woodDark`, bushes a single `grass`. Tints keyed in `MATERIAL_TINTS`.
- glTF loads PBRMaterial, which renders near-black without IBL — assetLibrary converts everything to StandardMaterial. Use a fresh gamma-space `Texture(url, scene, false, false)` (the loader's own albedo textures are sRGB buffers → too dark on StandardMaterial) and set `twoSidedLighting = true` (Kenney meshes are double-sided; the visible side is often the backface).
- Inactive desaturation = a second material set from a pre-generated `colormap-desat.png` (flat-color nature materials gray-lerp instead).

## Design rules

- **No flat roofs** — every roof is pitched, even shallow. Flat kit pieces only as non-roof slabs (e.g. colonnade architrave).
- Placed-building variety is `hashPosition(x, y)`-keyed, deliberately not run-seeded — a building at a cell always looks the same regardless of placement order. Keep that.

## Kit sources

Kenney packs re-download from kenney.nl (zip URL embedded in the asset page HTML behind the donate dialog). Only a subset of the Nature Kit is in `public/models/nature/`; the full kit (July 2026 zip: kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip) also has fences, crops, bushes, flowers, and 4 `pineTall` variants — useful for future garden/farm decor.
