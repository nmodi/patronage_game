# Patronage — Roadmap

*Split out of [design-doc.md](design-doc.md) (July 2026). The design doc holds the systems; [artifacts/game-mechanics-audit.md](artifacts/game-mechanics-audit.md) holds the per-mechanic code references; this file holds only what's ahead. When an item ships, delete it here and document the built system in the design doc.*

---

## Next up — priorities (July 2026)

Ranked after the July 2026 cuts (neighborhood zoning was cut outright; the diagonal row-house-blending follow-up closed itself when houses went fill-to-footprint). All numbered phases (0–12) plus factions slice 1 and architects slice 1 are done — the built systems are documented in [design-doc.md](design-doc.md).

**Tier 1 — designed, builds directly on what just landed:**
1. **Capstone slice** — signature commission chains ([factions.md](factions.md)) + Town Hall and the Dome as chain capstones + the civic **Commune** requester (the Signoria) + `minRank` commission gating. These are really one combined slice: the chains need capstone structures to ask for, and the capstones need chains to arrive through. Converges the two half-finished arcs (factions, architects) into the game's late-game payoff.
2. **Map resources** ([map-resources.md](map-resources.md)) — the seed decides which suppliers/materials a run offers. Its leverage went up with five material pools and construction `buildCost`s live: per-run scarcity would shape strategy, not just flavor. The last unbuilt seed dimension besides factions; the natural follow-on as the replayability layer.
3. **Remaining faction slices** ([factions.md](factions.md)) — per-family taste jitter, seed-shuffled install order, rivalry pairs. (Signature chains promoted into tier-1 above.)

**Tier 2 — needs real design work first:**
- **Richer economy** — replaces the Market as the primary florin source; Market repurposed as overflow material supply. One sketch line in the backlog; everything else open.
- **Housing tiers 3–5 + named family manors** — with zoning cut, individual placement is the permanent model, so housing variety *is* the residential endgame. Also the declared home for noble-family visual identity (stemma heraldry, rustication).
- **Riverfront row** — riverfront terraces; simpler than originally scoped since blending is now free by construction. Could ride along with the housing-tiers pass.
- **Buildings overhaul** — more buildings, rebalanced values, reorganized categories, and building progression (see the backlog entry). Subsumes the old "expanded roster" item; the progression piece needs the most design.

**Tier 3 — small, self-contained gap-fillers:**
- Per-plaza paving choice (all three drawers ship behind `?plaza=`; needs `Tile.variant` state, click-to-select, style picker)
- Freeform-plaza leftovers: paving render polish + prefab retirement decision (see backlog)
- Lake map archetype + hiding grid tiles over water
- Distinct model for the studio placeholder (graphics)
- Small carried-over opens: single Town Center Plaza enforcement, real-art roster expansion, boats/banners

**Parallel track — Audio (music & SFX)** *(added July 2026; music, interaction-SFX, and crowd-ambience slices shipped)*: touches no sim systems, so it runs alongside the tiers rather than inside them. Remaining: Mid/Late-era tracks — see the backlog entry.

**Horizon:** River & Waterfront building set (gated on the water-adjacency design in design-doc.md), campaign scenarios.

---

## Backlog

- Richer economy system (replaces the Market as the primary florin source; Market repurposed as overflow material supply, bought with florins when suppliers are maxed)
- Seed system — remaining dimensions. *The `seed` field exists (`app/game/map/seed.ts`, persisted, shown in Settings) and already deterministically picks the starting city name, map archetype, river course, coastline, terrain heights, and wilderness scatter. Still open — it should also influence:*
  - Available resources on the map (which suppliers/materials this run offers) — designed in [map-resources.md](map-resources.md)
  - Faction archetypes / personality types — different archetypes value different things and ask for different commissions — designed in [factions.md](factions.md)
  - Types of commissions that pop up
  - (Open list — more dimensions as they come up)
- Per-plaza paving choice — restyle any placed plaza in-game between the three paving treatments. All three drawers already exist in `render/paths.ts` (previewable via the `?plaza=` dev flag):
  - **Radial cobble rings** (shipped default) — sett cobbles in rings radiating from the fountain, street-limestone palette; the ring geometry points at the centerpiece (ref: Roman sampietrini)
  - **Terracotta herringbone** — warm brick herringbone field at 45° framed by a pale travertine border course; echoes the rooftops, strongest color pop (ref: Siena, Piazza del Campo)
  - **Grand travertine slabs** — large creamy slabs on the diagonal framed by the darker street limestone; quietest, reads as "finer stonework" (ref: Florentine piazzas)
  - Implementation notes: needs per-tile style state (the unused `Tile.variant` field fits), a first click-to-select interaction (`pickGridCell` → `tiles["x,y"]` → origin, same lookup the hover tooltip uses), and a style-picker popover. The renderer diffs tiles by object identity, but `renderOrigin`'s rebuild guard only checks `buildingId`/`extendKey` — the style must join that condition, and the pad batch keys (`pad:<size>:<style>`) already support per-style batches.
