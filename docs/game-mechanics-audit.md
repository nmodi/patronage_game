# Patronage — Game Mechanics Audit
*Generated July 2026. A complete rundown of every implemented game mechanic with code references, followed by an audit of the `docs/` folder: which planned mechanics are built and which are not.*

This is a snapshot of the code as it stands, cross-checked against the design docs. Line numbers are approximate (they drift with edits); the file + function names are the durable references. Balance constants are pulled from `app/game/constants.ts` unless noted — per-building stats live inline in `app/game/buildings.ts`.

---

# Part 1 — Mechanics rundown

## 1. Time & the tick loop

| Mechanic | What it does | Code |
|---|---|---|
| **Monthly tick** | One tick = one game month. Fixed pipeline each tick: gather staffable buildings → allocate workers → activate tiles → material blocking → plaza connectivity → display summary → city metrics + population drift → occupancy → diminishing returns → generation → artist arrival → commission reconcile/offer → artwork progress. Returns a `TickTransition`, preserving object identity for unchanged arrays. | `app/game/tick.ts` → `advanceTick()` |
| **Clock / speed** | `BASE_TICK_INTERVAL = 1500`ms real time per tick; speed multipliers `[1, 2, 3]`. | `constants.ts`; store `tick()` in `app/stores/useGameStore.ts` |
| **Calendar** | Month = `MONTH_NAMES[tick % 12]`, year = `1400 + floor(tick / 12)` → "May 1482". | `useGameStore.ts` → `formatMonth` |

## 2. Workers & labor (two-pass allocation)

