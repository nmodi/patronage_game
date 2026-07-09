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
- **Masterwork display sites** — Phase 9 hook (planned)

---

## The five effect slots

### 1. Unlock a commission lane

The most important slot — landmarks widen the *input* to the core loop rather than adding parallel systems. The effect is felt entirely through the Phase 8 offer stream: new requesters, bigger rewards, new artwork types. Concretely, gating means adding/removing entries in `REQUESTERS` based on which buildings exist.

| Building | Unlocks |
|---|---|
| Cathedral | Religious commissions — "The Church" enters the requester pool only once a cathedral stands |
| Guildhall | Craft commissions |
| Palazzo | That noble family's commissions (see below) |
| Baptistery | Higher-*tier* Church commissions |
| Banking House | Larger noble commissions |
| Wool Merchant | Tapestry commissions |
| Glassblower | Stained-glass commissions |
| Monastery | Illuminated-manuscript commissions — gated on Monastery **and** Paper Mill both existing (the first two-building combo unlock; still one boolean in the offer generator) |

Cathedral extras: completing it pays a **one-time prestige lump** (the consecration moment), and once Phase 9 lands it doubles as a masterwork display site (see the toolkit).

### 2. Passive resource trickle

One number per building, feeding an existing headline resource. Subject to diminishing returns on duplicates so "stamp five markets" is never the answer.

| Building | Boosts |
|---|---|
| Market | Florins |
| Spice Trader | Florins + prestige |
| Baptistery | Flat prestige |
| Decorations (see below) | Inspiration |
| Vineyard, Olive Grove | Florins — working farmland: "pretty things inspire, productive land pays" |

**Decorations are the current gap:** the main doc lists decorations→inspiration as built-in, but no decoration in `buildings.ts` has a `generates` field today. Closing it is one field per def, scaled roughly by cost (the tick loop sums before rounding, so fractions accumulate):

| Decoration | Inspiration / month |
|---|---|
| Fountain | 2 |
| Colonnade, Obelisk, Bell Tower | 1.5 |
| Tree, Cypress | 0.5 |
| Bush, Rocks, Boulder, Fence, Stone Wall | 0.25 |

### 3. Population thresholds

Service buildings (Bakery, Tavern, Bathhouse, Apothecary, Public Well, Market Stall) raise the amenity ceiling while staffed. Already built; every future service building does exactly this and nothing more.

**Chapel** joins this slot with a twist: flat `amenities: +10` with **zero workers required** — the one build-once, truly passive service ("spiritual comfort"). That's what differentiates it from the staffed services. *(Rejected alternative: a small prestige trickle — the passive amenity is more distinct.)*

### 4. Soft spatial aura

Library / Studiolo boosts nearby workshops using the same flat-bonus mechanic as plaza proximity (Phase 10). Reuse that one implementation — no second radius system.

**Bell Tower as connectivity relay:** mark the campanile `isHub: true` (or a half-strength refresh) so it refreshes the Main Plaza's reach like a secondary plaza — cheaper than a plaza, and historically exactly what campaniles did: anchor a neighborhood. Reuses the one spatial system verbatim. Runs only while its bell-ringer is staffed (see Slight negatives).

### 5. Artist-growth modifiers

School speeds apprentice XP; Anatomical Theatre gives a technique bump. Both plug into the Phase 11 teaching multiplier.

---

## Mechanism toolkit

The slots above say *what* each building does; these are the cheap levers that express them — each one line in an existing function. New buildings should pick from this list before inventing anything:

1. **Requester-pool gating** — building existence adds/removes `REQUESTERS` entries (Cathedral→Church, Palazzo→named family, Guildhall→guilds).
2. **Offer-stream shaping** — derive `COMMISSION_OFFER_CHANCE` / `MAX_OPEN_OFFERS` / `OFFER_EXPIRY_MONTHS` from buildings (Guildhall: open-offer cap +1; Banking House: longer offer expiry — "the bank underwrites patience").
3. **Payout skewing** — flat % on commission completion (Banking House +15% florins; Baptistery +15% prestige on Church works).
4. **Arrival shaping** — terms in `maybeArriveArtist` (a Loggia or "Osteria degli Artisti" raises artist arrival chance).
5. **Connectivity relays** — `isHub` on non-plaza buildings (Bell Tower now; maybe Market later, piazza-del-mercato style).
6. **XP multipliers** — Phase 11 hook (School: apprentice XP boost; Anatomical Theatre: one-time permanent work-speed bump once built).
7. **Display sites** — Phase 9 hook: alternate masterwork homes with different permanent trickles (plaza display = inspiration, cathedral display = prestige). One choice per finished work, no management.

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
- Cathedral: a small clergy staff (~2) keeps the Church commission lane open

**D — Forgone plaza bonus.** Noisy buildings — Marble Supplier, Timber Yard, Market — don't *receive* the plaza connectivity bonus (one exclusion check where `plazaBoost` is applied in `app/game/tick.ts`). Never below base rate, no neighbor damage — but prime plaza frontage is wasted on a marble yard, so placement gets its beat of thought.

**Rejected:** true negative auras (a supplier dampening its neighbors' output) — that punishes building something that looks good where the player wants it, violating principle 6. Also rejected: requester personality trade-offs (e.g. an impatient family with short offer expiries) — cut to keep requesters pure flavor.

---

## Palazzo: resolving the dual listing

The main doc lists Palazzo as both a Civic landmark and Housing tier 4. **This doc collapses them:** a Palazzo is housing that also installs a named noble family as a commission requester — the first palazzo built is the Medici, the second the Strozzi, and so on down a fixed family list. One building, two effect slots (housing + commission unlock), and it makes the "named family palazzos" stretch item nearly free. Family offers skew prestige-heavy (the existing `mix: "prestige"` path). *Stretch: each palazzo also raises the open-offer cap by 1 — nobles keep the docket full.*

---

## What non-art buildings never do

- No relationship meters
- No upkeep or maintenance
- No per-building resources (church "faith", bank "interest rate")
- No hard radii — spatial effects are always soft flat bonuses

The tension budget is already spent on supplier capacity and commission deadlines.

---

## Implementation note

Most future buildings are ~10 lines each: a building def plus either a tag the commission offer generator checks or one term in an existing tick-loop sum. Specific yields (e.g. prestige per month) are balancing decisions made at implementation time — the numbers in this doc are starting points, not commitments. None of the effects above are built yet; the quick-win order is decoration trickles → chapel passive amenity → bell-tower hub flag → cathedral/palazzo requester gating.
