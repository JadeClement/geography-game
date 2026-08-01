/**
 * Learn mode session sequencer.
 *
 * Wraps the existing weak-country sampling (lib/learning.buildLearningQueue) and
 * turns a sampled country pool into a fully-specified, ordered question queue for
 * the mixed-question Learn engine. It does NOT re-sample countries — that stays
 * with the existing logic; this only decides, per country, WHICH question type to
 * ask and in WHAT order.
 *
 * Sequencing rules (applied in priority order 1→5):
 *  1. Type selection per country — eligible types via getEligibleQuestionTypes,
 *     weighted toward higher tiers (primary tier 70% when the band has two tiers).
 *     Generator null → try next eligible type → finally an always-buildable
 *     Find/Name fallback. A country is never dropped.
 *  2. Variety — never 3+ consecutive questions of the same type.
 *  3. Opening — the first question is Tier 3/4 (warm-up), never cold free recall.
 *  4. Tier representation — 10+ question sessions include ≥2 tiers; if every
 *     sampled country is single-tier (e.g. all mastered/Tier 1), inject 2 Tier 3
 *     comparative "bonus" questions from the most-tested region.
 *  5. Comparative placement — no two Tier 3/4 questions back to back.
 *
 * Priority: the spec orders the rules 1→5, so on conflict Rule 2 (variety) beats
 * Rule 3 (opening) beats Rule 5 (spacing). The ordering pass reflects this.
 * Rule 4's suggested "positions 3 and 7" is superseded by the higher-priority
 * opening/spacing rules once the bonus comparatives are injected.
 *
 * Best-effort caveats (inherent to the type catalog + mastery ladder, not bugs):
 * - When a (mastery band × category) yields only comparative/association tiers
 *   (e.g. any category at mastery 0–0.30 → Tier 4 only), every question is a
 *   comparative, so Rule 5's "no two comparatives adjacent" cannot hold.
 * - When a band exposes a single question type for a category (notably `capitals`
 *   at mastery ≥ 0.90 → only capital_free_recall, or `flags` at 0.70–0.90 → a
 *   single flag type), Rule 2's "no 3-in-a-row" cannot hold. Mixed-mastery
 *   sessions (the norm for weak-country Learn pools) have ample type variety and
 *   satisfy all rules. Adding more capital/flag question types would remove the
 *   caveat entirely.
 */

import {
  QUESTION_TIERS,
  getEligibleQuestionTypes,
} from "@/lib/learn/questionTypes";
import {
  generateQuestion,
  indexCountries,
  generatePopulationCompare,
  generateAreaCompare,
} from "@/lib/learn/questionGenerator";

const PRIMARY_TIER_WEIGHT = 0.7; // weight of the band's top tier when 2+ tiers
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

// ── Rule 1: per-country type selection ────────────────────────────────────────

// Group eligible types by tier, preserving tier priority order (as returned by
// getEligibleQuestionTypes: the band's primary tier first).
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

// Weighted random tier: top tier gets PRIMARY_TIER_WEIGHT, remaining tiers split
// the rest evenly. Single-tier bands always return that tier.
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

// Ordered list of candidate type ids: the chosen tier's types first (shuffled),
// then the remaining tiers in priority order (shuffled within each tier).
function buildCandidateOrder(eligibleTypes) {
  const { order, byTier } = groupTypesByTier(eligibleTypes);
  if (order.length === 0) return [];

  const chosenTier = pickWeightedTier(order);
  const candidates = [...shuffle(byTier.get(chosenTier) ?? [])];
  for (const tier of order) {
    if (tier === chosenTier) continue;
    candidates.push(...shuffle(byTier.get(tier) ?? []));
  }
  return candidates;
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
    return {
      ...base,
      answerType: "text_entry",
      prompt: `What is the capital of ${record.name}?`,
      correctAnswer: record.capital.trim(),
      mapConfig: null,
    };
  }
  if (category === "flags") {
    return {
      ...base,
      answerType: "text_entry",
      prompt: "Which country's flag is shown?",
      promptSubtext: "Type its name.",
      correctAnswer: record.name,
      mapConfig: null,
    };
  }
  return { ...base, prompt: `Find ${record.name} on the map.` };
}

function selectQuestionForCountry(mastery, category, record, allCountries, masteryStats) {
  const eligible = getEligibleQuestionTypes(mastery, category);
  const candidates = buildCandidateOrder(eligible);

  for (const type of candidates) {
    const question = generateQuestion(type.id, record, allCountries, masteryStats);
    if (question) return question;
  }
  return buildFallbackQuestion(record, category);
}

// ── Rule 4: bonus comparative injection ───────────────────────────────────────

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

function buildBonusComparatives(region, index, usedIds, allCountries, masteryStats, count) {
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
    const question =
      generatePopulationCompare(record, allCountries, masteryStats) ??
      generateAreaCompare(record, allCountries, masteryStats);
    if (question) {
      bonus.push(question);
      usedIds.add(cid(record));
    }
  }
  return bonus;
}

