/**
 * Question type + tier definitions for the Learn mode mixed-question engine.
 *
 * ── Audit notes (key architecture found before building) ───────────────────────
 * - Learn ("learning") mode currently shares Test mode's single round engine in
 *   components/GeographyGame.jsx. The question rendered is decided purely by the
 *   session LEVEL (F1/F2 = "Find it" map click, N1/N2 = "Name it" text entry) and
 *   MODE (countries/capitals/flags), NOT by gameType. Learn mode only differs by:
 *   session build (weak-country queue via lib/learning.buildLearningQueue),
 *   `gameType: 'learning'` on stat writes, and the Learn More hints panel.
 * - EMA mastery updates run SERVER-SIDE in lib/mastery.computeMasteryUpdate
 *   (called from lib/db.recordCountryPerformance via POST /api/country-stats).
 *   Graduation only advances when gameType === 'test'. This file must NOT change
 *   any of that; Learn mode layers its own per-question-type EMA weight
 *   multiplier ON TOP of the existing update (see LEARN_EMA_MULTIPLIERS below),
 *   which a later step wires into the update path without touching Test mode.
 * - Country data (data/countries.json) fields available as question fuel:
 *   name, capital, population, area (km²), landlocked, languages[], neighbors[]
 *   (iso3), region, flag (derived iso2 -> flagcdn), facts[].
 *
 * ── Mastery → tier ladder (per spec) ──────────────────────────────────────────
 *   mastery 0.00 – 0.30 → Tier 4 only
 *   mastery 0.30 – 0.50 → Tier 3 + Tier 4
 *   mastery 0.50 – 0.70 → Tier 2 + Tier 3
 *   mastery 0.70 – 0.90 → Tier 1 + Tier 2
 *   mastery 0.90+       → Tier 1 only (prep for Test graduation)
 * Bounds are lower-inclusive (e.g. exactly 0.30 → the 0.30–0.50 band).
 *
 * One gap this ladder creates: `flags` category has no Tier 1 type (free recall
 * of a flag is not in the type list), so `mastery ≥ 0.90` + `flags` would be
 * empty. getEligibleQuestionTypes applies a documented safety fallback (widen to
 * adjacent tiers) so it never returns an empty list for a valid category.
 */

import { ROUND_OUTCOMES } from "@/lib/countryStats";

export const QUESTION_TIERS = {
  TIER_1: "tier_1", // free recall — highest EMA weight
  TIER_2: "tier_2", // recognition with context
  TIER_3: "tier_3", // comparative
  TIER_4: "tier_4", // association — lowest EMA weight
};

/**
 * EMA weight multipliers layered on top of the existing Test-mode EMA update,
 * for Learn mode answers only. Keyed by tier + outcome. Free recall (Tier 1)
 * gets full Test-equivalent credit/penalty (1.0); easier recognition /
 * comparative / association formats prove less, so they move mastery less.
 * These are the raw multiplier values; see resolveLearnEmaMultiplier for how an
 * (tier, outcome) pair maps to one of these entries.
 */
export const LEARN_EMA_MULTIPLIERS = {
  tier_1_correct_fast: 1.0, // same as Test — full credit
  tier_1_correct_slow: 1.0,
  tier_1_wrong: 1.0, // full penalty — this is a real miss
  tier_1_reveal: 1.0,

  tier_2_correct_fast: 0.6,
  tier_2_correct_slow: 0.6,
  tier_2_wrong: 0.5,

  tier_3_correct: 0.3,
  tier_3_wrong: 0.2,

  tier_4_correct: 0.15,
  tier_4_wrong: 0.1,
};

/**
 * Resolves the numeric Learn-mode EMA multiplier for a given question tier and
 * round outcome. Pass the result to computeMasteryUpdate's `learnModeMultiplier`.
 *
 * Notes on the mapping (the multiplier table only defines the keys below):
 * - Tier 1: distinguishes fast/slow correct, a first-try miss (`wrong`), and a
 *   reveal, matching the Test-mode outcome granularity (all 1.0).
 * - Tier 2: correct (fast/slow, both 0.6); any miss — second-try OR reveal —
 *   uses `tier_2_wrong` (the table defines no separate tier_2_reveal).
 * - Tier 3 / Tier 4: binary correct/wrong only (these formats have no clue
 *   ladder and no fast/slow distinction), so any non-first-try-correct is wrong.
 *
 * @param {string} tier - one of QUESTION_TIERS
 * @param {string} outcome - one of ROUND_OUTCOMES
 * @param {{ fast?: boolean }} [opts]
 * @returns {number}
 */
