import type { ArtistRank, ArtistType } from "./types.ts";

export const BASE_TICK_INTERVAL = 1500;
export const GAME_SPEED_MULTIPLIERS = [1, 2, 3] as const;

// 120 × 0.5 = a 60-unit world extent; the finer cells exist so roads can be
// narrower than buildings (path/road/avenue widths).
export const GRID_SIZE = 120;
export const CELL_SIZE = 0.5;

// Population grows only to this ceiling until service buildings raise it.
export const BASE_POPULATION_CAP = 15;

// Single home for every gameplay-balance knob (not: per-building stats, which
// live with each building's other metadata in buildings.ts; not: water.ts's
// procedural terrain-generation ranges, a different kind of "tuning"). Files
// that already exported one of these keep re-exporting it from here so no
// other import path (including *.check.ts self-tests) has to change.

// --- Worker allocation (workers.ts) ---
export const MAX_STAFFING_BONUS = 0.5; // +50% output at max staffing vs. minimum

// --- Plaza connectivity (connectivity.ts) ---
export const PLAZA_CONNECTION_BONUS = 0.25; // at full strength
export const PLAZA_REACH = 30; // road cells (0.5 world units each) from the nearest hub until the bonus fades to 0

// --- Freeform plazas (gathering.ts / roadStretch.ts) ---
export const PLAZA_RECT_MAX_SPAN = 24; // rect-drag axis cap (bounds the pooled preview quads)
// Formation: a plaza is a connected union of fully-open CORE×CORE cell blocks
// (open = bare buildable ground, plaza paving, or land road cells). Authored
// blocks are all player paving; organic blocks additionally need the local
// gathering field at GATHER_FORM. 4×4 cells = 2×2 wu — wider than a 3-cell
// avenue (strip-proof by construction), smaller than the old Small Plaza.
export const PLAZA_CORE = 4;
// Gathering field: per-cell "would people linger here?", derived from tiles
// only (no occupancy, no time — the field moves only when the player builds).
// Additive contributions with linear falloff over GATHER_REACH Chebyshev
// cells, so the field is monotonic non-decreasing in houses/services/roads.
export const GATHER_REACH = 12; // cells (6 wu)
export const GATHER_HOUSING_W = 1; // per point of housing capacity
export const GATHER_AMENITY_W = 0.5; // per amenity point (well 5 … tavern 25)
export const GATHER_INSPIRATION_W = 2; // per generated inspiration/month (fountains, plazas — art draws crowds)
export const GATHER_JUNCTION_W = 3; // per road-junction cell (3+ road neighbors)
export const GATHER_FORM = 14; // mean field over a core block for organic formation
// Organic blocks must also be ENCLOSED — a campo is leftover space framed by
// buildings, streets, or the waterline, never open countryside: an outward
// lane from a block edge counts as bounded when it hits a tile or water
// within this many cells (the map edge frames nothing). Adding a tile only
// ever bounds more (monotonic).
export const PLAZA_ENCLOSE_REACH = 3;
// Organic seeds come in two tiers: a SMALL campo is a true courtyard — a 4x4
// clearing with every outward lane bounded, zero forgiveness — while a GRAND
// campo needs a generous 5x5 clearing but may keep a modest opening
// (openLanes of its outward lanes running past the reach). The strictness
// split is what scales formation with city character WITHOUT any population
// input: a village court framed flush forms a small campo, while a mature
// city's incidental pockets essentially never fully enclose (0 of 1917 hot
// 4x4 blocks in the maxed demo city), so sprawl isn't littered with minis —
// and since building only ever bounds MORE lanes and raises the field, a
// formed campo can never be un-formed by growth. The field is NOT the rarity
// lever (every framed pocket runs far past GATHER_FORM; raising the bar 3x
// changed nothing in the demo); pocket geometry is — 4x4-forgiving found 13
// organic pockets there, 5x5-forgiving finds 4. Once seeded, an organic
// plaza fills out: it floods its open pocket (bare ground, paving, furniture
// — never streets) up to PLAZA_ENCLOSE_REACH steps from the core, so a
// formed campo hugs its court walls instead of stranding a core-sized square
// (a small campo is fully walled, so it has nothing to fill).
export const ORGANIC_TIERS = [
  { core: 4, openLanes: 0 }, // small campo: perfectly framed
  { core: 5, openLanes: 2 }, // grand campo: mass forgives a modest opening
] as const;
// Formed-plaza effects: hubs like the premade plazas (connectivity reset), plus
// a flat Inspiration trickle per plaza — organic ones run slightly hotter, the
// entire reward for letting the city grow its own piazza (no one-time bonus:
// razing and re-forming gains nothing by construction).
export const PLAZA_FORMED_INSPIRATION = 2; // per formed plaza per month (the old Small Plaza's rate)
export const ORGANIC_PLAZA_MULT = 1.15;