// ── Rules 2, 3, 5: ordering ───────────────────────────────────────────────────

// Single greedy pass that orders the queue honoring the rules by priority:
//   Rule 2 (highest of the three): never place a 3rd consecutive identical type
//     — enforced as a hard constraint whenever the type mix allows it.
//   Rule 3: open with a comparative (Tier 3/4) when any exist.
//   Rule 5: avoid placing two comparatives back to back.
// At each step it picks, among the types that would not create a 3-run, the one
// with the best preference score (opening/spacing), breaking ties toward the
// largest remaining bucket so no single type is left to pile up at the end.
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
      (sum, type) => sum + (typeIsComparative(type) === comparative ? remaining(type) : 0),
      0
    );

  // Among a set of candidate types, take the one with the largest remaining
  // bucket (with jitter) — this keeps per-type counts even, which is what gives
  // Rule 2 (no 3-in-a-row) headroom.
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
  let prev1 = null; // type placed at i-1
  let prev2 = null; // type placed at i-2

  while (result.length < questions.length) {
    const liveTypes = [...buckets.keys()].filter((type) => remaining(type) > 0);

    // Rule 2 (hard): exclude any type that would form a 3-run, unless it's all
    // that's left.
    let allowed = liveTypes.filter((type) => !(type === prev1 && type === prev2));
    if (allowed.length === 0) allowed = liveTypes;

    const compTypes = allowed.filter((type) => typeIsComparative(type));
    const nonCompTypes = allowed.filter((type) => !typeIsComparative(type));
    const prevIsComparative = prev1 != null && typeIsComparative(prev1);

    let chosenType;
    if (result.length === 0) {
      // Rule 3: warm up — open with a comparative when possible, else any
      // non-Tier-1 recognition question; never open cold with Tier 1 free recall.
      if (compTypes.length > 0) {
        chosenType = pickLargest(compTypes);
      } else {
        const nonT1 = nonCompTypes.filter(
          (type) => tierOfType.get(type) !== QUESTION_TIERS.TIER_1
        );
        chosenType = pickLargest(nonT1.length > 0 ? nonT1 : allowed);
      }
    } else if (prevIsComparative) {
      // Rule 5: never place a comparative right after a comparative while a
      // spacer (non-comparative) is available.
      chosenType = pickLargest(nonCompTypes.length > 0 ? nonCompTypes : compTypes);
    } else {
      // Previous was a spacer: place a comparative once comparatives are at least
      // as plentiful as the remaining spacers, so they don't strand at the tail
      // and force adjacencies later. Otherwise keep laying down spacers.
      if (compTypes.length > 0 && classRemaining(true) >= classRemaining(false)) {
        chosenType = pickLargest(compTypes);
      } else {
        chosenType = pickLargest(nonCompTypes.length > 0 ? nonCompTypes : allowed);
      }
    }

    result.push(buckets.get(chosenType).pop());
    prev2 = prev1;
    prev1 = chosenType;
  }

  return result;
}

// ── meta ───────────────────────────────────────────────────────────────────────

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

  return { tierBreakdown, typeBreakdown, avgMastery };
}

// ── entry point ──────────────────────────────────────────────────────────────

/**
 * @param {object} params
 * @param {Array<{ countryId: string, mastery: number }>} params.countries - already sampled pool
 * @param {"countries"|"capitals"|"flags"} params.category
 * @param {Array|Map|object} params.allCountries - full country data lookup
 * @param {*} [params.masteryStats] - per-country mastery, forwarded to generators
 * @param {number|"all"} [params.sessionSize]
 * @returns {{ questions: object[], sessionMeta: { tierBreakdown: object, typeBreakdown: object, avgMastery: number } }}
 */
export function buildLearnSession({
  countries,
  category,
  allCountries,
  masteryStats,
  sessionSize,
}) {
  const index = indexCountries(allCountries);
  const sampled = Array.isArray(countries) ? countries : [];

  // Rule 1: one question per sampled country (never dropped).
  const questions = [];
  for (const { countryId, mastery } of sampled) {
    const record = index.get(countryId);
    if (!record) continue; // no data for this id — nothing to build
    questions.push(
      selectQuestionForCountry(mastery ?? 0, category, record, allCountries, masteryStats)
    );
  }

  // Rule 4: guarantee ≥2 tiers for 10+ question sessions.
  const distinctTiers = new Set(questions.map((q) => q.tier));
  if (questions.length >= MIN_SESSION_FOR_TIER_RULES && distinctTiers.size < 2) {
    const region = mostTestedRegion(sampled, index);
    if (region) {
      const usedIds = new Set(questions.map((q) => q.countryId));
      questions.push(
        ...buildBonusComparatives(
          region,
          index,
          usedIds,
          allCountries,
          masteryStats,
          BONUS_COMPARATIVE_COUNT
        )
      );
    }
  }

  // Rules 2 + 3 + 5: order the assembled queue in a single priority-aware pass.
  const ordered = arrangeQuestions(questions);

  return {
    questions: ordered,
    sessionMeta: buildSessionMeta(ordered, sampled),
  };
}
