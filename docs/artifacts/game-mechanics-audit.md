# Patronage — Game Mechanics Audit
*Generated July 2026; last refreshed after the material-stockpile rework and architects slice 1 (July 2026). A complete rundown of every implemented game mechanic with code references, followed by an audit of the `docs/` folder: which planned mechanics are built and which are not.*

**Maintenance: update this doc whenever a feature is complete** — add/adjust its Part 1 rows and move it in Part 2, in the same change that deletes its [roadmap.md](../roadmap.md) entry and documents the system in the design doc.

This is a snapshot of the code as it stands, cross-checked against the design docs. Line numbers are approximate (they drift with edits); the file + function names are the durable references. Balance constants are pulled from `app/game/constants.ts` unless noted — per-building stats live inline in `app/game/buildings.ts`.

---

# Part 1 — Mechanics rundown

## 1. Time & the tick loop

| Mechanic | What it does | Code |
|---|---|---|
| **Monthly tick** | One tick = one game month. Fixed pipeline each tick: gather staffable buildings → allocate workers → activate tiles → plaza connectivity → display summary → city metrics + population drift → occupancy rent → diminishing returns → generation (florins/inspiration + material production) → formed-plaza inspiration → artist arrival → commission reconcile/offer → artwork progress → tradition-pool accrual + XP floor → funded-build collection → material pools clamp-add. Returns a `TickTransition`, preserving object identity for unchanged arrays. | `app/game/tick.ts` → `advanceTick()` |
| **Clock / speed** | `BASE_TICK_INTERVAL = 1500`ms real time per tick; speed multipliers `[1, 2, 3]`. | `constants.ts`; store `tick()` in `app/stores/useGameStore.ts` |
| **Calendar** | Month = `MONTH_NAMES[tick % 12]`, year = `1400 + floor(tick / 12)` → "May 1482". | `useGameStore.ts` → `formatMonth` |

## 2. Workers & labor (two-pass allocation)

