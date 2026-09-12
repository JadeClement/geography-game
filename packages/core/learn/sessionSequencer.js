/**
 * Learn mode session sequencer.
 *
 * Turns a sampled country pool into an ordered question queue for the mixed
 * Learn engine. Format difficulty is driven by each country's EMA mastery
 * (MASTERY_BANDS), not a regional challenge level.
 *
 * Sequencing rules (applied in priority order 1→5):
 *  1. Type selection per country — primary tier from that country's mastery,
 *     types shuffled evenly in-tier; generator null → next type → easier
 *     tier → always-buildable Find/Name fallback. A country is never dropped.
 *  2. Variety — never 3+ consecutive questions of the same type.
 *  3. Opening — the first question is Tier 3/4 (warm-up), never cold free recall.
 *  4. Tier representation — 10+ question sessions include ≥2 tiers; if every
 *     sampled country is single-tier, inject 2 Tier 3 comparative bonuses
 *     (placed near indices 3 and 7 when the list is long enough).
 *  5. Comparative placement — no two Tier 3/4 questions back to back.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AUDIT (EMA-driven tier selection) — do not delete; implementation reference
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Canonical sources live in packages/core (apps/web/lib/learn/* re-exports).
 *
 * 1. workingTier — read / write / store
 *    Store: Postgres table `learn_challenge` (user_id, mode, region PK) with
 *    columns working_tier, momentum, recent_outcomes. Created in
 *    apps/web/scripts/setup-db.js. NOT a country_stats column.
 *    Read:  getLearnChallenge (apps/web/lib/db.js) ← GET /api/learn-challenge
 *           ← fetchLearnChallenge (apps/web/lib/countryStats.js)
 *           ← GeographyGame.buildLearnEngineData; also startLearnEngineGame
 *           resume snapshot.challenge; savedLearnSession.challenge.
 *    Write: upsertLearnChallenge ← POST /api/learn-challenge
 *           ← saveLearnChallenge ← GeographyGame.handleLearnAnswer
 *           (also updateChallengeLevel locally then rebuild remaining
 *           questions via rebuildQuestionsForCountries).
 *    Harden/ease: packages/core/learn/challengeLevel.js
 *           updateChallengeLevel — ≥85% harden / ≤55% ease, two-tick
 *           momentum bump. Called from GeographyGame + the API POST.
 *    Mobile session.tsx never fetched/wrote workingTier.
 *
 * 2. MASTERY_BANDS
 *    Defined in packages/constants/index.js; re-exported by
 *    packages/core/learn/questionTypes.js. getMasteryBand /
 *    getEligibleQuestionTypes(mastery) used it, but the LIVE sequencer
 *    called getEligibleQuestionTypesForChallenge(workingTier) instead.
 *    Bands (min → primary tier = tiers[0]):
 *      new 0.00 → [tier_4]
 *      developing 0.30 → [tier_3, tier_4]
 *      proficient 0.50 → [tier_2, tier_3]
 *      advanced 0.70 → [tier_1, tier_2]
 *      mastered 0.90 → [tier_1]
 *
 * 3. Start Learn → first question
 *    StartScreen URL ?play=1, type=learning
 *    → GeographyGame.startGame → buildLearnEngineData:
 *         fetchMasteryStats GET /api/mastery?mode=  (ALL mode stats, before
 *         sampling — already the correct order)
 *         mapStatsToMasteryEntries: { countryId, level, masteryScore,
 *         graduated, lastAttemptAt, lastOutcome } — NO attempt counters
 *         (firstTryCorrect etc. are on country_stats but stripped here).
 *         First-exposure proxy: lastAttemptAt == null ⇒ 0 attempts.
 *         fetchLearnChallenge (REMOVED from this path)
 *         buildFullRegionLearningQueue (weak EMA weighted)
 *         buildLearnSession({ countries: sampled, masteryStats, category })
 *    → startLearnEngineGame sets learnQuestions[0]
 *    Mobile: session.tsx getAllMastery + buildFullRegionLearningQueue +
 *    buildLearnSession({ countries: queued records, masteryStats: rows }).
 *
 * 4. Answer → EMA in DB
 *    LearnQuestionRenderer onAnswer
 *    → GeographyGame.handleLearnAnswer
 *    → buildLearnStatPayloads(event) reads event.tier (question.tier), NOT
 *      regional workingTier. resolveLearnEma → LEARN_EMA_MULTIPLIERS.
 *    → POST /api/country-stats { learnModeMultiplier, questionTier, … }
 *    → recordCountryPerformance → computeMasteryUpdate (packages/core/mastery.js)
 *    Test mode never sends learnModeMultiplier (stays 1.0).
 *
 * 5. workingTier / challengeLevel / per-region difficulty references
 *    packages/core/learn/sessionSequencer.js (this file — live path)
 *    packages/core/learn/challengeLevel.js (harden/ease; unused by sequencer)
 *    packages/core/learn/questionTypes.js getEligibleQuestionTypesForChallenge
 *    packages/core/learn/predictedSuccess.js (workingTier arg; telemetry only)
 *    packages/constants LEARN_CHALLENGE
 *    apps/web/lib/db.js getLearnChallenge / upsertLearnChallenge /
 *      deleteUserPracticeData still deletes learn_challenge rows
 *    apps/web/app/api/learn-challenge/route.js
 *    apps/web/lib/countryStats.js fetchLearnChallenge / saveLearnChallenge
 *    apps/web/components/GeographyGame.jsx (session start + answer)
 *    apps/web/lib/savedLearnSession.js snapshot.challenge field
 *    apps/web/scripts/setup-db.js learn_challenge table
 *    apps/web/scripts/test-learn-mode.js, test-saved-learn-session.js
 *
 * Mastery fetch order: already fetch-all-then-sample. Attempt counts are
 * not in /api/mastery entries; lastAttemptAt is the existing field used
 * as a zero-vs-nonzero attempts proxy. Learn writes skill_domain rows;
 * Test still writes skill_domain = 'general'. See apps/web/lib/db.js.
 */