| Mechanic | What it does | Code |
|---|---|---|
| **Two-pass allocation** | Stateless each tick. Pass 1 fills every building to `workersRequired` in priority order (a building the pool can't fully staff gets 0 — no partial staffing). Pass 2 distributes surplus up to `maxWorkers`. Priority `TYPE_PRIORITY`: service 0, materials 1, artist 2, city 3, else 9; ties by key. | `app/game/workers.ts` → `allocateWorkers()` |
| **Staffing efficiency** | Output scales linearly from 1× at minimum staff to `1 + MAX_STAFFING_BONUS` (**1.5×**, +50%) at max staff: `1 + 0.5·max(0, workers−required)/(maxWorkers−required)`. | `workers.ts` → `staffingEfficiency()` |
| **Activation gate** | A tile is active only when `workers ≥ workersRequired`; workerless buildings (`workersRequired === 0`) are active on placement. Inactive → generates nothing, no amenities, desaturated in render. | `tick.ts`; placement default in `useGameStore.ts` → `placeTiles()` |

## 3. Materials / suppliers (the core scarcity mechanic)

| Mechanic | What it does | Code |
|---|---|---|
| **Supplier capacity gating** | Materials are never a stockpile — a working workshop holds a supplier *slot* until its artwork completes. Capacity = Σ `supplies.capacity` over staffed suppliers, per material. When demand > capacity, oldest workshops (by `builtTick`, then key) keep slots; the rest are blocked. Keyed per material (marble vs bronze don't cross-allocate). | `app/game/materials.ts` → `computeSupply()`, `getSupply()` |
| **Material blocking** | Each working artist checks its commission's material (or type default); if the workshop isn't in that material's `allowed` set, the workshop is deactivated this tick. | `tick.ts` |
| **Material defaults** | painter→pigment, sculptor→marble; bronze only from an explicit commission material (rolled at offer time). | `materials.ts` → `MATERIAL_BY_ARTIST_TYPE`, `commissionMaterial()` |
| **Blocked-reason strings** | "No X supplier" / "X at capacity" for tooltips. | `materials.ts` → `blockedReason()` |

## 4. Plaza connectivity (soft spatial)

| Mechanic | What it does | Code |
|---|---|---|
| **Connectivity BFS** | The Main Plaza (`town_center_plaza`) radiates through roads via a 0–1 BFS (roads cost 1/cell, any plaza/hub cell resets distance to 0). Building strength = best adjacent network cell with linear falloff: `max(0, 1 − dist/PLAZA_REACH)`. `PLAZA_REACH = 30` road cells; `PLAZA_CONNECTION_BONUS = 0.25` at full strength. Memoized by tiles identity (WeakMap). A nudge, never a gate. | `app/game/connectivity.ts` → `computePlazaConnectivity()` |
| **Hubs / conductors** | Hub set = plazas + `isHub` buildings (bell tower), derived from metadata via `PLAZA_IDS`; road-cost conductors via `ROAD_OVERLAY_IDS` (e.g. market stall). | `connectivity.ts` |
| **Plaza boost application** | `plazaBoost = 1 + connectionBonusOf(meta)·strength·trafficFactor`. Multiplies generation (tick), housing & amenities (metrics), commission pace (artists). Per-building bonus override via `connectionBonus` metadata (default 0.25). | `tick.ts` `plazaBoost`; `metrics.ts`; `artists.ts` `progressArtworks()` |

## 5. Foot traffic (market stall)

| Mechanic | What it does | Code |
|---|---|---|
| **Traffic factor** | For `footTraffic`-flagged buildings only, the plaza bonus additionally scales by real traffic: `boost = 1 + connectionBonus·hubStrength·bustle·catchment`. Both factors 0–1 and monotonic non-decreasing (adding pop/roads/houses never lowers output). Unflagged buildings return factor 1. | `app/game/traffic.ts` → `trafficFactor()` |
| **Bustle** (citywide) | `min(1, crowdCurve(pop)/BUSTLE_FULL)`, `BUSTLE_FULL = 60` — the visible crowd's own curve. | `traffic.ts` → `bustle()` |
| **Catchment** (per stall) | FIFO BFS over network cells up to `CATCHMENT_REACH = 15`; sums housing of adjacent houses, normalized `min(1, cap/CATCHMENT_FULL)`, `CATCHMENT_FULL = 24`. Spatial only. Memoized by tiles identity. | `traffic.ts` → `computeCatchment()` |

## 6. Crowd (sim → visual; feeds bustle)

| Mechanic | What it does | Code |
|---|---|---|
| **Crowd curve** | Exact 1:1 with population up to 20; beyond, `20 + round(6·√(pop−20))`. This number feeds bustle. Figure count also clamps to a cap (240) and one figure per 2 walkable cells. | `app/game/crowd.ts` → `crowdCurve()`, `crowdSize()` |

## 7. Population & city metrics

| Mechanic | What it does | Code |
|---|---|---|
| **Housing / amenity caps + drift** | `populationCap = min(housing, amenities)`; population moves toward the cap by `POPULATION_DRIFT_PER_MONTH = 1`/month. | `tick.ts` |
| **City metrics** | `housing = Σ round(meta.housing·boost)`; `amenities = BASE_POPULATION_CAP(15) + Σ round(meta.amenities·boost)` over active tiles, `boost = plazaBoost·displayBoost`. | `app/game/metrics.ts` → `computeCityMetrics()`; store `getHousing()` |

## 8. Economy — income, rent, cost curves

| Mechanic | What it does | Code |
|---|---|---|
| **Occupancy-scaled rent** | House income × `occupancy = min(1, population/housing)`, so empty houses pay little and total rent is bounded by population. | `tick.ts` |
| **Income diminishing returns** | Duplicate *non-housing* florin generators of the same id decay geometrically, oldest-first: the Nth yields `INCOME_DIMINISHING_RETURNS(0.85)^N`. Housing excluded (occupancy handles it). | `tick.ts` |
| **Generation** | Per active origin: `efficiency = staffingEfficiency·plazaBoost·displayBoost`; `florinDelta += income·efficiency·incomeScale`; `inspirationDelta += inspiration·efficiency`. | `tick.ts` |
| **Cost escalation** | Duplicate workshops/suppliers/services (`type` ∈ artist/materials/service) cost `round(baseCost·COST_ESCALATION(1.15)^rank)`, rank = build order among standing siblings. Landmarks/housing/roads/decorations stay flat. Priced live off the tile map, no persisted counter. | `app/game/buildings.ts` → `costEscalates()`, `escalatedCost()`, `buildOrderRank()` |
| **Raze salvage** | Refund = `floor(escalatedCost(rank)·RAZE_SALVAGE_FRACTION(0.5))` — tracks the escalated price actually paid. | `app/game/raze.ts` → `getRazeSalvage()` |
| **Starting economy** | `STARTING_FLORINS = 3000`; inspiration/prestige/population start at 0. | `constants.ts`; `useGameStore.ts` |
| **Consecration lump** | Cathedral pays a one-time `prestigeOnBuild = 25` on placement. | `useGameStore.ts` → `placeTiles()` |

## 9. Artists, XP & teaching

| Mechanic | What it does | Code |
|---|---|---|
| **Passive arrival** | Each month, if inspiration > 0 and an active workshop has a free slot past its cooldown, chance `ARTIST_ARRIVAL_CHANCE = 0.1` an apprentice arrives (cooldown `ARTIST_ARRIVAL_COOLDOWN_MONTHS = 2`). | `app/game/artists.ts` → `maybeArriveArtist()` |
| **Continuous XP / teaching** | Every artist in an active workshop gains `practicePerMonth(2)·(taught ? teachingMultiplier(3) : 1)` XP/month; "taught" = ranked below a workshop-mate. Completing a work = `perCompletedWork(100)` for every member. | `artists.ts` → `progressArtworks()` XP block; `XP_RATES` in `constants.ts` |
| **Rank thresholds** | Seven ranks by cumulative XP (never demotes): journeyman 400 / artisan 900 / virtuoso 1500 / master 2200 / renowned_master 3000 / grand_master 4000. One work = 100 XP. | `constants.ts` `RANK_XP`; `artists.ts` `nextRankXp()`, `RANK_ORDER` |
| **Work durations by rank** | apprentice 6 → grand_master 3 months. | `constants.ts` `WORK_DURATION_MONTHS` |
| **Artwork prestige by rank** | apprentice 1 → grand_master 10 (before requester skew). | `constants.ts` `ARTWORK_PRESTIGE` |
| **Artwork pace** | Founder tracks `workProgress`, advancing only while active + inspiration > 0. Pace = `(1 + EXTRA_ARTIST_PACE_BONUS(0.5)·(members−1))·(1 + 0.25·plazaStrength)·displayBoost`. Completes at `durationMonths`. | `artists.ts` → `progressArtworks()` |

## 10. Commissions (the core loop)

| Mechanic | What it does | Code |
|---|---|---|
| **Offer generation** | Each month, if open offers < `MAX_OPEN_OFFERS = 3`, chance `COMMISSION_OFFER_CHANCE = 0.15` one arrives. Type drawn from artist types present (every offer actionable). Sculptor offers roll bronze at `BRONZE_COMMISSION_CHANCE = 1/3`. Best rank of that type scales duration/reward. Expiry `OFFER_EXPIRY_MONTHS = 12`. | `app/game/commissions.ts` → `maybeOfferCommission()` |
| **Reward calc** | `basePrestige = ARTWORK_PRESTIGE[bestRank]`; florins compressed against rank (`FLORIN_RANK_COMPRESSION = 0.25`, `FLORINS_PER_PRESTIGE = 25`). Requester `mix` skews split by `REQUESTER_REWARD_SKEW = 2` (florins-mix doubles florins/halves prestige; prestige-mix the reverse; mixed leaves base). | `commissions.ts` |
| **Requesters** | Flavor strings: The Church (florins), Medici/Strozzi/Pazzi (prestige), Wool/Silk Guild (mixed). Guilds slated for removal. | `commissions.ts` → `REQUESTERS` |
| **Assignment guard** | Assign only if offer open, founder exists + type matches + idle, host is an active matching workshop, and a supplier slot is free. | `commissions.ts` → `canAssignCommission()`; store `assignCommission()` |
| **Reconciliation** | Each tick: commissions whose workshop vanished revert to open offers with fresh expiry; offers past expiry are dropped. | `commissions.ts` → `reconcileCommissions()`, `reopenCommission()` |
| **Completion payout** | Mints a named `Artwork` (captures title, requester, prestige, material), pays florins + prestige, clears `workProgress`, grants all members 100 XP. | `artists.ts` → `progressArtworks()` |

## 11. Work display (Phase 9)

| Mechanic | What it does | Code |
|---|---|---|
| **Display slots** | Buildings/plazas carry typed slots (`painting`/`statue` interior, `plinth` exterior with a footprint cell). Painters fill painting; sculptors fill statue+plinth; architects none. | `app/game/display.ts` → `slotAccepts`, `SLOT_KINDS_BY_ARTIST`, `DisplaySlotDef` in `types.ts` |
| **Host boost** | `displayBoost = 1 + DISPLAY_HOST_BONUS(0.05)·min(count, 5)` → +5%/work, cap +25%. | `display.ts` → `displayBoost()` |
| **Per-tick trickle** | By quality `q` (captured commission prestige, default 2): church hosts (cathedral/chapel) add `q·0.02` prestige/tick; other hosts add `q·0.25` inspiration/tick. | `display.ts` → `computeDisplaySummary()` |
| **Placement guard** | Artwork must be unassigned; host must be an origin with a matching free slot accepting the artist type. Shared by store + both assign UIs. | `display.ts` → `canDisplayWork()` |
| **Plinth rotation** | Plinth slot cells rotate with the host (integer ring for quarter turns; nearest mask cell for diagonals). | `display.ts` → `rotateSlotCell()`, `plinthSlotAt()` |

## 12. Renaissance milestone (Phase 12, soft ending)

| Mechanic | What it does | Code |
|---|---|---|
| **Four/five derived gates** | Derived live, no tracking: prestige ≥ `RENAISSANCE_PRESTIGE(500)`; a Master-rank+ artist; a displayed Wonder (quality ≥ `WONDER_PRESTIGE(15)`); a completed work for The Church; and ≥ `RENAISSANCE_NOBLE_HOUSES(2)` distinct "House …" requesters with completed works. | `app/game/renaissance.ts` → `renaissanceProgress()` |
| **Celebration** | One-shot `renaissanceReached` flag → title card once; the checklist rides the prestige chip's hover tooltip all game. Play continues (Golden Age). | store `useGameStore.ts`; `ui/RenaissanceCard.tsx`; `ui/TopBar.tsx` `PrestigeStat` |

## 13. Buildings — catalog & placement geometry

| Mechanic | What it does | Code |
|---|---|---|
| **Building catalog** | Single frozen source-of-truth array of every placeable building + derived lookups (`BUILDING_METADATA_BY_ID/TYPE`, `BuildingId` union). Categories: `residential, artist, materials, service, road, city, decoration`. | `app/game/buildings.ts` → `BUILDING_TYPES` |
| **`BuildingMetadata` shape** | `type, id, name, baseCost, size, color, footprint, generates?{income,inspiration}, housing?, amenities?, prestigeOnBuild?, isHub?, connectionBonus?, footTraffic?, placesOnRoads?, workersRequired?, maxWorkers?, artistCapacity?, artistType?, roadWidth?, linear?, paved?, supplies?, displaySlots?`. | `app/game/types.ts` |
| **Effect flags** | `isHub` (plazas + bell_tower), `placesOnRoads` (market_stall), `footTraffic` (market_stall), `connectionBonus` (stall 1.0), `paved`, `linear` (colonnade/fence/stone_wall), `prestigeOnBuild` (cathedral 25), `roadWidth` (5 road variants). `costEscalates` is computed from `type`, not a field. | `buildings.ts` |
| **Footprint mask** | Claimed grid cells + center offset per rotation; cardinal = axis-aligned rect (odd quarters swap w/d), cached per `dims×rotation`. | `buildings.ts` → `footprintMask()`, `footprintMaskFor()` |
| **Diagonal (45°) mask** | Diagonal rotations claim cells whose centers fall inside the yaw-rotated rect (ε-shrunk), re-anchored row-major — a true diamond, not the bbox. R cycles 8 rotation steps. | `buildings.ts` → `rasterizeDiagonalMask()`; rotation encoding `quarterOf`, `isDiagonalRotation`, `yawOfRotation` |

## 14. Placement validation

| Mechanic | What it does | Code |
|---|---|---|
| **Per-cell check** | Classifies each footprint cell `blocked/occupied/free`. Occupied blocks unless a decoration overlaps a non-origin cell, or a `placesOnRoads` building overwrites a plain cardinal road cell / plaza rim cell. Empty cells block on water unless the building is a bridge. | `app/game/placementRules.ts` → `checkCell()` |
| **Plaza-rim guard** | A stall may only overwrite a plaza's outer-ring cells (mask-based) — never origin or interior, so stalls can't erode a plaza inward. | `placementRules.ts` → `isPlazaRimCell()` |
| **Batch planner** | Authoritative batch validation: bounds, in-batch overlap, water gate, affordability via `Σ escalatedCost(startRank+i)`. | `placementRules.ts` → `planPlacement()`; per-frame probe `canPlaceAt()` |
| **Linear/road drag** | Plans a road/linear-decoration drag in one pass; existing compatible cells join free, only new empty cells validated + charged; `totalCost = baseCost·newCells`. | `placementRules.ts` → `planLinearPlacement()` |

## 15. Roads

| Mechanic | What it does | Code |
|---|---|---|
| **Widths & variants** | Path (1 cell), Road (2), Avenue (3) at 25ƒ/cell; Dirt Path (1, 10ƒ); Stone Bridge (2, 80ƒ, only structure on water). Cost per cell. All carry plaza connectivity identically. | `buildings.ts` road defs |
| **Diagonal stretch** | Road drags snap to 8 octants (edges at 22.5°). Diagonal runs are a staircase of ordinary road cells with ribbon orientation stored in `rotation` (`ROAD_DIAG_NE = 1`, `ROAD_DIAG_NW = 3`; cardinal = undefined, so old saves untouched). Wider roads stamp offset rows to stay orthogonally contiguous. | `app/game/roadStretch.ts` → `buildRoadStretch()` |
| **Snap-to-road (Shift)** | Snaps a building flush to the nearest road within `SNAP_RANGE = 6`, auto-facing it; diagonal ribbons rotate the building a true 45°. Purely an assist — no candidate falls through to free placement. | `app/game/roadSnap.ts` → `findRoadSnap()` |
| **Junction plates / ribbons** | Diagonal-owned crossings drop an unrotated junction plate; renderer draws diagonal cells as √2-stretched decals. | `app/game/render/roadRenderer.ts` |

## 16. Water & map archetypes (seed-rolled)

| Mechanic | What it does | Code |
|---|---|---|
| **Archetype roll** | From a `water:${seed}` RNG: dry 15% / inland 30% / coastal 30% / scenic-river 15% / scenic-coast 10%. Scenic water stays ≥1.5wu clear of the buildable grid (plays like dry). | `app/game/water.ts` → `generateWater()` |
| **River meander** | Centerline = two sine octaves with seeded amplitude/frequency jitter; width oscillates, floored at `MIN_RIVER_WIDTH = 1.2`; clamped `EDGE_MARGIN = 5` from edges. Slopes capped so raster rows overlap (no severed cells). | `water.ts` → `riverCenterAt`, `riverWidthAt`, `riverDistance` |
| **Sea / estuary** | Coastal archetypes inset a wiggling coastline from a grid edge; estuary widens the river ~2× toward the mouth via smoothstep. | `water.ts` → `seaDistance`, `coastEdge` |
| **Cell gating** | Water cells block building (mirrored in placement previews); the single sim gate is in `placeTiles`. Bridge is the one exception. Memoized on `mapSeed`. | `water.ts` → `getWaterCells()`; `placementRules.ts` |

## 17. Seed system

| Mechanic | What it does | Code |
|---|---|---|
| **Run seed** | Short 6-char lowercase alphanumeric, shareable, shown in Settings. | `app/game/seed.ts` → `generateSeed()` |
| **Deterministic city name** | Picks from a fixed 16-name pool via `seededRng`. | `seed.ts` → `pickCityName()` |
| **Archetype-targeted seed** | Map-archetype picker rejection-samples fresh seeds until the archetype rolls (seed stays the sole map truth). | `seed.ts` → `seedForArchetype()` |
| **Seeded terrain** | `createTerrain(mapSeed)` derives namespaced streams (`hills:`, `scatter:`, `fields:`); null seed → legacy fixed constants. | `app/game/render/terrain.ts` |
| **RNG primitives** | mulberry32 + FNV-1a hash + positional tone hash. | `app/game/random.ts` → `mulberry32`, `hashString`, `seededRng`, `positionToneIndex` |

## 18. Raze / demolition

| Mechanic | What it does | Code |
|---|---|---|
| **Impact / confirm** | Counts resident artists, any open/assigned commission, displayed works. `needsConfirmation` if any non-zero (deliberate demolitions get a confirm card; sweeps pass over them). | `raze.ts` → `getRazeImpact()`; `ui/RazeConfirm.tsx` |
| **Self-heal cascade** | Removes footprint cells (retaining overlapping decorations owned by others), adds salvage, evicts artists, recalls displayed works, reopens commissions with fresh expiry. | `raze.ts` → `razeBuilding()` |

## 19. Render & UI systems (where each player-facing system lives)

| System | Code |
|---|---|
| Tile/building renderer (diff, budgeted construction, model upgrade, shadows, aprons, smoke, display) | `render/mapRenderer.ts` → `createTileRenderer` |
| Placement ghost & controller (raycast, ghost, R-rotate, Shift-snap, drag-stretch, raze sweep, click-inspect) | `render/placement.ts` → `createPlacementController` |
| Composed prefab kit (declarative parts, fittings, palettes, rotation/front/extension rules) | `render/modelManifest.ts` → `MODEL_MANIFEST` |
| Decorative citizens (random-walk network, population→count, speed tracks sim) | `render/citizens.ts` → `createCitizens` |
| Citizen figures + thin-instance batching (5 variants, 15 draw calls) + statue mesh | `render/citizenFigures.ts` → `createThinInstanceFigureFactory`, `createStatueMesh` |
| Displayed art (plinths, marble/bronze statues, façade easel canvases) | `render/displayArt.ts` → `createDisplayArt` |
| Road/bridge/diagonal-ribbon renderer | `render/roadRenderer.ts` |
| Terrain (seeded hills, fields, analytic water carving) | `render/terrain.ts` → `createTerrain` |
| Water visuals (animated wobbling surface — the codebase's first animated material) | `render/waterMesh.ts` → `createWaterVisuals` |
| Paving/apron/dirt materials (3 plaza styles behind `?plaza=`) | `render/paths.ts` |
| Masonry wall textures (coursed patterns per category) | `render/wallTexture.ts` |
| Procedural kit pieces (`proc:` blocks, roofs, surrounds, bifora, rose, portals) | `render/proceduralPieces.ts` |
| HUD root / one-panel-open enforcement | `ui/GameHUD.tsx` |
| Top bar (resources, clock, speed, editable city name, population + renaissance goal tooltips, settings) | `ui/TopBar.tsx` |
| Building palette (category flyouts, affordability dimming, raze tool, layered cancel) | `ui/BuildingPalette.tsx` |
| Artists/workshops panel (rank, XP, status reasons) | `ui/ArtistsPanel.tsx` |
| Commissions panel / assignment UI (eligible-workshop computation mirrors sim guards) | `ui/CommissionsPanel.tsx` |
| Gallery codex (completed works, Display at…/Recall) | `ui/GalleryPanel.tsx` |
| Display panel (per-building slot manager, store `inspectTarget`-driven) | `ui/DisplayPanel.tsx` |
| Building tooltip (status reasons, computed active effects, plaza/traffic hints, raze salvage) | `ui/BuildingTooltip.tsx` |
| Renaissance celebration card | `ui/RenaissanceCard.tsx` |
| Raze confirm popover | `ui/RazeConfirm.tsx` |
| Main menu / continue-save peek (no hydration until Continue) | `ui/MainMenu.tsx` |

---

# Part 2 — Docs folder audit: planned vs. implemented

The `docs/` folder holds the main spec plus supplemental design/planning docs. Below, each doc's planned mechanics are sorted into **Built**, **Partially built**, and **Not built**.

## `design-doc.md` — main spec (Phases 0–12 + graphics)

**Built (all numbered phases + most graphics):**
- Phases 0–12: placement, time, building types, population & two-pass workers, artists + ranks, artworks/XP, supplier capacity gating, commissions, work display, plaza connectivity, artist training/teaching, Renaissance milestone.
- Graphics G1–G4 (model pipeline, terrain, ground dressing, life & polish) + generated kit pieces + category-identity pass.
- G5 mostly: river + bridge, decorative citizens (population-scaled), obelisk, seeded water archetypes, diagonal streets, snap-to-road + 45° buildings, market stall + foot traffic, main menu.

**Not built (explicitly "Later / stretch"):**
- Richer economy system (Market → overflow supply repurpose).
- Neighborhood zoning.
- Housing tiers 3–5 (Villa, Palazzo-as-housing exists but not Villa/Grand Palazzo; named family palazzos).
- Architects & building commissions (the whole third-discipline pipeline: Architect's Studio, city-teaches-architects XP, rank-gated commissions, building commissions).
- Expanded building roster (River & Waterfront set, most Social/Religious/Trade categories).
- Lungarno row housing.
- More map archetypes (Lake); hiding grid tiles over water.
- Campaign scenarios.
- Diagonal row-house blending (the one 45° follow-up).
- Per-plaza paving choice (all 3 drawers exist behind `?plaza=`, but no in-game picker / `Tile.variant` wiring).
- Single-Town-Center-Plaza enforcement (still open, carried from Phase 10).

## `building-effects.md` — non-art building effects

**Built (the July 2026 quick-win wave):**
- Decoration inspiration trickles (per-def, per-cell on linear pieces).
- Cottage/townhouse rents (2ƒ/5ƒ, occupancy-scaled).
- Chapel passive `amenities: +10`, workerless.
- Bell Tower as `isHub` connectivity relay + inspiration trickle.
- Cathedral consecration lump (`prestigeOnBuild: 25`).
- Palazzo `housing: 12`.
- Work-display sites (Phase 9) as an effect slot.

**Not built:**
- **Requester-pool shaping** — the big remaining piece: Cathedral commission elevation, Palazzo noble installs. Waits on factions.
- Effect-2/3/4/5 buildings not yet in the roster: Baptistery, Banking House, Wool Merchant, Glassblower, Monastery, Spice Trader, Library/Studiolo, School, Anatomical Theatre — none placeable.
- All **slight-negative trade-offs** (Banking House ±, Market inspiration drag, Tavern −inspiration, bell-ringer worker draw, cathedral clergy staffing, forgone-plaza-bonus exclusions) — none implemented.
- Palazzo requester install / open-offer-cap bump.

## `factions.md` — requesters grown into patrons

**Status: not built (ideation only).** Nothing here exists in code. The current game uses flat flavor-string `REQUESTERS` with only a florin/prestige mix skew.
- Not built: taste profiles, favor ladder, signature chains, seed-rolled roster, rivalry pairs, per-faction favor state.
- The design-doc's Phase-12 patron gate (Church + 2 noble houses via completed works) is a *stand-in* for favor and **is** built — it reads per-requester completed works directly (`renaissance.ts`).

## `plans/factions-slice-1.md` — faction slice 1 implementation plan

**Status: not built (proposed, pending decision).** A detailed implementation plan (favor 0–100 meter, patron admission gating, faction banner UI, denunciation, pacing rebalance, `SAVE_VERSION = 8`). None of it is in code — current `SAVE_VERSION`, `COMMISSION_OFFER_CHANCE = 0.15`, `FLORINS_PER_PRESTIGE = 25` are all still the pre-slice values, and there is no `favor` state, `FactionBanner.tsx`, or `OfferAlert.tsx`. Note this plan deliberately *overturns* the "no relationship meters" non-negotiable — not yet decided/adopted.

## `map-resources.md` — seed-determined supplier availability

**Status: not built.** No seed-rolled resource flags; all suppliers (pigment/marble/bronze) are always placeable. Not built: per-run resource booleans, substitute pairs (marble↔clay, timber↔lime), Terracotta Kiln/Lime Kiln/Goldsmith/Timber Yard/Glassblower buildings, offer-generator resource weighting, greyed-out "not found in this region" build menu, Market escape valve. (Water power *is* implicitly rolled — the dry archetype is that resource absent.)

## `artist-brief.md` — architectural fittings commission

**Status: batch 1 built procedurally (not commissioned).** All four batch-1 pieces (rect window, arched window, door, arcade bay) are generated in `render/proceduralPieces.ts` to the brief's specs.
- Not built / open: batch 2–3 commission pieces — the genuinely organic ones. Per `procedural-pieces.md`, bifora and rose window ended up built in code too; the remaining open commission pieces are the **dome** and **ivy**.

## `procedural-pieces.md` & `kitbashing.md` — generated-pieces state

**Status: current, mostly built.** Eleven+ `proc:` pieces generated (blocks, gable/hip roofs, surrounds, door frame/leaf, arch bay, portals, bifora, arch-leaf, rose). Panel-free pass complete (kit door/window/arch panels at 0 refs). **Open:** the organic commission pieces (dome, ivy) — the one thing still flagged as wanting an artist.

## `citizen-population-plan.md` — population-scaled crowds

**Status: fully implemented (July 2026).** Count curve (`crowd.ts`), thin-instance factory (`citizenFigures.ts`), `&crowd=` dev flag, population wiring all landed. One deviation noted in the doc itself: walk-network clamp shipped at 1 figure per 2 cells (not 3).

## `performance-backlog.md` — rendering performance

**Status: mostly done.** Building/scatter thin-instance batching, on-demand shadows, shared smoke, O(occupied-tiles) sync scans, dirt-overlay frame-budgeting — all DONE. **Open:** only the "grid-growth checklist" for when `GRID_SIZE` grows toward ~160 (a future scaling task, not a bug).

---

## Summary — the biggest unbuilt planned systems

1. **Factions** (favor, taste profiles, signature chains) — the largest designed-but-unbuilt system; two competing designs on file (`factions.md` flavor-first vs `plans/factions-slice-1.md` meter-based). Blocks requester-pool shaping in `building-effects.md`.
2. **Architects & building commissions** — the entire third discipline and construction pipeline.
3. **Map resources** — seed-rolled supplier availability + substitute pairs.
4. **Expanded building roster** — most Civic/Religious/Trade/Social/Waterfront buildings; all the `building-effects.md` slight-negative trade-offs.
5. **Neighborhood zoning** and **housing tiers 3–5**.
6. **Per-plaza paving picker**, **single-plaza enforcement**, **diagonal row-house blending**, **Lake archetype**, **campaign scenarios** — smaller stretch items.
</content>
</invoke>
