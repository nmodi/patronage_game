import type { ArtistRank } from "./types.ts";

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
export const ARTIST_ARRIVAL_CHANCE = 0.1; // per month, when a slot is open
export const ARTIST_ARRIVAL_COOLDOWN_MONTHS = 2;
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

// Career averages ~3.3 works/yr, so practice at 24 XP/yr is ~7% extra (minor);
// taught apprentices at 72 XP/yr get a ~20% head start.
export const XP_RATES = {
  practicePerMonth: 2, // passive training, every artist, every month
  teachingMultiplier: 3, // practice rate × this when a higher-ranked artist shares the workshop
  perCompletedWork: 100, // one-time gain for every member when the workshop completes a work
};

// --- Work display (display.ts) ---
// Quality = the minting commission's prestige (roughly 1..20; see
// maybeOfferCommission — ARTWORK_PRESTIGE 1..10, doubled by "prestige" requesters).
export const DEFAULT_ARTWORK_PRESTIGE = 2; // pre-Phase-9 works with no prestige field
export const DISPLAY_HOST_BONUS = 0.05; // host effectiveness per displayed work
export const DISPLAY_HOST_BONUS_MAX_WORKS = 5; // cap: +25%
export const DISPLAY_INSPIRATION_PER_PRESTIGE = 0.25; // inspiration/tick per work (q8 ≈ 2, half a plaza)
export const DISPLAY_PRESTIGE_PER_PRESTIGE = 0.02; // prestige/tick, church hosts (q20 ≈ 4.8/yr — flavor)

// --- Commissions & economy (commissions.ts) ---
export const COMMISSION_OFFER_CHANCE = 0.15; // per month, when under the cap
export const MAX_OPEN_OFFERS = 3;
export const OFFER_EXPIRY_MONTHS = 12;
export const BRONZE_COMMISSION_CHANCE = 1 / 3; // share of sculpture offers cast in bronze (the pricier medium)
export const FLORINS_PER_PRESTIGE = 25; // base commission reward conversion
export const REQUESTER_REWARD_SKEW = 2; // florins/prestige requesters' 2x/half split
export const FLORIN_RANK_COMPRESSION = 0.25; // share of the prestige rank curve florins keep (prestige keeps it all — florins are the constraint, prestige is the number that goes up)
export const INCOME_DIMINISHING_RETURNS = 0.85; // geometric decay per duplicate florin-generator of the same building, oldest first
export const COST_ESCALATION = 1.15; // per-duplicate build-cost growth for workshops/suppliers/services

// --- Renaissance milestone (renaissance.ts) ---
// The soft ending's gates. Prestige comes almost entirely from commissions
// (~1–20 each; cathedral +25 once), so 500 ≈ dozens of completed works — a
// full mid/late-game arc. A Wonder is a displayed work at WONDER_PRESTIGE
// quality: max is 20 (ARTWORK_PRESTIGE 10 × the 2x prestige-requester skew),
// so 15 demands a top-rank artist on a noble commission.
export const RENAISSANCE_PRESTIGE = 500;
export const WONDER_PRESTIGE = 15;
export const RENAISSANCE_NOBLE_HOUSES = 2; // distinct houses with a completed work (plus the Church)

// --- Raze (raze.ts) ---
export const RAZE_SALVAGE_FRACTION = 0.5; // half the build cost, salvaged

// --- Population (tick.ts) ---
export const POPULATION_DRIFT_PER_MONTH = 1; // pop moves toward the cap by this much/month

// --- Starting state (useGameStore.ts) ---
export const STARTING_FLORINS = 3000;