import { QUESTION_TIERS } from "@worldly/constants";
import {
  getPrimaryTierForMastery,
  getEligibleTypesForCategory,
  getDomainForQuestionType,
  getLearnModeContent,
  isTypeAllowedForCategory,
} from "./questionTypes.js";
import {
  coerceDomainMasteryMap,
  getDomainMastery,
  hasDomainRow,
} from "./domainMastery.js";
import { predictedSuccess } from "./predictedSuccess.js";
import { applyContinueNote } from "./continueNotes.js";
import {
  generateQuestion,
  indexCountries,
  generatePopulationCompare,
  generateAreaCompare,
  generateGdpCompare,
} from "./questionGenerator.js";

const TRIVIAL_MASTERY = 0.92;
const MAX_CONSECUTIVE_SAME_TYPE = 2;
const MIN_SESSION_FOR_TIER_RULES = 10;
const BONUS_COMPARATIVE_COUNT = 2;
const PRIMARY_DOMAIN_BOOST = 1.6;
const BONUS_SLOT_A = 3;
const BONUS_SLOT_B = 7;
const TIER_NUMBER = {
  [QUESTION_TIERS.TIER_1]: 1,
  [QUESTION_TIERS.TIER_2]: 2,
  [QUESTION_TIERS.TIER_3]: 3,
  [QUESTION_TIERS.TIER_4]: 4,
};

