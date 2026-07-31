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
- **Housing tiers 3–5 + named family palazzos** — with zoning cut, individual placement is the permanent model, so housing variety *is* the residential endgame. Also the declared home for noble-family visual identity (stemma heraldry, rustication).
- **Lungarno row** — riverfront terraces; simpler than originally scoped since blending is now free by construction. Could ride along with the housing-tiers pass.
- **Buildings overhaul** — more buildings, rebalanced values, reorganized categories, and building progression (see the backlog entry). Subsumes the old "expanded roster" item; the progression piece needs the most design.

**Tier 3 — small, self-contained gap-fillers:**
- Per-plaza paving choice (all three drawers ship behind `?plaza=`; needs `Tile.variant` state, click-to-select, style picker)
- Lake map archetype + hiding grid tiles over water
- Distinct models for the studio/loggia/baptistery placeholders (graphics)
- Small carried-over opens: single Town Center Plaza enforcement, custom display-art models, boats/banners

**Parallel track — Audio (music & SFX)** *(added July 2026; music slice shipped)*: touches no sim systems, so it runs alongside the tiers rather than inside them. Slice 1 (ambient bed + interaction SFX) is small and disproportionately valuable in a cozy game — worth picking up early, before or alongside the tier-1 work. See the backlog entry for the slice sketch.

**Horizon:** River & Waterfront building set (gated on the water-adjacency design in design-doc.md), campaign scenarios.

---

## Backlog

- Richer economy system (replaces the Market as the primary florin source; Market repurposed as overflow material supply, bought with florins when suppliers are maxed)
- Seed system — remaining dimensions. *The `seed` field exists (`app/game/seed.ts`, persisted, shown in Settings) and already deterministically picks the starting city name, map archetype, river course, coastline, terrain heights, and wilderness scatter. Still open — it should also influence:*
  - Available resources on the map (which suppliers/materials this run offers) — designed in [map-resources.md](map-resources.md)
  - Faction archetypes / personality types — different archetypes value different things and ask for different commissions — designed in [factions.md](factions.md)
  - Types of commissions that pop up
  - (Open list — more dimensions as they come up)
- Per-plaza paving choice — restyle any placed plaza in-game between the three paving treatments. All three drawers already exist in `render/paths.ts` (previewable via the `?plaza=` dev flag):
  - **Radial cobble rings** (shipped default) — sett cobbles in rings radiating from the fountain, street-limestone palette; the ring geometry points at the centerpiece (ref: Roman sampietrini)
  - **Terracotta herringbone** — warm brick herringbone field at 45° framed by a pale travertine border course; echoes the rooftops, strongest color pop (ref: Siena, Piazza del Campo)
  - **Grand travertine slabs** — large creamy slabs on the diagonal framed by the darker street limestone; quietest, reads as "finer stonework" (ref: Florentine piazzas)
  - Implementation notes: needs per-tile style state (the unused `Tile.variant` field fits), a first click-to-select interaction (`pickGridCell` → `tiles["x,y"]` → origin, same lookup the hover tooltip uses), and a style-picker popover. The renderer diffs tiles by object identity, but `renderOrigin`'s rebuild guard only checks `buildingId`/`extendKey` — the style must join that condition, and the pad batch keys (`pad:<size>:<style>`) already support per-style batches.
- Housing tiers 3–5; named family palazzos
- **Rank-gated commissions** — a commission may require a **minimum rank** ("requires a Virtuoso architect"). Deferred from architects slice 1 — both launch structures are modest and rank already scales duration/reward; add `minRank` when Dome/Town-Hall-tier asks land. The ordinary offer stream must stay actionable — roll requirements at or below the city's best; asks above it live on the favor ladder's upper rungs and signature chains ([factions.md](factions.md)) (an unmet rank gate never expires a chain or punishes — principle 7).
- **Capstone structures & the Commune** — Town Hall and the Dome as signature-chain capstones; a civic **Commune** requester (the Signoria asking for civic structures) as its own patron slice on top of the Church/noble pool.
- Remaining faction slices — per-family taste jitter, seed-shuffled install order, rivalry pairs, signature commission chains ([factions.md](factions.md))
- **Buildings overhaul** *(added July 2026 — subsumes the old "expanded building roster" item)* — four strands, likely one design pass then slices:
  - **More buildings** — the unbuilt roster in [design-doc.md](design-doc.md) Building Categories (Banking House, Wool Merchant, Glassblower, Monastery, Spice Trader, Library/Studiolo, School, Anatomical Theatre, Town Hall, …) plus the River & Waterfront set (gated on the water-adjacency design noted in that section). Effect designs for many already exist in [building-effects.md](../building-effects.md).
  - **Rebalance values** — a numbers pass over costs, incomes, amenities, and material rates once the roster grows; the current values were tuned for the small roster.
  - **Reorganize categories** — the palette's five tabs (Housing/Workshops/Civic/Materials/Decorations) will strain as the roster grows; regroup `BuildingType` categories and the palette to match (affects `TYPE_PRIORITY` worker ordering and `costEscalates` type sets — both key off `type`).
  - **Building progression** — buildings unlock as the city grows instead of everything being available from tick one (candidate gates: population, prestige, a standing prerequisite building — the Cathedral-gates-Church-rungs pattern generalized). Needs design: what gates what, and how it stays cozy (locked ≠ punished, principle 6 — a visible "coming later" reads as aspiration, a hidden tab as a wall).
- **Lungarno row** — a taller riverfront housing variant that blends into a continuous wall along the water (the Florence lungarno look), reusing the row-house fill-to-footprint blending (`HOUSE_FIT`)
- **More map archetypes** — extend the seeded water system (`app/game/water.ts`, rolled from `mapSeed`) with new archetypes beyond inland/coastal/dry/scenic. First candidate: **Lake** — an enclosed body inside or clipping the buildable grid (fed by the existing river course), giving lakefront placement and Stone Bridge crossings without a full coast. Reuses the existing archetype roll, water-cell gating, and bridge/water rendering; mainly a new water-cell shape + probability-table slot. Also: **hide grid tiles over water** so the placement grid only draws on buildable cells, making it visually obvious where building is (and isn't) allowed — the grid is already hidden except while placing (`render/paths.ts`), so this is a water-cell mask on that overlay.
- **Ambience & sound effects** *(added July 2026; the music slice shipped — sporadic era-based tracks, see the design doc's Music section)* — **Slice 1, ambience + feedback**: an ambient bed (birdsong/wind at the edges, light crowd murmur near plazas — could scale with the existing `bustle` number for free) plus interaction SFX (placement thunk, raze, coin chime on commission payout, the offer-arrival card's bell). Nothing needs to be spatial at this camera distance, so plain web audio from the React layer suffices (the music hook set the pattern) — no Babylon sound-engine dependency unless positional audio earns its way in later. Also pending: Mid/Late-era tracks for the shipped era system (`TRACKS` in `app/game/music.ts` — append and done).
- **Single Town Center Plaza enforcement** — carried over from phases 9/10: the Main Plaza should be one per city; nothing enforces it yet.
- **Custom display-art models** — displayed statues/paintings are placeholder procedural (re-posed citizen figure, hashed canvas on an easel); real low-poly models later.
- Distinct models for the architect placeholders — studio (workshop hall minus dormer + drafting yard), loggia (arch-bay arcade under a hip), baptistery (square drum + portal + lantern standing in for the octagon)
- Graphics stretch leftovers: boats, banners
- Campaign scenarios