// --- Foot traffic (traffic.ts) ---
// Bustle: the decorative-crowd curve (crowdCurve in crowd.ts) normalized —
// 60 figures ⇔ pop ≈ 64, a solid mid-game city. In the 1:1 crowd regime every
// new resident moves bustle ~1.7%, so the stall's tooltip climbs visibly.
export const BUSTLE_FULL = 60;
// Catchment: housing capacity in walking reach for full traffic — six
// cottages (housing 4) or three townhouses (housing 8); a dense quarter
// saturates it. Reach is PLAZA_REACH / 2: you'll walk half as far to a stall
// as a plaza's pull radiates.
export const CATCHMENT_FULL = 24;
export const CATCHMENT_REACH = 15; // network cells from the stall

// --- Artists & XP (artists.ts) ---
// Arrivals are rarer since the city-tradition rework: newcomers spawn already
// at the tradition floor, so each arrival is worth more.
export const ARTIST_ARRIVAL_CHANCE = 0.04; // per month, when a slot is open
export const ARTIST_ARRIVAL_COOLDOWN_MONTHS = 2;

// --- City discipline XP pools (artists.ts, tick.ts) ---
// The city itself accumulates XP per discipline: completions feed their own
// pool, construction spend feeds the architect pool. Persisted primary state.
// Always seed with { ...EMPTY_DISCIPLINE_XP } — accrual is pure/immutable and
// must never mutate a shared reference (the EMPTY_POOLS precedent).
export const EMPTY_DISCIPLINE_XP: Record<ArtistType, number> = {
  painter: 0,
  sculptor: 0,
  architect: 0,
};
export const POOL_PER_PRESTIGE = 10; // pool XP per point of a completed work's prestige, atop the flat perCompletedWork
export const FLOOR_FRACTION = 0.25; // every artist's xp sits at ≥ this share of their discipline's pool
export const EXTRA_ARTIST_PACE_BONUS = 0.5; // +50% work pace per additional workshop-mate

export const WORK_DURATION_MONTHS: Record<ArtistRank, number> = {
  apprentice: 6,
  journeyman: 5,
  artisan: 5,
  virtuoso: 4,
  master: 4,
  renowned_master: 3,
  grand_master: 3,
};

export const ARTWORK_PRESTIGE: Record<ArtistRank, number> = {
  apprentice: 1,
  journeyman: 2,
  artisan: 3,
  virtuoso: 4,
  master: 6,
  renowned_master: 8,
  grand_master: 10,
};

// Cumulative thresholds with escalating steps so each promotion takes years
// of game time and top ranks stay rare. Scale: one completed work = 100 xp.
export const RANK_XP: { rank: ArtistRank; xp: number }[] = [
  { rank: "grand_master", xp: 4000 },
  { rank: "renowned_master", xp: 3000 },
  { rank: "master", xp: 2200 },
  { rank: "virtuoso", xp: 1500 },
  { rank: "artisan", xp: 900 },
  { rank: "journeyman", xp: 400 },
];

// Completions are the only personal XP source; the discipline pool's floor
// (FLOOR_FRACTION) replaces the old practice/teaching trickle.
export const XP_RATES = {
  perCompletedWork: 100, // one-time gain for every member when the workshop completes a work
  // The city teaches architects: pool XP per florin the player spends placing
  // structures (feeds pool.architect, no studio required). A 1500ƒ cathedral
  // banks 75 ≈ ¾ of a completed work; a 10ƒ fence floors to 0.
  perFlorinBuilt: 0.05,
};

// --- Work display (display.ts) ---
// Quality = the minting commission's prestige (roughly 1..60 at max favor; see
// maybeOfferCommission — ARTWORK_PRESTIGE 1..10 × COMMISSION_PRESTIGE_SCALE,
// doubled by "prestige" requesters, × grandeur up to 2).
export const DEFAULT_ARTWORK_PRESTIGE = 2; // pre-Phase-9 works with no prestige field
export const DISPLAY_HOST_BONUS = 0.05; // host effectiveness per displayed work
export const DISPLAY_HOST_BONUS_MAX_WORKS = 5; // cap: +25%
export const DISPLAY_INSPIRATION_PER_PRESTIGE = 0.25; // inspiration/tick per work (q8 ≈ 2, half a plaza)

