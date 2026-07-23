# Building Effects — Non-Art Buildings
*Supplemental doc to [design-doc.md](design-doc.md) (the main spec) — effect design for buildings outside the art pipeline (landmarks, religious, trade, service, decorative). July 2026.*

---

## Governing rule

The building design test from the main doc is the whole constraint: **every building must unlock something or passively boost something — never require active management.** That yields a closed menu of five effect types. Every non-art building fits exactly one (occasionally two). If a proposed effect can't be expressed as *an unlock in the commission offer generator* or *a flat modifier in the tick loop*, it's the wrong effect for this game.

---

## Code hooks

Every effect below plugs into one of these existing anchor points — which is why most are ~10 lines:

- **Requester pool / offer generation** — `REQUESTERS` + `maybeOfferCommission` in `app/game/commissions.ts` (offer chance, open-offer cap, expiry, reward mix, duration)
- **Tick generation sums** — the florin/inspiration loop in `app/game/tick.ts` (staffing efficiency and plaza boost already applied)
- **Plaza connectivity** — `computePlazaConnectivity` + the `isHub` flag in `app/game/connectivity.ts`; the one spatial system
- **Amenity ceiling** — the `amenities` field summed in the tick loop
- **Teaching multiplier** — Phase 11 hook (planned)
- **Work display sites** *(built — Phase 9)* — `displaySlots` on the building def; displayed works trickle inspiration (or prestige in churches) and boost the host, via `app/game/display.ts` `computeDisplaySummary`

---

## The five effect slots

### 1. Unlock a commission lane

The most important slot — landmarks widen the *input* to the core loop rather than adding parallel systems. The effect is felt entirely through the Phase 8 offer stream: new requesters, bigger rewards, new artwork types. Concretely, gating is either requester-pool shaping *(built — factions slice 1: the pool starts empty; a Chapel/Cathedral admits the Church, each Palazzo installs the next noble house, and the Cathedral opens the Church's upper favor rungs — see the main doc's Commission Requesters)* or a new commission *lane* the existing requesters draw from (everything else below).

| Building | Unlocks |
|---|---|
| Cathedral | Grander Church commissions — the Church offers modest works from day one; a standing cathedral opens its upper favor rungs and signature chain |
| Palazzo | The next noble family's commissions (see below) |
| Baptistery | The Church's alternate capstone arc — the bronze doors (the Cathedral gates the ladder rungs; the Baptistery adds this alternate top-rung arc) |
| Banking House | Larger noble commissions |
| Wool Merchant | Tapestry commissions |
| Glassblower | Stained-glass commissions |
| Monastery | Illuminated-manuscript commissions — gated on Monastery **and** Paper Mill both existing (the first two-building combo unlock; still one boolean in the offer generator) |

Cathedral extras: completing it pays a **one-time prestige lump** *(built — July 2026: `prestigeOnBuild: 25`, paid in `placeTiles`; the commission-elevation effect above still waits on factions)*, and *(built — Phase 9)* it doubles as a work display site — 4 painting + 2 statue slots, and as a church its displayed works trickle prestige (see the toolkit).

### 2. Passive resource trickle

One number per building, feeding an existing headline resource. Subject to diminishing returns on duplicates so "stamp five markets" is never the answer *(built — July 2026: geometric decay per duplicate non-housing florin generator, by build order — `INCOME_DIMINISHING_RETURNS` in `app/game/tick.ts`)*.

| Building | Boosts |
|---|---|
| Market | Florins |
| Cottage, Townhouse *(built — July 2026)* | Florins — rents (2ƒ / 5ƒ per month base, the pre-scaffolded `income` field, finally switched on; scaled by occupancy `min(1, population/housing)` so empty houses pay little — a later rebalance pass) |
| Spice Trader | Florins + prestige |
| Baptistery | Flat prestige |
| Decorations (see below) | Inspiration |
| Vineyard, Olive Grove | ~~Florins~~ — the farmland-pays idea was declined for now (July 2026); they trickle inspiration with the other greenery instead. Stays open as a later lever |

**Decoration trickles *(built — July 2026)*:** one `generates.inspiration` field per def, scaled roughly by cost. Linear pieces (colonnade, fence, stone wall) are one origin tile per dragged cell, so their rates are per cell — the old per-placement numbers were rescaled down. Note the tick rounds the summed delta each month, so a lone bush yields nothing until it has company (accepted; decorations cluster).

| Decoration | Inspiration / month |
|---|---|
| Fountain | 2 |
| Obelisk, Bell Tower | 1.5 |
| Tree, Cypress, Vineyard, Olive Grove | 0.5 |
| Bush, Rocks, Boulder | 0.25 |
| Colonnade | 0.25 per cell |
| Fence, Stone Wall | 0.05 per cell |

### 3. Population thresholds

Service buildings (Bakery, Tavern, Bathhouse, Apothecary, Public Well, Market Stall) raise the amenity ceiling while staffed. Already built; every future service building does exactly this and nothing more. (The Market Stall's amenities additionally scale with foot traffic — bustle × housing catchment, see the design doc's Market Stall entry.)

**Chapel** joins this slot with a twist *(built — July 2026)*: flat `amenities: +10` with **zero workers required** — the one build-once, truly passive service ("spiritual comfort"). That's what differentiates it from the staffed services. *(Rejected alternative: a small prestige trickle — the passive amenity is more distinct.)*

### 4. Soft spatial aura

Library / Studiolo boosts nearby workshops using the same flat-bonus mechanic as plaza proximity (Phase 10). Reuse that one implementation — no second radius system.