- **Freeform-plaza leftovers** *(core shipped August 2026 — painted paving, centerpiece/open-square hub qualification, fountain display slot; see design-doc.md → Roads → Freeform plazas)*:
  - **Paving render polish** — move freeform paving from per-cell thin-instance quads to a chunked canvas overlay sheet (the `dirtPathOverlay.ts` machinery: chunking, draping, redraw budgets), unlocking radial sett rings drawn dynamically around a seated centerpiece (`drawPlazaCobble` with a center argument), a border course traced along the blob perimeter, and no repetition on large fields. Layering trap on record: the overlay sheet draws at y 0.008 and paving currently renders at road height 0.01 — the sheet approach needs the surface at or below the sheet.
  - **Ghost live-count** — while placing a centerpiece, surface the would-be "Piazza hub: N/M" in the placement UI instead of only on the placed tooltip.
  - **Secondary-prefab retirement decision** — the Plaza/Small Plaza stamps are now redundant with painted piazzas; retire them from the palette for new games (metadata stays for old saves) or keep as one-click stamps. Decide after play.
  - **Site-bound fountain commissions** — "a Neptune for the piazza": offers gated on an empty fountain slot existing, auto-installing on completion. Touches `maybeOfferCommission`, so the site reference must stamp off existing rng draws (trap rule). Only if the slot version proves not enough — the player choosing which fountain gets the Neptune may be decision enough.
- Housing tiers 3–5; named family manors
- **Rank-gated commissions** — a commission may require a **minimum rank** ("requires a Virtuoso architect"). Deferred from architects slice 1 — both launch structures are modest and rank already scales duration/reward; add `minRank` when Dome/Town-Hall-tier asks land. The ordinary offer stream must stay actionable — roll requirements at or below the city's best; asks above it live on the favor ladder's upper rungs and signature chains ([factions.md](factions.md)) (an unmet rank gate never expires a chain or punishes — principle 7).
- **Capstone structures & the Commune** — Town Hall and the Dome as signature-chain capstones; a civic **Commune** requester (the Signoria asking for civic structures) as its own patron slice on top of the Church/noble pool.
- Remaining faction slices — per-family taste jitter, seed-shuffled install order, rivalry pairs, signature commission chains ([factions.md](factions.md))
- **Buildings overhaul** *(added July 2026 — subsumes the old "expanded building roster" item)* — four strands, likely one design pass then slices:
  - **More buildings** — the unbuilt roster in [design-doc.md](design-doc.md) Building Categories (Banking House, Wool Merchant, Glassblower, Monastery, Spice Trader, Library, School, Anatomical Theatre, Town Hall, …) plus the River & Waterfront set (gated on the water-adjacency design noted in that section). Effect designs for many already exist in [building-effects.md](../building-effects.md).
  - **Rebalance values** — a numbers pass over costs, incomes, amenities, and material rates once the roster grows; the current values were tuned for the small roster.
  - **Reorganize categories** — the palette's five tabs (Housing/Workshops/Civic/Materials/Decorations) will strain as the roster grows; regroup `BuildingType` categories and the palette to match (affects `TYPE_PRIORITY` worker ordering and `costEscalates` type sets — both key off `type`).
  - **Building progression** — buildings unlock as the city grows instead of everything being available from tick one (candidate gates: population, prestige, a standing prerequisite building — the Cathedral-gates-Church-rungs pattern generalized). Needs design: what gates what, and how it stays cozy (locked ≠ punished, principle 6 — a visible "coming later" reads as aspiration, a hidden tab as a wall).
