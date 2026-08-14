import {
  ROUND_OUTCOMES,
  QUESTION_TIERS,
  LEARN_EMA_MULTIPLIERS,
  QUESTION_TYPES,
  MASTERY_BANDS,
} from "@worldly/constants";
import { orderedTiersForChallenge } from "./challengeLevel.js";

export {
  QUESTION_TIERS,
  LEARN_EMA_MULTIPLIERS,
  QUESTION_TYPES,
  MASTERY_BANDS,
};

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
 * Challenge-driven eligibility: working tier + adjacent (not mastery bands).
 * Widens through the full tier ladder if the category has no types in-band.
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
