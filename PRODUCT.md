# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primarily the author — Patronage is a personal project built for fun; there are no external audience commitments. It is still designed for an imagined player: cozy-first (the Dorfromantik / Townscaper crowd — low pressure, aesthetic satisfaction, relaxed sessions) with enough system depth underneath to reward players who dig in. When cozy tone and systems depth conflict, cozy leads.

## Product Purpose

A cozy city builder set in Renaissance Italy (1400s–1500s). The player is a patron-ruler building a city where art and culture flourish: attract artists, keep them supplied and inspired, and route them onto commissions — the contracts through which all art gets made. Success is the pleasure of the loop and the beauty of the town, capped by the Renaissance prestige milestone (a soft ending; play continues).

## Positioning

Not a survival game, not a logistics puzzle, not a pathfinding optimizer. The differentiating mechanism is **commissioned art with stakes**: every artwork has a requester, a name, and consequences (patron favor), and the city exists to serve that loop rather than the other way around. Simulation is deliberately shallow where other city builders go deep — service buildings are threshold checks, spatial effects are soft bonuses, and there are exactly three headline resources.

## Operating Context

- Played in a desktop browser with mouse + keyboard; no touch or mobile support intended.
- Sessions are drop-in/drop-out: players may leave anytime, so autosave and quick resume are product requirements (save lives in localStorage, hydrated only via the main menu's Continue).
- Must hold a playable framerate on modest hardware (integrated GPUs, older laptops).
- Entirely client-side: no accounts, no backend, no server-side state, ever.

## Capabilities and Constraints

`docs/design-doc.md` is the product authority — read it before touching any game system. Its "Key Design Principles" are non-negotiable and flagged in CLAUDE.md; the load-bearing ones:

- Exactly 3 headline resources (Florins, Inspiration, Prestige) + Population as status. Materials are an accumulating stockpile but stay off the top bar; favor is never a top-bar resource.
- No citizen pathfinding, no granular supply chains; decorative citizens are cosmetic.
- Every building either unlocks something or passively boosts something — never requires active management.
- Spatial effects are soft (flat bonuses, no hard radii).
- Patron favor moves only on player decisions, never time decay; consequences stay faction-scoped.

Tech: React + TypeScript + React Router v7, Babylon.js canvas for the 3D city, React DOM overlay (Tailwind) for all UI, Zustand store. Sim logic in `app/game/`, rendering in `app/game/render/`, UI in `app/game/ui/`.

## Brand Commitments

- Name: **Patronage**.
- Committed visual reference (recorded in the design doc, not invented here): Dorfromantik — low-poly isometric 3D, warm ochre/terracotta/sandstone, "one town" cohesion. The design doc's Visual Style section is binding for the game canvas.
- Tone: warm, cozy, unhurried; nothing punishing or alarmist in UI language.

## Evidence on Hand

- `docs/design-doc.md` — full design spec with phase history; `docs/` also holds factions, building-effects, map-resources plans and an artist brief (`docs/artifacts/artist-brief.md`).
- No marketing copy, testimonials, screenshots-for-press, or store assets exist; future surfaces must not fabricate reception or player quotes.

## Product Principles

1. Cozy leads — depth is discovered, never demanded; no system should require active management to avoid failure.
2. Art is the point: commissions with requesters and stakes are the spine every other system feeds.
3. Simulate shallowly, suggest richly — visual life (crowds, smoke, banners) over mechanical simulation.
4. A number joins the UI only if a real player decision stands behind it.
5. Respect the session: safe to walk away, instant to resume, playable on the hardware already in the house.
