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
 *   multiplier ON TOP of the existing update (see TIER_EMA_WEIGHT below), which a
 *   later step wires into the update path without touching Test mode behavior.
 * - Country data (data/countries.json) fields available as question fuel:
 *   name, capital, population, area (km²), landlocked, languages[], neighbors[]
 *   (iso3), region, flag (derived iso2 -> flagcdn), facts[].
 *
 * ── NOTE on getEligibleQuestionTypes ──────────────────────────────────────────
 * The originating spec was truncated mid-sentence at the description of
 * getEligibleQuestionTypes. The mastery→tier ladder below is a reasonable,
 * clearly-documented default: weaker countries get easier recognition /
 * association formats, and free recall unlocks as mastery grows. Bands span two
 * tiers so every session mixes formats and every (band, category) has coverage.
 * Thresholds are exported so they can be tuned once the full spec is available.
 */

export const QUESTION_TIERS = {
  TIER_1: "tier_1", // free recall — highest EMA weight
  TIER_2: "tier_2", // recognition with context
  TIER_3: "tier_3", // comparative
  TIER_4: "tier_4", // association — lowest EMA weight
};

/**
 * Per-tier EMA weight multiplier, layered on top of the existing Test-mode EMA
 * update for Learn mode answers only. Free recall (Tier 1) fully counts; easier
 * recognition/association formats prove less, so they move mastery less. Tunable.
 */
export const TIER_EMA_WEIGHT = {
  [QUESTION_TIERS.TIER_1]: 1.0,
  [QUESTION_TIERS.TIER_2]: 0.7,
  [QUESTION_TIERS.TIER_3]: 0.5,
  [QUESTION_TIERS.TIER_4]: 0.3,
};

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
  NEIGHBOR_FREE_RECALL: {
    tier: QUESTION_TIERS.TIER_1,
    id: "neighbor_free_recall",
    categories: ["countries"],
    requires: ["neighbors"],
  },

  // ── Tier 2 · recognition with context ────────────────────────────────────────
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
  REGION_IDENTIFICATION: {
    tier: QUESTION_TIERS.TIER_2,
    id: "region_identification",
    categories: ALL_CATEGORIES,
  },
  NEIGHBOR_CONFIRM: {
    tier: QUESTION_TIERS.TIER_2,
    id: "neighbor_confirm",
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
  NEIGHBOR_COUNT_COMPARE: {
    tier: QUESTION_TIERS.TIER_3,
    id: "neighbor_count_compare",
    categories: ALL_CATEGORIES,
    requires: ["neighbors"],
  },
  LANDLOCKED_CHECK: {
    tier: QUESTION_TIERS.TIER_3,
    id: "landlocked_check",
    categories: ALL_CATEGORIES,
  },

  // ── Tier 4 · association ──────────────────────────────────────────────────────
  REGION_GROUPING: {
    tier: QUESTION_TIERS.TIER_4,
    id: "region_grouping",
    categories: ALL_CATEGORIES,
  },
  LANGUAGE_FAMILY: {
    tier: QUESTION_TIERS.TIER_4,
    id: "language_family",
    categories: ALL_CATEGORIES,
    requires: ["languages"],
  },
  FLAG_COLOR: {
    tier: QUESTION_TIERS.TIER_4,
    id: "flag_color",
    categories: ["flags"],
  },
  SHARED_BORDER_CLICK: {
    tier: QUESTION_TIERS.TIER_4,
    id: "shared_border_click",
    categories: ["countries"],
    requires: ["neighbors"],
  },
};

// Fast lookup by string id (the `id` value is what gets persisted / passed around).
export const QUESTION_TYPES_BY_ID = Object.fromEntries(
  Object.values(QUESTION_TYPES).map((type) => [type.id, type])
);

export function getQuestionTypeById(id) {
  return QUESTION_TYPES_BY_ID[id] ?? null;
}

export function getTierEmaWeight(tier) {
  return TIER_EMA_WEIGHT[tier] ?? 1.0;
}

/**
 * Mastery bands drive which tiers are eligible. Each band lists its tiers in
 * rough priority order (harder/primary first). Bands overlap two tiers so a
 * session always mixes formats. `min` is inclusive lower bound of mastery (0–1).
 */
export const MASTERY_BANDS = [
  {
    id: "new",
    min: 0,
    tiers: [QUESTION_TIERS.TIER_4, QUESTION_TIERS.TIER_2],
  },
  {
    id: "developing",
    min: 0.25,
    tiers: [QUESTION_TIERS.TIER_2, QUESTION_TIERS.TIER_3],
  },
  {
    id: "proficient",
    min: 0.5,
    tiers: [QUESTION_TIERS.TIER_3, QUESTION_TIERS.TIER_1],
  },
  {
    id: "mastered",
    min: 0.8,
    tiers: [QUESTION_TIERS.TIER_1, QUESTION_TIERS.TIER_3],
  },
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

/**
 * Returns the question types eligible for a country at a given mastery level and
 * session category, ordered by tier priority for that mastery band. Data-level
 * feasibility (e.g. a country actually having neighbors/languages) is enforced
 * downstream by the individual question generators via each type's `requires`.
 *
 * @param {number} mastery - decay-adjusted mastery score, 0–1
 * @param {"countries"|"capitals"|"flags"} category - session game mode
 * @returns {Array<{tier: string, id: string, categories: string[], requires?: string[]}>}
 */
export function getEligibleQuestionTypes(mastery, category) {
  const band = getMasteryBand(mastery);
  const tierPriority = new Map(band.tiers.map((tier, index) => [tier, index]));

  return Object.values(QUESTION_TYPES)
    .filter(
      (type) =>
        tierPriority.has(type.tier) &&
        (!category || type.categories.includes(category))
    )
    .sort((a, b) => tierPriority.get(a.tier) - tierPriority.get(b.tier));
}