export function resolveLearnEmaMultiplier(tier, outcome, { fast = false } = {}) {
  const isCorrect = outcome === ROUND_OUTCOMES.FIRST_TRY_CORRECT;
  const isReveal = outcome === ROUND_OUTCOMES.NEEDED_REVEAL;
  const m = LEARN_EMA_MULTIPLIERS;

  switch (tier) {
    case QUESTION_TIERS.TIER_1:
      if (isCorrect) return fast ? m.tier_1_correct_fast : m.tier_1_correct_slow;
      if (isReveal) return m.tier_1_reveal;
      return m.tier_1_wrong;
    case QUESTION_TIERS.TIER_2:
      if (isCorrect) return fast ? m.tier_2_correct_fast : m.tier_2_correct_slow;
      return m.tier_2_wrong;
    case QUESTION_TIERS.TIER_3:
      return isCorrect ? m.tier_3_correct : m.tier_3_wrong;
    case QUESTION_TIERS.TIER_4:
      return isCorrect ? m.tier_4_correct : m.tier_4_wrong;
    default:
      return 1.0;
  }
}

// Game modes a question type can be used in. Comparative (Tier 3) and the
// region/language association types are mode-agnostic (the fact being tested is
// about the country regardless of whether the session mode is countries,
// capitals, or flags). Others are tied to their category's content.
const ALL_CATEGORIES = ["countries", "capitals", "flags"];

export const QUESTION_TYPES = {
  // ── Tier 1 · free recall ────────────────────────────────────────────────────
  BLANK_MAP_CLICK: {
    tier: QUESTION_TIERS.TIER_1,
    id: "blank_map_click",
    categories: ["countries"],
  },
  FREE_NAME_ENTRY: {
    tier: QUESTION_TIERS.TIER_1,
    id: "free_name_entry",
    categories: ["countries"],
  },
  CAPITAL_FREE_RECALL: {
    tier: QUESTION_TIERS.TIER_1,
    id: "capital_free_recall",
    categories: ["capitals"],
  },
  NEIGHBOR_RECALL_ALL: {
    tier: QUESTION_TIERS.TIER_1,
    id: "neighbor_recall_all",
    categories: ["countries"],
    requires: ["neighbors"],
  },

  // ── Tier 2 · recognition with context ────────────────────────────────────────
  NEIGHBOR_FREE_RECALL: {
    tier: QUESTION_TIERS.TIER_2,
    id: "neighbor_free_recall",
    categories: ["countries"],
    requires: ["neighbors"],
  },
  BINARY_MAP_CHOICE: {
    tier: QUESTION_TIERS.TIER_2,
    id: "binary_map_choice",
    categories: ["countries"],
  },
  FLAG_IDENTIFICATION: {
    tier: QUESTION_TIERS.TIER_2,
    id: "flag_identification",
    categories: ["flags"],
  },
  CAPITAL_MATCHING: {
    tier: QUESTION_TIERS.TIER_2,
    id: "capital_matching",
    categories: ["capitals"],
  },
  NEIGHBOR_CONFIRM: {
    tier: QUESTION_TIERS.TIER_2,
    id: "neighbor_confirm",
    categories: ["countries"],
    requires: ["neighbors"],
  },
  NEIGHBOR_SELECT_ALL: {
    tier: QUESTION_TIERS.TIER_2,
    id: "neighbor_select_all",
    categories: ["countries"],
    requires: ["neighbors"],
  },

  // ── Tier 3 · comparative (mode-agnostic) ─────────────────────────────────────
  POPULATION_COMPARE: {
    tier: QUESTION_TIERS.TIER_3,
    id: "population_compare",
    categories: ALL_CATEGORIES,
  },
  AREA_COMPARE: {
    tier: QUESTION_TIERS.TIER_3,
    id: "area_compare",
    categories: ALL_CATEGORIES,
  },
  // Single-select border ID — easier recognition than select-all (Tier 2) or
  // free recall (Tier 1), so it sits with the other comparative formats.
  NEIGHBOR_IDENTIFICATION: {
    tier: QUESTION_TIERS.TIER_3,
    id: "neighbor_identification",
    categories: ["countries"],
    requires: ["neighbors"],
  },

  // ── Tier 4 · association ──────────────────────────────────────────────────────
  // A single yes/no geographic fact (not a two-country comparison), so it lives
  // in the association tier alongside language family.
  LANDLOCKED_CHECK: {
    tier: QUESTION_TIERS.TIER_4,
    id: "landlocked_check",
    categories: ALL_CATEGORIES,
  },
  LANGUAGE_FAMILY: {
    tier: QUESTION_TIERS.TIER_4,
    id: "language_family",
    categories: ALL_CATEGORIES,
    requires: ["languages"],
  },
};

