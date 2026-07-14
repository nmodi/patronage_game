# Factions — Requesters Grown into Patrons
*Supplemental doc to [design-doc.md](design-doc.md) (the main spec) — design for the faction system: the "faction archetypes / personality types" dimension of the seed system, plus what "factions" means in this game at all. July 2026. Ideation only — not yet built, not scheduled.*

---

## The idea

Factions are the commission requesters grown into **patrons with memory and taste** — while staying inside principle 4 (requesters are flavor, not a management layer). The cast is exactly two archetypes: **the Church**, and **the named noble families** (each family its own faction, with its own favor count). Three additions over today's flavor-string table (`REQUESTERS` in `app/game/commissions.ts`, which already carries a `ponytail:` note that a faction system takes over offer generation later):

1. A **taste profile** — shapes *what* a faction asks for
2. A **favor ladder** — a per-faction count that only goes up
3. A **signature chain** — each faction's capstone story

Nothing about a faction ever punishes the player. Everything below is a carrot.

## What a faction is

Requester name + taste profile + favor count. That's the whole object. A faction is always the institution as a whole — the Church, House Medici — never a named individual patron.

**The pool is never empty.** The Church is a permanent roster member from month one, and the seed deals 1–2 starting noble houses at game start — so modest commissions flow from day one, exactly as the built Phase 8 game already plays. Buildings gate *growth and grandeur*, never the existence of the offer stream (locking the whole core loop behind a landmark would be the stick this doc forbids): each Palazzo installs the next noble family from the seed-shuffled list, and the Cathedral doesn't admit the Church — it *elevates* it, opening its upper favor rungs and signature chain (see the ladder below). You still choose which noble patrons join by what you build — the most Patronage-native faction management there is.

## Taste profiles

Today a requester only skews the florin/prestige split. A profile drives the offer generator instead: preferred artist types, materials, subject/title pools, and the reward mix.

| Faction | Asks for | Rewards |
|---|---|---|
| **The Church** | Frescos, altarpieces, devotional works, stained glass, vestments | Florin-heavy (today's `mix: "florins"` deepened) |
| **Noble families** | Portraits, bronzes, family-chapel works, tapestries for the palazzo | Prestige-heavy; per-family jitter from the seed (one house loves sculpture, another painting) |

**Hard line (reconciling building-effects.md's rejection of "requester personality trade-offs"):** profiles shape *what is offered* — subject, material, naming, reward mix — never *how hard it is*. No per-faction expiry, deadline, or pressure modifiers. That rejection stands; an "impatient family" is still cut.

## Favor ladder — a meter that only goes up

Each completed work for a faction ticks a per-faction count — per *family*, not for the nobility as a bloc; the Medici remember what you made for them, not what you made for the Strozzi. Thresholds unlock grander offers from that faction; nothing ever counts down.

- Rungs at **2 / 5 / 9** completed works (starting points, not commitments — same convention as building-effects.md)
- Higher rungs: longer, richer offers; rarer materials (bronze, gold) from that faction — and, once rank-gated commissions land (main doc, Later / stretch → Architects & building commissions), asks that name a minimum artist rank. Upper rungs are the only place an ask may exceed the city's current best rank: an aspirational carrot that waits, never a punishment
- Top rung: the faction offers its **signature chain** (below)
- **The Church's upper rungs (5 and 9) additionally require a standing Cathedral.** Favor still ticks past the thresholds without one — nothing is ever lost — but the grander asks and the signature chain wait until the cathedral stands (the Dome needs somewhere to go). Noble houses have no such gate: a family's palazzo is how it *enters* the roster, and the starting houses climb freely from day one
- **No decay, no neglect penalty.** Ignoring a faction only means never seeing its grandest asks
- **UI earns its keep by barely existing**: one line where the requester name already shows on the commission card — "House Medici — 4th work". Explicitly *not* a dedicated faction panel

This is how a meter "earns its way back in" per the main doc's Requesters section: by only going up and by needing almost no UI.

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

- Favor decay or neglect penalties
- A reputation currency (principle 8 — no fourth resource)
- Pick-a-side exclusivity or faction lockouts — the completionist cozy player is never punished
- A faction politics/events layer
- A dedicated faction UI panel
- A third requester archetype — the cast stays the Church + the families (lane-unlock buildings like the Wool Merchant widen *what's asked for*, never *who asks*)

## Interactions with existing systems

- **Offer generation** — this system is the planned successor to the `REQUESTERS` flavor-string table; taste profiles and ladder tier become inputs to `maybeOfferCommission` (`app/game/commissions.ts`). Design-level pointer only.
- **[building-effects.md](building-effects.md)** — requester-pool shaping has exactly two sources: Palazzo → next family (roster growth, atop the seed-dealt starters) and Cathedral → the always-present Church's upper rungs (elevation, not admission); every other unlock building adds a *lane* the existing patrons draw from. The "requester personality trade-offs" rejection is honored via the taste-profile hard line above.
- **[map-resources.md](map-resources.md)** — resource rolls gate lanes; a faction asking for an absent material follows that doc's rule (rare, deliberate Market-premium opportunities — never a stream of impossible offers).
- **Save shape** — one `Record<factionName, count>` is the only new state the ladder implies. Noted for scale, not planned.
