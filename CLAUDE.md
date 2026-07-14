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

- After implementing a phase in the design doc, move it to the done section. When other features are complete, mark them as *(built)*. 

## Current state vs. doc phases

Phases 0–11 done (placement, tick loop, workers, artists + ranks, artworks, supplier capacity gating, commissions, work display, plaza connectivity, artist training) plus graphics G1–G4 and most of G5 (seeded water layer — five map archetypes from dry to coastal — + stone bridges; see the doc's water pass). Phase 9 work display: typed display slots on buildings/plazas (`app/game/display.ts`), marble statues on plinths + framed paintings on easels (`app/game/render/displayArt.ts`), displayed works trickle inspiration/prestige + boost their host, click-a-building `DisplayPanel` + Gallery "Display at…". Phase 11 training: continuous XP (`app/game/artists.ts` `progressArtworks` + `XP_RATES`) — passive practice every month for artists in an active workshop, multiplied when a higher-ranked workshop-mate teaches, plus the completion bonus. Next up: Phase 12 Renaissance milestone. Roads and houses are player-placed individually — that's intentional current scope (zoning is a later phase; auto-roads were cut); paved roads also drag at 45° diagonals (dirt/bridge cardinal-only — see the doc's Diagonal streets).

Layout: `app/game/` = sim logic (building defs, tick loop, worker allocation), `app/game/render/` = Babylon rendering, `app/game/ui/` = DOM overlay UI, `app/stores/useGameStore.ts` = Zustand store. Check there before assuming a system exists.