| Mechanic | What it does | Code |
|---|---|---|
| **Two-pass allocation** | Stateless each tick. Pass 1 fills every building to `workersRequired` in priority order (a building the pool can't fully staff gets 0 — no partial staffing). Pass 2 distributes surplus up to `maxWorkers`. Priority `TYPE_PRIORITY`: service 0, materials 1, artist 2, city 3, else 9; ties by key. | `app/game/city/workers.ts` → `allocateWorkers()` |
| **Staffing efficiency** | Output scales linearly from 1× at minimum staff to `1 + MAX_STAFFING_BONUS` (**1.5×**, +50%) at max staff: `1 + 0.5·max(0, workers−required)/(maxWorkers−required)`. | `workers.ts` → `staffingEfficiency()` |
| **Activation gate** | A tile is active only when `workers ≥ workersRequired`; workerless buildings (`workersRequired === 0`) are active on placement. Inactive → generates nothing, no amenities, desaturated in render. | `tick.ts`; placement default in `useGameStore.ts` → `placeTiles()` |

## 3. Materials — accumulating stockpiles (the core scarcity mechanic)

*(Rework, July 2026 — replaced the original supplier capacity-token model; a deliberate reversal of "materials are never a stockpile".)*

| Mechanic | What it does | Code |
|---|---|---|
| **Five city-wide pools** | `pigment, marble, bronze, timber, stone` (`MATERIALS` drives caps/production/panel rows automatically). Persisted numbers, no routing, no per-building stores. Save v9 seeded the first three empty; v10 added timber/stone. | `app/game/art/materials.ts` → `MATERIALS`; `types.ts` `Material` union |
| **Production** | Each staffed supplier accrues `supplies.rate (2) × staffingEfficiency × plazaBoost` of its material per tick. Deliberately **no diminishing returns** (more suppliers must never mean less stock — principle 6); escalating build cost prices duplicates instead. | `tick.ts` generation loop; supplier `supplies: { material, rate, storage }` in `buildings.ts` |
| **Storage caps** | Per material: `MATERIAL_STORAGE_BASE (20)` + each supplier's `storage (20)` for its own material + each Warehouse's `materialStorage (50)` for **all** materials. Storage counts unstaffed; only production needs workers. Clamp-and-add is identity-stable. | `materials.ts` → `materialCaps()`, `addProduction()` |
| **Commission cost** | Commissions stamp `materialCost = MATERIAL_COST_SCALE (5) × rankPrestige (1–10) × grandeur (1–2)` at offer time; the pool is deducted when the player **assigns** (no refund when a raze reopens the offer). Once assigned, work never stalls on materials — understaffing is now the only inactive cause. Pre-v9 offers read `?? 0` (stay free). | `commissions.ts` → `commissionMaterialCost()`; store `assignCommission()` |
| **Construction cost** | Grand buildings carry `BuildingMetadata.buildCost` (cathedral 40 stone + 10 timber; manor, bell tower, warehouse; blueprint structures) — deducted lump-sum at placement. Houses/roads/workshops/suppliers stay florins-only (no bootstrap deadlock); salvage never refunds materials. | `placementRules.ts` → `planPlacement()`/`canPlaceAt()`; `placeTiles()` |
| **Material defaults** | painter→pigment, sculptor→marble; bronze only from an explicit commission material (rolled at offer time, `BRONZE_COMMISSION_CHANCE = 1/3`). | `materials.ts` → `MATERIAL_BY_ARTIST_TYPE`, `commissionMaterial()` |
| **UI** | Slim "Materials" rail docked to the right screen edge (held/cap + live `+N/mo` rate, hidden until a cap exceeds the base); supplier tooltips show rate + citywide stock; offer cards show cost + "Not enough marble — 14 / 30 in store". | `ui/MaterialsPanel.tsx`; `ui/BuildingTooltip.tsx`; `ui/CommissionsPanel.tsx` |

## 4. Plaza connectivity (soft spatial)

| Mechanic | What it does | Code |
|---|---|---|
| **Connectivity BFS** | The Main Plaza (`town_center_plaza`) radiates through roads via a 0–1 BFS (roads cost 1/cell, any plaza/hub/formed-plaza cell resets distance to 0 — formed-plaza cells conduct even when bare, with no tile). Building strength = best adjacent network cell with linear falloff: `max(0, 1 − dist/PLAZA_REACH)`. `PLAZA_REACH = 30` road cells; `PLAZA_CONNECTION_BONUS = 0.25` at full strength. Takes `mapSeed` (formed plazas derive from it); memoized by tiles identity (WeakMap). A nudge, never a gate. | `app/game/city/connectivity.ts` → `computePlazaConnectivity()` |
| **Hubs / conductors** | Hub set = plazas + `isHub` buildings (bell tower), derived from metadata via `PLAZA_IDS`, **plus formed freeform plazas** (below); road-cost conductors via `ROAD_OVERLAY_IDS` (e.g. market stall). | `connectivity.ts` |
| **Gathering field** | Per-cell "would people linger here?" score from **tiles only** (no occupancy/time — moves only on build/raze): housing + amenities + generated inspiration + street junctions, additive with linear falloff over `GATHER_REACH` (12 cells, Chebyshev). Monotonic non-decreasing in everything (asserted). Memoized by tiles identity. | `app/game/city/gathering.ts` → `computeGathering()` |
| **Freeform plaza formation** | A plaza = connected union of fully-open 4×4 core blocks (`PLAZA_CORE`; open = bare buildable land, plaza paving, land road cells — bridges never). Block qualifies **authored** (all paving) or **organic** (mean field ≥ `GATHER_FORM` 14 *and* enclosed — every outward lane hits a tile/water/map edge within `PLAZA_ENCLOSE_REACH` 3). Region organic if any block is field-qualified — paving more never demotes. Fully derived, nothing persisted; `anchor` = row-major-first cell (naming's future key). | `gathering.ts` → `FormedPlaza`, `plazaCells` |
| **Formed-plaza inspiration** | Flat `PLAZA_FORMED_INSPIRATION` (2/month) per formed plaza, × `ORGANIC_PLAZA_MULT` (1.15) when organic — the entire organic reward (no one-time bonus; raze-and-reform gains nothing). Workerless, boost-free, like the premade plazas. | `gathering.ts` → `formedPlazaInspiration()`; added in `tick.ts` after the generation loop |
| **Plaza boost application** | `plazaBoost = 1 + connectionBonusOf(meta)·strength·trafficFactor`. Multiplies generation (tick), housing & amenities (metrics), commission pace (artists). Per-building bonus override via `connectionBonus` metadata (default 0.25). | `tick.ts` `plazaBoost`; `metrics.ts`; `artists.ts` `progressArtworks()` |

## 5. Foot traffic (market stall)

| Mechanic | What it does | Code |
|---|---|---|
| **Traffic factor** | For `footTraffic`-flagged buildings only, the plaza bonus additionally scales by real traffic: `boost = 1 + connectionBonus·hubStrength·bustle·catchment`. Both factors 0–1 and monotonic non-decreasing (adding pop/roads/houses never lowers output). Unflagged buildings return factor 1. | `app/game/city/traffic.ts` → `trafficFactor()` |
| **Bustle** (citywide) | `min(1, crowdCurve(pop)/BUSTLE_FULL)`, `BUSTLE_FULL = 60` — the visible crowd's own curve. | `traffic.ts` → `bustle()` |
| **Catchment** (per stall) | FIFO BFS over network cells up to `CATCHMENT_REACH = 15`; sums housing of adjacent houses, normalized `min(1, cap/CATCHMENT_FULL)`, `CATCHMENT_FULL = 24`. Spatial only. Memoized by tiles identity. | `traffic.ts` → `computeCatchment()` |

## 6. Crowd (sim → visual; feeds bustle)

| Mechanic | What it does | Code |
|---|---|---|
| **Crowd curve** | Exact 1:1 with population up to 20; beyond, `20 + round(6·√(pop−20))`. This number feeds bustle. Figure count also clamps to a cap (240) and one figure per 2 walkable cells. | `app/game/city/crowd.ts` → `crowdCurve()`, `crowdSize()` |

## 7. Population & city metrics

| Mechanic | What it does | Code |
|---|---|---|
| **Housing / amenity caps + drift** | `populationCap = min(housing, amenities)`; population moves toward the cap by `POPULATION_DRIFT_PER_MONTH = 1`/month. | `tick.ts` |
| **City metrics** | `housing = Σ round(meta.housing·boost)`; `amenities = BASE_POPULATION_CAP(15) + Σ round(meta.amenities·boost)` over active tiles, `boost = plazaBoost·displayBoost`. | `app/game/city/metrics.ts` → `computeCityMetrics()`; store `getHousing()` |

## 8. Economy — income, rent, cost curves

| Mechanic | What it does | Code |
|---|---|---|
| **Occupancy-scaled rent** | House income × `occupancy = min(1, population/housing)`, so empty houses pay little and total rent is bounded by population. | `tick.ts` |
| **Income diminishing returns** | Duplicate *non-housing* florin generators of the same id decay geometrically, oldest-first: the Nth yields `INCOME_DIMINISHING_RETURNS(0.85)^N`. Housing excluded (occupancy handles it). | `tick.ts` |
| **Generation** | Per active origin: `efficiency = staffingEfficiency·plazaBoost·displayBoost`; `florinDelta += income·efficiency·incomeScale`; `inspirationDelta += inspiration·efficiency`. | `tick.ts` |
| **Cost escalation** | Duplicate workshops/suppliers/services (`type` ∈ artist/materials/service) cost `round(baseCost·COST_ESCALATION(1.15)^rank)`, rank = build order among standing siblings. Landmarks/housing/roads/decorations stay flat. Priced live off the tile map, no persisted counter. | `app/game/buildings.ts` → `costEscalates()`, `escalatedCost()`, `buildOrderRank()` |
| **Raze salvage** | Refund = `floor(escalatedCost(rank)·RAZE_SALVAGE_FRACTION(0.5))` — tracks the escalated price actually paid. | `app/game/placement/raze.ts` → `getRazeSalvage()` |
| **Starting economy** | `STARTING_FLORINS = 3000`; inspiration/prestige/population start at 0. | `constants.ts`; `useGameStore.ts` |
| **Consecration lump** | Cathedral pays a one-time `prestigeOnBuild = 25` on placement. | `useGameStore.ts` → `placeTiles()` |

## 9. Artists, XP & city tradition

| Mechanic | What it does | Code |
|---|---|---|
| **Passive arrival** | Each month, if inspiration > 0 and an active workshop has a free slot past its cooldown, chance `ARTIST_ARRIVAL_CHANCE = 0.04` an artist arrives **at the tradition floor** (cooldown `ARTIST_ARRIVAL_COOLDOWN_MONTHS = 2`). | `app/game/art/artists.ts` → `maybeArriveArtist()` |
| **City tradition pools** | Persisted `disciplineXp` per discipline (save v12 seeds from artists' per-type max xp). Completions bank `perCompletedWork(100) + POOL_PER_PRESTIGE(10)·prestige`; each tick every artist is lifted to `FLOOR_FRACTION(0.25)·pool` (rank re-derived, never demotes; pools only grow). Personal XP beyond the floor = completions only (`perCompletedWork` per member). | `artists.ts` → `accrueDisciplineXp()`, `applyXpFloor()`, `xpFloor()`; wired in `tick.ts` |
| **Workshop founding / graduation** | A new workshop is founded by the discipline's highest-xp non-founder (rehomed; founder = first artist at a key survives, since rehoming preserves array order and only moves non-founders), else a fresh floor-level arrival. Occupied-key guard unchanged. | `artists.ts` → `pickGraduate()`; store `placeTiles()` |
| **The city teaches architects** | Every placement banks `perFlorinBuilt (0.05) × florins actually spent` into `disciplineXp.architect` — no studio required (cathedral = 75; fences floor to 0; funded 0ƒ builds bank 0). Accrued before founding, so a first studio's own cost reaches its founder via the floor. Excluded from the Renaissance tradition gate. | store `placeTiles()` |
| **Rank thresholds** | Seven ranks by cumulative XP (never demotes): journeyman 400 / artisan 900 / virtuoso 1500 / master 2200 / renowned_master 3000 / grand_master 4000. One work = 100 XP. | `constants.ts` `RANK_XP`; `artists.ts` `nextRankXp()`, `RANK_ORDER` |
| **Work durations by rank** | apprentice 6 → grand_master 3 months. | `constants.ts` `WORK_DURATION_MONTHS` |
| **Artwork prestige by rank** | apprentice 1 → grand_master 10 (before requester skew). | `constants.ts` `ARTWORK_PRESTIGE` |
| **Artwork pace** | Founder tracks `workProgress`, advancing only while active + inspiration > 0. Pace = `(1 + EXTRA_ARTIST_PACE_BONUS(0.5)·(members−1))·(1 + 0.25·plazaStrength)·displayBoost`. Completes at `durationMonths`. | `artists.ts` → `progressArtworks()` |

## 10. Commissions (the core loop)

| Mechanic | What it does | Code |
|---|---|---|
| **Offer generation** | Each month, if open offers < `MAX_OPEN_OFFERS = 3`, chance `COMMISSION_OFFER_CHANCE = 0.08` one arrives (rare-but-rich pacing — ~one a year, announced by a persistent arrival card). Requester drawn from the admitted patron pool (empty pool → no offers). Type drawn from artist types present (every offer actionable). Sculptor offers roll bronze at `BRONZE_COMMISSION_CHANCE = 1/3` — material only; the title still comes from the requester-scoped pool, so any sculpture subject can be cast in bronze. Best rank of that type scales duration/reward; the requester's favor rung multiplies duration/florins/prestige (see §10a). Expiry `OFFER_EXPIRY_MONTHS = 12`. | `app/game/art/commissions.ts` → `maybeOfferCommission()` |
| **Reward calc** | `basePrestige = ARTWORK_PRESTIGE[bestRank] · COMMISSION_PRESTIGE_SCALE(1.5)`; florins compressed against rank (`FLORIN_RANK_COMPRESSION = 0.25`, `FLORINS_PER_PRESTIGE = 40`). Requester `mix` skews split by `REQUESTER_REWARD_SKEW = 2` (florins-mix doubles florins/halves prestige; prestige-mix the reverse). Favor grandeur multiplies on top. | `commissions.ts` |
| **Requesters (patron pool)** | The Church (florins mix, devotional `CHURCH_TITLES`) + Medici/Strozzi/Pazzi (prestige mix). Guilds removed. Pool gated by admission: Chapel or Cathedral seats the Church; each Manor installs the next house in table order. | `commissions.ts` → `REQUESTERS`, `requesterPool()` |
| **Decline** | An open offer can be declined from the panel: dropped immediately, −5 favor with the requester (same denunciation-crossing check as expiry). | store `declineCommission()` |
| **Assignment guard** | Assign only if offer open, founder exists + type matches + idle, host is an active matching workshop, and the city stock covers `materialCost` (4th param `available`). The store deducts the pool on success. | `commissions.ts` → `canAssignCommission()`; store `assignCommission()` |
| **Blueprint commissions** | Every architect-type offer is a building commission drawn from `BUILDING_COMMISSIONS` at the title draw (same single rng call — painter/sculptor draw order untouched), one shared list for every requester — currently **empty** (Baptistery and Loggia removed Aug 2026; while empty, architects get no offers via an early-out after the type draw). No `materialCost` at assign (design work is free); completion mints a normal Artwork **plus** a funded-build token. The structure is `commissionOnly: true` — "Funded" badge in the Civic palette, placeable once per token at 0ƒ + its `buildCost` materials, salvage 0, no refund on raze-reopen. `SLOT_KINDS_BY_ARTIST.architect = []` keeps designs undisplayable. | `commissions.ts` → `BUILDING_COMMISSIONS`, `Commission.building`; `tick.ts` `fundedBuilds`; `placementRules.ts` |
| **Reconciliation** | Each tick: commissions whose workshop vanished revert to open offers with fresh expiry; offers past expiry are dropped. | `commissions.ts` → `reconcileCommissions()`, `reopenCommission()` |
| **Completion payout** | Mints a named `Artwork` (captures title, requester, prestige, material), pays florins + prestige, clears `workProgress`, grants all members 100 XP, and banks `100 + 10·prestige` into the discipline's tradition pool. A completed blueprint additionally appends its building id to persisted `fundedBuilds`. | `artists.ts` → `progressArtworks()`; `tick.ts` |

## 10a. Faction favor (factions slice 1)

| Mechanic | What it does | Code |
|---|---|---|
| **Favor meter** | Persisted `favor: Record<string, number>`, 0–100 per faction; reads default `FAVOR_START = 50`. Moves **only on decisions**: `FAVOR_PER_WORK = +8` per completed work, `FAVOR_SLIGHT = −5` per declined or expired open offer. No time decay. Save v8 seeds old saves from per-requester completed works. | `commissions.ts` → `favorOf()`, `favorFromWorks()`; `tick.ts`; `saveMigration.ts` |
| **Rungs (grandeur)** | Favor ≥ `FAVOR_RUNGS` [60, 75, 90] → `FAVOR_GRANDEUR` [1, 1.3, 1.6, 2] multiplying that faction's offer duration/florins/prestige. The Church's rungs 2–3 additionally require a standing Cathedral (effective rung capped, favor untouched). | `commissions.ts` → `favorRung()` |
| **Cooled / Affronted tiers** | Below `FAVOR_COOLED(35)`: offers skip `COOLED_SKIP_CHANCE(0.5)` of the time and force rung 0. Below `FAVOR_AFFRONTED(15)`: skip `AFFRONTED_SKIP_CHANCE(0.75)`. The ≥15 → <15 crossing fires a one-time denunciation: `DENOUNCE_PRESTIGE(−15)` city prestige (clamped ≥ 0) + alert card; re-arms on recovery. The design's single sanctioned citywide consequence. | `commissions.ts` → `favorTier()`; `tick.ts` `denounced` |
| **UI** | Per-patron crest banner top-right (favor %, standing, next rung, cathedral-gate/recovery hints); persistent arrival + denunciation cards (transient `offerAlert`/`denounceAlert` store fields); Decline button + "— Nth work" flavor on the commissions panel. | `ui/FactionBanner.tsx`; `ui/OfferAlert.tsx`; `ui/CommissionsPanel.tsx` |

## 11. Work display (Phase 9)

| Mechanic | What it does | Code |
|---|---|---|
| **Display slots** | Buildings/plazas carry typed slots (`painting`/`statue` interior, `plinth` exterior with a footprint cell). Painters fill painting; sculptors fill statue+plinth; architects none. | `app/game/art/display.ts` → `slotAccepts`, `SLOT_KINDS_BY_ARTIST`, `DisplaySlotDef` in `types.ts` |
| **Host boost** | `displayBoost = 1 + DISPLAY_HOST_BONUS(0.05)·min(count, 5)` → +5%/work, cap +25%. | `display.ts` → `displayBoost()` |
| **Per-tick trickle** | By quality `q` (captured commission prestige, default 2): every host adds `q·0.25` inspiration/tick. (Church-host prestige trickle removed Aug 2026.) | `display.ts` → `computeDisplaySummary()` |
| **Placement guard** | Artwork must be unassigned; host must be an origin with a matching free slot accepting the artist type. Shared by store + both assign UIs. | `display.ts` → `canDisplayWork()` |
| **Plinth rotation** | Plinth slot cells rotate with the host (integer ring for quarter turns; nearest mask cell for diagonals). | `display.ts` → `rotateSlotCell()`, `plinthSlotAt()` |
| **Real artwork assets** | Title-keyed maps swap procedural visuals for real art: pixelated PD paintings (thumbnails + easel canvas), 600-tri statue scans (holder mesh, async container load, shadow re-register). **Every title in every pool is a real work with its own asset** (Aug 2026) — the sculpture pools ↔ `STATUE_MODELS` (11) and the painter pools ↔ `ART_IMAGES` (24) are one-to-one in both directions, and no title repeats across pools; all three assertions plus the file-on-disk check are pinned by `artists.check.ts`. Only retired titles held by old saves still render procedural. | `art/artImages.ts` → `ART_IMAGES`, `STATUE_MODELS`; `art/artists.ts` → `TITLES`/`CHURCH_TITLES`; `render/displayArt.ts`; `scripts/make-pixel-art.py`, `scripts/make-low-poly-statue.py` |

## 12. Renaissance milestone (Phase 12, soft ending)

| Mechanic | What it does | Code |
|---|---|---|
| **Four/five derived gates** | Derived live, no gate tracking: prestige ≥ `RENAISSANCE_PRESTIGE(500)`; a completions-fed tradition pool (painter or sculptor — never the construction-fed architect pool) ≥ `RENAISSANCE_TRADITION_XP(6000)`; a displayed Wonder (quality ≥ `WONDER_PRESTIGE(15)`); a completed work for The Church; and ≥ `RENAISSANCE_NOBLE_HOUSES(2)` distinct "House …" requesters with completed works. | `app/game/art/renaissance.ts` → `renaissanceProgress()` |
| **Celebration** | One-shot `renaissanceReached` flag → title card once; the checklist rides the prestige chip's hover tooltip all game. Play continues (Golden Age). | store `useGameStore.ts`; `ui/RenaissanceCard.tsx`; `ui/TopBar.tsx` `PrestigeStat` |

## 13. Buildings — catalog & placement geometry

| Mechanic | What it does | Code |
|---|---|---|
| **Building catalog** | Single frozen source-of-truth array of every placeable building + derived lookups (`BUILDING_METADATA_BY_ID/TYPE`, `BuildingId` union). Categories: `residential, artist, materials, service, road, city, decoration`. | `app/game/buildings.ts` → `BUILDING_TYPES` |
| **`BuildingMetadata` shape** | `type, id, name, baseCost, size, color, footprint, generates?{income,inspiration}, housing?, amenities?, prestigeOnBuild?, isHub?, connectionBonus?, footTraffic?, placesOnRoads?, workersRequired?, maxWorkers?, artistCapacity?, artistType?, roadWidth?, linear?, paved?, supplies?, materialStorage?, buildCost?, commissionOnly?, displaySlots?`. | `app/game/types.ts` |
| **Effect flags** | `isHub` (plazas + bell_tower), `placesOnRoads` (market_stall), `footTraffic` (market_stall), `connectionBonus` (stall 1.0), `paved`, `linear` (colonnade/fence/stone_wall), `prestigeOnBuild` (cathedral 25), `roadWidth` (5 road variants), `buildCost` (landmarks; also future blueprint structures), `commissionOnly` (none currently — the blueprint roster is empty), `materialStorage` (warehouse 50), `areaDrag` + `paletteType` (plaza_paving — rect-drag surface sold under Civic), `retired` (plaza, small_plaza — off the palette, defs kept for old saves). `costEscalates` is computed from `type`, not a field. | `buildings.ts` |
| **Footprint mask** | Claimed grid cells + center offset per rotation; cardinal = axis-aligned rect (odd quarters swap w/d), cached per `dims×rotation`. | `buildings.ts` → `footprintMask()`, `footprintMaskFor()` |
| **Diagonal (45°) mask** | Diagonal rotations claim cells whose centers fall inside the yaw-rotated rect (ε-shrunk), re-anchored row-major — a true diamond, not the bbox. R cycles 8 rotation steps. | `buildings.ts` → `rasterizeDiagonalMask()`; rotation encoding `quarterOf`, `isDiagonalRotation`, `yawOfRotation` |

## 14. Placement validation

| Mechanic | What it does | Code |
|---|---|---|
| **Per-cell check** | Classifies each footprint cell `blocked/occupied/free`. Occupied blocks unless a decoration overlaps a non-origin cell, or a `placesOnRoads` building overwrites a plain cardinal road cell / plaza rim cell. Empty cells block on water unless the building is a bridge. | `app/game/placement/placementRules.ts` → `checkCell()` |
| **Plaza-rim guard** | A stall may only overwrite a plaza's outer-ring cells (mask-based) — never origin or interior, so stalls can't erode a plaza inward. | `placementRules.ts` → `isPlazaRimCell()` |
| **Batch planner** | Authoritative batch validation: bounds, in-batch overlap, water gate, terrace-level gate, affordability via `Σ escalatedCost(startRank+i)`, material affordability via the batch `materialCost` bill (`PlacementSnapshot` carries `materials` + optional `fundedBuilds`; `commissionOnly` structures need a token). | `placementRules.ts` → `planPlacement()`; per-frame probe `canPlaceAt()` |
| **Flat-ground gate** | Backstop only: footprint height spread ≤ `MAX_BUILD_SPREAD` (0.5 wu), but the field is sized so no real footprint ever trips it — elevation is visual, never difficulty. Roads/linear runs follow the surface. | `placementRules.ts` → `footprintSpread` check; `app/game/map/elevation.ts` |
| **Linear/road drag** | Plans a road/linear-decoration drag in one pass; existing compatible cells join free, only new empty cells validated + charged; `totalCost = baseCost·newCells`. | `placementRules.ts` → `planLinearPlacement()` |

## 15. Roads

| Mechanic | What it does | Code |
|---|---|---|
| **Widths & variants** | Path (1 cell), Road (2), Avenue (3) at 25ƒ/cell; Dirt Path (1, 10ƒ); Stone Bridge (2, 80ƒ, only structure on water); Plaza (rect-drag paving surface, 12ƒ/cell — `areaDrag`, blocked cells skipped uncharged; sells under Civic via `paletteType`, stays type road). Cost per cell. All carry plaza connectivity identically. | `buildings.ts` road defs |
| **Diagonal stretch** | Road drags snap to 8 octants (edges at 22.5°). Diagonal runs are a staircase of ordinary road cells with ribbon orientation stored in `rotation` (`ROAD_DIAG_NE = 1`, `ROAD_DIAG_NW = 3`; cardinal = undefined, so old saves untouched). Wider roads stamp offset rows to stay orthogonally contiguous. | `app/game/placement/roadStretch.ts` → `buildRoadStretch()` |
| **Snap-to-road (Shift)** | Snaps a building flush to the nearest road within `SNAP_RANGE = 6`, auto-facing it; diagonal ribbons rotate the building a true 45°. Purely an assist — no candidate falls through to free placement. | `app/game/placement/roadSnap.ts` → `findRoadSnap()` |
| **Junction plates / ribbons** | Diagonal-owned crossings drop an unrotated junction plate; renderer draws diagonal cells as √2-stretched decals. | `app/game/render/roadRenderer.ts` |

## 16. Water, terrain & map archetypes (seed-rolled)

| Mechanic | What it does | Code |
|---|---|---|
| **Archetype roll** | From a `water:${seed}` RNG: dry 15% / inland 30% / coastal 30% / scenic-river 15% / scenic-coast 10%. Scenic water stays ≥1.5wu clear of the buildable grid (plays like dry). | `app/game/map/water.ts` → `generateWater()` |
| **Elevation field** | Derived from `elevationSeed` (`elevation:` RNG namespace); three characters: ~40% plains (0.15 wu ripple, never dead flat), ~30% rolling hills (0.7 wu local octave, 40–60 wu), ~30% sloped (broad swell, 280–400 wu wavelengths, ≤ 2.5 wu end-to-end relief + 0.3 wu local octave). True flat only for `elevationSeed: null` (pre-v13 saves, demo). Invariants: 0 within 1.5 wu of water, slope-capped 0.03 wu/wu away from it; gradient ≤ 0.35/wu; every cathedral-sized spot stays under the spread gate. Memoized like water; null seed = flat (pre-v13 saves, demo). | `app/game/map/elevation.ts` → `generateElevation()`, `getElevation()`, `footprintSpread()`; `elevation.check.ts` |
| **River meander** | Centerline = two sine octaves with seeded amplitude/frequency jitter; width oscillates, floored at `MIN_RIVER_WIDTH = 1.2`; clamped `EDGE_MARGIN = 5` from edges. Slopes capped so raster rows overlap (no severed cells). | `water.ts` → `riverCenterAt`, `riverWidthAt`, `riverDistance` |
| **Sea / estuary** | Coastal archetypes inset a wiggling coastline from a grid edge; estuary widens the river ~2× toward the mouth via smoothstep. | `water.ts` → `seaDistance`, `coastEdge` |
| **Cell gating** | Water cells block building (mirrored in placement previews); the single sim gate is in `placeTiles`. Bridge is the one exception. Memoized on `mapSeed`. | `water.ts` → `getWaterCells()`; `placementRules.ts` |

## 17. Seed system

| Mechanic | What it does | Code |
|---|---|---|
| **Run seed** | Short 6-char lowercase alphanumeric, shareable, shown in Settings. | `app/game/map/seed.ts` → `generateSeed()` |
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
| Road/bridge/diagonal-ribbon renderer (+ plaza ground: raw paving in street setts, formed plazas in pale slabs, packed-earth campo quads — rebuilt wholesale per edit) | `render/roadRenderer.ts` |
| Terrain (seeded hills, fields, analytic water carving, in-grid elevation field) | `render/terrain.ts` → `createTerrain` |
| Ground-height samplers (registered terrain surface; seats, skirts, road/walker/dirt drape) | `render/groundLevel.ts` → `setGroundSampler`, `worldGroundY`, `cellGroundY`, `footprintGroundRange` |
| Water visuals (animated wobbling surface — the codebase's first animated material) | `render/waterMesh.ts` → `createWaterVisuals` |
| Paving/apron/dirt materials (3 plaza styles behind `?plaza=`; freeform plaza-paving slabs, 4 seed variants) | `render/paths.ts` |
| Gathering overlay (draped unlit heat + formed-plaza regions + premade-hub highlights, first `activeOverlay` view) | `render/gatheringOverlay.ts` → `createGatheringOverlay` |
| Masonry wall textures (coursed patterns per category) | `render/wallTexture.ts` |
| Procedural kit pieces (`proc:` blocks, roofs, surrounds, bifora, rose, portals) | `render/proceduralPieces.ts` |
| HUD root / one-panel-open enforcement | `ui/GameHUD.tsx` |
| Top bar (resources, clock, speed, editable city name, population + renaissance goal tooltips, settings) | `ui/TopBar.tsx` |
| Building palette (category flyouts, affordability dimming, raze tool, layered cancel) | `ui/BuildingPalette.tsx` |
| Artists/workshops panel (rank, XP, status reasons) | `ui/ArtistsPanel.tsx` |
| Commissions panel / assignment UI (eligible-workshop computation mirrors sim guards) | `ui/CommissionsPanel.tsx` |
| Gallery codex (completed works, Display at…/Recall) | `ui/GalleryPanel.tsx` |
| Display panel (per-building slot manager, store `inspectTarget`-driven) | `ui/DisplayPanel.tsx` |
| Building tooltip (status reasons, computed active effects, plaza/traffic hints, formed-piazza status on paving, raze salvage) | `ui/BuildingTooltip.tsx` |
| Overlay toggle + gathering legend | `ui/OverlayToggle.tsx` |
| Renaissance celebration card | `ui/RenaissanceCard.tsx` |
| Materials rail (per-material held/cap + live monthly rate, right screen edge) | `ui/MaterialsPanel.tsx` |
| Faction crest banner (per-patron favor/standing card) | `ui/FactionBanner.tsx` |
| Offer-arrival + denunciation alert cards | `ui/OfferAlert.tsx` |
| Raze confirm popover | `ui/RazeConfirm.tsx` |
| Main menu / continue-save peek (no hydration until Continue) | `ui/MainMenu.tsx` |

## 20. Music & sound (sporadic era soundtrack + interaction SFX + crowd ambience)

| Mechanic | What it does | Code |
|---|---|---|
| **Era pick** | Track era chosen from prestige at play time (`ERA_PRESTIGE` 0/200/450), falling back to the nearest lower era with tracks; avoids repeating the last track. Cosmetic `Math.random`, not the sim rng. | `app/game/audio/music.ts` → `pickTrack()` |
| **Sporadic playback** | One module-singleton `HTMLAudioElement` + one re-armed timer: first track right on city load (`startMusic()` in the menu click's gesture stack; blocked play — e.g. `?demo` — retries on next pointerdown), then 90–240 s silence between tracks. Plays through sim pause, stops on Main Menu. | `app/game/ui/useMusic.ts` |
| **Interaction SFX** | 15 one-shot Kenney CC0 clips (AAC in `public/sfx/`): sim-event sounds hook store actions + the tick's diff signals (offer coin-purse, denounce bell, payout coins, assign/decline, display clink, pause/speed, palette select); interactive-only sounds (place/raze thunks, deny, rotate) hook the input sites in `render/placement.ts` so demo-boot placements stay silent; panel open/close on `HudPanel`/Gallery; Renaissance fanfare on card appear. Cloned elements per play, rejected autoplay dropped. | `app/game/audio/sfx.ts` → `playSfx()`; `useGameStore.ts`; `render/placement.ts` |
| **Crowd ambience** | One looping crowd-murmur bed (Metzik CC BY 4.0, loop crossfade baked into the asset): volume = `ambienceVolume` × `bustle(population)` × camera-closeness (radius 3–80 → 1..`ZOOM_QUIET` 0.3 floor). Engine mirrors `useMusic`'s singleton shape; render loop feeds `camera.radius` per frame via a no-op-unless-changed setter. | `app/game/audio/ambience.ts` → `ambienceGain()`; `app/game/ui/useAmbience.ts`; `render/BabylonCanvas.tsx` |
| **Volume** | Persisted `musicVolume` (0–1, default 0.4), `sfxVolume` (default 0.5), and `ambienceVolume` (default 0.5); Settings sliders, 0 = mute. | `useGameStore.ts`; `ui/SettingsMenu.tsx` |

---

# Part 2 — Docs folder audit: planned vs. implemented

The `docs/` folder holds the main spec plus supplemental design/planning docs. Below, each doc's planned mechanics are sorted into **Built**, **Partially built**, and **Not built**.

## `design-doc.md` — main spec (systems reference)

*Restructured July 2026: the phase history and backlog moved out — the doc now holds only current-system design; [roadmap.md](../roadmap.md) holds what's ahead.*

**Built (everything the doc documents as a system):**
- All numbered phases 0–12: placement, time, building types, population & two-pass workers, artists + ranks, artworks/XP, commissions, work display, plaza connectivity, city tradition pools (replaced artist training/teaching, Aug 2026), Renaissance milestone. (Phase 7's supplier capacity gating was superseded by the material stockpile rework — §3.)
- Material stockpiles (five pools + construction `buildCost`s), factions slice 1 (patron admission, favor, rungs, denunciation), architects slice 1 (studio, city-teaches pool XP, blueprint-commission pipeline; its two launch structures — Baptistery and Loggia — were removed Aug 2026, leaving the roster empty), sporadic era-based music + interaction SFX + crowd ambience (§20).
- Graphics G1–G4 + generated kit pieces + category-identity pass; G5 mostly: river + bridge, decorative citizens, obelisk, seeded water archetypes, diagonal streets, snap-to-road + 45° buildings, market stall + foot traffic, main menu. Freeform plazas (gathering field, 4×4-core formation, authored/organic, formed-plaza hubs + inspiration) + the map-overlay system's first view (August 2026) — premade Plaza/Small Plaza retired from the palette.

**Cut (July 2026):** neighborhood zoning (individual placement is the permanent model); the diagonal row-house-blending follow-up (closed by construction — houses fill their footprint).

**Not built:** see [roadmap.md](../roadmap.md) — the single source for open items.

## `roadmap.md` — prioritized backlog

**Status: the live planning doc (July 2026).** Everything in it is by definition not built; when an item ships it's deleted there, documented in design-doc.md, and reflected here. Headline open items: the capstone slice (signature chains + Town Hall/Dome + Commune + `minRank`), map resources, remaining faction slices, richer economy, housing tiers 3–5, Mid/Late-era tracks (music + interaction SFX + crowd ambience shipped — §20).

## `building-effects.md` — non-art building effects

**Built (the July 2026 quick-win wave):**
- Decoration inspiration trickles (per-def, per-cell on linear pieces).
- Cottage/townhouse rents (2ƒ/5ƒ, occupancy-scaled).
- Chapel passive `amenities: +10`, workerless.
- Bell Tower as `isHub` connectivity relay + inspiration trickle.
- Cathedral consecration lump (`prestigeOnBuild: 25`).
- Manor `housing: 12`.
- Work-display sites (Phase 9) as an effect slot.

**Built (factions slice 1, July 2026):**
- **Requester-pool shaping** — Cathedral commission elevation (Church admission + upper favor rungs), Manor noble installs (`requesterPool` in `commissions.ts`).

**Built (architects slice 1, July 2026):**
- Blueprint-commission pipeline (funded tokens, `commissionOnly` gating, 0ƒ placement) — standing but dormant: its two launch structures, the **Baptistery** and **Loggia**, were removed Aug 2026 (save migration v11 strips them from old saves; the Loggia's design is shelved in building-effects.md → Blueprint lane).

**Not built:**
- Effect-2/3/4/5 buildings not yet in the roster: Banking House, Wool Merchant, Glassblower, Monastery, Spice Trader, Library, School, Anatomical Theatre — none placeable.
- All **slight-negative trade-offs** (Banking House ±, Market inspiration drag, Tavern −inspiration, bell-ringer worker draw, cathedral clergy staffing, forgone-plaza-bonus exclusions) — none implemented.
- Open-offer-cap bump on Manor.

## `factions.md` — requesters grown into patrons

**Status: slice 1 built (July 2026).** Patron admission, the 0–100 favor ladder, rungs/tiers, and the banner UI landed via `archive/factions-slice-1.md`; the main doc's Commission Requesters section supersedes this doc where they conflict.
- Still not built: taste profiles, seed-rolled roster, rivalry pairs, signature chains.

## `archive/factions-slice-1.md` — faction slice 1 implementation plan

**Status: built (July 2026) — archived.** The plan landed in full: favor 0–100 meter, patron admission gating, `FactionBanner.tsx`/`OfferAlert.tsx`, denunciation, rare-but-rich pacing (`COMMISSION_OFFER_CHANCE = 0.08`, `FLORINS_PER_PRESTIGE = 40`), `SAVE_VERSION = 8`. The "no relationship meters" rule was deliberately overturned (design-doc principle 4).

## `map-resources.md` — seed-determined supplier availability

**Status: not built** (though its supplier roster grew: **Timber Yard** and **Stone Quarry** now exist via architects slice 1 — always placeable, not seed-rolled). No seed-rolled resource flags; all seven suppliers are always placeable. Not built: per-run resource booleans, substitute pairs (marble↔clay, timber↔lime), Terracotta Kiln/Lime Kiln/Goldsmith/Glassblower buildings, offer-generator resource weighting, greyed-out "not found in this region" build menu, Market escape valve. (Water power *is* implicitly rolled — the dry archetype is that resource absent.)

## `artifacts/artist-brief.md` — architectural fittings commission

**Status: batch 1 built procedurally (not commissioned).** All four batch-1 pieces (rect window, arched window, door, arcade bay) are generated in `render/proceduralPieces.ts` to the brief's specs.
- Not built / open: batch 2–3 commission pieces — the genuinely organic ones. Per `llm-context/procedural-pieces.md`, bifora and rose window ended up built in code too; the remaining open commission pieces are the **dome** and **ivy**.

## `llm-context/procedural-pieces.md` & `llm-context/kitbashing.md` — generated-pieces state

**Status: current, mostly built.** Eleven+ `proc:` pieces generated (blocks, gable/hip roofs, surrounds, door frame/leaf, arch bay, portals, bifora, arch-leaf, rose). Panel-free pass complete (kit door/window/arch panels at 0 refs). **Open:** the organic commission pieces (dome, ivy) — the one thing still flagged as wanting an artist.

## `archive/citizen-population-plan.md` — population-scaled crowds

**Status: fully implemented (July 2026).** Count curve (`crowd.ts`), thin-instance factory (`citizenFigures.ts`), `&crowd=` dev flag, population wiring all landed. One deviation noted in the doc itself: walk-network clamp shipped at 1 figure per 2 cells (not 3).

## `performance-backlog.md` — rendering performance

**Status: mostly done.** Building/scatter thin-instance batching, on-demand shadows, shared smoke, O(occupied-tiles) sync scans, dirt-overlay frame-budgeting — all DONE. **Open:** only the "grid-growth checklist" for when `GRID_SIZE` grows toward ~160 (a future scaling task, not a bug).

---

## Summary — the biggest unbuilt planned systems

*(Mirrors [roadmap.md](../roadmap.md)'s priority tiers — that file is the ranked version.)*

1. **The capstone slice** — signature chains (`factions.md`) + Town Hall/Dome capstones + the Commune requester + `minRank` gating; converges the two half-built arcs (factions slice 1 and architects slice 1 are done).
2. **Map resources** — seed-rolled supplier availability + substitute pairs.
3. **Remaining faction slices** — taste profiles, seed-shuffled roster, rivalry pairs.
4. **Richer economy** and **housing tiers 3–5** — both need design first.
5. **Buildings overhaul** — more buildings (most Civic/Religious/Trade/Social/Waterfront, incl. the `building-effects.md` slight-negative trade-offs), value rebalance, category reorg, and building progression.
6. **Mid/Late-era tracks** (the audio track's remaining slice — music + interaction SFX + crowd ambience shipped, §20), **per-plaza paving picker**, **single-plaza enforcement**, **Lake archetype**, **campaign scenarios** — smaller/parallel items.