function cid(record) {
  return record?.id ?? record?.iso3 ?? record?.countryId ?? null;
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

function lookupStat(masteryStats, countryId) {
  if (!countryId || masteryStats == null) return null;
  if (masteryStats instanceof Map) {
    return masteryStats.get(countryId) ?? null;
  }
  if (Array.isArray(masteryStats)) {
    const matches = masteryStats.filter(
      (row) => (row?.countryId ?? row?.id) === countryId
    );
    if (matches.length === 0) return null;
    return matches.reduce((best, row) =>
      (Number(row.masteryScore) || 0) >= (Number(best.masteryScore) || 0)
        ? row
        : best
    );
  }
  if (typeof masteryStats === "object") {
    return masteryStats[countryId] ?? null;
  }
  return null;
}

function attemptCountFromStat(stat, entry = {}) {
  if (Number.isFinite(entry.attemptCount)) return Math.max(0, entry.attemptCount);
  if (!stat) {
    if (entry.lastAttemptAt) return 1;
    return 0;
  }
  const summed =
    (Number(stat.firstTryCorrect) || 0) +
    (Number(stat.secondTryCorrect) || 0) +
    (Number(stat.neededReveal) || 0) +
    (Number(stat.incorrect) || 0);
  if (summed > 0) return summed;
  if (stat.lastAttemptAt || entry.lastAttemptAt) return 1;
  return 0;
}

function normalizeCountryEntry(entry, masteryStats) {
  const countryId = entry?.countryId ?? entry?.id ?? entry?.iso3 ?? null;
  const stat = lookupStat(masteryStats, countryId);
  const mastery = Number.isFinite(entry?.mastery)
    ? entry.mastery
    : Number.isFinite(entry?.masteryScore)
      ? entry.masteryScore
      : Number(stat?.masteryScore) || 0;
  return {
    countryId,
    mastery: Math.min(1, Math.max(0, mastery)),
    attempts: attemptCountFromStat(stat, entry),
    stat,
  };
}

/**
 * Single format-band for a mastery score (overall or domain-specific).
 * Reads MASTERY_BANDS via getPrimaryTierForMastery.
 */
export function getTierForCountry(masteryScore, attemptCount = 0) {
  const mastery = Number.isFinite(masteryScore) ? masteryScore : 0;
  const attempts = Number(attemptCount) || 0;
  if (mastery === 0 || attempts === 0 && mastery === 0) return QUESTION_TIERS.TIER_4;
  return getPrimaryTierForMastery(mastery);
}

export function getTierFromScore(masteryScore) {
  return getTierForCountry(masteryScore);
}

function isDomainFirstExposure(domainMap, countryId, domain, domainScore, attempts) {
  if ((Number(domainScore) || 0) !== 0) return false;
  if (hasDomainRow(domainMap, countryId, domain)) return false;
  if (hasDomainRow(domainMap, countryId, "general")) return false;
  const countryDomains = domainMap?.get(countryId);
  if (countryDomains && countryDomains.size > 0) return true;
  return (Number(attempts) || 0) === 0;
}

function isTrivialDomainCandidate(domainScore, catalogTier, alternativesRemain) {
  if ((Number(domainScore) || 0) <= TRIVIAL_MASTERY) return false;
  if (!isComparativeTier(catalogTier)) return false;
  if (!alternativesRemain) return false;
  return true;
}

function catalogFallbackRank(domainTier, catalogTier) {
  const domainNum = TIER_NUMBER[domainTier] ?? 4;
  const catalogNum = TIER_NUMBER[catalogTier] ?? 4;
  if (catalogNum >= domainNum) return catalogNum - domainNum;
  return 10 + (domainNum - catalogNum);
}

function computeTypePriority(domainScore) {
  const score = Number.isFinite(domainScore) ? domainScore : 0;
  const idealness = 1 - Math.abs(score - 0.5) * 2;
  const weakBoost = (1 - score) * 0.3;
  return Math.max(0.1, Math.min(1, idealness + weakBoost));
}

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
      tier: QUESTION_TIERS.TIER_2,
      emaMultiplierKey: QUESTION_TIERS.TIER_2,
      answerType: "text_entry",
      prompt: `What is the capital of ${record.name}?`,
      correctAnswer: record.capital.trim(),
      mapConfig: null,
    });
  }
  if (category === "flags") {
    return applyContinueNote({
      ...base,
      type: "flag_free_recall",
      tier: QUESTION_TIERS.TIER_2,
      emaMultiplierKey: QUESTION_TIERS.TIER_2,
      answerType: "text_entry",
      prompt: "Which country has this flag?",
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

function attachPredictedSuccess(question, country, countryMastery, workingTierHint) {
  if (!question) return null;
  const wt =
    workingTierHint ??
    TIER_NUMBER[question.tier] ??
    TIER_NUMBER[getPrimaryTierForMastery(countryMastery)] ??
    4;
  const score = predictedSuccess({
    workingTier: wt,
    question,
    country,
    peerMeta: { compareRatio: question.compareRatio ?? null },
    countryMastery,
  });
  return { ...question, predictedSuccess: score };
}

function decorateQuestion(question, extra) {
  if (!question) return null;
  const typeId = question.type;
  const skillDomain =
    extra.skillDomain ?? getDomainForQuestionType(typeId);
  return {
    ...question,
    firstExposure: Boolean(extra.firstExposure),
    countryMastery: extra.mastery,
    countryAttempts: extra.attempts,
    skillDomain,
    domainMasteryScore:
      extra.domainMasteryScore != null ? extra.domainMasteryScore : extra.mastery,
  };
}

function generateForType(typeId, record, allCountries, masteryStats) {
  return generateQuestion(typeId, record, allCountries, masteryStats);
}

/**
 * Select one question for a country using per-domain EMA.
 * Types whose catalog tier matches the domain's MASTERY_BANDS primary tier
 * are preferred; failed generators fall through to other types, then Find/Name.
 */
export function selectQuestionForCountry({
  category,
  record,
  allCountries,
  masteryStats,
  mastery = 0,
  attempts = 0,
  domainMap: domainMapArg = null,
}) {
  const domainMap = domainMapArg ?? coerceDomainMasteryMap(masteryStats);
  const countryId = cid(record);
  const eligible = getEligibleTypesForCategory(category);
  const primaryDomains = new Set(getLearnModeContent(category).primaryDomains ?? []);

  const scored = eligible.map((type) => {
    const domain = getDomainForQuestionType(type.id);
    const domainScore = getDomainMastery(domainMap, countryId, domain, mastery);
    const domainTier = getTierFromScore(domainScore);
    const boost = primaryDomains.has(domain) ? PRIMARY_DOMAIN_BOOST : 1;
    return {
      type,
      domain,
      domainScore,
      domainTier,
      catalogTier: type.tier,
      priority: computeTypePriority(domainScore) * boost,
    };
  });

  const matching = scored.filter((entry) => entry.catalogTier === entry.domainTier);
  const fallbacks = scored.filter((entry) => entry.catalogTier !== entry.domainTier);
  matching.sort((a, b) => b.priority - a.priority + (Math.random() - 0.5) * 0.08);
  fallbacks.sort((a, b) => {
    const rank =
      catalogFallbackRank(a.domainTier, a.catalogTier) -
      catalogFallbackRank(b.domainTier, b.catalogTier);
    if (rank !== 0) return rank;
    return b.priority - a.priority;
  });

  const ordered = [...matching, ...fallbacks];
  const nonTrivial = ordered.filter(
    (entry) =>
      !isTrivialDomainCandidate(entry.domainScore, entry.catalogTier, ordered.length > 1)
  );
  let pool = nonTrivial.length > 0 ? nonTrivial : ordered;

  if (countryId === "BRA") {
    const special = pool.find((entry) => entry.type.id === "brazil_non_neighbors");
    if (special && Math.random() < 0.85) {
      pool = [special, ...pool.filter((entry) => entry !== special)];
    }
  }

  for (const candidate of pool) {
    const raw = generateForType(candidate.type.id, record, allCountries, masteryStats);
    if (!raw) continue;
    const question = attachPredictedSuccess(
      raw,
      record,
      candidate.domainScore,
      TIER_NUMBER[raw.tier] ?? TIER_NUMBER[candidate.catalogTier]
    );
    return decorateQuestion(question, {
      firstExposure: isDomainFirstExposure(
        domainMap,
        countryId,
        candidate.domain,
        candidate.domainScore,
        attempts
      ),
      mastery: candidate.domainScore,
      attempts,
      skillDomain: candidate.domain,
      domainMasteryScore: candidate.domainScore,
    });
  }

  const fallback = attachPredictedSuccess(
    buildFallbackQuestion(record, category),
    record,
    mastery,
    TIER_NUMBER[QUESTION_TIERS.TIER_1]
  );
  return decorateQuestion(fallback, {
    firstExposure: isDomainFirstExposure(
      domainMap,
      countryId,
      getDomainForQuestionType(fallback?.type),
      getDomainMastery(
        domainMap,
        countryId,
        getDomainForQuestionType(fallback?.type),
        mastery
      ),
      attempts
    ),
    mastery,
    attempts,
    skillDomain: getDomainForQuestionType(fallback?.type),
    domainMasteryScore: getDomainMastery(
      domainMap,
      countryId,
      getDomainForQuestionType(fallback?.type),
      mastery
    ),
  });
}

/**
 * Rebuild questions for a country list from each country's mastery (used if
 * a caller still has a leftover challenge argument — ignored).
 */
export function rebuildQuestionsForCountries({
  countries,
  category,
  allCountries,
  masteryStats,
}) {
  const index = indexCountries(allCountries);
  const questions = [];
  for (const entry of countries ?? []) {
    const normalized = normalizeCountryEntry(entry, masteryStats);
    const record = index.get(normalized.countryId);
    if (!record) continue;
    questions.push(
      selectQuestionForCountry({
        category,
        record,
        allCountries,
        masteryStats,
        mastery: normalized.mastery,
        attempts: normalized.attempts,
        domainMap: coerceDomainMasteryMap(masteryStats),
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

const BONUS_COMPARE_GENERATORS = [
  ["population_compare", generatePopulationCompare],
  ["area_compare", generateAreaCompare],
  ["gdp_compare", generateGdpCompare],
];

function buildBonusQuestions(
  region,
  index,
  usedIds,
  allCountries,
  masteryStats,
  count,
  category
) {
  const generators = BONUS_COMPARE_GENERATORS.filter(([typeId]) =>
    isTypeAllowedForCategory(typeId, category)
  );
  if (generators.length === 0) return [];

  const candidates = shuffle(
    [...index.values()].filter(
      (record) =>
        record.region === region &&
        record.enabled !== false &&
        !usedIds.has(cid(record))
    )
  );

  const bonus = [];
  for (const record of candidates) {
    if (bonus.length >= count) break;
    let raw = null;
    for (const [, generate] of generators) {
      raw = generate(record, allCountries, masteryStats);
      if (raw) break;
    }
    if (raw) {
      bonus.push(
        decorateQuestion(
          attachPredictedSuccess(raw, record, 0, TIER_NUMBER[QUESTION_TIERS.TIER_3]),
          {
            firstExposure: false,
            mastery: 0,
            attempts: 0,
            skillDomain: getDomainForQuestionType(raw.type),
            domainMasteryScore: 0,
          }
        )
      );
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

  const remaining = (type) => buckets.get(type)?.length ?? 0;
  const typeIsComparative = (type) => {
    const sample = buckets.get(type)?.[0];
    return isComparativeTier(sample?.tier);
  };

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
        const nonT1 = nonCompTypes.filter((type) => {
          const sample = buckets.get(type)?.[0];
          return sample?.tier !== QUESTION_TIERS.TIER_1;
        });
        chosenType = pickLargest(nonT1.length > 0 ? nonT1 : allowed);
      }
    } else if (prevIsComparative) {
      chosenType = pickLargest(
        nonCompTypes.length > 0 ? nonCompTypes : compTypes
      );
    } else if (result.length >= 2 && prev1 === prev2) {
      const different = allowed.filter((type) => type !== prev1);
      chosenType = pickLargest(different.length > 0 ? different : allowed);
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

function ensureWarmOpen(questions) {
  if (!questions.length) return questions;
  if (isComparativeTier(questions[0].tier)) return questions;
  const swapAt = questions.findIndex((q) => isComparativeTier(q.tier));
  if (swapAt <= 0) return questions;
  const next = [...questions];
  [next[0], next[swapAt]] = [next[swapAt], next[0]];
  return next;
}

function placeBonusesNearSlots(ordered, bonuses) {
  if (!bonuses.length) return ordered;
  const next = [...ordered];
  const slots = [BONUS_SLOT_A, BONUS_SLOT_B];
  bonuses.forEach((bonus, i) => {
    const preferred = Math.min(slots[i] ?? next.length, next.length);
    next.splice(preferred, 0, bonus);
  });
  return ensureWarmOpen(next);
}

function buildSessionMeta(questions, sampled) {
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

  return {
    tierBreakdown,
    typeBreakdown,
    avgMastery,
  };
}

/**
 * @param {object} params
 * @param {Array<{ countryId?: string, id?: string, mastery?: number, lastAttemptAt?: * }>} params.countries
 * @param {"countries"|"capitals"|"flags"} params.category
 * @param {Array|Map|object} params.allCountries
 * @param {Map|Array|object} [params.masteryStats]
 * @param {number|"all"} [params.sessionSize]
 * @param {number} [params.currentSessionNumber] unused here — sampling happens before this call
 * @param {number} [params.now] unused here — sampling happens before this call
 */
export function buildLearnSession({
  countries,
  category,
  allCountries,
  masteryStats,
  sessionSize,
  currentSessionNumber,
  now,
}) {
  void sessionSize;
  void currentSessionNumber;
  void now;
  const index = indexCountries(allCountries);
  const domainMap = coerceDomainMasteryMap(masteryStats);
  const sampled = (Array.isArray(countries) ? countries : [])
    .map((entry) => normalizeCountryEntry(entry, masteryStats))
    .filter((entry) => entry.countryId && index.has(entry.countryId));

  const questions = [];
  for (const { countryId, mastery, attempts } of sampled) {
    const record = index.get(countryId);
    if (!record) continue;
    questions.push(
      selectQuestionForCountry({
        category,
        record,
        allCountries,
        masteryStats,
        mastery,
        attempts,
        domainMap,
      })
    );
  }

  const distinctTiers = new Set(questions.map((q) => q.tier));
  let bonuses = [];
  if (questions.length >= MIN_SESSION_FOR_TIER_RULES && distinctTiers.size < 2) {
    const region = mostTestedRegion(sampled, index);
    if (region) {
      const usedIds = new Set(questions.map((q) => q.countryId));
      bonuses = buildBonusQuestions(
        region,
        index,
        usedIds,
        allCountries,
        masteryStats,
        BONUS_COMPARATIVE_COUNT,
        category
      );
    }
  }

  // Arrange main questions, then drop T3 bonuses near slots 3 and 7 so an
  // all-Tier-1 session still warms up and satisfies the two-tier rule.
  const arranged = arrangeQuestions(questions);
  const ordered =
    bonuses.length > 0
      ? placeBonusesNearSlots(arranged, bonuses)
      : ensureWarmOpen(arranged);

  return {
    questions: ordered,
    sessionMeta: buildSessionMeta(ordered, sampled),
  };
}

void MAX_CONSECUTIVE_SAME_TYPE;