- **Riverfront row** — a taller riverfront housing variant that blends into a continuous wall along the water (the Florence lungarno look), reusing the row-house fill-to-footprint blending (`HOUSE_FIT`)
- **More map archetypes** — extend the seeded water system (`app/game/map/water.ts`, rolled from `mapSeed`) with new archetypes beyond inland/coastal/dry/scenic. First candidate: **Lake** — an enclosed body inside or clipping the buildable grid (fed by the existing river course), giving lakefront placement and Stone Bridge crossings without a full coast. Reuses the existing archetype roll, water-cell gating, and bridge/water rendering; mainly a new water-cell shape + probability-table slot. Also: **hide grid tiles over water** so the placement grid only draws on buildable cells, making it visually obvious where building is (and isn't) allowed — the grid is already hidden except while placing (`render/paths.ts`), so this is a water-cell mask on that overlay.
- **Era tracks** *(the crowd-ambience bed + its local-bustle zoom coupling shipped August 2026 — see the design doc's Music & Sound section)* — Mid/Late-era tracks for the shipped era system (`TRACKS` in `app/game/audio/music.ts` — append and done). Possible later ambience layers: birdsong/wind at the map edges, and a shared AudioContext if runtime crossfading ever earns its way in (the shipped bed bakes its loop crossfade into the asset instead).
- **Single Town Center Plaza enforcement** — carried over from phases 9/10: the Main Plaza should be one per city; nothing enforces it yet.
- **Real-art roster expansion** — both title pools are real works with real assets now (design doc → Commissions & Works); remaining is content depth: cut more statues from [artifacts/statue-scan-catalog.md](artifacts/statue-scan-catalog.md) at 600 tris (the Pietà/Saint George/Baptist shortlist needs a MyMiniFactory account), and pull further paintings from the 60-work roster in [artifacts/painting-source-catalog.md](artifacts/painting-source-catalog.md) — each is one `SOURCES` line plus one `ART_IMAGES` line. A `focal_y` knob would unlock the tall altarpieces currently benched for cropping to a midriff band.
- Distinct model for the architect studio placeholder (workshop hall minus dormer + drafting yard)
- Graphics stretch leftovers: boats, banners
- Campaign scenarios

---

## Stretch ideas — showcase track

*Career-facing, not game-facing: each of these exists to generate a resume line, an interview story, or domain learning for a target industry. An idea belongs here only if the game's needs and the domain's hard problems genuinely overlap. Separate from the tiers above — none of these block game work.*

**Resume-signal features (domain-neutral):**

1. **Deterministic replay + golden-master tests** — record seed + player decision log; replay must reproduce the city bit-for-bit. Proves the "deterministic, testable simulation core" resume claim instead of asserting it; gives golden-master regression tests in CI (replay a log, assert end-state hash) and an interview story about rng-draw-order discipline. Highest signal per unit of work, and genuinely useful for catching sim regressions.
2. **Shareable cities (tiny backend)** — "Share my city" → POST save blob to a one-endpoint service, get a short read-only URL. The one feature that honestly earns "full-stack" for this project (~a day: one endpoint + object storage). Skip accounts/leaderboards/multiplayer — months of work, zero extra hiring signal.
3. **Performance story with numbers** — in-game perf overlay (draw calls, tick ms, FPS at N buildings) + turn [performance-backlog.md](performance-backlog.md) into a before/after writeup ("1,000-building city: X draw calls → Y, tick under Z ms"). Measurement + prose, not new engineering.
4. **Skip: LLM-generated content** (patron letters, flavor text) — Basketpal already carries the LLM-pipeline signal; duplicating it adds nothing and forces an API-key dependency into a self-contained game.

**Mapping-industry track** (Mapbox, Esri, Felt, Overture, TomTom — ranked by how directly each maps to what these companies hire for):

1. **Real-world map import — "build Renaissance Florence on real Florence"** — ingest an OSM extract, project it, snap streets/rivers/coastline to the grid, generate a playable map. Teaches the core skill set (OSM's messy schema, coordinate projections, geometry cleaning, Douglas-Peucker simplification to snap real streets to tiles) and doubles as the best viral feature ("play your hometown"). Biggest lift on this list; every hour is domain learning.
2. **Isochrone overlay** — the 0-1 BFS from plazas already exists; render it as travel-time contour bands. Isochrones are a literal Mapbox API product, and it's a genuinely useful overlay for placing the next plaza. Days, not weeks. Fits design constraints: derived visualization, not citizen pathfinding.
3. **Automatic label placement** — player-named districts/buildings rendered with collision avoidance, priority, zoom-dependent culling. A classic hard cartography problem and instant peer conversation in rendering-team interviews.
4. **Antique-map export** — render the city as a period engraved map (cf. the 1584 Buonsignori map of Florence): stylized building glyphs, coastline generalization, labels, a cartouche. Combines labeling + generalization + stylized rendering; the output is a shareable portfolio artifact that fits the game's aesthetic.
5. **GeoJSON export + spatial indexing** — export buildings as polygons / roads as linestrings so the city opens in QGIS/Felt/geojson.io (an afternoon); quadtree for picking/spatial queries. Real vocabulary, low wow-factor — warmups inside a bigger item, not headliners.

Sequencing: 2 → 3 → 4 compound (isochrones teach the overlay plumbing, labels feed the antique map); 1 stands alone as the deep end. If mapping is a real target: start with 2 as the cheap win, commit to 1 as the centerpiece.

**Other-industry tracks (same pattern, undeveloped):** game studios/graphics → WebGPU renderer port; simulation/robotics → headless sim + benchmark harness; data platforms → the replay/event-log system framed as event sourcing. Decide the target industry first — each track is weeks, and the domain match is what makes the time pay twice.
