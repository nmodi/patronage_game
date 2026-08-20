# Organic Touches — Render-Only Ideas

*Supplemental doc to [design-doc.md](design-doc.md) (the main spec) — a pool of visual ideas that follow the freeform-plazas pattern. August 2026. None built.*

---

## The pattern

Freeform plazas work because the city **recognizes** something the player already made. No new resource, no management, no sim state: a detector reads tiles, and the world signifies what it found (paving upgrades to finished slab, bare ground gets packed earth, walkers dwell there). The player's authorship is untouched — they built the buildings, the city just noticed the shape.

Everything below applies that template to visuals. Each idea is **render-only**: it reads existing derived data, changes what you see, and touches no sim system. That makes them independently shippable, cheap to abandon, and free of the usual traps (no save migration, no rng-draw-order risk, no principle-6 monotonicity argument — nothing's output changes).

## Rules these follow

Same contracts the shipped systems already honor, so an idea from this list can't quietly break one:

- **Derived from tiles + mapSeed only.** No occupancy, no clocks, no walker positions. The look moves when the player builds or razes, never on its own.
- **Deterministic per cell.** Seed variation off `mapSeed` + cell coordinates so the same city always renders the same, and so a rebuild never reshuffles the neighborhood.
- **Sim → render, never back.** Same one-way contract the decorative walkers hold. These read the gathering field; nothing reads them.
- **Ground heights come from `render/groundLevel.ts`'s registered sampler**, never from re-deriving the elevation field (trap rule).
- **The city never builds.** These recognize ground and dress buildings — none of them place a building the player didn't. See "Ruled out" below.

---

## The ideas

Grouped by what they make the city feel like. Each entry: what the player sees → what it derives from → what already exists to reuse.

### Time — the city looks its age

**1. Weathering and patina.** Old buildings pick up moss on shaded walls, staining below rooflines, vine creep on housing that faces open ground; new construction is clean stone. → `Tile.builtTick` (already on every tile, already persisted — no migration) against the current tick, bucketed into 2–3 age tiers. → Wall texture work has precedent in `render/wallTexture.ts`; a per-building age tint or decal layer rides the existing render entry. *The city gains a temporal layer it currently has none of, and not razing becomes visible.*

**2. Roofline variation from density.** In a packed housing cluster, roofs grow dormers, chimney pots, drying racks, a rooftop terrace; isolated cottages stay clean-roofed. → Neighbor count within 1–2 cells, seeded per cell. → Kitbash roof pieces and the ridge-along-X convention are documented in `render/CLAUDE.md`. *This is what makes an old town read as layered rather than tiled.*

**3. Streets that mature.** A road hemmed by buildings renders as finished setts; the same road with farmland around it stays a dirt lane. → Adjacent tile count per road cell, monotonic (more buildings never demotes a street). → `render/dirtPathOverlay.ts` already rasterizes neighbor-aware dirt in 20-cell chunks with per-chunk redraw; this is a third state in that pipeline. *Street-level twin of the plaza slab upgrade.*

### Enclosure — the spaces between buildings

**4. Garden courtyards.** A single bare cell fully ringed by housing renders as a private garden: potted citrus, a well, terracotta pots. → Pure adjacency: bare buildable ground, all neighbors residential. → The exact inverse of the plaza detector — too small and too enclosed to be public, so it reads domestic. Note `gathering.ts` already rejects these as plazas (a fully walled court is a private yard); this dresses what that rule turns away. *Makes tight housing blocks feel Mediterranean instead of cramped.*

**5. Street furniture drift.** Benches, bollards, a well, a shrine niche accumulate on road cells where buildings face each other across a narrow street — the tighter the gap, the more furniture. → Facing-wall adjacency, seeded per cell. → Thin-instance placement via `render/thinInstanceHost.ts`. *Fills the gap between "road" and "plaza": the ordinary street with character because it's enclosed.*

**6. Facade life.** Laundry lines strung between housing walls across a 1–2 cell gap; flower boxes, awnings, and open shutters on housing that edges a formed plaza or a gathering-hot street. → Tile adjacency + the gathering field. → Same thin-instance host; glazed casements already exist to hang shutters off. *Cheapest lived-in lever on the list.*

### Movement — where people already go

**7. Worn paths / desire lines.** Bare ground on the line between two hot areas renders as packed dirt — the ghost of where people cut through before the player paves it. → Gathering field + the existing 0-1 connectivity BFS; no new pathfinding, just cells that sit between hot sources. → `render/dirtPathOverlay.ts` does exactly this rasterization today, fed by player-placed dirt roads (`dirtCells` in `mapRenderer.ts`); this feeds it a second, derived set. *Inverse of organic plazas: not "people would linger" but "people already cut through" — and a free hint for the next road.*

**8. Market day on stalls.** A stall on hot ground has its awning unfurled and goods out; one on a quiet lane sits shuttered with crates stacked. → Gathering field value at the stall's cell. → Static-prop version of the walker dwell-time weighting that already ships.

**9. Ambient life scaled by the field.** Birds flushing off a hot piazza, cats on quiet lanes, a handcart parked on a busy street. → Gathering field. → Decorative-walker tier; `render/citizens.ts` holds the precedent and the cosmetic-only contract.

### Atmosphere — the city from a distance

**10. Light spill at dusk.** Windows on buildings beside plazas and hot ground glow warm; quiet streets stay dark-windowed. → Gathering field driving an emissive swap. → *Probably the most atmospheric single touch here — it makes the gathering field visible at night without opening an overlay.* Wants a day/night or golden-hour tint to hang on, which doesn't exist yet.

**11. Chimney smoke over housing.** A lone cottage gets one thin wisp; a dense block hazes above the roofline. → Housing cluster size. → `render/smoke.ts` (`createSmokePlume`) already ships, but is deliberately exclusive to production buildings — artist workshops and the bakery (`mapRenderer.ts`). Extending it to housing is a scope decision about what a chimney signifies, not new tech. *The aerial "this neighborhood is alive" signal, the top-down twin of street-level crowds.*

**12. Shadows of the skyline.** Tall buildings (cathedral, church, civic towers) darken the ground and low roofs beside them at a fixed sun angle — a baked directional projection of known tall footprints, not a shadow map. → Tall-building footprints, recomputed on build/raze like the gathering field. → `render/cloudShadows.ts` is precisely this plumbing already: a material plugin multiplying every `StandardMaterial`'s lit color by a texture sampled in world XZ, riding thin instances for free. A second static texture in that shader is a small change. *Makes the cathedral loom, and rewards putting civic buildings where they'd really go.*

### Edges — where the city meets the world

**13. Tree canopy on quiet edges.** Where the city thins out, plane trees and cypresses line the road; as the player builds outward the trees recede, so the frontier always looks gentle. → Low gathering field + few neighbors. → Assets and placement both exist: `render/environmentScatter.ts` already scatters olives, cypresses, rocks, and fences — but only in a ring *outside* the buildable grid, once at load, with an `avoid` predicate for water. This is that scatter brought inside the grid and made reactive. *An old screenshot then shows where the edge used to be.*

**14. Water life.** River and canal cells beside dense building get moored fishing boats, laundry platforms, a small dock; cells far from buildings stay wild — reeds, a heron. → Building adjacency to water cells, the same measure the gathering field already takes. → Extends the roadmap's "boats" graphics leftover from decorative scatter into something that answers the city's shape.

### Identity — the city names itself

**15. Emergent quarters.** Where three or more same-category buildings cluster, the city recognizes a quarter — "the wool district," "the artisans' quarter." Recognition is the opposite of the zoning that got cut: the player never draws or manages anything, the city notices what they already did. → Category adjacency clustering. → Stacks with **plaza naming** (roadmap) into one "the city names itself" theme, and feeds the showcase track's automatic-label-placement item.

**Open question before building it:** does a quarter *do* anything? A trickle makes it a min-max target and drags in a principle-6 monotonicity argument. Start as pure identity — label only, no effect. If it later earns an effect, that's a deliberate reversal, not a default.

**16. Emergent features as commission context.** A patron asks for their statue "in the new campo"; a quarter's guild asks for its trade's workshop. → Formed plazas and quarters, once either has a stable identity.

**Not render-only** — this is the bridge from recognition to the core loop, listed here because it's what ideas 1–15 are ultimately *for*. It touches `maybeOfferCommission` (rng-draw-order trap) and wants the plaza-naming record to exist first. The roadmap already carries one instance ("the campo petitions for a fountain") under plaza naming.

---

## Where to start

**1 (weathering), 4 (garden courtyards), 5 (street furniture)** — all three are adjacency or `builtTick` checks on data that already exists, they need no new sim coupling, and together they turn a dense housing block from grid-fill into a neighborhood. Weathering carries the most weight per hour: it gives the city a dimension (age) that nothing currently expresses.

**3, 7, and 12** are the next tier and each rides plumbing that already shipped — the dirt raster for two of them, the cloud-shadow material plugin for the third.

## Ruled out

**The city building on its own** — spontaneous shrines, squatter cottages, self-placed decoration. Organic plazas work because they recognize *ground*, not claim it. The moment the sim places a building the player didn't, authorship gets muddy and razing the city's own choice feels bad. Recognition yes; construction no.
