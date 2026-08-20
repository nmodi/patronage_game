# Patronage — Game Design Document
*Implementation reference. Distilled July 2026 — this supersedes earlier drafts.*

---

## Overview

**Patronage** is a cozy city builder set in Renaissance Italy (1400s–1500s). The player acts as a patron-ruler whose goal is to create a city where art and culture can flourish. It is not a survival game, not a logistics puzzle, and not a pathfinding optimizer. The core loop: build the city that attracts artists, keep them supplied and inspired, and route them onto **commissions** — the contracts through which all art gets made.

The closest visual reference is **Dorfromantik** — low-poly, isometric 3D, warm and inviting.

---

## Tech Stack

- **Framework:** React + TypeScript + React Router v7
- **3D rendering:** Babylon.js (@babylonjs/core)
- **State management:** Zustand
- **Styling:** Tailwind CSS
- **Architecture:** Two layers — Babylon canvas for the 3D city, React DOM overlay for all UI panels

---

## Visual Style

Art direction: free CC0 packs — Kenney Fantasy Town Kit (buildings/props, kitbashed per building) + Kenney Nature Kit (trees), retinted to the Mediterranean palette by editing the kits' shared `colormap.png` (see `scripts/retint-colormap.py`; models in `public/models/`).

- Low-poly isometric 3D
- Warm ochre, terracotta, sandstone color palette
- Tiled ground, terracotta rooftops, cypress trees, fountains
- Plaza pads pave with sett cobbles in rings radiating from the fountain — the street limestone palette, so pattern (not color) marks the focal point
- Building aprons are mottled stone in the same street palette (no slab grid) — buildings join roads quietly instead of sitting on lighter flagstone islands
- **No flat roofs on buildings** — every roof is pitched (gable/hip/point), even if only a shallow pitch; flat kit pieces are allowed only as non-roof slabs (e.g. the colonnade architrave)
- **Category identity, Florence rules** *(built — July 2026)*: categories read at a glance without breaking the one-town look. Roofs stay terracotta city-wide with only minor variation (~1 in 3 leans slightly brown); facades vary per category — housing reads as **warm sandstone** *(July 2026)*: five hand-drawn masonry patterns (coursed rubble, Roman brick, ashlar, stucco-over-stone, smooth plaster) in creamy Tuscan gold-tan — the brief is subtlety: near-solid tone spreads, joints a step darker, mortar as warm as the stones — weighted and position-hashed per house (`STONE_TINTS` in `render/wallTexture.ts`, riding the tint layer); the rest wears the same drawn-masonry family since the **texture pass** *(July 2026)*: category identity rides the position-hashed pattern mix — workshops brick-forward, suppliers rough rubble, services smooth plaster — and civic (manor, chapel) gets its own `civic` pattern, large dressed ashlar in pale-but-warm stone (every door/window is a generated stone fitting since the panel-free pass, July 2026); religious buildings wear verde di Prato green (~#58634c), the Duomo's green-and-white language, in two registers *(marble pass — July 2026)*: the **campanile** and the **cathedral's west front** read as white marble inlay — hand-drawn textures in `render/wallTexture.ts`, redesigned in the **marble redesign** *(July 2026, picked off a five-way concept board after the original hairline linework averaged into a grey wash at the 40–90&thinsp;px a storey face fills at gameplay zoom — solid fields and chunky figures survive the downscale, lines don't)*: the tower's shaft (`campanile`) is Giotto polychrome — three framed panel bays per storey, verde outer / rose centre (the centre sits behind each storey's bifora, so the visible bays carry the green; the first cut had it inverted and the tower read pink), white hexagon medallions (the relief cycle) floating in them — and the cathedral wears a **screen facade** (`screen`, San Miniato al Monte language: a five-arch blind arcade with alternating solid verde tympana on the street register under a row of circle-in-square intarsia) — thin slabs hung on the front, with the pediment and sloped aisle-shoulder wedges in a quiet `marble` pattern (field + hairline courses; anything figured stripes across the gable's per-unit u tiling or gets cut by the slope), exactly what the real fronts are, over flanks of **brown rubble** (`flank` — the residences' courses shifted brown, Santa Croce's medieval walls) lined with a five-bay window rhythm (arched clerestories, arched-over-rectangular rows on the aisles); both are panel-free, all fittings generated — including the **landmark portals** *(July 2026)*: voussoir-arched stone frames with double bronze-panel doors under a stone tympanum lunette (`proc:portal-frame`/`proc:portal-leaf`), on the cathedral's three west portals and the bell tower base. The **chapel** wears the portal at parish scale plus arched windows (sides + a small gable lancet) *(panel-free pass, July 2026; round windows were tried and dropped — they read as portholes)*. Verde lives **only in the wall textures** *(stone trim pass, July 2026)*: the green fitting tints (chapel surrounds, cathedral/bell-tower portal frames + bifore + rose ring) were tried and retired — every window/door surround is plain stone. Shape grammar: civic alone breaks the skyline (high gables, spires), workshops = gable + dormer + prominent chimney (painter long hall vs sculptor T head-house), suppliers = low hip roofs + visible stock yards (carts, slabs, crates), services = gable-end street bays + banner signs. Crenellations/battlements are reserved for civic *landmarks* only (Town Hall, future walls/gates) — never on housing, workshops, or ordinary civic buildings. Mechanism: `Part.tint` in `modelManifest.ts` — details in [kitbashing.md](llm-context/kitbashing.md) (Materials & tinting)
- Buildings show activity via animations (chimney smoke — exclusive to production buildings: workshops and the bakery); inactive buildings desaturate and lose animations
- Hover tooltips on all buildings explaining status

---

## Time System

- 1 game month = 1 tick (2 seconds real time at 1x speed)
- Speed controls: pause, 1x, 2x, 3x
- Display format: "May 1482"
- All durations (commissions, artist growth) measured in months

---

## Core Resources

**Design principle:** A resource earns a place in the top bar only if the player makes interesting decisions about it. There are exactly three headline resources plus one status pool.

| Resource | Role | Description |
|---|---|---|
| **Florins (f)** | What you **spend** | Currency, generated by economic buildings (markets) and house rents. "Second marble supplier, or another workshop?" **Late-game money rebalance** *(built — July 2026)*: florins are the constraint resource, prestige is the number that goes up, so income is kept from compounding unbounded — house rent scales with occupancy (`min(1, population/housing)`) instead of raw house count, duplicate non-housing florin generators (e.g. a second Market) get geometric diminishing returns, and commission florin rewards are compressed against artist rank (`FLORIN_RANK_COMPRESSION`) while the prestige reward keeps its full curve. On the spend side, a second wave *(built — July 2026)* deepens the outlet as the city grows: duplicate workshops/suppliers/services cost progressively more to build (`COST_ESCALATION`, `escalatedCost` in `app/game/buildings.ts`), priced live off how many of that building already stand — no persisted counter, no save migration. Raze salvage tracks the escalated price actually paid, not the flat base cost. No upkeep, no new sink either way — flattened income meets a build-out that costs more as it grows. |
| **Inspiration** | What you **cultivate** | Fuels artist productivity. A city-wide pool generated by plazas, decorations, and displayed works. Buildings on the Main Plaza's road network get a graded efficiency bonus with falloff, refreshed by secondary plazas (soft spatial — no cliff). |
| **Prestige** | What you **earn** | Cultural reputation. Not spent — the satisfying number that goes up. Crossing the prestige milestone triggers the Renaissance celebration. |
| **Population** | Status pool | The labor pool. Not spent like currency, but the two-pass worker allocation makes it matter. |

**Deliberately NOT headline resources:** materials (pigment, marble, bronze) *are* a stockpile since July 2026 — city-wide pools that suppliers fill and commissions spend (see Material Suppliers) — but they stay off the top bar. They're a cost you pay when accepting a commission, not a number you steer the city by; they live in a small readout strip and on supplier/commission cards. Adding a fourth top-bar resource still needs a real standing decision behind it (principle 8).

---

## City Building

Players place buildings individually on the grid — houses included. This is deliberate for the current scope: placing houses is satisfying at small-city scale.

**Raze** *(built — July 2026)*: a demolition tool at the end of the build palette. Click removes a structure; holding the button drags a sweep across roads and decorations. Razing salvages half the build cost as florins. Demolitions that hurt — housed artists, an assigned commission — need a deliberate click plus a confirm card ("Its artists will depart; '…' will be set aside"); sweeps pass over them. Downstream systems self-heal: artists depart immediately, the commission re-opens with a fresh expiry, workers rebalance next tick. Materials already spent on a reopened commission are **not** refunded — reassigning it pays again.

Neighborhood zoning (zones auto-filling with housing) was considered and **cut** *(July 2026)* — individual placement works well at this scale and stays the permanent model.

### Housing Tiers
1. Cottage *(built)*
2. Townhouse *(built)*
3. Villa
4. Manor
5. Grand Manor

Facade language for tiers 3–5 (when built): graduated **rustication** (rough-cut stone base shading to smooth upper floors — Palazzo Medici/Strozzi), **bifora** (two-light arched) windows, string courses between floors, deep Tuscan eaves. Distinguishes fine housing from the stucco of tiers 1–2 without leaving the palette.

**Row-house blending** *(built; simplified — houses now blend by construction)*: cottages and townhouses fill their footprint to the wall plane (`HOUSE_FIT` in `render/modelManifest.ts`), so side-adjacent houses simply touch and read as a terrace — no neighbour-reactive stretching, no store or save changes, and it works at any rotation including 45° (the old `computeBlend` extend machinery was retired). The gable ridge runs across the party-wall axis so gable ends land on the shared side walls, where a neighbour buries them into a continuous roofline.

---

## Roads

Roads are **player-placed** by dragging stretches, like any building. Grid-aligned (paved variants also drag at 45° — see Diagonal streets). They are light structure/decoration — buildings do not require road connection to function.

**Widths** *(built)*: the grid is subdivided 2× relative to building scale (cells are 0.5 world units; buildings span 4+ cells), so roads come in three widths as build-menu variants — **Path** (1 cell), **Road** (2 cells), **Avenue** (3 cells) — plus a **Dirt Path** (1 cell, packed-earth texture, 10ƒ) for country lanes. Cost is per cell (25ƒ for paved), so wider roads cost more per length. Purely aesthetic + cost choice; all variants carry plaza connectivity identically.

**Diagonal streets** *(built — July 2026)*: road drags snap to 8 octants — the 4 cardinals plus 45° diagonals (Florence's medieval cuts across its Roman grid; boundaries at 22.5°). **All five road variants** drag diagonally (Path/Road/Avenue, plus Dirt Path and the Stone Bridge). A diagonal run is a thin staircase of ordinary road cells, one per ±(1,±1) step (wider roads stamp rows offset one cell along x, keeping the set orthogonally contiguous), with the ribbon orientation stored in the tile's `rotation` field (`1` NE / `3` NW via `app/game/placement/roadStretch.ts`; cardinal roads stay `undefined`, so old saves are untouched — no save migration). The renderer draws those cells as ±45°-rotated, √2-stretched decals forming a continuous ribbon; plaza connectivity and citizen walks traverse diagonal adjacency (step cost 1 — slightly generous vs √2, fine per principle 6). Where a diagonal crosses a cardinal road the shared cell keeps the first placer's orientation; every ribbon cell at a crossing — a cardinal-road 4-neighbor of any surface, or an opposite-diagonal neighbor at either parity (crossing at a shared cell or between cell centers) — swaps its rotated quad for a **junction pad** in directionless mottled stone (paved lanes: the building-apron limestone; dirt lanes: rimless packed earth), so both brick directions terminate cleanly at the pad instead of 45° slabs overlapping straight ones (**junction pads** *(July 2026)*, replacing the old same-texture under-plate — `isJunction` in `app/game/render/roadRenderer.ts`). The pad takes one of two shapes (`junctionKind`): where a cardinal street passes **through** the cell (road neighbors on opposite sides), a convex hexagonal plate — the 45° ribbon strip through the cell (perpendicular end cuts, flush with the neighbor ribbons' brick ends) widened to take in the two cell corners the strip misses, covering the street's full width — and everywhere else (terminal mouths, street-end elbows, bowties) a plain mottle **strip** in the suppressed ribbon's own transform, so lane-side junctions keep the lane's silhouette and just wash quietly over any bricks they graze. (Three cuts rejected on taste: an enlarged 1.5-cell square read as a blob wider than the streets; a cell-square + ribbon-strip union re-created the sawtooth silhouette in mottle; all-hexagon paved lane-side cells into a lump against street ends.) Overlapping pads y-stagger by grid parity instead of z-fighting. Diagonal paved ribbons also carry their own 3-courses-per-√2-cell texture (`getPavedRibbonMaterial`) so slabs match cardinal size — the old shared texture stretched ~41% lengthwise — with quad seams still landing on grout. Diagonal **Dirt Path** renders its 45° runs as a baked decal ribbon with the grass rim on its long edges (`getDirtRibbonMaterial` in `render/paths.ts`) — the cardinal raster overlay is grid-axis-aligned and stays cardinal — and the diagonal **Stone Bridge** carries √2-stretched decks with continuous outer parapet rails (interior lane rails suppressed). By construction a diagonal street is slightly narrower and cheaper per world-length than its cardinal twin — accepted at this cozy scale.

**Stone Bridge** *(built — July 2026)*: a fourth road variant (2 cells wide, 80ƒ/cell) and the only structure placeable on water cells; on land it reads as a stone causeway. Raised limestone deck with parapet rails; carries plaza connectivity and citizens across the river like any road. See Water & Map Archetypes below.

**Snap-to-road placement + 45° buildings** *(built — July 2026)*: holding **Shift** while placing a building snaps the ghost flush against the nearest road within ~6 cells, sliding along it with the cursor and auto-rotated so the building's front faces the road (`app/game/placement/roadSnap.ts`). Against a *diagonal* ribbon the building rotates a true 45° and packs parallel to it; **R cycles 8 rotation steps** (45° each), so diagonal orientation is also a free choice anywhere. Purely an assist per principle 6 — no valid candidate falls through to ordinary free placement, and releasing Shift restores it exactly. Under the hood: `Tile.rotation` 4–7 = quarter (r−4) + 45° (values 0–3 unchanged, so old saves need no migration), and a diagonal building claims a true **diamond cell mask** — the cells whose centers fall inside its rotated rectangle (`footprintMask`, `app/game/buildings.ts`) — not its bounding box, which is what lets it sit flush against a diagonal street. Resolves the former "Diagonal (45°) placement" stretch goal's open questions: footprint = mask, not bbox; plaza connectivity needs no change (mask cells conduct through the existing 4-neighbor adjacency); colonnade extend is deliberately skipped at 45° (the side machinery is cardinal); row-house blending needs no special case — houses fill their footprint, so diagonal neighbours touch by construction. Display plinths work on 45° hosts (slot cells rotate continuously, landing on the nearest mask cell). Render: models measure/fit in the quarter frame, then take a final +45° yaw; aprons rotate to match; the ghost previews the claimed diamond with the pooled road-preview quads while snapped.

**Plaza connection** *(built — Phase 10)*: roads carry the Main Plaza's reach. The bonus radiates from the **Town Center Plaza** (the Main Plaza; single-instance enforcement is a later addition) through connected roads, fading linearly to zero over 30 road cells (15 world units). **Secondary plazas on the network refresh it to full** — mini-hubs the player is nudged to seed through outlying districts; an isolated plaza radiates nothing. The bonus scales what a building provides, up to **+25%** beside a hub: generator output, workshop commission speed, housing capacity, and service amenities. Purely a carrot — off-network buildings run at full base rate, and the tooltip nudges: "Link to a plaza with roads: up to +25%". *(Since the freeform-plazas rework below, formed plazas are the secondary hubs — the premade Plaza/Small Plaza buildings are retired from the palette; placed ones keep working.)*

*(An earlier draft specified automatic cluster/hub road generation. Cut — manual placement fits the cozy hands-on scale.)*

**Freeform plazas (Plazas II)** *(built — August 2026; replaces the reverted first attempt from the ground up)*: plazas are no longer stamped buildings — they are **recognized ground**, reachable by two paths through one detector (`app/game/city/gathering.ts`):

- **Authored**: a rect-dragged **Plaza** surface (sold under Civic via `paletteType` — the def stays `type: "road"` for conduction/walkability/raze semantics; 12ƒ/cell; `areaDrag` — blocked cells inside the rect are skipped uncharged, so one drag floods around obstacles and joins existing paving free). Paved ground that fits a core (below) is a plaza immediately.
- **Organic**: no player action. Where the **gathering field** is hot and enough enclosed open ground exists, the city forms a campo on its own — bare ground, roads, all of it.

**The gathering field** answers "would people linger here?" per cell, derived from **tiles only** — no occupancy, no clocks, no walker positions — so it moves only when the player builds or razes: deterministic, replay-safe, and a formed plaza can never flicker between player actions. Additive inputs with linear falloff over `GATHER_REACH` (12 cells): housing capacity, amenities, generated inspiration (fountains, plazas, ornament — placing a commissioned fountain to seed a piazza is the intended move), and street junctions. Monotonic non-decreasing in everything (principle 6's spirit; asserted in `gathering.check.ts`).

**Formation**: a plaza is a connected union of fully-open **4×4 core blocks** (open = bare buildable land, player paving, or land road cells — a generous crossing becomes a piazza the way real ones did; bridges never join). The 4×4 core is the minimum size *and* the strip-proofing — no 3-wide avenue ever contains one — and unions make any shape legal. A block qualifies **authored** (all paving) or **organic** (mean field ≥ `GATHER_FORM` *and* **enclosed**: every outward lane hits a tile, water, or the map edge within `PLAZA_ENCLOSE_REACH` (3) cells — a campo is leftover space framed by the city, never open meadow). Un-forming happens only when the player builds over the ground itself.

**Effects**: formed plazas are secondary hubs exactly like the retired premade ones — their cells (including bare, tile-less campo cells) reset the connectivity BFS to 0 and conduct; unreached plazas still radiate nothing. Each trickles a flat `PLAZA_FORMED_INSPIRATION` (2/month, the old Small Plaza's rate; workerless and boost-free like the premade plazas). A plaza whose ground is field-qualified counts **organic** and runs `ORGANIC_PLAZA_MULT` (1.15×) hotter — the *entire* organic reward, intrinsic and permanent, so raze-and-reform cycles gain nothing by construction (no one-time bonus by design). Since paving never lowers the field, paving more can never demote an organic plaza — and an authored court can *grow into* organic as the city gathers around it. Everything is derived each compute and persisted nowhere; **plaza naming** (context-derived, renamable) is the deferred follow-up that brings the first persistent record (see roadmap).

**Formation is signified in the world, not just the overlay**: raw paving wears the streets' sett texture (it's just paved ground); the moment a plaza forms, its paved cells upgrade to the pale finished slab bond, and its bare campo cells get packed-earth ground quads (`roadRenderer.ts` rebuilds the plaza-ground batches wholesale each map edit — formed status is global, any building can tip it). Hovering paving also reads out the status ("A piazza" / "the city gathers here" / "no 4×4 open square fits").

**Map overlays** *(built — August 2026, first view)*: a Civ-style overlay system — session-only `activeOverlay` state, one HUD toggle + legend (`ui/OverlayToggle.tsx`), one draped unlit mesh (`render/gatheringOverlay.ts`). View 1 is **Gathering**: the field as warm heat (full warmth = the formable level), formed plazas filled and bordered gold (organic) or slate (authored), and the premade hub plazas (Town Center Plaza; old saves' Plaza/Small Plaza) highlighted in the authored slate — so the player watches a spot warm up before the city claims it. The roadmap's isochrone overlay is the intended second rider on this plumbing.

**Walkers**: formed plaza cells join the decorative walkers' network (including bare campo cells), and walkers dwell far more often on formed plazas and gathering-hot ground — the crowd visibly chooses the spot before it becomes a piazza. Strictly sim → render: the walkers read the derived field, never feed it (their cosmetic-only trap rule is untouched).

---

## Water & Map Archetypes *(built — July 2026)*

Every new game rolls a seeded **map archetype** — **inland** (a river meanders edge-to-edge through the buildable grid, 30%), **coastal** (a sea clips a waterfront strip off one grid edge; the river widens into an estuary and flows into it at a mouth, 30%), **dry** (the classic waterless plain, 15%), **scenic river** (the river runs through the countryside beyond the grid — pure scenery, 15%), or **scenic coast** (sea + estuary entirely beyond the grid edge, 10%). Scenic water keeps ≥1.5 wu clear of the buildable area (asserted in `water.check.ts`), so those maps play exactly like dry ones. The river continues past the grid through a carved valley to the fog line, so it never reads as a canal. Water cells block building — the game's first terrain affordance (an affordance, not a punishment: principle 6 governs bonuses, and old saves stay untouched) — and the **Stone Bridge** (Roads tab, 80ƒ/cell, `roadWidth: 2`, also placeable on land as a causeway) is the one structure allowed onto water; being `type: "road"` it carries drag placement, plaza connectivity, and citizen walks across for free (limestone parapet rails drop on sides that continue onto road/civic cells — `mapRenderer.ts` bridge batch). Sim: `app/game/map/water.ts` (import-free, verified by `water.check.ts`) derives all water cells from the persisted `mapSeed`; the single sim gate is in `placeTiles`, mirrored by the placement previews. Save v6 is the first *preserving* migration: pre-water saves get `mapSeed: null` — forever dry, since a newly rolled river would collide with their buildings. `?demo` runs on the fixed `DEMO_MAP_SEED` (`demoLayout.ts`, an *inland* river down the east) — its hand-placed city sits clear on the west bank, crossed by a Stone Bridge to a countryside estate (`demoLayout.check.ts` replays the whole layout against that seed's water to prove nothing collides). Render: the terrain mesh carves a dilated channel/valley/sea floor (`render/terrain.ts`), and `render/waterMesh.ts` builds fine bed/bank/shore ribbons plus a gently wobbling flat-shaded water surface — the codebase's first animated material (CPU vertex wobble + per-face normals on a `StandardMaterial`, so fog and the color grade apply for free). Wilderness scatter avoids the water. Estuary fix (July 2026): the river-meets-sea junction is a proper funnel — the water strip flares across the mouth and ducks under the sea sheet, river banks and the nearby shore dive underwater (shading to bed tone) instead of ending on cut faces, the terrain carves a matching mouth funnel, and terrain facets near water tint by rendered depth (fully submerged = bed, touches the waterline = sand) so no dry-dark carve pokes through the junction.

Dev helpers: `/?demo` seeds a visual test city, `&pause` freezes the tick for stable screenshots, `&map=<seed>` forces a specific map (water archetype / river course / coast **and terrain elevation**) for iteration — works with `?demo` too, `&cam=x,z[,radius[,alpha[,beta]]]` frames a world position for headless screenshots.

---

## Terrain Elevation (Rolling Hills) *(built — August 2026)*

Maps carry a **smooth rolling elevation field** — the countryside hills' visual language brought inside the buildable grid, gentler — every seeded map rolls one of three characters: ~40% **plains** (a whisper of ripple, `RIPPLE_RISE` 0.15 wu — never dead flat), ~30% **rolling hills** (all relief in the local octave, `ROLLING_RISE` 0.7 wu, 40–60 wu wavelengths), ~30% **sloped** — a **broad swell** (wavelengths 280–400 wu, past the grid, up to `BROAD_RISE` 2.5 wu of end-to-end relief as a regional slope) with a small local octave (`LOCAL_RISE` 0.3 wu) on top. Big height differences map-edge to map-edge on sloped maps, tiny gradients anywhere local — derived from the persisted `elevationSeed` exactly like water derives from `mapSeed` (`app/game/map/elevation.ts`, memoized `getElevation`, own `elevation:` rng namespace so no other seeded pick reshuffles; verified by `elevation.check.ts`). Two invariants everything leans on: the field **is 0 near water and slope-capped away from it** (flat within 1.5 wu of any water edge, then clamped under a `BANK_SLOPE` 0.03 wu/wu cone — banks, bridges, and the whole water render pipeline stay on the plain they were built for, and the bank climb can never steepen no matter how tall the swell) and **slopes stay gentle** (bounded octaves; the check asserts the finite-difference gradient ≤ 0.35/wu). Gameplay: **elevation never blocks placement** — the field is sized so even a cathedral footprint's height spread stays under `MAX_BUILD_SPREAD` (0.5 wu) at every position on every seed (`elevation.check.ts` asserts the worst case); the `footprintSpread` gate in `planPlacement`/`canPlaceAt` survives only as a backstop against future field changes. Hills are visual realism and variety, deliberately not difficulty. **Roads, linear decorations, and walkers follow the surface freely** — elevation blocks placement like water does but never touches output or connectivity (principle 6; the BFS stays adjacency-only). Save v13 mirrors v6: pre-elevation saves get `elevationSeed: null` — forever flat; `?demo` also runs flat so the hand-placed layout keeps placing. Render: the field adds into the one terrain mesh's displacement (`render/terrain.ts` — in-grid now, flowing past the grid edge under the decorative countryside hills), and everything standing on the ground samples the terrain's own bilinear surface through `render/groundLevel.ts` (`setGroundSampler` registered at init; the `bridgeLiftAt` precedent): buildings seat on the **highest ground sample under their footprint** with a stone **foundation-podium skirt** covering the downhill gap (decorations just stand on the ground; aprons, display art, markers ride the seat), cardinal road quads pitch *and* roll to hug the local ground plane (diagonal ribbons chord along their travel), dirt-path chunks vertex-drape, citizens sample under their feet each frame, the placement grid drapes as per-cell polylines, and pointer picking ray-marches the height field with a bisection refine (`render/placement.ts`) — the terrain mesh stays unpickable and frozen.

---

## Population & Workers

- Housing capacity determines maximum population; population drifts toward `min(housing, amenities)` one per month
- Service buildings (Bakery, Tavern) raise the amenity ceiling while staffed — no supply chains, just population-growth thresholds
- Buildings require workers to function; understaffed buildings are inactive

### Worker Allocation — Two-Pass Algorithm
1. Fill all buildings to **minimum staffing**, in priority order
2. Distribute remaining workers up to **maximum capacity** for efficiency bonuses (up to +50% at max staff)

Below minimum: inactive (desaturated, tooltip explains). At minimum: base efficiency. Above: bonus.

---

## Commission Requesters — the Factions *(slice 1 built — July 2026)*

Commissions arrive from patrons: **the Church** and **named noble families** (Medici, Strozzi, Pazzi). Requesters shape a commission's flavor — what's asked for, the artwork's name (the Church draws devotional titles), the reward mix (Church pays florins, nobles pay prestige) — and, since factions slice 1, carry real standing:

- **Patron admission gates the pool.** The pool starts empty — a **Chapel** (or Cathedral) admits the Church, each **Manor** installs the next noble house in table order, and the **Cathedral** additionally opens the Church's upper favor rungs. No offers flow before the first patron is seated (the commissions panel says to build a Chapel). *(This deliberately supersedes the earlier "the pool is never empty" sketch in [factions.md](factions.md).)*
- **Favor, 0–100 per faction** (starts 50). Moves only on player decisions: **+8** per completed work, **−5** per declined or expired open offer. **No time decay, ever.**
- **Rungs by current level** — favor ≥60 / ≥75 / ≥90 multiplies that faction's offer duration, florins, and prestige by up to **2×** (grandeur). The Church's top two rungs also need a standing Cathedral (the grander asks want somewhere to go); favor itself is never capped.
- **Cooled (< 35)**: the faction's offers skip half the time and stay modest (rung 0). **Affronted (< 15)**: near-silence — offers skip 75% — and the first crossing fires a one-time **denunciation**: −15 city prestige and an alert card, the design's single sanctioned citywide consequence. Every rare offer that still lands is the recovery path.
- **Pacing is rare-but-rich**: since missing an offer costs favor, arrivals are ~one a year (`COMMISSION_OFFER_CHANCE` 0.08), announced by an unmissable persistent arrival card, and rewards are buffed to compensate (`FLORINS_PER_PRESTIGE` 40, `COMMISSION_PRESTIGE_SCALE` 1.5).
- **Faction banner UI**: one clickable crest per admitted patron, top-right — its card shows favor %, standing (Affronted/Cooled/Neutral/rung names), the next rung, and hints (cathedral gate, recovery). The offer card in the panel carries a Decline button and "— Nth work" cumulative flavor.

*(Earlier drafts included the Guilds as a third requester group — cut, and the two built guild entries are now removed. Earlier drafts also banned relationship meters and a faction panel; both were deliberately overturned here — the meter earns its keep by moving only on decisions and staying faction-scoped.)*

Future slices, still designed in [factions.md](factions.md): per-family taste jitter, seed-shuffled install order, rivalry pairs, signature commission chains.

---

## Artists

### Types
Painters, Sculptors, Architects *(painters + sculptors spawnable today)*

### Progression
- Seven ranks, earned through continuous XP: **Apprentice → Journeyman → Artisan → Virtuoso → Master → Renowned Master → Grand Master** (XP thresholds: 400 / 900 / 1500 / 2200 / 3000 / 4000 — one completed work = 100 XP; the roster shows each founder's progress, e.g. "640 / 900 XP")
- Steps escalate — each promotion takes years of game time, and top ranks are rare; an artist's full career runs roughly a dozen game years
- Higher rank = faster work, more prestige per completion (every tier changes at least one)
- **City tradition *(built — August 2026; replaced the practice/teaching trickle)*:** the city itself banks XP per discipline (`disciplineXp` — persisted primary state, since the construction contribution isn't recoverable from tiles; save v12 seeds old saves from artists' per-type max XP). Every completion adds `perCompletedWork` (100) + `POOL_PER_PRESTIGE` (10) × the work's prestige to its discipline's pool, and each tick every artist's personal XP is lifted to `FLOOR_FRACTION` (0.25) × their pool (`applyXpFloor` — rank re-derived, never demoted; pools only grow, so the floor is monotonic — principle 6). Personal XP beyond the floor comes from completions only.
- **Arrivals & graduation *(built — August 2026)*:** arrivals are rarer (`ARTIST_ARRIVAL_CHANCE` 0.04, was 0.1) but land already at the tradition floor, as do founders — a newcomer never out-ranks the bench. A newly placed workshop is founded by the discipline's highest-XP non-founder, rehomed from their bench seat (**graduation** — this can slow the donor workshop's member-count pace mid-commission; deliberate), falling back to a fresh floor-level arrival when there's no bench. Razing a discipline's last workshop keeps its tradition banked. Floor promotions raise ranks earlier than the old trickle, so commission offers scale up sooner; the arrival-chance rebalance shifts seeded-run rng outcomes (accepted — draw structure is unchanged).

### Needs
- A staffed workshop with a free slot (artists arrive passively when the city has inspiration)
- A commission to work — whose material cost the city could afford when it was accepted
- City inspiration above zero

---

## Material Suppliers

Suppliers **produce material stock** — the primary scarcity mechanic:

| Supplier | Serves |
|---|---|
| Pigment Trader | Painters |
| Marble Supplier | Sculptors (marble commissions) |
| Bronze Foundry | Sculptors (bronze commissions) |
| Goldsmith | Luxury commissions |
| Timber Yard *(built — July 2026)* | Construction (grand-building `buildCost`) |
| Stone Quarry *(built — July 2026)* | Construction (grand-building `buildCost`) |
| Paper Mill | Scholars, printed works |

**Material stock** *(built — July 2026; a deliberate reversal of the original "materials are never a stockpile" rule — see Key Design Principles #2/#5)*. Each material is one **city-wide pool** that accumulates:

- **Suppliers produce** their material every month while staffed — `supplies: { material, rate, storage }` in `buildings.ts` (all three currently produce 2/month), scaled by staffing efficiency and plaza connection exactly like a florin generator. Deliberately **no diminishing returns**: a second supplier is always more stock (principle 6), and escalating build cost already prices duplicates.
- **Commissions cost a lump sum**, deducted when the player assigns one (`materialCost`, stamped at offer time as `MATERIAL_COST_SCALE × the artwork rank curve × the requester's favor grandeur`). So the grander the ask — higher-ranked artist, higher-favor patron — the deeper the stockpile it demands. Once assigned, **work never stalls on materials**; the stock is already spent (principle 7 — no mid-flight crisis). Razing a workshop reopens the commission but does not refund the materials.
- **Storage is capped**, so waiting can't substitute for building: `MATERIAL_STORAGE_BASE` (20) per material, plus each supplier's own `storage` (20, its material only), plus each **Warehouse** (+50, every material). A top-rank commission at the top favor rung costs 100 — more than one supplier's ceiling — so the grandest asks require a genuinely built-out city, which is the whole point of the system.
- Sculpture commissions still come in **marble or bronze** (bronze the rarer, pricier medium) drawing on **separate pools** — a bronze commission needs a Bronze Foundry, not a full marble store.
- Capacity is not per-artist any more: how many artists can work at once is a workshop-and-worker question, not a material one. The material question is now "can the city afford this commission?"
- **Construction materials** *(built — July 2026, the architects slice)*: **timber** and **stone** are two more pools, produced by the Timber Yard and Stone Quarry, spent not by commissions but by **placing grand buildings** — `BuildingMetadata.buildCost` on landmarks (cathedral 40 stone + 10 timber — a full single quarry's ceiling — manor, bell tower, warehouse) and on blueprint structures (none currently — the blueprint roster is empty, see Architects & Building Commissions), deducted lump-sum in `planPlacement`/`placeTiles` exactly like commission stock at assign. Houses, roads, workshops, decorations, and the suppliers themselves stay florins-only, so a fresh city never bootstraps-deadlocks. Salvage stays florins-only — razing never refunds materials. The build palette shows each bill ("450ƒ · 40 stone") and dims when the stores can't cover it; the placement ghost turns red the same way (`canPlaceAt`).

The pools are five persisted numbers with no routing and no per-building stockpiles — principle 2's ban on granular supply chains survives intact; only the "never a stockpile" clause was traded away.

**Which suppliers a run offers** is planned to be seed-determined — see [map-resources.md](map-resources.md). The **Market's** planned repurpose (spend florins for overflow material capacity) is now a natural small follow-up: florins → pool, an emergency top-up when a commission outruns your suppliers.

---

## Commissions — the Core Loop

**All artwork is commissioned.** There is no free-play "start artwork" button — commissions are how art gets made, giving every work a name, a patron, and stakes.

Each commission has:
- A **requester** (Church / noble family) — flavor and reward mix
- A **required artist type** (painter, sculptor, …) — *stretch:* plus an optional **minimum rank** of that type (see Architects & Building Commissions)
- A **required material** and its **cost in stock**, deducted from the city pool when the commission is assigned — *(built)* sculpture commissions roll marble or bronze; cost scales with artist rank and the patron's grandeur
- A **duration** in months
- A **reward** (florins and/or prestige)
- An optional **deadline** (gentle tension, not punishment)

Flow: commissions are offered periodically → player accepts and assigns to a workshop → the workshop's artists work it (progress each tick while staffed, supplied, and inspired) → completion mints a named **Work** and pays out.

Works displayed in the plaza boost Inspiration permanently.

**Real artwork assets** *(built — Aug 2026)*: mapped artwork titles render as real public-domain art instead of procedural placeholders, keyed by title in `app/game/art/artImages.ts` — unmapped titles keep the procedural canvas/statue variants, so coverage grows title by title with no system change. **Paintings**: Wikimedia PD-Art masters pixelated to 48×60/16 colors (`scripts/make-pixel-art.py`, per-source focal-x crop for wide panels; ~2 KB PNGs in `public/art/`), shown in every `ArtworkThumbnail` (`image-rendering: pixelated`) and overdrawn onto the easel canvas's DynamicTexture when the PNG loads. **Statues**: threedscans.com sculpture scans (no restrictions) decimated to a 600-tri flat-shaded baseline (`scripts/make-low-poly-statue.py` — two-stage cut with floater removal + auto z-up/flip; height-1 GLBs in `public/models/statues/`), loaded through the cached asset-container path into `createStatue`'s holder mesh with the shared marble/bronze materials (loaded meshes re-register as shadow casters via callback — `addShadowCaster` can't see late children). 600 was picked from an in-game 1200/600/300/150 ladder: 1200 reads a fidelity tier above the kit, 300 chunks up complex poses (Hermes); reclining pieces warrant 1200. **Wide statues** *(Aug 2026)*: a loaded scan whose horizontal long axis beats its height by >1.2× (`statueFit` in `art/display.ts`, measured yaw-free from the streamed-in GLB's bounds) is fit-scaled to a 1.2-wu length budget instead of the 0.73-wu display height, and the renderer swaps the slot's round pedestal for a low masonry slab sized to the piece's footprint (`createSlab`; the swap mutates the existing art handle so teardown disposes the slab) — one pedestal decoration serves every statue shape, no new building or slot kind. **Real titles** *(Aug 2026)*: the invented sculpture titles are gone — every entry in the two sculpture pools (`TITLES.sculptor`, `CHURCH_TITLES.sculptor` in `artists.ts`) names a real sculpture that has a real scan, and `STATUE_MODELS` covers all eleven one-to-one (`artists.check.ts` asserts both directions plus the GLB's presence on disk, since the pools and the map live in different files). Secular = antiquities a patron collected all'antica plus Renaissance bronzes (Cincinnatus, the Spinario, Neptune, the reclining Pan — a genuine c. 1535 Sangallo — Theodoric the Great 1513, the Minerva of Arezzo, the Orator, Hermes Fastening his Sandal); church = the Transi of René de Chalon (1547), Saint Hugh, Queen Margaret. **Subject and medium are independent**: the bronze roll (`BRONZE_COMMISSION_CHANCE`) sets the commission's `material` and nothing else, so any sculpture title — the Church's included — can come back as a bronze cast, and the renderer picks marble or bronze at display time from that material, never from the scan. There is deliberately **no bronze title pool**: a separate pool made the medium decide the subject, which is backwards (a patron asks for a Neptune, then for it in bronze) and split a small roster into pieces the player would rarely see. **Real painting titles** *(Aug 2026)*: the same rule now covers the brush — both painter pools name real works, `ART_IMAGES` covers all twenty-four one-to-one, and `artists.check.ts` asserts both directions plus the PNG on disk (and that no title repeats across any pool, since the title *is* the asset key — one collision would silently give two works one image). Secular = portraits, allegories and the city's own trades (Primavera, the Birth of Venus, Lady with an Ermine, Mona Lisa, Botticelli's Man with a Medal, Ghirlandaio's Old Man and His Grandson, Castiglione, the School of Athens, the Tempest, Pallas and the Centaur, Petrus Christus's Goldsmith, Matsys's Moneylender); church = the Annunciation, the Adoration of the Magi, Antonello's Saint Jerome, the Last Judgment, the Madonna of the Goldfinch, the Sistine Madonna, Mantegna's Lamentation, the Baptism of Christ, the Mystical Nativity, Crivelli's Annunciation with Saint Emidius, the Expulsion, the Montefeltro Altarpiece. **Aspect ratio picks the source, not fame**: the 4:5 crop means a near-4:5 panel ships for free and anything past ~1.2 needs a `focal_x` or an official detail crop — wide frescoes (the Last Supper, the Creation of Adam) throw away the part that makes them famous, so they stay benched. Source shortlists — sculpture (1400–1600 focus + license-safe gap fillers): [artifacts/statue-scan-catalog.md](artifacts/statue-scan-catalog.md), painting (60 verified PD-Art works, aspect ratios, benched works and why): [artifacts/painting-source-catalog.md](artifacts/painting-source-catalog.md); step-by-step runbook for both pipelines: [reference/art-pipelines.md](reference/art-pipelines.md).

Multiple commissions run simultaneously; the right panel shows active ones with progress bars.

---

## Architects & Building Commissions *(slice 1 built — July 2026)*

The third discipline is a construction pipeline:

- **Architect's Studio** — the third per-discipline workshop (`architect_studio`, workshop stats, `artistType: "architect"`); hosts and spawns architects. No chimney — drafting, not firing — so no smoke plume; no display slots, since designs aren't displayable art (`SLOT_KINDS_BY_ARTIST.architect = []`).
- **The city teaches architects**: every structure the player places banks XP scaled by the florins **actually spent** into the architect tradition pool (`XP_RATES.perFlorinBuilt` 0.05 → `disciplineXp.architect`, **no studio required** — pre-studio construction spend is banked, not lost; a 1500ƒ cathedral banks 75 ≈ ¾ of a completed work; a fence floors to 0, so decoration spam can't farm XP; a funded 0ƒ blueprint build banks 0). Architects inherit it through the tradition floor; accrued in `placeTiles` before founding, so the first studio's own cost reaches its founder. The construction-fed pool deliberately does **not** count toward the Renaissance tradition gate (see The Goal).
- **Blueprint commissions**: every architect-type offer **is** a building commission — the design for a structure, drawn from `BUILDING_COMMISSIONS` (`commissions.ts`) at the title draw, one shared list for every requester. **The roster is currently empty** (the Baptistery and Loggia were removed Aug 2026; candidate designs live in [building-effects.md](building-effects.md) → Blueprint lane) — while empty, architects receive no offers (an early-out right after the type draw, so rng draw order is untouched either way). The pipeline itself stands ready: a completed blueprint costs **no materials at assign** (the design is intellectual work); completion mints the design as a normal Artwork (favor +8, Renaissance gates, gallery — all the standard completion machinery) **plus a funded-build token** (`fundedBuilds` in the store, collected by the tick). The token surfaces the structure in the Civic palette with a "Funded" badge; placing it costs **0 florins** ("the requester pays construction") **but bills its `buildCost` materials** — a blueprint build waits until the city can quarry its stone (principle 5). One token, one placement; salvage is 0 (the player never paid florins); no refund on raze, like commission stock. Structures are `commissionOnly: true` — never in the open palette, gated authoritatively in `planPlacement`/`canPlaceAt`. Reactivating the lane = one `BUILDING_COMMISSIONS` row + one `commissionOnly` building def.

Still open (see [roadmap.md](roadmap.md)): rank-gated commissions (`minRank`), Town Hall and the Dome as chain capstones, a civic **Commune** requester, a first structure for the emptied blueprint roster, and a distinct model for the studio placeholder.

---

## Inspiration System

- City-wide pool; plazas are the primary generators — the Town Center Plaza plus **formed freeform plazas** (flat 2/month each, organic ×1.15; see Roads → Freeform plazas) *(built)*
- Secondary: decorations, gardens, fountains, displayed Works *(decoration trickles built — July 2026; rates in [building-effects.md](building-effects.md))*
- **Soft spatial** *(built)*: the Main Plaza's bonus radiates through roads with gentle falloff, refreshed by secondary plazas (see Roads → Plaza connection). No in/out cliff — connection is a nudge, not a requirement.
- Zero inspiration halts artist arrivals and artwork progress

---

## Building Categories

**Building design test:** every building must either *unlock* something (a commission type, a population threshold, an artist technique) or *passively boost* something (inspiration, florins, prestige). No building requires active management.

The full roster below is the long-term target, implemented incrementally. *(built)* marks what exists. Effect design for the non-art buildings (which of five effect slots each fills, Manor dual-listing resolution) is detailed in the supplemental [building-effects.md](building-effects.md).

### Civic / Landmark
- **Town Center Plaza** *(built)* — generates Inspiration, displays Works; the **Main Plaza**, the connectivity hub and the one plaza that stays a deliberate founding act. **Plaza / Small Plaza** *(retired — August 2026)*: superseded by freeform plazas (see Roads → Freeform plazas); their defs remain (`retired` flag) so placed ones in old saves keep working, they just left the build palette
- **Cathedral** *(built — July 2026: consecration prestige lump + church elevation — admits the Church and unlocks its upper favor rungs; see Commission Requesters)* — unlocks the Church's grander commissions
- **Market** *(built)* — generates Florins for now. **Planned repurpose:** once a richer economy system takes over money-making, the Market becomes an overflow supply source — spend florins there for extra material capacity when your suppliers are at their limits.
- **Town Hall (Palazzo Comunale)** — the seat of the player's government: a crenellated civic fortress with a tall off-center tower (Palazzo Vecchio / Bargello type). Effect open — candidates: unlocks civic commissions, or a flat prestige boost. Like the Cathedral, it may break the skyline; civic owns that privilege
- **Manor** *(built — July 2026: housing 12 + requester install — each Manor seats the next noble house in table order; see Commission Requesters)* — installs the next noble family as a requester (housing + requester unlock)
- **Banking House** — enables larger noble commissions, boosts florins

### Production / Artistic

Workshops are per-discipline: each hosts and spawns only its own artist type.

- **Painter's Workshop** *(built)* — painters; requires workers and material access
- **Sculptor's Workshop** *(built)* — sculptors; same stats, reuses the workshop model for now
- **Architect's Studio** *(built — July 2026)* — architects, the third discipline; the blueprint-commission pipeline's workshop (see Architects & Building Commissions)

### Suppliers (produce material stock)
- Pigment Trader *(built)*, Marble Supplier *(built)*, Bronze Foundry *(built — bronze sculpture commissions)*, Timber Yard *(built — construction timber)*, Stone Quarry *(built — construction stone)*, Goldsmith, Paper Mill, Glassblower (unlocks stained-glass commissions)
- **Warehouse** *(built — July 2026)* — workerless storage: +50 to every material's ceiling, no production. The way a city banks enough stock for a grand commission without a supplier for every material. A **9×7 storage hall at tavern scale** *(July 2026)* — the biggest thing on the Materials tab, since storage is the one material building that is pure volume: long gable hall, one wide cargo doorway on the gable end, and a timber-post loggia of stacked crates down the street side (reference sheet in `docs/reference/`). Suppliers stay 4×4 sheds with working yards; the warehouse has no yard because it does no work. *(Saves from before the regrow hold the old 4×4 footprint, so the bigger hall can overlap neighbours there — accepted, no migration.)*

### Housing
- Cottage *(built)*, Townhouse *(built)*, Villa, Manor, Grand Manor

### Service (raise population thresholds — built once, then passive)
- Bakery *(built)*, Tavern *(built — its terrace canopy is a striped **fabric awning** since July 2026 (`proc:awning`), the market stalls' cloth language rather than a second tiled roof)*, Market Stall *(built — July 2026: workerless 1×1 street stall, the first `placesOnRoads` building — placeable onto plain cardinal road cells and onto a plaza's outer ring (non-origin perimeter cells only, mask-based so stalls can't erode inward; every plinth slot is interior, so no collisions), overwriting the cell; it conducts plaza connectivity at road cost so a 1-wide path is never severed. Small florin + amenity trickle scaled hard by **real foot traffic** *(July 2026, replacing the original flat sensitivity override)*: `boost = 1 + connectionBonus (1.0) × hubStrength × bustle × catchment`, up to +100% vs the global +25%. **Bustle** (citywide 0..1) is the decorative crowd's population curve normalized (`crowdCurve / BUSTLE_FULL` — the street's visible crowd and the stall's take ride the same number); **catchment** (per stall, 0..1) is base housing capacity within `CATCHMENT_REACH` (15) network cells over `CATCHMENT_FULL` (24), spatial only — occupancy deliberately excluded since bustle already carries population. Both factors are monotonic non-decreasing in population, roads, and houses (adding anything never lowers output — principle 6; the floor everywhere is base rate), fully derived each tick (no per-tile state, no save migration — principle 8), and surfaced as one tooltip line ("Foot traffic: +N%"). Existing low-population saves see stall income/amenities drop from the old flat +100% toward base — intended: an empty city has no shoppers. Knobs in `constants.ts`; model in `app/game/city/traffic.ts` (`traffic.check.ts` asserts the monotonicity guarantees). Reading the actual decorative walkers was considered and rejected: they're render-only, non-deterministic random-walkers (principle 1 keeps them cosmetic). Blocked on bridges, diagonal ribbon cells, and plaza interiors; razing one leaves a re-draggable hole. Model: the kit stall reshaped one-sided — `scripts/make-stall-side.py` slides the awning ridge back so a long slope presents to the street; the Market's booth rows keep the symmetric gable)*, Bathhouse, Apothecary, Public Well

### Social & Cultural Life
- **Library** — boosts inspiration for nearby workshops
- **School** — speeds apprentice development
- **Anatomical Theatre** — artist technique improvements

### Religious & Ceremonial
- **Monastery** — illuminated manuscripts; quiet inspiration
- **Chapel** *(built — July 2026: passive +10 amenity, workerless; admits the Church as a patron — see Commission Requesters)* — neighborhood religious building

### Trade & Economy
- **Wool Merchant** — unlocks tapestry commissions
- **Spice Trader** — prestige + florin boost

### River & Waterfront (future scope — only meaningful on maps with water)
Historically the Arno banks were industry (dyers' quarter, the tiratoi wool-drying sheds, mills on the pescaia weir); ports had docks, fondaco warehouses, customs houses. Inland maps get the river-industry set, coastal maps the port set:

- **Dyeworks** — wool-industry supplier (pairs with the Wool Merchant; serves tapestry/textile commissions)
- **Water Mill** — florin generator; its weir (pescaia) across the river is the visual anchor
- **Docks / Wharf** — coastal trade, florin boost
- **Trading House** — coastal trade, florin/prestige boost
- **Shop-lined bridge** — Ponte Vecchio-style variant of the Stone Bridge; the shops make it a florin generator

Design tension to resolve before building any of these: water adjacency must stay a **soft** bonus per principle 6 — these buildings *prefer* water, they never hard-require it to function. Sitting on/over water cells (mill, shop bridge) is placement gating like the Stone Bridge already has, which is fine; a performance penalty for being inland is not.

### Decorative
- Tree *(built)*, Cypress *(built — stretched/sunk Kenney pine)*, Bell Tower / Campanile *(built — the cathedral's old tower as a freestanding decoration; July 2026: a secondary connectivity hub with an inspiration trickle)*, Fountain *(built)*, Vineyard *(built — dirt furrows planted with rows of vine-on-post trees)*, Olive Grove *(built)*, Colonnade *(built)*, Memorial Column / Obelisk *(built — kitbashed pillar + block + point roof)*, Bush *(built — nature-kit plant variants)*, Rocks + Boulder *(built — nature-kit rocks, limestone tint)*, Wooden Fence *(built — nature-kit rail/plank segments)*, Low Stone Wall *(built — wall-block slab kitbash with end posts)*, Sculpture Display *(built — a placeable stone plinth; displays a sculpture, Phase 9)*, Garden, Gallery Wall, Tower House (casa-torre — slim San Gimignano-style family tower, a skyline element; small inspiration/prestige boost). *(The Loggia left this list twice over — it landed as a civic blueprint-commission structure in July 2026, then was removed from the game in Aug 2026; its design is shelved in [building-effects.md](building-effects.md) → Blueprint lane.)*

### Diversity incentive
- **Diminishing returns** *(built — July 2026, income buildings only)*: duplicate non-housing florin generators of the same building (e.g. a second Market) yield geometrically less per additional building — part of the late-game money rebalance (see Core Resources note on Florins). Not yet extended to non-income buildings.
- **Escalating cost** *(built — July 2026)*: the cost-side mirror — duplicate workshops, suppliers, and services (`costEscalates` in `app/game/buildings.ts`: `artist`/`materials`/`service` types) cost progressively more to build, geometrically by how many of that same building already stand (`COST_ESCALATION`). Landmarks, housing, roads, and decorations stay flat-priced — see Core Resources note on Florins.

---

## Inactive Building Feedback

When a building cannot function it desaturates, activity animations stop, and the hover tooltip states the specific reason — since the material stockpile rework, understaffing is the only such reason ("Needs 2 more workers"); material shortfalls now surface on the commission offer instead ("Not enough marble — 14 / 30 in store"), before any work starts.

---

## The Goal: the Renaissance Milestone *(built — July 2026)*

The Renaissance arrives when the city meets **four gates** — a soft ending, not a game-over screen. (Earlier drafts said "start simple: one number"; the option to grow extra conditions was taken up when this was built.)

- **Prestige** at the threshold (`RENAISSANCE_PRESTIGE`, 500 — dozens of completed commissions plus the cathedral's lump; a full mid/late-game arc)
- **A deep tradition** — a completions-fed discipline pool (painter or sculptor) at `RENAISSANCE_TRADITION_XP` (6000 ≈ 15–20 mid-game works; replaced "any Master artist" in the August 2026 tradition rework — the floor spawns high-rank artists too readily for a personal-rank gate, and a pre-rework Master no longer auto-satisfies it). The construction-fed architect pool is excluded: building spend alone must never satisfy an artistic-mastery gate (revisit if the blueprint roster reawakens)
- **A Wonder on display** — a displayed work of `WONDER_PRESTIGE` (15) quality: an extraordinary work people travel to see. A designation, not a system — the max mintable quality is 20 (`ARTWORK_PRESTIGE` 10 × the 2x prestige-requester skew), so a Wonder takes a top-rank artist on a noble commission, then a display slot. The richer version (signature-chain capstones minting Wonders) arrives with factions ([factions.md](factions.md))
- **Patrons** — a completed work for the Church **and** for 2+ distinct noble houses (`RENAISSANCE_NOBLE_HOUSES`): the stand-in for "favor with each faction" until favor ladders exist — per-requester completed works *is* factions.md's favor count, so this upgrades naturally when that phase lands

All four are derived live from persisted state (`renaissanceProgress` in `app/game/art/renaissance.ts` — no gate tracking of its own; the tradition gate reads the persisted `disciplineXp` pools); the only gate-specific stored bit is the one-shot `renaissanceReached` celebration flag. Crossing shows a title card once — *"The Renaissance has come to your city."*, honoring the Wonder by name *(an earlier draft added a festival event — cut; the card is the celebration)* — and play continues into a Golden Age, the city you keep living in. The prestige chip's hover tooltip carries the four-gate checklist all game (a visible goal, never a hidden wall) and reads "The Golden Age" after.

---

## UI Layout

```
[Logo / Date] [Pause][Play][FF]   [Florins] [Inspiration] [Prestige] [Population]   [Settings]
──────────────────────────────────────────────────────────────────────────────────────────────
│                    │                                          │                            │
│   ARTISTS          │                                          │   CURRENT COMMISSIONS      │
│   ─────────        │                                          │   ──────────────────       │
│   (roster, ranks,  │         3D CITY (Babylon canvas)          │   [Icon] Cathedral Fresco  │
│    work status)    │                                          │      Church — 64% — 6mo    │
│                    │    [Building tooltip on hover]           │   [Icon] Portrait of L.    │
│                    │                                          │      Medici — 38% — 4mo    │
──────────────────────────────────────────────────────────────────────────────────────────────
                  [Housing] [Workshops] [Civic] [Materials] [Decorations]
```

Left panel: artist roster (replaces the faction bars from earlier drafts). Right panel: active commissions. Top-right, under the settings button, a single **right rail** holds the persistent city status in one column: the faction crest banner (one crest per admitted patron → standing card) above, and the **Stores** card below it (pigment / marble / bronze, stock over ceiling — hidden until the first supplier or warehouse stands). Patrons above, what you can answer them with below; both are `Panel` cards at the same width, so the rail reads as one column. *(A centered strip under the top bar was tried first and rejected — floating in dead space with nothing to anchor to.)* Bottom-right: the persistent commission-arrival card and its darker denunciation sibling.

---

## Music & Sound *(built — July 2026)*

The soundtrack is **sporadic, not constant**: single period tracks separated by minutes of silence (90–240 s between tracks; the first track starts right on city load, so a session never opens in silence), so music arrives like a street musician passing through rather than a loop. Which track plays follows the city's arc: tracks are tagged with an **era** and the era is chosen from **prestige** at play time (`ERA_PRESTIGE` in `app/game/audio/music.ts` — Early 0+, Mid 200+, Late 450+, just under the Renaissance's 500), falling back to the nearest lower era that has tracks, so shipping new eras is just appending files to `TRACKS`. Currently two Early tracks (see `CREDITS.md`).

Implementation is deliberately minimal: one `HTMLAudioElement` and one re-armed timer in a module singleton (`startMusic`/`useMusic` in `app/game/ui/useMusic.ts` — a singleton so stale React effects can never leave a second track playing). The menu click calls `startMusic()` inside its own gesture call stack — the one shape every browser's autoplay policy accepts — and a blocked `play()` (e.g. `?demo`, which skips the menu) retries on the next pointerdown. Music keeps playing while the sim is paused — it's ambience, not sim state — and stops on return to the Main Menu. No Babylon sound engine, no sim-RNG coupling. A single volume slider in Settings (`musicVolume` in the store, persisted; 0 = mute, no separate toggle).

**Interaction SFX** *(built — July 2026)*: one-shot sounds on the moments the player acts or the city answers — placement thunk / raze rubble / invalid-click deny, ghost rotate, palette select, pause & speed, panel open/close (book covers), commission assign (ledger thump) / decline (page flip), display clink, the offer-arrival coin-purse jingle (a paying patron), the dark denunciation bell, the completion coin payout, and a pizzicato fanfare when the Renaissance card appears. All fifteen are Kenney CC0 clips (`CREDITS.md`), converted to AAC (Safari plays no Ogg Vorbis), served from `public/sfx/` through a registry + `playSfx(name)` in `app/game/audio/sfx.ts` — cloned `HTMLAudioElement`s so rapid sounds overlap, no `AudioContext` (that upgrade waits for the ambient bed, which needs looping/crossfade). **Attach-point philosophy**: sim-event sounds hook the Zustand store actions and the `tick` action's existing diff signals (`newOffer`, `denounced`, a grown `artworks` list) — never individual buttons, and no blanket click sound; purely interactive sounds (place/raze thunks, deny) hook the input sites in `render/placement.ts` instead of `placeTiles`, so programmatic placement (demo boot) stays silent, and a `play()` rejected by the autoplay policy is dropped silently. `sfxVolume` in the store (persisted, own Settings slider, 0 = mute); `app/game/audio/sfx.check.ts` asserts every registry path has a real file.

**Ambient bed** *(built — August 2026; local-bustle coupling August 2026)*: a single looping crowd-murmur bed that makes the city sound as busy as it looks — and, zoomed in, as busy as the spot you're looking at. Loudness is derived, never a new sim input: `ambienceGain(population, radius, local)` in `app/game/audio/ambience.ts` = a camera-closeness envelope (linear over the camera's radius clamp 3–80, flooring at `ZOOM_QUIET` 0.3 so zooming out quiets but never kills the city) × a cross-fade, by that same closeness, from citywide `bustle(population)` (fully zoomed out — exactly the pre-coupling behavior) to `local` (fully zoomed in — so an empty countryside is silent and a thronged plaza is loud). `local` comes from the **per-tile bustle field** (`createBustleField` in `app/game/city/bustleField.ts`): a sparse per-cell count of the decorative walker figures, maintained by `render/citizens.ts` routing every spawn/arrival/despawn through one `setCell` helper, sampled at the camera focus with a soft kernel (`w = max(0, 1 − d²/r²)`, knobs `BUSTLE_RADIUS` 6 world units / `BUSTLE_LOCAL_FULL` 6 figure-equivalents). This is a render→audio coupling only — figures still have no sim meaning. The field is the intended seam for future bustle-dependent building output (per-tile score, possibly replacing traffic.ts's catchment), but that coupling is deliberately deferred with two blockers on record: figures are unseeded render-side walkers that freeze on pause (consuming them in the tick reverses "count is their only sim coupling" and needs the materials-reversal treatment), and per-tile density dilutes as the walk network grows (naive coupling would let a new road lower a market's take, violating principle 6). The engine (`useAmbience.ts`) mirrors `useMusic`'s module-singleton HTMLAudio shape — menu-click gesture start, pointerdown retry for `?demo`, direct volume sets with no ramp (population steps are tiny, zoom is per-frame continuous, the local sample is quantized to 1% steps) — and the render loop feeds it `camera.radius` + the field sample each frame through no-op-unless-changed setters. Still no `AudioContext`: the loop seam is a crossfade baked into the asset (`scripts/make-ambience-loop.py`, stdlib-only slice + equal-power tail-into-head fold) from Metzik's Visby medieval-market field recording (CC BY 4.0, `CREDITS.md`). `ambienceVolume` in the store (persisted, own Settings slider, 0 = mute); `ambience.check.ts` pins the gain curve's endpoints and monotonicity.

---

## Roadmap

The prioritized backlog lives in [roadmap.md](roadmap.md). Shipped work is documented in the sections above; a per-mechanic rundown of every built system with code references lives in [artifacts/game-mechanics-audit.md](artifacts/game-mechanics-audit.md), kept current: it's updated whenever a feature completes. The old phase-history detail was retired July 2026 (git history keeps it).

---

## Key Design Principles (do not violate these)

1. **No citizen pathfinding micromanagement.** Citizens are abstracted.
2. **No granular supply chains.** Service buildings raise population thresholds — no food routing. Materials accumulate in five city-wide pools and are spent lump-sum when a commission is accepted **or a grand building is placed** — never routed, never per-building, never a stockpile the player manages. *(The original rule read "supplier capacity, never a stockpile"; the stockpile clause was deliberately overturned in July 2026 so material cost could scale with commission grandeur — the anti-simulation half of the rule stands. The placement-spend clause joined with the architects slice: same lump-sum pattern, a different moment.)*
3. **All art is commissioned.** Every artwork has a requester, a name, and stakes. No anonymous grind output.
4. **Favor is a decisions-only meter.** Each patron carries 0–100 favor moved solely by what the player does — completed works up, declined or expired offers down — never by time decay. Consequences stay faction-scoped (that patron's offer rate and grandeur), with one sanctioned exception: the first slide into Affronted costs a one-time denunciation prestige hit. Favor is never a top-bar resource. *(This deliberately overturned the original "no relationship meters" rule — the meter earned its way back in by these constraints.)*
5. **Meaningful scarcity over complexity.** Material stock versus commission cost is the primary constraint — a grand ask should outrun a small city's suppliers and storage.
6. **Soft spatial meaning.** Plaza connection is a nudge (graded bonus with gentle falloff), never a hard cliff. Players are never punished for building something that looks good to them.
7. **Cozy but with real decisions.** Tension from commission deadlines and artist/material scarcity — not crisis management.
8. **Lean resources.** Exactly three headline resources (Florins, Inspiration, Prestige) plus Population as status. Never add a resource the player doesn't make decisions about.
9. **A building must unlock or boost — never require management.**
10. **The Renaissance is a milestone celebration, then a Golden Age to live in** — a soft ending, not a score screen or fail state.