// --- Commissions & economy (commissions.ts) ---
// Offers are rare-but-rich since factions slice 1: missing one costs favor, so
// arrivals are ~one a year and rewards are buffed to compensate (the old pacing
// was 0.15/month at FLORINS_PER_PRESTIGE 25, no prestige scale).
export const COMMISSION_OFFER_CHANCE = 0.08; // per month, when under the cap
export const MAX_OPEN_OFFERS = 3;
export const OFFER_EXPIRY_MONTHS = 12;
export const BRONZE_COMMISSION_CHANCE = 1 / 3; // share of sculpture offers cast in bronze (the pricier medium)
export const FLORINS_PER_PRESTIGE = 40; // base commission reward conversion
export const COMMISSION_PRESTIGE_SCALE = 1.5; // on minted base prestige (rarer offers, richer each)
export const REQUESTER_REWARD_SKEW = 2; // florins/prestige requesters' 2x/half split
export const FLORIN_RANK_COMPRESSION = 0.25; // share of the prestige rank curve florins keep (prestige keeps it all — florins are the constraint, prestige is the number that goes up)
export const INCOME_DIMINISHING_RETURNS = 0.85; // geometric decay per duplicate florin-generator of the same building, oldest first
export const COST_ESCALATION = 1.15; // per-duplicate build-cost growth for workshops/suppliers/services

// --- Material stock (materials.ts, tick.ts, commissions.ts) ---
// Materials accumulate in one city-wide pool each and are spent lump-sum when a
// commission is assigned. Per-supplier rate/storage live in buildings.ts.
export const MATERIAL_STORAGE_BASE = 20; // pool cap floor per material, before any supplier or warehouse
export const MATERIAL_COST_SCALE = 5; // × the artwork rank curve (1–10) × grandeur (1–2) = a commission's material cost

// --- Factions (commissions.ts, tick.ts) ---
// Per-faction favor, 0–100. Reads default to FAVOR_START; moves only on player
// decisions (completions up, declined/expired offers down) — never time decay.
export const FAVOR_START = 50;
export const FAVOR_PER_WORK = 8; // per completed work for that faction
export const FAVOR_SLIGHT = 5; // per declined or expired open offer
export const FAVOR_RUNGS = [60, 75, 90]; // favor levels unlocking grander offers
export const FAVOR_GRANDEUR = [1, 1.3, 1.6, 2]; // × duration/florins/prestige at rung 0–3
export const FAVOR_COOLED = 35; // below: offers thin out, rung forced to 0
export const FAVOR_AFFRONTED = 15; // below: near-silence + one-time denunciation
export const COOLED_SKIP_CHANCE = 0.5;
export const AFFRONTED_SKIP_CHANCE = 0.75;
export const DENOUNCE_PRESTIGE = 15; // one-time city prestige hit on crossing into affronted

// --- Renaissance milestone (renaissance.ts) ---
// The soft ending's gates. Prestige comes almost entirely from commissions
// (~1–30 each at neutral favor; cathedral +25 once), so 500 ≈ dozens of
// completed works — a full mid/late-game arc. A Wonder is a displayed work at
// WONDER_PRESTIGE quality: since the factions pacing rebalance a master's noble
// work (6 × 1.5 × 2 = 18) clears it — a high-rank artist on a noble commission.
export const RENAISSANCE_PRESTIGE = 500;
export const WONDER_PRESTIGE = 15;
export const RENAISSANCE_NOBLE_HOUSES = 2; // distinct houses with a completed work (plus the Church)
// The "Master" gate: a completions-fed discipline pool (painter/sculptor —
// never the construction-fed architect pool) this deep ≈ 15–20 mid-game works,
// matching the old grind to a personal Master.
export const RENAISSANCE_TRADITION_XP = 6000;

// --- Raze (raze.ts) ---
export const RAZE_SALVAGE_FRACTION = 0.5; // half the build cost, salvaged

// --- Population (tick.ts) ---
export const POPULATION_DRIFT_PER_MONTH = 1; // pop moves toward the cap by this much/month

// --- Starting state (useGameStore.ts) ---
export const STARTING_FLORINS = 3000;
