# Patronage

Cozy Renaissance-Italy city builder. Full design spec: docs/design-doc.md — read it before implementing any game system (resources, commissions, buildings, worker allocation, artists, etc.). The prioritized backlog lives in docs/roadmap.md.

## Non-negotiable design constraints

From the doc's "Key Design Principles" — flag it if a change would violate one of these rather than just implementing it:

- No citizen pathfinding, no granular supply chains — service buildings are threshold checks, not simulations. Materials are city-wide pools spent lump-sum (a deliberate July 2026 reversal of "never a stockpile") — still no routing, no per-building stores, no mid-work stalls, and never on the top bar.
- All art is commissioned: every artwork has a requester, a name, and stakes. Requester favor (0–100) moves only on player decisions — completions up, declines/expiries down, **never time decay** — and consequences stay faction-scoped (sole exception: the one-time denunciation on first sliding into Affronted). Favor is never a top-bar resource.
- Exactly 3 headline resources (Florins, Inspiration, Prestige) + Population as status. Don't add a new top-bar resource without a real player decision behind it.
- Every building either unlocks something or passively boosts something — never requires active management.
- Spatial effects are soft: plaza proximity is a flat bonus, never a hard in/out radius.
- Renaissance = prestige milestone soft ending; play continues afterward.

- When a roadmap item ships, delete its entry from docs/roadmap.md and document the built system in the design doc, marked *(built)*. Update docs/artifacts/game-mechanics-audit.md in the same change: its Part 1 mechanic rows and Part 2 built/not-built status must track every completed feature. Built-system detail lives in the design doc **only** — this file gains a line only when a change introduces a new trap rule.
- Commit messages are one line, written in a technical register: lowercase, terse imperative, no conventional-commit prefixes. Add a body only when the change genuinely can't be understood without one — the docs carry the reasoning, not the git log.


## Game design conversations
When I describe a rough feature or mechanic idea, treat it as the start of a design conversation, not a spec. Ask what I'm imagining for player-facing behavior, what feel or tone I'm going for, and how it interacts with existing systems — before writing any code.

Don't implement until I say something like "let's build it," "go ahead," or "implement that." Until then, stay in discussion: propose variations, point out tensions with existing mechanics, ask what I've ruled out.

## Commits
Small fixes, one liners, etc. can be committed automatically, but larger changes (particularly those that come from a game design conversation) should not be committed automatically. When committing, commit in logical chunks that can be rolled back independently if the need arises. 


## Current state

Phases 0–12 are built (placement, tick loop, workers, artists + ranks + city-tradition XP pools, artworks, suppliers + five-material stockpiles, commissions + favor-bearing patrons, work display, plaza connectivity, Renaissance soft ending, architects/blueprint pipeline) plus graphics G1–G5 (water archetypes + bridges, diagonal roads, 45° buildings + snap-to-road, decorative crowds, SFX + crowd ambience), a main menu, and freeform plazas + the map-overlay system (August 2026 — premade Plaza/Small Plaza retired from the palette). The design doc's *(built)* sections are the authority on how every shipped system works — read the relevant one before touching a game system. Next up: docs/roadmap.md.

Trap rules — invariants that break things when missed (details in the design doc):

- Diagonal buildings (`Tile.rotation` 4–7) claim a diamond cell mask (`footprintMask` in `app/game/buildings.ts`) — never treat a diagonal footprint as its bounding box.
- Offer generation is rng-draw-order-sensitive: `maybeOfferCommission` keeps one fixed sequence of rng calls (new features stamp their data off existing draws — the materialCost and blueprint changes both did), or seeded games and old saves' future offers shift.
- Derived state stays derived: connectivity, traffic, escalated build costs, and renaissance progress recompute from tiles/state each tick and are never persisted. Any save-shape change needs a `saveMigration.ts` bump (v13 today); prefer designs that need none.
- The gathering field and formed plazas (`city/gathering.ts`) derive from tiles + mapSeed ONLY — no occupancy, no clocks, no walker positions (walkers are steered BY the field, never read into it) — and the field is monotonic non-decreasing in buildings/roads (`gathering.check.ts` asserts it). `computePlazaConnectivity`/`computeCityMetrics` now take `mapSeed`; all these computes memoize by tiles object identity, so never mutate a tiles object in place and re-ask (the store always replaces it — check fixtures must too).
- More of a producer never means less output (principle 6): no diminishing returns on suppliers, and traffic factors are monotonic non-decreasing (`traffic.check.ts` asserts it).
- The elevation field (`map/elevation.ts`) guarantees gentle slopes and flat ground near water (`elevation.check.ts` asserts both) — road draping, foundation skirts, and the water render pipeline all assume it. Elevation gates placement only (footprint spread), never output or connectivity; and render-side ground heights come exclusively from `render/groundLevel.ts`'s registered sampler (the terrain's own surface), never from re-deriving the field, so meshes and figures can't drift from the rendered ground.
- Decorative walkers are cosmetic-only (unseeded, frozen on pause) — their sim couplings are the count (`crowdSize`) and the render→audio bustle field, nothing else; bustle-dependent building output is deliberately deferred with blockers on record (see the doc's Ambient bed).

Graphics/visual-pass history and kitbash/texture/fitting gotchas live in app/game/render/CLAUDE.md, loaded automatically when working under app/game/render/.

## Code organization

- Layout: `app/game/` = sim logic, `app/game/render/` = Babylon rendering, `app/game/ui/` = DOM overlay UI, `app/stores/useGameStore.ts` = Zustand store. Check there before assuming a system exists. Sim modules live in feature subdirs of `app/game/` (`placement/`, `art/`, `city/`, `map/`, `audio/`, `demo/`); root holds only shared foundation imported by 3+ clusters (`types`, `constants`, `random`, `buildings`, `grid`) plus the orchestrators (`tick`, `saveMigration`, `checkHelpers`). New features go in the matching subdir, `.check.ts` colocated (the test glob is recursive).
- UI: one component file = one concern. Split when a file grows a second unrelated state cluster or an inline dropdown/submenu/tooltip beyond a few lines — `GameHUD.tsx` is the composition-root model (TopBar → SettingsMenu/TopBarStats is the precedent). Markup repeated in 2+ panels gets extracted (`ArtworkRow`, `CommissionMeta`); pure data like icon/label maps lives in data modules (`buildingIcons.ts`, `labels.ts`, `ARCHETYPE_LABELS` in water.ts), never inside a component file.
- Reuse before writing. Check for an existing helper/component before implementing one in place: sim math surfaced in UI calls the sim's own function so tooltip and tick can't drift (`plazaBoost`/`trafficFactor` in `city/traffic.ts`, `supplierRate` in `city/metrics.ts`, `applyFavor` in `art/commissions.ts`, `origins()` in `buildings.ts` for scan-all-buildings loops); panel chrome comes from the shared primitives in `Panel.tsx` (`Panel`, `HudPanel`, `HudToggleButton`, `CloseButton`, `Row`, `ModalBackdrop`) plus `ResourceStat` (tooltip-capable) and `ui/format.ts` (a July 2026 dedup pass deleted ~700 lines of hand-copied drift).
