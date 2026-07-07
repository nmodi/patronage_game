# Patronage

Cozy Renaissance-Italy city builder. Full design spec: @docs/design-doc.md — read it before implementing any game system (resources, commissions, buildings, worker allocation, artists, etc.).

## Non-negotiable design constraints

From the doc's "Key Design Principles" — flag it if a change would violate one of these rather than just implementing it:

- No citizen pathfinding, no granular supply chains — service/material buildings are capacity/threshold checks, not simulations. Materials are supplier capacity, never a stockpile.
- All art is commissioned (once Phase 8 lands): every artwork has a requester, a name, and stakes. Requesters (Church, noble families, guilds) are flavor on commissions — no relationship meters or neglect penalties.
- Exactly 3 headline resources (Florins, Inspiration, Prestige) + Population as status. Don't add a new top-bar resource without a real player decision behind it.
- Every building either unlocks something or passively boosts something — never requires active management.
- Spatial effects are soft: plaza proximity is a flat bonus, never a hard in/out radius.
- Renaissance = prestige milestone soft ending; play continues afterward.

- After implementing a phase in the design doc, update that phase to note that it is DONE. 

## Current state vs. doc phases

Phases 0–7 done (placement, tick loop, workers, artists + ranks, artworks, supplier capacity gating) plus graphics G1–G4. Next up: Phase 8 commissions. Roads and houses are player-placed individually — that's intentional current scope (zoning is a later phase; auto-roads were cut).

Layout: `app/game/` = sim logic (building defs, tick loop, worker allocation), `app/game/render/` = Babylon rendering, `app/game/ui/` = DOM overlay UI, `app/stores/useGameStore.ts` = Zustand store. Check there before assuming a system exists.