// Fast lookup by string id (the `id` value is what gets persisted / passed around).
export const QUESTION_TYPES_BY_ID = Object.fromEntries(
  Object.values(QUESTION_TYPES).map((type) => [type.id, type])
);

export function getQuestionTypeById(id) {
  return QUESTION_TYPES_BY_ID[id] ?? null;
}

/**
 * Mastery bands drive which tiers are eligible. Each band lists its tiers in
 * priority order (harder/primary tier first, per the spec's "Tier N + Tier M"
 * ordering). `min` is the inclusive lower bound of mastery (0–1).
 */
export const MASTERY_BANDS = [
  {
    id: "new",
    min: 0,
    tiers: [QUESTION_TIERS.TIER_4],
  },
  {
    id: "developing",
    min: 0.3,
    tiers: [QUESTION_TIERS.TIER_3, QUESTION_TIERS.TIER_4],
  },
  {
    id: "proficient",
    min: 0.5,
    tiers: [QUESTION_TIERS.TIER_2, QUESTION_TIERS.TIER_3],
  },
  {
    id: "advanced",
    min: 0.7,
    tiers: [QUESTION_TIERS.TIER_1, QUESTION_TIERS.TIER_2],
  },
  {
    id: "mastered",
    min: 0.9,
    tiers: [QUESTION_TIERS.TIER_1],
  },
];

// Full tier ordering from hardest (Tier 1) to easiest (Tier 4), used by the
// safety fallback when a band × category yields no eligible types.
const TIER_FALLBACK_ORDER = [
  QUESTION_TIERS.TIER_1,
  QUESTION_TIERS.TIER_2,
  QUESTION_TIERS.TIER_3,
  QUESTION_TIERS.TIER_4,
];

export function getMasteryBand(mastery) {
  const score = Number.isFinite(mastery) ? Math.min(Math.max(mastery, 0), 1) : 0;
  // Highest band whose threshold the score meets.
  let band = MASTERY_BANDS[0];
  for (const candidate of MASTERY_BANDS) {
    if (score >= candidate.min) band = candidate;
  }
  return band;
}

function typesForTiers(orderedTiers, category) {
  const tierPriority = new Map(orderedTiers.map((tier, index) => [tier, index]));
  return Object.values(QUESTION_TYPES)
    .filter(
      (type) =>
        tierPriority.has(type.tier) &&
        (!category || type.categories.includes(category))
    )
    .sort((a, b) => tierPriority.get(a.tier) - tierPriority.get(b.tier));
}

/**
 * Returns the question types eligible for a country at a given mastery level and
 * session category, ordered by tier priority for that mastery band. Data-level
 * feasibility (e.g. a country actually having neighbors/languages) is enforced
 * downstream by the individual question generators via each type's `requires`.
 *
 * If the band's tiers have no type for the category (e.g. flags has no Tier 1
 * type at mastery ≥ 0.90), the eligible tiers are progressively widened along
 * TIER_FALLBACK_ORDER until at least one type is found, so this never returns an
 * empty list for a valid category.
 *
 * @param {number} mastery - decay-adjusted mastery score, 0–1
 * @param {"countries"|"capitals"|"flags"} category - session game mode
 * @returns {Array<{tier: string, id: string, categories: string[], requires?: string[]}>}
 */
export function getEligibleQuestionTypes(mastery, category) {
  const band = getMasteryBand(mastery);
  const strict = typesForTiers(band.tiers, category);
  if (strict.length > 0) return strict;

  // Fallback: keep the band's own tiers first (still prioritized), then append
  // remaining tiers hardest→easiest until the category has coverage.
  const wideningTiers = [
    ...band.tiers,
    ...TIER_FALLBACK_ORDER.filter((tier) => !band.tiers.includes(tier)),
  ];
  return typesForTiers(wideningTiers, category);
}
