/**
 * Learn mode session sequencer.
 *
 * Turns a sampled country pool into an ordered question queue for the mixed
 * Learn engine. Format difficulty is driven by challenge level (mode × region),
 * not per-country mastery bands. predictedSuccess scores candidates so sessions
 * stay near the flow target; tiers still only affect EMA multipliers downstream.
 *
 * Sequencing rules (applied in priority order 1→5):
 *  1. Type selection per country — eligible types via challenge working tier
 *     (± adjacent), scored by predictedSuccess (skip trivial, prefer flow).
 *     Generator null → try next candidate → finally an always-buildable
 *     Find/Name fallback. A country is never dropped.
 *  2. Variety — never 3+ consecutive questions of the same type.
 *  3. Opening — the first question is Tier 3/4 (warm-up), never cold free recall.
 *  4. Tier representation — 10+ question sessions include ≥2 tiers; if every
 *     sampled country is single-tier, inject 2 Tier 3 comparative bonuses.
 *  5. Comparative placement — no two Tier 3/4 questions back to back.
 */

import { LEARN_CHALLENGE, QUESTION_TIERS } from "@worldly/constants";
import {
  getEligibleQuestionTypesForChallenge,
} from "./questionTypes.js";
import {
  createDefaultChallenge,
  normalizeChallenge,
  orderedTiersForChallenge,
} from "./challengeLevel.js";
import {
  predictedSuccess,
  pickByPredictedSuccess,
  isTrivialPrediction,
} from "./predictedSuccess.js";
import { applyContinueNote } from "./continueNotes.js";
import {
  generateQuestion,
  indexCountries,
  generatePopulationCompare,
  generateAreaCompare,
} from "./questionGenerator.js";

const PRIMARY_TIER_WEIGHT = LEARN_CHALLENGE.PRIMARY_TIER_WEIGHT;
const MAX_CONSECUTIVE_SAME_TYPE = 2;
const MIN_SESSION_FOR_TIER_RULES = 10;
const BONUS_COMPARATIVE_COUNT = 2;