**Bell Tower as connectivity relay** *(built — July 2026)*: the campanile is `isHub: true` and refreshes the Main Plaza's reach like a secondary plaza — cheaper than a plaza, and historically exactly what campaniles did: anchor a neighborhood. `connectivity.ts` now derives its hub set from the metadata flag (previously hard-coded plaza ids), so `isHub` is honest. Built workerless with a 1.5 inspiration trickle; the bell-ringer staffing negative (see Slight negatives) is still open.

### 5. Artist-growth modifiers

School speeds apprentice XP; Anatomical Theatre gives a technique bump. Both plug into the Phase 11 teaching multiplier.

---

## Mechanism toolkit

The slots above say *what* each building does; these are the cheap levers that express them — each one line in an existing function. New buildings should pick from this list before inventing anything:

1. **Requester-pool shaping** *(built — factions slice 1: `requesterPool` in `app/game/commissions.ts`)* — building existence shapes the patron pool. Three sources: Chapel/Cathedral → the Church is admitted, Palazzo → the next noble house in table order (seed-shuffled order is a future slice), and Cathedral → the Church's upper favor rungs (see [factions.md](factions.md)).
2. **Offer-stream shaping** — derive `COMMISSION_OFFER_CHANCE` / `MAX_OPEN_OFFERS` / `OFFER_EXPIRY_MONTHS` from buildings (Banking House: longer offer expiry — "the bank underwrites patience").
3. **Payout skewing** — flat % on commission completion (Banking House +15% florins; Baptistery +15% prestige on Church works).
4. **Arrival shaping** — terms in `maybeArriveArtist` (a Loggia or "Osteria degli Artisti" raises artist arrival chance).
5. **Connectivity relays** — `isHub` on non-plaza buildings (Bell Tower now; maybe Market later, piazza-del-mercato style).
6. **XP multipliers** — Phase 11 hook (School: apprentice XP boost; Anatomical Theatre: one-time permanent work-speed bump once built).
7. **Display sites** *(built — Phase 9)*: homes for finished works with different permanent trickles (plaza/most buildings = inspiration, church display = prestige) plus a small per-work host-effectiveness boost (+5% each, cap +25%). One choice per finished work, no management. `app/game/display.ts` (`displaySlots`, `computeDisplaySummary`, `canDisplayWork`).

---

## Slight negatives — trade-offs, not punishments

A touch of downside makes a build a decision instead of a reflex. The rules: a negative only exists as the flip side of a bigger boost, never drops anything below its base rate, never costs upkeep, and never damages a neighbor. One beat of thought at build time; zero ongoing attention.

**A — Paired resource trade-offs.** A second term in the same tick sum or payout multiplier:

| Building | Boost | Drag |
|---|---|---|
| Banking House | +15% florin payouts | −10% prestige payouts ("money is gauche") |
| Market | Florin trickle | Small inspiration drag ("commercial bustle vs. contemplation") — makes *another market or another plaza?* a real question, and self-limits market spam alongside diminishing returns |
| Anatomical Theatre | Permanent work-speed bump | Church offers slightly less frequent while it stands ("scandalous dissections") |
| Tavern (optional) | +Amenities | −1 inspiration (rowdy) |

**B — Worker draw on landmarks.** Reuses the existing staffing system wholesale — the negative is pulling scarce workers from the pool, and the inactive/desaturate feedback is already built:

- Bell Tower: `workersRequired: 1` (the bell-ringer) — its hub refresh and inspiration trickle run only while staffed
- Cathedral: a small clergy staff (~2) keeps its elevation live — understaffed, the Church's offers drop back to their day-one modest tier (never below it)

**D — Forgone plaza bonus.** Noisy buildings — Marble Supplier, Timber Yard, Market — don't *receive* the plaza connectivity bonus (one exclusion check where `plazaBoost` is applied in `app/game/tick.ts`). Never below base rate, no neighbor damage — but prime plaza frontage is wasted on a marble yard, so placement gets its beat of thought.

**Rejected:** true negative auras (a supplier dampening its neighbors' output) — that punishes building something that looks good where the player wants it, violating principle 6. Also rejected: requester personality trade-offs (e.g. an impatient family with short offer expiries) — cut to keep requesters pure flavor.

---

## Palazzo: resolving the dual listing

The main doc lists Palazzo as both a Civic landmark and Housing tier 4. **This doc collapses them:** a Palazzo is housing *(built — July 2026: `housing: 12`)* that also installs the next noble family as a commission requester *(built — factions slice 1: table order Medici → Strozzi → Pazzi; the seed-shuffled list is a future slice)*. One building, two effect slots (housing + commission unlock), and it makes the "named family palazzos" stretch item nearly free. Family offers skew prestige-heavy (the existing `mix: "prestige"` path). *Stretch: each palazzo also raises the open-offer cap by 1 — nobles keep the docket full.*

---

## What non-art buildings never do

- No relationship meters
- No upkeep or maintenance
- No per-building resources (church "faith", bank "interest rate")
- No hard radii — spatial effects are always soft flat bonuses

The tension budget is already spent on supplier capacity and commission deadlines.

---

## Implementation note

Most future buildings are ~10 lines each: a building def plus either a tag the commission offer generator checks or one term in an existing tick-loop sum. Specific yields (e.g. prestige per month) are balancing decisions made at implementation time — the numbers in this doc are starting points, not commitments. The July 2026 quick-win wave landed decoration trickles, chapel passive amenity, bell-tower hub, cathedral consecration lump, palazzo housing, and house rents; requester-pool shaping (chapel/cathedral church admission + elevation, palazzo noble installs) landed with factions slice 1.
