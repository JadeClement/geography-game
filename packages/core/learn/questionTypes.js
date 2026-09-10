import {
  ROUND_OUTCOMES,
  QUESTION_TIERS,
  LEARN_EMA_MULTIPLIERS,
  QUESTION_TYPES,
  MASTERY_BANDS,
  GAME_MODES,
  LEARN_CONTRIBUTION_RATE,
} from "@worldly/constants";
import { orderedTiersForChallenge } from "./challengeLevel.js";

const TIER_EASIER_ORDER = [
  QUESTION_TIERS.TIER_1,
  QUESTION_TIERS.TIER_2,
  QUESTION_TIERS.TIER_3,
  QUESTION_TIERS.TIER_4,
];

export {
  QUESTION_TIERS,
  LEARN_EMA_MULTIPLIERS,
  QUESTION_TYPES,
  MASTERY_BANDS,
};

export const SKILL_DOMAINS = {
  LOCATION: "location",
  NEIGHBORS: "neighbors",
  CAPITAL: "capital",
  FLAG: "flag",
  STATISTICS: "statistics",
  FACTS: "facts",
};

export const DEFAULT_SKILL_DOMAIN = SKILL_DOMAINS.LOCATION;

/** Domains that have a dedicated Test mode (Learn writes at 0.8x). */
export const DOMAINS_WITH_TEST_MODE = [
  SKILL_DOMAINS.LOCATION,
  SKILL_DOMAINS.CAPITAL,
  SKILL_DOMAINS.FLAG,
];

export function inferDomainFromMode(mode) {
  if (mode === GAME_MODES.CAPITALS) return SKILL_DOMAINS.CAPITAL;
  if (mode === GAME_MODES.FLAGS) return SKILL_DOMAINS.FLAG;
  // Leftover Test-neighbors rows (mode text, not a playable GAME_MODES value).
  if (mode === SKILL_DOMAINS.NEIGHBORS) return SKILL_DOMAINS.NEIGHBORS;
  return SKILL_DOMAINS.LOCATION;
}

export function resolveSkillDomain({ questionType, mode } = {}) {
  if (questionType) return getDomainForQuestionType(questionType);
  return inferDomainFromMode(mode);
}

export function getLearnContributionRate(domain) {
  const rate = LEARN_CONTRIBUTION_RATE[domain];
  return Number.isFinite(rate) ? rate : 1;
}

/** Maps every QUESTION_TYPES id (plus a few legacy aliases) to a skill domain. */
export const QUESTION_TYPE_TO_DOMAIN = {
  blank_map_click: SKILL_DOMAINS.LOCATION,
  borderless_map_click: SKILL_DOMAINS.LOCATION,
  shape_drop: SKILL_DOMAINS.LOCATION,
  binary_map_choice: SKILL_DOMAINS.LOCATION,
  shape_identification: SKILL_DOMAINS.LOCATION,
  shape_name_entry: SKILL_DOMAINS.LOCATION,
  free_name_entry: SKILL_DOMAINS.LOCATION,
  find_it_fill: SKILL_DOMAINS.LOCATION,
  find_it_blank: SKILL_DOMAINS.LOCATION,
  borderless_map: SKILL_DOMAINS.LOCATION,
  shape_name: SKILL_DOMAINS.LOCATION,
  name_it_fill: SKILL_DOMAINS.LOCATION,
  name_it_blank: SKILL_DOMAINS.LOCATION,

  neighbor_confirm: SKILL_DOMAINS.NEIGHBORS,
  neighbor_free_recall: SKILL_DOMAINS.NEIGHBORS,
  neighbor_recall_all: SKILL_DOMAINS.NEIGHBORS,
  neighbor_select_all: SKILL_DOMAINS.NEIGHBORS,
  neighbor_identification: SKILL_DOMAINS.NEIGHBORS,
  brazil_non_neighbors: SKILL_DOMAINS.NEIGHBORS,
  neighbor_yes_no: SKILL_DOMAINS.NEIGHBORS,

  capital_free_recall: SKILL_DOMAINS.CAPITAL,
  capital_matching: SKILL_DOMAINS.CAPITAL,

  flag_identification: SKILL_DOMAINS.FLAG,
  flag_color: SKILL_DOMAINS.FLAG,

  population_compare: SKILL_DOMAINS.STATISTICS,
  area_compare: SKILL_DOMAINS.STATISTICS,
  gdp_compare: SKILL_DOMAINS.STATISTICS,
  population_rank: SKILL_DOMAINS.STATISTICS,
  area_rank: SKILL_DOMAINS.STATISTICS,
  gdp_rank: SKILL_DOMAINS.STATISTICS,
  neighbor_count_compare: SKILL_DOMAINS.STATISTICS,

  landlocked_check: SKILL_DOMAINS.FACTS,
  language_family: SKILL_DOMAINS.FACTS,
  religion_majority: SKILL_DOMAINS.FACTS,
  religion_pie: SKILL_DOMAINS.FACTS,
  region_grouping: SKILL_DOMAINS.FACTS,
  region_identification: SKILL_DOMAINS.FACTS,
  religion: SKILL_DOMAINS.FACTS,
};