function cid(record) {
  return record?.id ?? record?.iso3 ?? null;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `q_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isComparativeTier(tier) {
  return tier === QUESTION_TIERS.TIER_3 || tier === QUESTION_TIERS.TIER_4;
}

function groupTypesByTier(eligibleTypes) {
  const order = [];
  const byTier = new Map();
  for (const type of eligibleTypes) {
    if (!byTier.has(type.tier)) {
      byTier.set(type.tier, []);
      order.push(type.tier);
    }
    byTier.get(type.tier).push(type);
  }
  return { order, byTier };
}

function pickWeightedTier(orderedTiers) {
  if (orderedTiers.length <= 1) return orderedTiers[0] ?? null;

  const [primary, ...rest] = orderedTiers;
  const restWeight = (1 - PRIMARY_TIER_WEIGHT) / rest.length;
  const weights = [PRIMARY_TIER_WEIGHT, ...rest.map(() => restWeight)];

  let roll = Math.random();
  for (let i = 0; i < orderedTiers.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return orderedTiers[i];
  }
  return orderedTiers[orderedTiers.length - 1];
}

// An always-buildable question so a country is never dropped when every eligible
// generator returns null. Mirrors the classic Learn "Find it" / "Name it".
function buildFallbackQuestion(record, category) {
  const base = {
    id: makeId(),
    type: "fallback",
    tier: QUESTION_TIERS.TIER_1,
    countryId: cid(record),
    prompt: "",
    promptSubtext: "",
    answerType: "map_click",
    correctAnswer: cid(record),
    options: null,
    comparisonCountryId: null,
    mapConfig: { display: "blank", targetId: cid(record) },
    clueEligible: true,
    emaMultiplierKey: QUESTION_TIERS.TIER_1,
  };

  if (category === "capitals" && record.capital?.trim()) {
    return applyContinueNote({
      ...base,
      type: "capital_free_recall",
      answerType: "text_entry",
      prompt: `What is the capital of ${record.name}?`,
      correctAnswer: record.capital.trim(),
      mapConfig: null,
    });
  }
  if (category === "flags") {
    return applyContinueNote({
      ...base,
      answerType: "text_entry",
      prompt: "Which country's flag is shown?",
      promptSubtext: "Type its name.",
      correctAnswer: record.name,
      mapConfig: null,
    });
  }
  return applyContinueNote({
    ...base,
    type: "blank_map_click",
    prompt: `Find ${record.name} on the map.`,
  });
}

function attachPredictedSuccess(question, workingTier, country, countryMastery) {
  if (!question) return null;
  const score = predictedSuccess({
    workingTier,
    question,
    country,
    peerMeta: { compareRatio: question.compareRatio ?? null },
    countryMastery,
  });
  return { ...question, predictedSuccess: score };
}

/**
 * Select one question for a country using challenge level + predictedSuccess.
 *
 * Tier is chosen from the challenge ladder first (≈70% working tier), then
 * instance-level predictedSuccess picks among generated questions in that tier
 * (with fallback to other eligible tiers if nothing builds / all trivial).
 */
export function selectQuestionForCountry({
  workingTier,
  category,
  record,
  allCountries,
  masteryStats,
  mastery = 0,
}) {
  const wt =
    Number(workingTier) || LEARN_CHALLENGE.DEFAULT_WORKING_TIER;
  const eligible = getEligibleQuestionTypesForChallenge(wt, category);
  const { order, byTier } = groupTypesByTier(eligible);

  // Prefer challenge ordering when present.
  const preferred = orderedTiersForChallenge(wt).filter((tier) => byTier.has(tier));
  const tierOrder = [
    ...preferred,
    ...order.filter((tier) => !preferred.includes(tier)),
  ];

  if (cid(record) === "BRA" && byTier.has(QUESTION_TIERS.TIER_3)) {
    // Bias Brazil toward its special comparative when Tier 3 is in play.
    if (Math.random() < 0.85) {
      const braTypes = byTier.get(QUESTION_TIERS.TIER_3) ?? [];
      const special = braTypes.find((type) => type.id === "brazil_non_neighbors");
      if (special) {
        const raw = generateQuestion(
          special.id,
          record,
          allCountries,
          masteryStats
        );
        if (raw) {
          return attachPredictedSuccess(raw, wt, record, mastery);
        }
      }
    }
  }

  const tryTier = (tiers) => {
    let fallback = null;
    for (const tier of tiers) {
      const scored = [];
      for (const type of shuffle(byTier.get(tier) ?? [])) {
        const raw = generateQuestion(type.id, record, allCountries, masteryStats);
        if (!raw) continue;
        const question = attachPredictedSuccess(raw, wt, record, mastery);
        scored.push({ question, predictedSuccess: question.predictedSuccess });
      }
      if (scored.length === 0) continue;

      const nonTrivial = scored.filter(
        (entry) => !isTrivialPrediction(entry.predictedSuccess, wt)
      );
      if (nonTrivial.length > 0) {
        return pickByPredictedSuccess(nonTrivial, wt);
      }
      // Entire tier was trivial — remember a fallback and try a harder/other tier.
      if (!fallback) fallback = pickByPredictedSuccess(scored, wt);
    }
    return fallback;
  };

  // Primary: weighted single-tier attempt, then remaining tiers as fallback.
  const primaryTier = pickWeightedTier(tierOrder);
  const primaryFirst = primaryTier
    ? [primaryTier, ...tierOrder.filter((tier) => tier !== primaryTier)]
    : tierOrder;

  const picked = tryTier(primaryFirst);
  if (picked) return picked;

  return attachPredictedSuccess(
    buildFallbackQuestion(record, category),
    wt,
    record,
    mastery
  );
}

/**
 * Rebuild questions for a country list with the current challenge (used for
 * mid-session adaptation after challengeLevel updates).
 */
export function rebuildQuestionsForCountries({
  countries,
  category,
  allCountries,
  masteryStats,
  challenge,
}) {
  const state = normalizeChallenge(challenge);
  const index = indexCountries(allCountries);
  const questions = [];
  for (const entry of countries ?? []) {
    const countryId = entry.countryId ?? entry.id;
    const mastery = entry.mastery ?? 0;
    const record = index.get(countryId);
    if (!record) continue;
    questions.push(
      selectQuestionForCountry({
        workingTier: state.workingTier,
        category,
        record,
        allCountries,
        masteryStats,
        mastery,
      })
    );
  }
  return questions;
}

function mostTestedRegion(sampled, index) {
  const counts = new Map();
  for (const { countryId } of sampled) {
    const region = index.get(countryId)?.region;
    if (!region) continue;
    counts.set(region, (counts.get(region) ?? 0) + 1);
  }
  let best = null;
  let bestCount = -1;
  for (const [region, count] of counts) {
    if (count > bestCount) {
      best = region;
      bestCount = count;
    }
  }
  return best;
}

function buildBonusQuestions(
  region,
  index,
  usedIds,
  allCountries,
  masteryStats,
  count,
  workingTier,
  existingTiers
) {
  const candidates = shuffle(
    [...index.values()].filter(
      (record) =>
        record.region === region &&
        record.enabled !== false &&
        !usedIds.has(cid(record))
    )
  );

  // Prefer a tier that is not already represented so Rule 4 can fire.
  const wantComparative = !existingTiers.has(QUESTION_TIERS.TIER_3);
  const wantAssociation = !existingTiers.has(QUESTION_TIERS.TIER_4);

  const bonus = [];
  for (const record of candidates) {
    if (bonus.length >= count) break;
    let raw = null;
    if (wantComparative) {
      raw =
        generatePopulationCompare(record, allCountries, masteryStats) ??
        generateAreaCompare(record, allCountries, masteryStats);
    } else if (wantAssociation) {
      raw =
        generateQuestion("landlocked_check", record, allCountries, masteryStats) ??
        generateQuestion("binary_map_choice", record, allCountries, masteryStats) ??
        generateQuestion("language_family", record, allCountries, masteryStats);
    } else {
      raw =
        generatePopulationCompare(record, allCountries, masteryStats) ??
        generateAreaCompare(record, allCountries, masteryStats);
    }
    if (raw) {
      bonus.push(attachPredictedSuccess(raw, workingTier, record, 0));
      usedIds.add(cid(record));
    }
  }
  return bonus;
}

function arrangeQuestions(questions) {
  const buckets = new Map();
  for (const question of shuffle(questions)) {
    if (!buckets.has(question.type)) buckets.set(question.type, []);
    buckets.get(question.type).push(question);
  }

  const tierOfType = new Map(questions.map((q) => [q.type, q.tier]));
  const remaining = (type) => buckets.get(type)?.length ?? 0;
  const typeIsComparative = (type) => isComparativeTier(tierOfType.get(type));

  const classRemaining = (comparative) =>
    [...buckets.keys()].reduce(
      (sum, type) =>
        sum + (typeIsComparative(type) === comparative ? remaining(type) : 0),
      0
    );

  const pickLargest = (types) => {
    let best = null;
    let bestScore = -Infinity;
    for (const type of types) {
      const score = remaining(type) + Math.random() * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = type;
      }
    }
    return best;
  };

  const result = [];
  let prev1 = null;
  let prev2 = null;

  while (result.length < questions.length) {
    const liveTypes = [...buckets.keys()].filter((type) => remaining(type) > 0);

    let allowed = liveTypes.filter(
      (type) => !(type === prev1 && type === prev2)
    );
    if (allowed.length === 0) allowed = liveTypes;

    const compTypes = allowed.filter((type) => typeIsComparative(type));
    const nonCompTypes = allowed.filter((type) => !typeIsComparative(type));
    const prevIsComparative = prev1 != null && typeIsComparative(prev1);

    let chosenType;
    if (result.length === 0) {
      if (compTypes.length > 0) {
        chosenType = pickLargest(compTypes);
      } else {
        const nonT1 = nonCompTypes.filter(
          (type) => tierOfType.get(type) !== QUESTION_TIERS.TIER_1
        );
        chosenType = pickLargest(nonT1.length > 0 ? nonT1 : allowed);
      }
    } else if (prevIsComparative) {
      chosenType = pickLargest(
        nonCompTypes.length > 0 ? nonCompTypes : compTypes
      );
    } else {
      if (compTypes.length > 0 && classRemaining(true) >= classRemaining(false)) {
        chosenType = pickLargest(compTypes);
      } else {
        chosenType = pickLargest(
          nonCompTypes.length > 0 ? nonCompTypes : allowed
        );
      }
    }

    result.push(buckets.get(chosenType).pop());
    prev2 = prev1;
    prev1 = chosenType;
  }

  return result;
}

function buildSessionMeta(questions, sampled, challenge) {
  const tierBreakdown = {};
  const typeBreakdown = {};
  for (const question of questions) {
    tierBreakdown[question.tier] = (tierBreakdown[question.tier] ?? 0) + 1;
    typeBreakdown[question.type] = (typeBreakdown[question.type] ?? 0) + 1;
  }

  const masteries = sampled
    .map((entry) => entry.mastery)
    .filter((value) => Number.isFinite(value));
  const avgMastery =
    masteries.length > 0
      ? masteries.reduce((sum, value) => sum + value, 0) / masteries.length
      : 0;

  const state = normalizeChallenge(challenge);
  return {
    tierBreakdown,
    typeBreakdown,
    avgMastery,
    workingTier: state.workingTier,
    momentum: state.momentum,
  };
}

/**
 * @param {object} params
 * @param {Array<{ countryId: string, mastery: number }>} params.countries
 * @param {"countries"|"capitals"|"flags"} params.category
 * @param {Array|Map|object} params.allCountries
 * @param {*} [params.masteryStats]
 * @param {number|"all"} [params.sessionSize]
 * @param {object} [params.challenge] - { workingTier, momentum, recentOutcomes }
 */
export function buildLearnSession({
  countries,
  category,
  allCountries,
  masteryStats,
  sessionSize,
  challenge,
}) {
  const index = indexCountries(allCountries);
  const sampled = Array.isArray(countries) ? countries : [];
  const state = normalizeChallenge(challenge ?? createDefaultChallenge());

  const questions = [];
  for (const { countryId, mastery } of sampled) {
    const record = index.get(countryId);
    if (!record) continue;
    questions.push(
      selectQuestionForCountry({
        workingTier: state.workingTier,
        category,
        record,
        allCountries,
        masteryStats,
        mastery: mastery ?? 0,
      })
    );
  }

  const distinctTiers = new Set(questions.map((q) => q.tier));
  if (questions.length >= MIN_SESSION_FOR_TIER_RULES && distinctTiers.size < 2) {
    const region = mostTestedRegion(sampled, index);
    if (region) {
      const usedIds = new Set(questions.map((q) => q.countryId));
      questions.push(
        ...buildBonusQuestions(
          region,
          index,
          usedIds,
          allCountries,
          masteryStats,
          BONUS_COMPARATIVE_COUNT,
          state.workingTier,
          distinctTiers
        )
      );
    }
  }

  const ordered = arrangeQuestions(questions);

  return {
    questions: ordered,
    sessionMeta: buildSessionMeta(ordered, sampled, state),
    challenge: state,
  };
}

// Silence unused in case bundlers flag the variety constant (kept for docs parity).
void MAX_CONSECUTIVE_SAME_TYPE;
