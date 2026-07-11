# Map Resources — Seed-Determined Supplier Availability
*Supplemental doc to [design-doc.md](design-doc.md) (the main spec) — design for the "available resources on the map" dimension of the seed system. July 2026. Not yet built.*

---

## The idea

Each new game's seed determines **which resources the map offers**, and therefore which playstyles the run supports. A map without marble makes a painting city; a map without timber pushes painters toward fresco. Resources constrain *how* you play, not whether you can.

This is the seed-system bullet "available resources on the map" from the main doc, fleshed out.

## What a "map resource" is (and isn't)

The main doc's rule holds: **materials are supplier capacity, never a stockpile** (principle 2). So a map resource is not deposits on tiles, not a quantity mined down, not a new top-bar number. It is a per-run flag:

> Resource present → its supplier building is placeable. Absent → it isn't (Market covers the gap at a premium).

One boolean per resource, rolled from the seed at new-game time. No new sim — the existing supplier-capacity gating does all the work once the building exists.

## Resource roster

Each resource gates a supplier, which gates artist types and/or commission lanes (the same unlock slot [building-effects.md](building-effects.md) uses):

| Resource | Supplier | Gates | When absent |
|---|---|---|---|
| **Pigment** | Pigment Trader *(built)* | Painters | Never absent — see guarantees |
| **Marble** | Marble Supplier *(built)* | Marble sculpture | Sculptors work terracotta (if clay) or the run is a painting city |
| **Clay** | Terracotta Kiln | Terracotta sculpture (della Robbia), building-cost discount | Sculpture is marble-only |
| **Timber** | Timber Yard | Panel paintings, intarsia | Painters skew to fresco commissions |
| **Lime** | Lime Kiln | Fresco commissions | Painters skew to panel commissions |
| **Gold** | Goldsmith | Luxury/gilded commissions (altarpieces, reliquaries) | Fewer top-paying Church/noble offers |
| **Wool** | Wool Merchant (+ Dyeworks) | Tapestry commissions | No textile lane |
| **Sand/soda** | Glassblower | Stained-glass commissions | No glass lane; leans coastal |
| **Water power** | Paper Mill, Water Mill | Printed/scholar commissions, mill florins | Already rolled — the dry archetype *is* this resource being absent |

Second wave (flavor once the skeleton works): **Alum** (boosts Dyeworks — the Tolfa monopoly; a soft limiter layered on wool), **Silk** (top-tier luxury textiles).

## Substitute pairs — the core design move

An absent resource should **redirect** the player, not delete content. Two pairs do that:

- **Marble ↔ Clay** — sculpture in marble (prestigious) vs terracotta (cheaper, humbler works). A no-marble map with clay still has sculptors; they just run a della Robbia workshop.
- **Timber ↔ Lime** — panel painting vs fresco. Both are painter lanes; which one this map favors is the constraint.

This is the cozy version of scarcity (principle 5 without violating 7): "this map is a fresco city," never "you can't paint."

## Guarantees

Rolled availability must never produce a dead run:

- **Pigment is always present** — an art game needs painters.
- **At least one of Marble / Clay** — sculpture always has *some* lane.
- **At least one of Timber / Lime** — painters always have *some* lane.
- Water power comes from the map archetype roll, not an independent flag (dry and scenic maps lack it; river/coastal maps have it). Glass leans coastal for flavor but shouldn't hard-require it — placement gating on water is fine, a functionality requirement is not (see the water-adjacency tension in the main doc's River & Waterfront section).

## Interactions with existing systems

- **Commission offers must respect the seed.** The offer generator weights toward available resources; commissions needing an absent resource appear rarely, as deliberate Market-premium opportunities — not as a stream of impossible offers. This is the one real sim change the feature needs (`maybeOfferCommission` in `app/game/commissions.ts`).
- **Market as the escape valve.** The main doc's planned Market repurpose (overflow material capacity bought with florins) is exactly the bypass for absent resources: the lane exists, it just costs more. Scarcity stays a nudge (principle 6), never a wall.
- **Build menu** — suppliers for absent resources are hidden or shown greyed with "not found in this region" flavor (lean toward shown-greyed: it teaches players that other seeds differ).
- **Seed display** — Settings already shows the seed; resource availability could join the map-archetype info there.

## Scope for v1

Five axes: **pigment (always on), marble, clay, timber, gold**, plus **water power** free from the archetype roll. Binary present/absent, guarantees above. Lime, wool, sand, alum, silk arrive with their buildings.
