# Factions — Requesters Grown into Patrons
*Supplemental doc to [design-doc.md](design-doc.md) (the main spec) — design for the faction system: the "faction archetypes / personality types" dimension of the seed system, plus what "factions" means in this game at all. July 2026. **Slice 1 is built** (patron admission, the 0–100 favor scale, rungs/tiers, banner UI — see [plans/factions-slice-1.md](plans/factions-slice-1.md) and the main doc's Commission Requesters section, which supersedes this doc where they conflict); taste profiles, seed-rolled roster, rivalry, and signature chains remain future slices.*

---

## The idea

Factions are the commission requesters grown into **patrons with memory and taste** — while staying inside principle 4 (requesters are flavor, not a management layer). The cast is exactly two archetypes: **the Church**, and **the named noble families** (each family its own faction, with its own favor count). Three additions over today's flavor-string table (`REQUESTERS` in `app/game/commissions.ts`, which already carries a `ponytail:` note that a faction system takes over offer generation later):

1. A **taste profile** — shapes *what* a faction asks for
2. A **favor ladder** — a per-faction count that only goes up
3. A **signature chain** — each faction's capstone story

Nothing about a faction ever punishes the player. Everything below is a carrot.

## What a faction is

Requester name + taste profile + favor count. That's the whole object. A faction is always the institution as a whole — the Church, House Medici — never a named individual patron.

**Patron admission gates the pool** *(built — slice 1, deliberately overturning this doc's earlier "the pool is never empty" sketch)*: the pool starts empty — a Chapel (400ƒ, or the Cathedral) admits the Church, each Palazzo (900ƒ) installs the next noble house (Medici → Strozzi → Pazzi, table order for now; the seed-shuffled list is a future slice), and the Cathedral additionally opens the Church's upper favor rungs and (future) signature chain. The commissions panel points a fresh city at the Chapel, so the "empty pool" phase is a first goal, not a wall. You choose which patrons join by what you build — the most Patronage-native faction management there is.

## Taste profiles

Today a requester only skews the florin/prestige split. A profile drives the offer generator instead: preferred artist types, materials, subject/title pools, and the reward mix.

| Faction | Asks for | Rewards |
|---|---|---|
| **The Church** | Frescos, altarpieces, devotional works, stained glass, vestments | Florin-heavy (today's `mix: "florins"` deepened) |
| **Noble families** | Portraits, bronzes, family-chapel works, tapestries for the palazzo | Prestige-heavy; per-family jitter from the seed (one house loves sculpture, another painting) |

**Hard line (reconciling building-effects.md's rejection of "requester personality trade-offs"):** profiles shape *what is offered* — subject, material, naming, reward mix — never *how hard it is*. No per-faction expiry, deadline, or pressure modifiers. That rejection stands; an "impatient family" is still cut.

## Favor — a 0–100 relationship scale *(built — slice 1, superseding the count-only ladder sketched earlier)*

Each faction carries **favor, 0–100** (start 50) — per *family*, not for the nobility as a bloc; the Medici remember what you made for them, not what you made for the Strozzi. It moves **only on player decisions**: +8 per completed work, −5 per declined or expired open offer. No time decay — that stays banned.

- **Rungs by current level** — favor ≥60 / ≥75 / ≥90 unlocks grandeur: that faction's offers multiply duration, florins, and prestige by up to 2×. Future slices hang rarer materials and minimum-rank asks on the upper rungs; the top rung is where the **signature chain** (below) will live
- **The Church's rungs 2–3 additionally require a standing Cathedral.** Favor itself is never capped or lost — the grander asks just wait until the cathedral stands (the Dome needs somewhere to go). Noble houses have no such gate
- **Cooled (< 35)**: offers from that faction thin out (skip half the time) and stay modest. **Affronted (< 15)**: near-silence, and the first crossing fires a one-time **denunciation** — −15 city prestige and an alert card, the design's single citywide consequence; it re-arms only after favor recovers. Every rare offer that still arrives is the recovery path
- **Offers are rare-but-rich**: since missing one costs favor, arrivals are ~one a year, announced by a persistent Civ-trade-request-style arrival card, with rewards buffed to compensate
- **UI**: a horizontal crest banner top-right, one clickable crest per admitted patron → a card with favor %, standing, next rung, and hints — plus "— Nth work" cumulative flavor beside the requester on commission cards. *(Overturns this doc's earlier "no faction panel" non-goal — deliberately; the banner is glanceable, not a management screen.)*

This is how the meter earned its way back in per the main doc's principle 4: it moves only on decisions, its consequences stay faction-scoped (denunciation excepted), and it never asks for upkeep.

## Signature chains — the capstones

Reaching a faction's top rung offers a 2–3 part commission arc ending in a famous, named landmark work with outsized prestige. History hands us the hooks:

- **The Church** — fresco cycle → altarpiece → **the Dome**; with a Baptistery standing, an alternate arc ends in **the bronze doors** (Ghiberti's Gates of Paradise)
- **A noble family** — portrait → family chapel → an equestrian bronze or a colossus

The Church chain's Cathedral prerequisite is structural — its top rung sits behind the Cathedral gate above, and the Dome is that cathedral's. The Baptistery alternate arc is unchanged.

Chain capstones are also where **building commissions** (main doc, Later / stretch → Architects & building commissions) naturally live: the Dome and the family chapel are architecture, so those chain steps become building commissions asking for a high-ranked architect once that pipeline exists — until then, chains stay artwork-only.

Chain works are natural feeders into the Phase 12 Renaissance milestone if it later grows extra conditions — that's the milestone's decision, not this doc's.

## Seed-rolled roster

Fleshes out the seed stretch bullet "faction archetypes / personality types":

- The seed shuffles a pool of ~6–8 named families (Medici, Strozzi, Pazzi, Rucellai, Pitti, Sforza, Gonzaga, Este…) into the install order; the first 1–2 houses are dealt at game start (the city's old families), and each Palazzo installs the next — so each run meets its houses in a different sequence
- Per-family taste jitter is seed-assigned (which house favors which art)
- Map resources from [map-resources.md](map-resources.md) gate *lanes*, not factions: wool present → the tapestry lane exists, whoever asks
- The Church is always available; a cathedral unlocks its grander asks (upper rungs + signature chain)

## Rivalry as spice, not state

Rarely, an offer arrives as a **pair**: two factions bidding for the same artist type with contrasting reward mixes — two houses, or a house against the Church. Accepting one dismisses the other, which simply re-offers something later. A real either/or a few times per run, zero grudge bookkeeping. Flavor text may wink ("the Pazzi will remember this") — mechanically, nobody remembers anything.

## Non-goals (banned regardless)

- Favor **time decay** — favor moves only on player decisions (declining/ignoring an offer is a decision; the calendar is not)
- A reputation currency (principle 8 — no fourth resource)
- Pick-a-side exclusivity or faction lockouts — the completionist cozy player is never punished
- A faction politics/events layer
- A third requester archetype — the cast stays the Church + the families (lane-unlock buildings like the Wool Merchant widen *what's asked for*, never *who asks*)

*(Two earlier non-goals — "no meter ever goes down" and "no dedicated faction UI" — were deliberately overturned by slice 1's favor scale and crest banner.)*

## Interactions with existing systems

- **Offer generation** — `maybeOfferCommission` (`app/game/commissions.ts`) now takes the admitted pool (`requesterPool`) and favor; taste profiles become a further input in a future slice. The guild entries are removed.
- **[building-effects.md](building-effects.md)** — requester-pool shaping has exactly two sources: Palazzo → next family (roster growth, atop the seed-dealt starters) and Cathedral → the always-present Church's upper rungs (elevation, not admission); every other unlock building adds a *lane* the existing patrons draw from. The "requester personality trade-offs" rejection is honored via the taste-profile hard line above.
- **[map-resources.md](map-resources.md)** — resource rolls gate lanes; a faction asking for an absent material follows that doc's rule (rare, deliberate Market-premium opportunities — never a stream of impossible offers).
- **Save shape** — one persisted `Record<factionName, favor>` (built: `favor` in the store, save v8 seeds it from per-requester completed works at +8 each).
