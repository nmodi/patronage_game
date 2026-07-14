# Patronage

Cozy Renaissance-Italy city builder. Full design spec: @docs/design-doc.md — read it before implementing any game system (resources, commissions, buildings, worker allocation, artists, etc.).

## Non-negotiable design constraints

From the doc's "Key Design Principles" — flag it if a change would violate one of these rather than just implementing it:

- No citizen pathfinding, no granular supply chains — service/material buildings are capacity/threshold checks, not simulations. Materials are supplier capacity, never a stockpile.
- All art is commissioned (once Phase 8 lands): every artwork has a requester, a name, and stakes. Requesters (Church, noble families) are flavor on commissions — no relationship meters or neglect penalties.
- Exactly 3 headline resources (Florins, Inspiration, Prestige) + Population as status. Don't add a new top-bar resource without a real player decision behind it.
- Every building either unlocks something or passively boosts something — never requires active management.
- Spatial effects are soft: plaza proximity is a flat bonus, never a hard in/out radius.
- Renaissance = prestige milestone soft ending; play continues afterward.

- After implementing a phase in the design doc, move it to the done section. When other features are complete, mark them as *(built)*. 

## Current state vs. doc phases

Phases 0–11 done (placement, tick loop, workers, artists + ranks, artworks, supplier capacity gating, commissions, work display, plaza connectivity, artist training) plus graphics G1–G4 and most of G5 (seeded water layer — five map archetypes from dry to coastal — + stone bridges; see the doc's water pass). Decorative citizens scale with population (exact when low/countable, damped toward a cap beyond — `crowdSize` in `app/game/crowd.ts`) and render as thin-instance batches (`createThinInstanceFigureFactory` in `app/game/render/citizenFigures.ts`, 15 draw calls for any crowd size); count is their only sim coupling — still cosmetic random-walkers, no pathfinding. Phase 9 work display: typed display slots on buildings/plazas (`app/game/display.ts`), marble statues on plinths + framed paintings on easels (`app/game/render/displayArt.ts`), displayed works trickle inspiration/prestige + boost their host, click-a-building `DisplayPanel` + Gallery "Display at…". Phase 11 training: continuous XP (`app/game/artists.ts` `progressArtworks` + `XP_RATES`) — passive practice every month for artists in an active workshop, multiplied when a higher-ranked workshop-mate teaches, plus the completion bonus. Next up: Phase 12 Renaissance milestone. Roads and houses are player-placed individually — that's intentional current scope (zoning is a later phase; auto-roads were cut); paved roads also drag at 45° diagonals (dirt/bridge cardinal-only — see the doc's Diagonal streets). Buildings rotate in 45° steps (R cycles 8; `Tile.rotation` 4–7 = quarter + 45°, claiming a diamond cell mask via `footprintMask` in `app/game/buildings.ts` — never treat a diagonal footprint as its bounding box), and holding Shift while placing snaps the ghost flush to a nearby road, auto-facing it (`app/game/roadSnap.ts`); row-house blending and colonnade extend are deliberately skipped at 45° (see the doc's Snap-to-road section). A main menu fronts the boot (`app/game/ui/MainMenu.tsx`: continue, new game with optional seed or archetype pick via `seedForArchetype`, demo tour — `?demo` is no longer dev-only); Settings → Main Menu reloads back to it, and the save only hydrates on Continue.

Layout: `app/game/` = sim logic (building defs, tick loop, worker allocation), `app/game/render/` = Babylon rendering, `app/game/ui/` = DOM overlay UI, `app/stores/useGameStore.ts` = Zustand store. Check there before assuming a system exists.
