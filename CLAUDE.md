# Patronage

Cozy Renaissance-Italy city builder. Full design spec: @docs/design-doc.md — read it before implementing any game system (resources, factions, commissions, buildings, worker allocation, Renaissance victory condition, etc.).

## Non-negotiable design constraints

From the doc's "Key Design Principles" — flag it if a change would violate one of these rather than just implementing it:

- No citizen pathfinding, no granular supply chains — service/material buildings are capacity/threshold checks, not simulations.
- Roads are fully automatic; players never place house-by-house, only zone neighborhoods.
- Exactly 3 headline resources (Florins, Inspiration, Prestige) + Population as status. Don't add a new top-bar resource without a real player decision behind it.
- Every building either unlocks something or passively boosts something — never requires active management.
- Renaissance is a multi-condition soft ending, not a score.

## Current state vs. doc phases

Implementation is early — roughly doc Phase 0–2. Layout: `app/game/` = sim logic (building defs, tick loop, worker allocation), `app/game/render/` = Babylon rendering, `app/game/ui/` = DOM overlay UI, `app/stores/useGameStore.ts` = Zustand store. Check there before assuming a system exists.