const UNMAPPED_TYPE_WARNED = new Set();

export function getDomainForQuestionType(questionTypeId) {
  if (questionTypeId && Object.prototype.hasOwnProperty.call(QUESTION_TYPE_TO_DOMAIN, questionTypeId)) {
    return QUESTION_TYPE_TO_DOMAIN[questionTypeId];
  }
  if (
    questionTypeId &&
    process.env.NODE_ENV !== "production" &&
    !UNMAPPED_TYPE_WARNED.has(questionTypeId)
  ) {
    UNMAPPED_TYPE_WARNED.add(questionTypeId);
    console.warn(
      `[learn] unmapped question type "${questionTypeId}" — using ${DEFAULT_SKILL_DOMAIN}`
    );
  }
  return DEFAULT_SKILL_DOMAIN;
}

export function getEligibleTypesForCategory(category) {
  return Object.values(QUESTION_TYPES).filter(
    (type) => !category || type.categories.includes(category)
  );
}

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

export const QUESTION_TYPES_BY_ID = Object.fromEntries(
  Object.values(QUESTION_TYPES).map((type) => [type.id, type])
);

export function getQuestionTypeById(id) {
  return QUESTION_TYPES_BY_ID[id] ?? null;
}

const TIER_FALLBACK_ORDER = [
  QUESTION_TIERS.TIER_1,
  QUESTION_TIERS.TIER_2,
  QUESTION_TIERS.TIER_3,
  QUESTION_TIERS.TIER_4,
];

export function getMasteryBand(mastery) {
  const score = Number.isFinite(mastery) ? Math.min(Math.max(mastery, 0), 1) : 0;
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

export function getEligibleQuestionTypes(mastery, category) {
  const band = getMasteryBand(mastery);
  const strict = typesForTiers(band.tiers, category);
  if (strict.length > 0) return strict;

  const wideningTiers = [
    ...band.tiers,
    ...TIER_FALLBACK_ORDER.filter((tier) => !band.tiers.includes(tier)),
  ];
  return typesForTiers(wideningTiers, category);
}

/**
 * Primary (harder) tier for a mastery score: first entry in the matching
 * MASTERY_BANDS.tiers list. E.g. developing [tier_3, tier_4] → tier_3.
 */
export function getPrimaryTierForMastery(mastery) {
  const band = getMasteryBand(mastery);
  return band?.tiers?.[0] ?? QUESTION_TIERS.TIER_4;
}

export function getQuestionTypesForTier(tier, category) {
  return typesForTiers([tier], category);
}

/** Next easier format tier, or null at the bottom of the ladder (tier_4). */
export function getNextEasierTier(tier) {
  const index = TIER_EASIER_ORDER.indexOf(tier);
  if (index < 0 || index >= TIER_EASIER_ORDER.length - 1) return null;
  return TIER_EASIER_ORDER[index + 1];
}

/**
 * Challenge-driven eligibility — DEPRECATED.
 * The live sequencer uses getPrimaryTierForMastery / getQuestionTypesForTier.
 *
 * @param {number} workingTier - 4 easiest … 1 hardest
 * @param {"countries"|"capitals"|"flags"} category
 */
export function getEligibleQuestionTypesForChallenge(workingTier, category) {
  const ordered = orderedTiersForChallenge(workingTier);
  const strict = typesForTiers(ordered, category);
  if (strict.length > 0) return strict;

  const wideningTiers = [
    ...ordered,
    ...TIER_FALLBACK_ORDER.filter((tier) => !ordered.includes(tier)),
  ];
  return typesForTiers(wideningTiers, category);
}
