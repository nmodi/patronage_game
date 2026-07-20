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

- Low-poly isometric 3D
- Warm ochre, terracotta, sandstone color palette
- Tiled ground, terracotta rooftops, cypress trees, fountains
- Plaza pads pave with sett cobbles in rings radiating from the fountain — the street limestone palette, so pattern (not color) marks the focal point
- Building aprons are mottled stone in the same street palette (no slab grid) — buildings join roads quietly instead of sitting on lighter flagstone islands
- **No flat roofs on buildings** — every roof is pitched (gable/hip/point), even if only a shallow pitch; flat kit pieces are allowed only as non-roof slabs (e.g. the colonnade architrave)
- **Category identity, Florence rules** *(built — July 2026)*: categories read at a glance without breaking the one-town look. Roofs stay terracotta city-wide with only minor variation (~1 in 3 leans slightly brown); facades vary per category — housing reads as **warm sandstone** *(July 2026)*: five hand-drawn masonry patterns (coursed rubble, Roman brick, ashlar, stucco-over-stone, smooth plaster) in creamy Tuscan gold-tan — the brief is subtlety: near-solid tone spreads, joints a step darker, mortar as warm as the stones — weighted and position-hashed per house (`STONE_TINTS` in `render/wallTexture.ts`, riding the tint layer); the rest wears the same drawn-masonry family since the **texture pass** *(July 2026)*: category identity rides the position-hashed pattern mix — workshops brick-forward, suppliers rough rubble, services smooth plaster — and civic (palazzo, chapel) gets its own `civic` pattern, large dressed ashlar in pale-but-warm stone (every door/window is a generated stone fitting since the panel-free pass, July 2026); religious buildings wear verde di Prato green (~#58634c), the Duomo's green-and-white language, in two registers *(marble pass — July 2026)*: the **campanile** and the **cathedral's west front** read as white marble inlay — hand-drawn textures in `render/wallTexture.ts`, redesigned in the **marble redesign** *(July 2026, picked off a five-way concept board after the original hairline linework averaged into a grey wash at the 40–90&thinsp;px a storey face fills at gameplay zoom — solid fields and chunky figures survive the downscale, lines don't)*: the tower's shaft (`campanile`) is Giotto polychrome — three framed panel bays per storey, verde outer / rose centre (the centre sits behind each storey's bifora, so the visible bays carry the green; the first cut had it inverted and the tower read pink), white hexagon medallions (the relief cycle) floating in them — and the cathedral wears a **screen facade** (`screen`, San Miniato al Monte language: a five-arch blind arcade with alternating solid verde tympana on the street register under a row of circle-in-square intarsia) — thin slabs hung on the front, with the pediment and sloped aisle-shoulder wedges in a quiet `marble` pattern (field + hairline courses; anything figured stripes across the gable's per-unit u tiling or gets cut by the slope), exactly what the real fronts are, over flanks of **brown rubble** (`flank` — the residences' courses shifted brown, Santa Croce's medieval walls) lined with a five-bay window rhythm (arched clerestories, arched-over-rectangular rows on the aisles); both are panel-free, all fittings generated — including the **landmark portals** *(July 2026)*: voussoir-arched stone frames with double bronze-panel doors under a stone tympanum lunette (`proc:portal-frame`/`proc:portal-leaf`), on the cathedral's three west portals and the bell tower base. The **chapel** wears the portal at parish scale plus arched windows (sides + a small gable lancet) *(panel-free pass, July 2026; round windows were tried and dropped — they read as portholes)*. Verde lives **only in the wall textures** *(stone trim pass, July 2026)*: the green fitting tints (chapel surrounds, cathedral/bell-tower portal frames + bifore + rose ring) were tried and retired — every window/door surround is plain stone. Shape grammar: civic alone breaks the skyline (high gables, spires), workshops = gable + dormer + prominent chimney (painter long hall vs sculptor T head-house), suppliers = low hip roofs + visible stock yards (carts, slabs, crates), services = gable-end street bays + banner signs. Crenellations/battlements are reserved for civic *landmarks* only (Town Hall, future walls/gates) — never on housing, workshops, or ordinary civic buildings. Mechanism: `Part.tint` in `modelManifest.ts` — details in [kitbashing.md](kitbashing.md) (Materials & tinting)
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

**Deliberately NOT resources:** materials are never a stockpile. Pigment, marble, etc. appear only as capacity status on supplier buildings ("Pigment Trader 2/3 painters").

---

## City Building

Players place buildings individually on the grid — houses included. This is deliberate for the current scope: placing houses is satisfying at small-city scale.

**Raze** *(built — July 2026)*: a demolition tool at the end of the build palette. Click removes a structure; holding the button drags a sweep across roads and decorations. Razing salvages half the build cost as florins. Demolitions that hurt — housed artists, an assigned commission — need a deliberate click plus a confirm card ("Its artists will depart; '…' will be set aside"); sweeps pass over them. Downstream systems self-heal: artists depart immediately, the commission re-opens with a fresh expiry, workers and supplier capacity rebalance next tick.

**Later-phase goal:** neighborhood zoning. Players designate zones ("Workers' Quarter") that auto-fill with tier-appropriate housing as prosperity grows. Not current scope; individual placement is the POC baseline it evolves from.

### Housing Tiers
1. Cottage *(built)*
2. Townhouse *(built)*
3. Villa
4. Palazzo
5. Grand Palazzo

Facade language for tiers 3–5 (when built): graduated **rustication** (rough-cut stone base shading to smooth upper floors — Palazzo Medici/Strozzi), **bifora** (two-light arched) windows, string courses between floors, deep Tuscan eaves. Distinguishes fine housing from the stucco of tiers 1–2 without leaving the palette.

**Row-house blending** *(built)*: cottages and townhouses (interchangeably) merge visually when placed side by side — walls and roof stretch to the shared footprint edge so the houses touch, and window panels on the shared wall drop. Isolated houses keep the inset look; a house adjacent on one side stretches only that side. The door side never blends, and blending is mutual (both facing sides must be door-free), so no house stretches into a neighbor's doorway and the look is independent of placement order. Derived at render time from neighbors via the colonnade's extend machinery (`computeBlend` in `mapRenderer.ts`, structural part stretch in `assetLibrary.ts`) — no store or save changes.

---

## Roads

Roads are **player-placed** by dragging stretches, like any building. Grid-aligned (paved variants also drag at 45° — see Diagonal streets). They are light structure/decoration — buildings do not require road connection to function.

**Widths** *(built)*: the grid is subdivided 2× relative to building scale (cells are 0.5 world units; buildings span 4+ cells), so roads come in three widths as build-menu variants — **Path** (1 cell), **Road** (2 cells), **Avenue** (3 cells) — plus a **Dirt Path** (1 cell, packed-earth texture, 10ƒ) for country lanes. Cost is per cell (25ƒ for paved), so wider roads cost more per length. Purely aesthetic + cost choice; all variants carry plaza connectivity identically.

**Diagonal streets** *(built — July 2026)*: road drags snap to 8 octants — the 4 cardinals plus 45° diagonals (Florence's medieval cuts across its Roman grid; boundaries at 22.5°). **All five road variants** drag diagonally (Path/Road/Avenue, plus Dirt Path and the Stone Bridge). A diagonal run is a thin staircase of ordinary road cells, one per ±(1,±1) step (wider roads stamp rows offset one cell along x, keeping the set orthogonally contiguous), with the ribbon orientation stored in the tile's `rotation` field (`1` NE / `3` NW via `app/game/roadStretch.ts`; cardinal roads stay `undefined`, so old saves are untouched — no save migration). The renderer draws those cells as ±45°-rotated, √2-stretched decals forming a continuous ribbon; plaza connectivity and citizen walks traverse diagonal adjacency (step cost 1 — slightly generous vs √2, fine per principle 6). Where a diagonal crosses a cardinal road the shared cell keeps the first placer's orientation; every ribbon cell at a crossing — a cardinal-road 4-neighbor of any surface, or an opposite-diagonal neighbor at either parity (crossing at a shared cell or between cell centers) — swaps its rotated quad for a **junction pad** in directionless mottled stone (paved lanes: the building-apron limestone; dirt lanes: rimless packed earth), so both brick directions terminate cleanly at the pad instead of 45° slabs overlapping straight ones (**junction pads** *(July 2026)*, replacing the old same-texture under-plate — `isJunction` in `app/game/render/roadRenderer.ts`). The pad takes one of two shapes (`junctionKind`): where a cardinal street passes **through** the cell (road neighbors on opposite sides), a convex hexagonal plate — the 45° ribbon strip through the cell (perpendicular end cuts, flush with the neighbor ribbons' brick ends) widened to take in the two cell corners the strip misses, covering the street's full width — and everywhere else (terminal mouths, street-end elbows, bowties) a plain mottle **strip** in the suppressed ribbon's own transform, so lane-side junctions keep the lane's silhouette and just wash quietly over any bricks they graze. (Three cuts rejected on taste: an enlarged 1.5-cell square read as a blob wider than the streets; a cell-square + ribbon-strip union re-created the sawtooth silhouette in mottle; all-hexagon paved lane-side cells into a lump against street ends.) Overlapping pads y-stagger by grid parity instead of z-fighting. Diagonal paved ribbons also carry their own 3-courses-per-√2-cell texture (`getPavedRibbonMaterial`) so slabs match cardinal size — the old shared texture stretched ~41% lengthwise — with quad seams still landing on grout. Diagonal **Dirt Path** renders its 45° runs as a baked decal ribbon with the grass rim on its long edges (`getDirtRibbonMaterial` in `render/paths.ts`) — the cardinal raster overlay is grid-axis-aligned and stays cardinal — and the diagonal **Stone Bridge** carries √2-stretched decks with continuous outer parapet rails (interior lane rails suppressed). By construction a diagonal street is slightly narrower and cheaper per world-length than its cardinal twin — accepted at this cozy scale.

**Stone Bridge** *(built — July 2026)*: a fourth road variant (2 cells wide, 80ƒ/cell) and the only structure placeable on water cells; on land it reads as a stone causeway. Raised limestone deck with parapet rails; carries plaza connectivity and citizens across the river like any road. See the water pass under the Graphics track.

**Snap-to-road placement + 45° buildings** *(built — July 2026)*: holding **Shift** while placing a building snaps the ghost flush against the nearest road within ~6 cells, sliding along it with the cursor and auto-rotated so the building's front faces the road (`app/game/roadSnap.ts`). Against a *diagonal* ribbon the building rotates a true 45° and packs parallel to it; **R cycles 8 rotation steps** (45° each), so diagonal orientation is also a free choice anywhere. Purely an assist per principle 6 — no valid candidate falls through to ordinary free placement, and releasing Shift restores it exactly. Under the hood: `Tile.rotation` 4–7 = quarter (r−4) + 45° (values 0–3 unchanged, so old saves need no migration), and a diagonal building claims a true **diamond cell mask** — the cells whose centers fall inside its rotated rectangle (`footprintMask`, `app/game/buildings.ts`) — not its bounding box, which is what lets it sit flush against a diagonal street. Resolves the former "Diagonal (45°) placement" stretch goal's open questions: footprint = mask, not bbox; plaza connectivity needs no change (mask cells conduct through the existing 4-neighbor adjacency); row-house blending and colonnade extend are deliberately skipped at 45° (diagonal houses render isolated — a follow-up). Display plinths work on 45° hosts (slot cells rotate continuously, landing on the nearest mask cell). Render: models measure/fit in the quarter frame, then take a final +45° yaw; aprons rotate to match; the ghost previews the claimed diamond with the pooled road-preview quads while snapped.

**Plaza connection** *(built — Phase 10)*: roads carry the Main Plaza's reach. The bonus radiates from the **Town Center Plaza** (the Main Plaza; single-instance enforcement is a later addition) through connected roads, fading linearly to zero over 30 road cells (15 world units). **Secondary plazas on the network refresh it to full** — mini-hubs the player is nudged to seed through outlying districts; an isolated plaza radiates nothing. The bonus scales what a building provides, up to **+25%** beside a hub: generator output, workshop commission speed, housing capacity, and service amenities. Purely a carrot — off-network buildings run at full base rate, and the tooltip nudges: "Link to a plaza with roads: up to +25%".

*(An earlier draft specified automatic cluster/hub road generation. Cut — manual placement fits the cozy hands-on scale.)*

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

## Commission Requesters (formerly "Factions")

Commissions arrive from flavorful requesters: **the Church** and **named noble families** (Medici, Strozzi, Pazzi…). Requesters shape a commission's flavor — what's asked for, the artwork's name, the reward mix (Church pays florins, nobles pay prestige).

*(Earlier drafts included the Guilds as a third requester group. Cut — a tighter two-patron cast; tapestry and craft works are simply asked for by the Church and the families. The built `REQUESTERS` table still lists two guild entries, slated for removal whenever it's next touched.)*

**No relationship meters, no neglect consequences, no rivalry systems.** Requesters are narrative texture on commissions, not a management layer. (If the game needs more tension later, meters can return — but they must earn their UI panel.)

A fuller faction system — taste profiles, one-way favor ladders, signature commission chains, a seed-rolled roster — is designed in [factions.md](factions.md). Still flavor-first: no meter ever goes down, no neglect consequences, no faction panel — and the requester pool is never empty, so commissions flow from day one (landmarks gate grandeur and roster growth, never the offer stream).

---

## Artists

### Types
Painters, Sculptors, Architects *(painters + sculptors spawnable today)*

### Progression
- Seven ranks, earned through continuous XP: **Apprentice → Journeyman → Artisan → Virtuoso → Master → Renowned Master → Grand Master** (XP thresholds: 400 / 900 / 1500 / 2200 / 3000 / 4000 — one completed work = 100 XP; the roster shows each founder's progress, e.g. "640 / 900 XP")
- Steps escalate — each promotion takes years of game time, and top ranks are rare; an artist's full career runs roughly a dozen game years
- Higher rank = faster work, more prestige per completion (every tier changes at least one)
- **Light teaching *(built)*:** every artist gains minor passive XP each month just by being in a staffed workshop; a strictly higher-ranked workshop-mate multiplies that rate (generalizes "Master teaches apprentices" — any rank gap teaches). Completing a work stays the big one-time gain. All rates tunable via `XP_RATES` in `app/game/artists.ts`. One multiplier — no lineage tracking, no death events.

### Needs
- A staffed workshop with a free slot (artists arrive passively when the city has inspiration)
- Material supplier capacity for their type
- City inspiration above zero

---

## Material Suppliers

Suppliers have **limited capacity** — the primary scarcity mechanic:

| Supplier | Serves |
|---|---|
| Pigment Trader | Painters |
| Marble Supplier | Sculptors (marble commissions) |
| Bronze Foundry | Sculptors (bronze commissions) |
| Goldsmith | Luxury commissions |
| Timber Yard | Construction, woodworkers, architects (building commissions, when they land) |
| Paper Mill | Scholars, printed works |

Materials are not consumed — a working artist holds a supplier slot until the work completes. When demand exceeds capacity, additional artists of that type cannot work (oldest workshops keep their slots). Players build more suppliers to expand capacity. This forces the core prioritization: which artists get materials? Sculpture commissions come in **marble or bronze** (bronze the rarer, pricier medium), and the two draw from separate suppliers — so a bronze commission needs a Bronze Foundry, not just any sculptor with a marble slot.

**Which suppliers a run offers** is planned to be seed-determined — see [map-resources.md](map-resources.md).

---

## Commissions — the Core Loop

**All artwork is commissioned.** There is no free-play "start artwork" button — commissions are how art gets made, giving every work a name, a patron, and stakes.

Each commission has:
- A **requester** (Church / noble family) — flavor and reward mix
- A **required artist type** (painter, sculptor, …) — *stretch:* plus an optional **minimum rank** of that type (see Later / stretch → Architects & building commissions)
- A **required material** (implies supplier capacity must be available) — *(built)* sculpture commissions roll marble or bronze
- A **duration** in months
- A **reward** (florins and/or prestige)
- An optional **deadline** (gentle tension, not punishment)

Flow: commissions are offered periodically → player accepts and assigns to a workshop → the workshop's artists work it (progress each tick while staffed, supplied, and inspired) → completion mints a named **Work** and pays out.

Works displayed in the plaza boost Inspiration permanently.

Multiple commissions run simultaneously; the right panel shows active ones with progress bars.

---

## Inspiration System

- City-wide pool; plazas are the primary generators
- Secondary: decorations, gardens, fountains, displayed Works *(decoration trickles built — July 2026; rates in [building-effects.md](building-effects.md))*
- **Soft spatial** *(built)*: the Main Plaza's bonus radiates through roads with gentle falloff, refreshed by secondary plazas (see Roads → Plaza connection). No in/out cliff — connection is a nudge, not a requirement.
- Zero inspiration halts artist arrivals and artwork progress

---

## Building Categories

**Building design test:** every building must either *unlock* something (a commission type, a population threshold, an artist technique) or *passively boost* something (inspiration, florins, prestige). No building requires active management.

The full roster below is the long-term target, implemented incrementally. *(built)* marks what exists. Effect design for the non-art buildings (which of five effect slots each fills, Palazzo dual-listing resolution) is detailed in the supplemental [building-effects.md](building-effects.md).

### Civic / Landmark
- **Plaza** / **Small Plaza** / **Town Center Plaza** *(built)* — generates Inspiration, displays Works. The Town Center Plaza is the **Main Plaza** — the connectivity hub; Plazas and Small Plazas (a 5-cell piazzetta, chapel-width) are secondary hubs that refresh its reach
- **Cathedral** *(model built; consecration prestige lump wired — July 2026; commission elevation designed in [building-effects.md](building-effects.md), pending factions)* — unlocks the Church's grander commissions (the Church itself offers from day one — see [factions.md](factions.md))
- **Market** *(built)* — generates Florins for now. **Planned repurpose:** once a richer economy system takes over money-making, the Market becomes an overflow supply source — spend florins there for extra material capacity when your suppliers are at their limits.
- **Town Hall (Palazzo Comunale)** — the seat of the player's government: a crenellated civic fortress with a tall off-center tower (Palazzo Vecchio / Bargello type). Effect open — candidates: unlocks civic commissions, or a flat prestige boost. Like the Cathedral, it may break the skyline; civic owns that privilege
- **Palazzo** *(model built; housing wired — July 2026; requester install designed in [building-effects.md](building-effects.md), pending factions)* — installs the next noble family as a requester (housing + requester unlock — the dual listing is collapsed there)
- **Banking House** — enables larger noble commissions, boosts florins

### Production / Artistic

Workshops are per-discipline: each hosts and spawns only its own artist type.

- **Painter's Workshop** *(built)* — painters; requires workers and material access
- **Sculptor's Workshop** *(built)* — sculptors; same stats, reuses the workshop model for now
- **Architect's Studio** — architects, the third discipline; grows into the building-commission pipeline (see Later / stretch → Architects & building commissions). Timber Yard is their supplier

### Suppliers (capacity-limited)
- Pigment Trader *(built)*, Marble Supplier *(built)*, Bronze Foundry *(built — bronze sculpture commissions)*, Goldsmith, Timber Yard, Paper Mill, Glassblower (unlocks stained-glass commissions)

### Housing
- Cottage *(built)*, Townhouse *(built)*, Villa, Palazzo, Grand Palazzo

### Service (raise population thresholds — built once, then passive)
- Bakery *(built)*, Tavern *(built)*, Market Stall *(built — July 2026: workerless 1×1 street stall, the first `placesOnRoads` building — placeable onto plain cardinal road cells and onto a plaza's outer ring (non-origin perimeter cells only, mask-based so stalls can't erode inward; every plinth slot is interior, so no collisions), overwriting the cell; it conducts plaza connectivity at road cost so a 1-wide path is never severed. Small florin + amenity trickle scaled hard by **real foot traffic** *(July 2026, replacing the original flat sensitivity override)*: `boost = 1 + connectionBonus (1.0) × hubStrength × bustle × catchment`, up to +100% vs the global +25%. **Bustle** (citywide 0..1) is the decorative crowd's population curve normalized (`crowdCurve / BUSTLE_FULL` — the street's visible crowd and the stall's take ride the same number); **catchment** (per stall, 0..1) is base housing capacity within `CATCHMENT_REACH` (15) network cells over `CATCHMENT_FULL` (24), spatial only — occupancy deliberately excluded since bustle already carries population. Both factors are monotonic non-decreasing in population, roads, and houses (adding anything never lowers output — principle 6; the floor everywhere is base rate), fully derived each tick (no per-tile state, no save migration — principle 8), and surfaced as one tooltip line ("Foot traffic: +N%"). Existing low-population saves see stall income/amenities drop from the old flat +100% toward base — intended: an empty city has no shoppers. Knobs in `constants.ts`; model in `app/game/traffic.ts` (`traffic.check.ts` asserts the monotonicity guarantees). Reading the actual decorative walkers was considered and rejected: they're render-only, non-deterministic random-walkers (principle 1 keeps them cosmetic). Blocked on bridges, diagonal ribbon cells, and plaza interiors; razing one leaves a re-draggable hole. Model: the kit stall reshaped one-sided — `scripts/make-stall-side.py` slides the awning ridge back so a long slope presents to the street; the Market's booth rows keep the symmetric gable)*, Bathhouse, Apothecary, Public Well

### Social & Cultural Life
- **Library / Studiolo** — boosts inspiration for nearby workshops
- **School** — speeds apprentice development
- **Anatomical Theatre** — artist technique improvements

### Religious & Ceremonial
- **Monastery** — illuminated manuscripts; quiet inspiration
- **Chapel** *(built — July 2026: passive +10 amenity, workerless; see [building-effects.md](building-effects.md))* — neighborhood religious building
- **Baptistery** — pure prestige; higher-tier Church commissions

### Trade & Economy
- **Wool Merchant** — unlocks tapestry commissions
- **Spice Trader** — prestige + florin boost

### River & Waterfront (future scope — only meaningful on maps with water)
Historically the Arno banks were industry (dyers' quarter, the tiratoi wool-drying sheds, mills on the pescaia weir); ports had docks, fondaco warehouses, customs houses. Inland maps get the river-industry set, coastal maps the port set:

- **Dyeworks / Tiratoio** — wool-industry supplier (pairs with the Wool Merchant; serves tapestry/textile commissions)
- **Water Mill** — florin generator; its weir (pescaia) across the river is the visual anchor
- **Docks / Wharf** — coastal trade, florin boost
- **Fondaco (warehouse)** — coastal trade, florin/prestige boost
- **Shop-lined bridge** — Ponte Vecchio-style variant of the Stone Bridge; the shops make it a florin generator

Design tension to resolve before building any of these: water adjacency must stay a **soft** bonus per principle 6 — these buildings *prefer* water, they never hard-require it to function. Sitting on/over water cells (mill, shop bridge) is placement gating like the Stone Bridge already has, which is fine; a performance penalty for being inland is not.

### Decorative
- Tree *(built)*, Cypress *(built — stretched/sunk Kenney pine)*, Bell Tower / Campanile *(built — the cathedral's old tower as a freestanding decoration; July 2026: a secondary connectivity hub with an inspiration trickle)*, Fountain *(built)*, Vineyard *(built — dirt furrows planted with rows of vine-on-post trees)*, Olive Grove *(built)*, Colonnade *(built)*, Memorial Column / Obelisk *(built — kitbashed pillar + block + point roof)*, Bush *(built — nature-kit plant variants)*, Rocks + Boulder *(built — nature-kit rocks, limestone tint)*, Wooden Fence *(built — nature-kit rail/plank segments)*, Low Stone Wall *(built — wall-block slab kitbash with end posts)*, Sculpture Display *(built — a placeable stone plinth; displays a sculpture, Phase 9)*, Garden, Loggia, Gallery Wall, Tower House (casa-torre — slim San Gimignano-style family tower, a skyline element; small inspiration/prestige boost)

### Diversity incentive
- **Diminishing returns** *(built — July 2026, income buildings only)*: duplicate non-housing florin generators of the same building (e.g. a second Market) yield geometrically less per additional building — part of the late-game money rebalance (see Core Resources note on Florins). Not yet extended to non-income buildings.
- **Escalating cost** *(built — July 2026)*: the cost-side mirror — duplicate workshops, suppliers, and services (`costEscalates` in `app/game/buildings.ts`: `artist`/`materials`/`service` types) cost progressively more to build, geometrically by how many of that same building already stand (`COST_ESCALATION`). Landmarks, housing, roads, and decorations stay flat-priced — see Core Resources note on Florins.

---

## Inactive Building Feedback

When a building cannot function it desaturates, activity animations stop, and the hover tooltip states the specific reason: "Needs 2 more workers", "Pigment Trader at capacity".

---

## The Goal: the Renaissance Milestone *(built — July 2026)*

The Renaissance arrives when the city meets **four gates** — a soft ending, not a game-over screen. (Earlier drafts said "start simple: one number"; the option to grow extra conditions was taken up when this was built.)

- **Prestige** at the threshold (`RENAISSANCE_PRESTIGE`, 500 — dozens of completed commissions plus the cathedral's lump; a full mid/late-game arc)
- **A Master** — any artist ranked Master or above
- **A Wonder on display** — a displayed work of `WONDER_PRESTIGE` (15) quality: an extraordinary work people travel to see. A designation, not a system — the max mintable quality is 20 (`ARTWORK_PRESTIGE` 10 × the 2x prestige-requester skew), so a Wonder takes a top-rank artist on a noble commission, then a display slot. The richer version (signature-chain capstones minting Wonders) arrives with factions ([factions.md](factions.md))
- **Patrons** — a completed work for the Church **and** for 2+ distinct noble houses (`RENAISSANCE_NOBLE_HOUSES`): the stand-in for "favor with each faction" until favor ladders exist — per-requester completed works *is* factions.md's favor count, so this upgrades naturally when that phase lands

All four are derived live from persisted state (`renaissanceProgress` in `app/game/renaissance.ts` — no tracking, no save migration); the only stored bit is the one-shot `renaissanceReached` celebration flag. Crossing shows a title card once — *"The Renaissance has come to your city."*, honoring the Wonder by name *(an earlier draft added a festival event — cut; the card is the celebration)* — and play continues into a Golden Age, the city you keep living in. The prestige chip's hover tooltip carries the four-gate checklist all game (a visible goal, never a hidden wall) and reads "The Golden Age" after.

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

Left panel: artist roster (replaces the faction bars from earlier drafts). Right panel: active commissions.

---

## Development Phases

### Done (Phases 0–11)
- **0 Setup** — project scaffold, empty scene, camera
- **1 Placement** — grid placement, costs, build menu, ghost
- **2 Time** — tick loop, calendar, pause/speed
- **3 Building types** — multiple types, per-type generation
- **4 Population & workers** — housing/amenity caps, two-pass allocation, inactive feedback
- **5 Artists** — arrival, workshops, types
- **6 Artworks** — work progress, XP ranks, prestige on completion
- **7 Suppliers** — capacity gating, blocked-artist feedback
- **8 Commissions** — DONE. System-generated offers (per-month chance, capped open offers, 12-month offer expiry; requesters are flavor strings that skew the florin/prestige mix); one-step assign-to-workshop UI in the right panel; progress per tick; completion mints the named artwork and pays out. Replaced the click-to-start artwork flow. Faction-driven offer generation is a later phase.
- **9 Work display** — DONE. Buildings and plazas carry typed **display slots** (`BuildingMetadata.displaySlots` — `painting`/`statue` interior, `plinth` exterior with a footprint cell); painter works fill painting slots, sculptor works fill statue/plinth slots (`app/game/display.ts` `canDisplayWork` guard, shared by the store actions and both assign UIs). **Two assign flows**: click a slotted building → `DisplayPanel` modal (fill an empty slot from storage, recall a filled one; a direct click on a filled plinth opens that work's detail — driven by the placement controller's idle click → `inspectTarget`), and the Gallery codex's per-work "Display at… / Recall". **Incentive (both, small)**: every displayed work trickles city **Inspiration** per tick scaled by its captured commission prestige — except church hosts (cathedral, chapel), which trickle **Prestige** — and the host runs **+5% more effective per work, capped +25%**, a second scalar threaded beside plaza connectivity through the tick, `computeCityMetrics`, and `progressArtworks` (`computeDisplaySummary`). **Render** (`app/game/render/displayArt.ts`): a plinth shows a stone pedestal always (empty = an invitation) + a marble statue when filled (the citizen figure re-posed via `createStatueMesh`); paintings display on a free-standing framed **easel** out front with a procedural hashed canvas — a wall-flush canvas got lost against the ornate low-poly kit facades, so it stands in the open like a statue. New **Sculpture Display** decoration (a placeable plinth). Raze self-heals: a razed host's works return to storage and the confirm card warns. No save migration — the new `Artwork.prestige`/`displayedAt` fields are optional. *Still open: displayed art is placeholder procedural (custom low-poly statue/painting models later); single-Town-Center-Plaza enforcement still carries over from Phase 10.*
- **10 Plaza connectivity (soft spatial inspiration)** — DONE, reframed from radius to network distance: the bonus radiates from the Main Plaza (Town Center Plaza) through roads with linear falloff (zero at 15 tiles), refreshed to full by secondary plazas on the network (`app/game/connectivity.ts` 0-1 BFS). Up to +25% by connection strength: generator output + service amenities (tick), commission progress (`progressArtworks`), housing capacity (`getHousing`); tooltip shows the current % or the "Link to a plaza with roads" hint. Gives roads a purpose; never a requirement or penalty. *Still open: enforce a single Town Center Plaza per city.*
- **11 Artist training & light teaching** — DONE. XP is now continuous instead of purely completion-driven: every artist in a staffed, active workshop gains small passive practice XP each month, multiplied when a strictly higher-ranked workshop-mate shares the space (generalizes "Master teaches apprentices" to any rank gap), and completing a work still grants its one-time bonus on top. Rank-up thresholds are unchanged. All rates live in `XP_RATES` (`app/game/artists.ts`, next to `RANK_XP`) for easy tuning. No UI or save changes — rank labels already surfaced rank-ups, and `Artist.xp` was already a fractional-friendly optional field.

- **12 Renaissance milestone** — DONE (July 2026). Four derived gates — prestige threshold, a Master-rank artist, a Wonder on display, Church + noble-house patrons (see The Goal) — checked live by `renaissanceProgress` (`app/game/renaissance.ts`, knobs in `constants.ts`); a one-shot celebration card (`RenaissanceCard.tsx`) dismissed into the persisted `renaissanceReached` flag (no migration — absent reads falsy), and the milestone checklist rides the prestige chip's hover tooltip. Play continues.

### Next
- All numbered phases are done — next work draws from Later / stretch (factions, map resources, zoning, architects & building commissions, …).

### Later / stretch
- Richer economy system (replaces the Market as the primary florin source; Market repurposed as overflow material supply, bought with florins when suppliers are maxed)
- Seed system — a run seed randomizes each new game. Randomly generated per new game as a relatively short alpha string (human-readable/shareable), viewable in the settings menu. *Partially built: the `seed` field now exists (`app/game/seed.ts`, persisted in the store, shown in Settings) and deterministically picks the starting city name (`pickCityName`) — and, since the water pass, the map archetype, river course, and coastline (`app/game/water.ts` via the store's `mapSeed`, which equals the run seed for new games). Resources/factions below are still open.* It should influence:
  - Terrain: heights and wilderness scatter *(built — July 2026)*: `createTerrain` takes `mapSeed` and derives namespaced streams via `seededRng` — `hills:` (sine-octave phases + ±20% frequency jitter; amplitude fixed), `scatter:` (returned as `terrain.rand`, drives `assetLibrary.scatterEnvironment`: tree clumps, shrubs, rocks, vineyard patches, fence/wall runs), `fields:` (field-patch colors). Null `mapSeed` (pre-water saves) falls back to the old fixed constants, so legacy scenery is pixel-identical. (`?demo` now runs on the fixed `DEMO_MAP_SEED` — an inland river — so it gets seeded terrain like a real game.) Note: placed-building variety stays position-hashed, deliberately not seeded — see [kitbashing.md](kitbashing.md) (Design rules).
  - Available resources on the map (which suppliers/materials this run offers) — designed in [map-resources.md](map-resources.md)
  - Faction archetypes / personality types — different archetypes value different things and ask for different commissions — designed in [factions.md](factions.md)
  - Types of commissions that pop up
  - (Open list — more dimensions as they come up)
- Per-plaza paving choice — restyle any placed plaza in-game between the three paving treatments. All three drawers already exist in `render/paths.ts` (previewable via the `?plaza=` dev flag):
  - **Radial cobble rings** (shipped default) — sett cobbles in rings radiating from the fountain, street-limestone palette; the ring geometry points at the centerpiece (ref: Roman sampietrini)
  - **Terracotta herringbone** — warm brick herringbone field at 45° framed by a pale travertine border course; echoes the rooftops, strongest color pop (ref: Siena, Piazza del Campo)
  - **Grand travertine slabs** — large creamy slabs on the diagonal framed by the darker street limestone; quietest, reads as "finer stonework" (ref: Florentine piazzas)
  - Implementation notes: needs per-tile style state (the unused `Tile.variant` field fits), a first click-to-select interaction (`pickGridCell` → `tiles["x,y"]` → origin, same lookup the hover tooltip uses), and a style-picker popover. The renderer diffs tiles by object identity, but `renderOrigin`'s rebuild guard only checks `buildingId`/`extendKey` — the style must join that condition, and the pad batch keys (`pad:<size>:<style>`) already support per-style batches.
- Neighborhood zoning (zones auto-fill with tier-appropriate housing)
- Housing tiers 3–5; named family palazzos
- **Architects & building commissions** — the third discipline grows into a construction pipeline, in three pieces that can land separately:
  - **Architect's Studio** — the third per-discipline workshop; hosts and spawns architects, Timber Yard as their supplier. Early on architects contribute little — by design; their value compounds via the next two pieces.
  - **The city teaches architects**: every structure the player places grants architects in an active studio a small XP lump **scaled by build cost** (a cathedral teaches much, a fence almost nothing — cost-scaling also stops decoration spam from farming XP). A fourth XP source alongside Phase 11's practice / teaching / completion, living in `XP_RATES` like the others. A mature city thus has a seasoned architect ready when the grand asks arrive.
  - **Rank-gated commissions**: a commission may require not just an artist type but a **minimum rank** of it ("requires a Virtuoso architect"). The ordinary offer stream stays actionable — it only rolls requirements at or below the city's current best of that type; asks *above* your best appear solely on the favor ladder's upper rungs and signature chains ([factions.md](factions.md)), as aspirational carrots that wait patiently (an unmet rank gate never expires a chain or punishes — principle 7).
  - **Building commissions**: factions eventually ask for *structures*, not just artworks — a family loggia, a chapel, the Dome itself as the Church chain's capstone. Leading model: the commission is the **design** — an architect works it like any commission (progress, supplier slot, duration), and completion unlocks the structure with the requester funding construction; the player still chooses where it stands, since placement staying in player hands is core. Alternatives (auto-placement, part-subsidized cost) stay open until built.
- Expanded building roster (religious, trade, social categories; River & Waterfront set — gated on the water-adjacency design noted in that section)
- **Lungarno row** — a taller riverfront housing variant that blends into a continuous wall along the water (the Florence lungarno look), reusing the existing row-house blending machinery (`computeBlend`)
- **Diagonal (45°) placement** *(built — July 2026; see Roads → Snap-to-road placement + 45° buildings)*. Open questions resolved: diagonal footprints claim a true cell mask (not the bounding box), plaza connectivity flows through mask cells unchanged, and row-house blending / colonnade extend are skipped at 45° in v1. Junction autotiling (plates under diagonal-owned crossings) and diagonal drags for Dirt Path / Stone Bridge are now built (see Roads → Diagonal streets). Remaining follow-up: diagonal row-house blending (a diagonal terrace along a diagonal street).
- **More map archetypes** — extend the seeded water system (`app/game/water.ts`, rolled from `mapSeed`) with new archetypes beyond inland/coastal/dry/scenic. First candidate: **Lake** — an enclosed body inside or clipping the buildable grid (fed by the existing river course), giving lakefront placement and Stone Bridge crossings without a full coast. Reuses the existing archetype roll, water-cell gating, and bridge/water rendering; mainly a new water-cell shape + probability-table slot. Also: **hide grid tiles over water** so the placement grid only draws on buildable cells, making it visually obvious where building is (and isn't) allowed — the grid is already hidden except while placing (`render/paths.ts`), so this is a water-cell mask on that overlay.
- **Main menu screen** *(built — July 2026)* — boot lands on a title menu (`app/game/ui/MainMenu.tsx`): **Continue** (peeks the save straight from localStorage, no store hydration; hidden when there's no compatible save), **New Game** with an optional typed seed *or* a map-archetype pick (`seedForArchetype` in `app/game/seed.ts` rejection-samples fresh seeds until the archetype rolls — the seed stays the only map truth, so a picked map is still shareable), and a demo-city tour link (`?demo` is no longer dev-only; its no-op storage still protects the real save). Starting over an existing save asks first. The in-game Settings panel gained a **Main Menu** button — a full page reload, the one clean path back that also exits demo mode. Visiting the menu never touches the save: hydration only happens on Continue.
- Campaign scenarios

### Graphics track (parallel)

Art direction: free CC0 packs — Kenney Fantasy Town Kit (buildings/props, kitbashed per building) + Kenney Nature Kit (trees), retinted to the Mediterranean palette by editing the kits' shared `colormap.png` (see `scripts/retint-colormap.py`; models in `public/models/`).

- **G1 — Model pipeline** *(done)*: `modelManifest.ts` prefab definitions, glTF loading, footprint-fit scaling, active/desaturated material sets, model placement ghost
- **G2 — Terrain** *(done)*: flat-shaded ground, hills, tree scatter, fog horizon. Wilderness pass (July 2026): denser tree clumps, shrub blobs, rocks/boulders, vineyard patches, and very rare old fence/stone-wall runs on the surrounding hills (`assetLibrary.scatterEnvironment`)
- **G3 — Ground dressing** *(done)*: kit path pieces for roads, composed plaza, grid hidden except while placing. Plaza paving pass (July 2026): plaza pads draw radial cobble rings (`render/paths.ts` `drawPlazaCobble`) instead of the shared flagstone; two alternate styles (herringbone, travertine — see stretch goals) ship in code behind the `?plaza=` dev flag. Also fixed pads rendering at y=0 under the building aprons — pads had been invisible since batching. Apron pass (July 2026): aprons switched from the palest flagstone (read as lighter islands under every building) to the dirt-path mottling recolored to the street limestone (`getApronMaterial` — no slab grid, quiet stone yards); decorations (fountain, obelisk, colonnade, bell tower) keep their small plinth aprons, and the market pad shares the same mottled stone
- **G4 — Life & polish** *(done)*: chimney smoke on active buildings (July 2026: gated to production buildings only — the palazzo's chimney no longer smokes), landmark label pins, rendering pipeline grade
- **Generated kit pieces** *(done — July 2026)*: the workhorse pieces are built in code, not loaded — `proc:block`, `proc:roof-gable`, `proc:gable-end`, `proc:roof-hip` (`render/proceduralPieces.ts`, entering through `getContainer`'s `proc:` branch so batching/tinting/desaturation are unchanged). A tint multiplies a whole part at once and the kit baked rival details onto one material, which made three things unfixable: `wall-block` was 56 of 76 triangles of **corner quoin** (the orange bars on every cottage were Kenney's, not a choice — Florentine stucco housing has plain corners), and `roof-gable` carried its **gable wall on the tile material**, so a pink house got a brown gable. Roofs also had zero tile geometry — flat-shaded orange. Now: plain 12-triangle block (which also stretches to 8× invisibly where the manifest uses it as a crate/slab/nave), tile-only roof with modeled coppi courses (14 across × 4 lapped rows down each slope, plus a ridge cap), and the gable end as its own part tinted `"facade"` so it matches the wall. Commissioning these was considered and dropped — a flat-coloured cube has no art in it. **Colour is the subtle part**: the kit's "flat" colours aren't flat — the colormap is unpadded gradient bands and every UV is a point sample, so Kenney bakes an *ambient-occlusion ramp* into the stucco (`#c6bba4` at the footing to `#f3e4c9` at the eave). Replacing that ramp with its brightest band made every wall glow; it's rebuilt as **vertex colours**, which also give the roof its per-tile variation. The scene lights a sunlit face at ~1.9×, so a generated piece may never be brighter than the kit swatch it sits beside or it clips (a hand-picked roof base rendered sunlit slopes pale sand). **Scope**: no kit roof is left — `proc:roof-hip` (coppi up the fall line, cut at the hips under hip ridges) took `roof-point`/`roof-high-point`, and the gable took `roof-gable-end`/`roof-high-gable`, whose steeper pitch is just a y-scale. Tile counts ride in the piece id (`proc:roof-gable@51x7`, `procRoofFile`), so a stretched ref renders *more* tiles instead of fatter ones and a coppo is the same size on a cottage as on the cathedral's 3.6×-stretched aisle. With every roof generated, `TILE_BASE` is the whole city's roofline in one constant, deliberately browner and less saturated than Kenney's orange tile (hue 19 / saturation 34 vs 14 / 48) to match Florence's rooftops; `ROOF_PALETTE` now only varies it (~8% cool wash on one roof in three). **Panel-free pass** *(July 2026)*: the kit's door/window/arch wall panels hit 0 refs — every opening across the roster (workshops, palazzo, chapel, suppliers, tavern, bakery) is a generated fitting via the manifest helpers (`windowOn`/`doorOn`/`archWindow`/`portalOn`; former round-window sites use `archWindow` — a generated oculus ring was tried and dropped, it read as portholes), which retired the corner-quoin z-fight flicker, the `mint` texture tint, and `make-mint-quoins.py`. The three suppliers were rebuilt bigger in the same pass (sheds 1.25–1.35 kit units, yards tucked inside the fit) — they'd read cottage-annex small. State of play and the open work: [procedural-pieces.md](procedural-pieces.md); measure any kit piece with `scripts/sample-kit-colour.py`.
- **Category identity pass** *(done — July 2026)*: facade/roof tint system + per-category shape grammar and props, see Visual Style. Twins broken: painter vs sculptor workshop (dormer + big chimney vs cross-ridge head-house), bakery vs cottage (projecting gable-end shop bay + oven chimney + banner), marble supplier vs cottage (squat hip roof + cart/slab stock yard); pigment trader's spire squashed to a low hip (spires read civic); townhouse's banner removed (banners = commerce signage)
- **G5 — Stretch** *(mostly built)*: river + bridge *(built — see Water pass below)*, decorative citizens *(built — `render/citizens.ts`, cosmetic meeples random-walking roads/plazas/markets; July 2026: the crowd size scales with **population** — matching it exactly while low and countable, damped toward a hard cap beyond (`crowdSize` in `app/game/crowd.ts`), clamped by walk-network size — and figures render as thin-instance batches (`createThinInstanceFigureFactory`, 15 draw calls for any crowd size). Count is the only sim coupling: still no pathfinding, no sim meaning (principle 1). `&crowd=<n>` dev flag forces the count for screenshots/perf runs)*, boats, banners, obelisk model *(built — kitbashed decoration, see Decorative roster)*
- **Water pass** *(built — July 2026)*: every new game rolls a seeded **map archetype** — **inland** (a river meanders edge-to-edge through the buildable grid, 30%), **coastal** (a sea clips a waterfront strip off one grid edge; the river widens into an estuary and flows into it at a mouth, 30%), **dry** (the classic waterless plain, 15%), **scenic river** (the river runs through the countryside beyond the grid — pure scenery, 15%), or **scenic coast** (sea + estuary entirely beyond the grid edge, 10%). Scenic water keeps ≥1.5 wu clear of the buildable area (asserted in `water.check.ts`), so those maps play exactly like dry ones. The river continues past the grid through a carved valley to the fog line, so it never reads as a canal. Water cells block building — the game's first terrain affordance (an affordance, not a punishment: principle 6 governs bonuses, and old saves stay untouched) — and the **Stone Bridge** (Roads tab, 80ƒ/cell, `roadWidth: 2`, also placeable on land as a causeway) is the one structure allowed onto water; being `type: "road"` it carries drag placement, plaza connectivity, and citizen walks across for free (limestone parapet rails drop on sides that continue onto road/civic cells — `mapRenderer.ts` bridge batch). Sim: `app/game/water.ts` (import-free, verified by `water.check.ts`) derives all water cells from the persisted `mapSeed`; the single sim gate is in `placeTiles`, mirrored by the placement previews. Save v6 is the first *preserving* migration: pre-water saves get `mapSeed: null` — forever dry, since a newly rolled river would collide with their buildings. `?demo` runs on the fixed `DEMO_MAP_SEED` (`demoLayout.ts`, an *inland* river down the east) — its hand-placed city sits clear on the west bank, crossed by a Stone Bridge to a countryside estate (`demoLayout.check.ts` replays the whole layout against that seed's water to prove nothing collides). Render: the terrain mesh carves a dilated channel/valley/sea floor (`render/terrain.ts`), and `render/waterMesh.ts` builds fine bed/bank/shore ribbons plus a gently wobbling flat-shaded water surface — the codebase's first animated material (CPU vertex wobble + per-face normals on a `StandardMaterial`, so fog and the color grade apply for free). Wilderness scatter avoids the water. Estuary fix (July 2026): the river-meets-sea junction is a proper funnel — the water strip flares across the mouth and ducks under the sea sheet, river banks and the nearby shore dive underwater (shading to bed tone) instead of ending on cut faces, the terrain carves a matching mouth funnel, and terrain facets near water tint by rendered depth (fully submerged = bed, touches the waterline = sand) so no dry-dark carve pokes through the junction.

Dev helpers: `/?demo` seeds a visual test city, `&pause` freezes the tick for stable screenshots, `&map=<seed>` forces a specific map (water archetype / river course / coast) for iteration — works with `?demo` too, `&cam=x,z[,radius[,alpha[,beta]]]` frames a world position for headless screenshots.

---

## Key Design Principles (do not violate these)

1. **No citizen pathfinding micromanagement.** Citizens are abstracted.
2. **No granular supply chains.** Service buildings raise population thresholds — no food routing. Materials are supplier capacity, never a stockpile.
3. **All art is commissioned.** Every artwork has a requester, a name, and stakes. No anonymous grind output.
4. **Requesters are flavor, not a management layer.** No relationship meters unless they earn their way back in.
5. **Meaningful scarcity over complexity.** Supplier capacity is the primary constraint.
6. **Soft spatial meaning.** Plaza connection is a nudge (graded bonus with gentle falloff), never a hard cliff. Players are never punished for building something that looks good to them.
7. **Cozy but with real decisions.** Tension from commission deadlines and artist/material scarcity — not crisis management.
8. **Lean resources.** Exactly three headline resources (Florins, Inspiration, Prestige) plus Population as status. Never add a resource the player doesn't make decisions about.
9. **A building must unlock or boost — never require management.**
10. **The Renaissance is a milestone celebration, then a Golden Age to live in** — a soft ending, not a score screen or fail state.
