/**
 * Step 9 — automated portion of the Learn-mode testing checklist.
 *
 * Covers the programmatically-verifiable items (session building + EMA weighting).
 * UI items (fact modal gestures, side panel, clue visibility) are manual.
 *
 * Run: npm run test:learn
 *   (node --import ./scripts/register-alias.mjs --test scripts/test-learn-mode.js)
 */
import test from "node:test";
import assert from "node:assert/strict";

import { QUESTION_TIERS, getEligibleQuestionTypes, getEligibleQuestionTypesForChallenge, getPrimaryTierForMastery, QUESTION_TYPES, getDomainForQuestionType, SKILL_DOMAINS, QUESTION_TYPE_TO_DOMAIN } from "@/lib/learn/questionTypes";
import { buildLearnSession, getTierForCountry, selectQuestionForCountry } from "@/lib/learn/sessionSequencer";
import { buildDomainMasteryMap, getDomainMastery, getOverallMastery } from "@/lib/learn/domainMastery";
import {
  createDefaultChallenge,
  updateChallengeLevel,
  challengeOutcomeFromAnswer,
} from "@/lib/learn/challengeLevel";
import {
  predictedSuccess,
  isTrivialPrediction,
  pickByPredictedSuccess,
} from "@/lib/learn/predictedSuccess";
import { resolveLearnEma, neighborSetCredit, outcomeFromEvent } from "@/lib/learn/emaIntegration";
import { computeMasteryUpdate } from "@/lib/mastery";
import { ROUND_OUTCOMES } from "@/lib/countryStats";
import countriesManifest from "@/data/countries.json";
import { generateQuestion } from "@/lib/learn/questionGenerator";
import {
  reorder,
  slotIndexFromY,
  slotsWithPlaceholder,
} from "@/lib/learn/rankList";
import {
  buildReligionPieSlices,
  movePieBoundary,
  scoreReligionPie,
  startingPercentsForSlices,
} from "@/lib/learn/religionPie";
import {
  buildLearnWrongReveal,
  classifyNeighborTeachPaint,
  getNeighborIdsForQuestion,
  getNeighborTeachExtraCountries,
} from "@/lib/learn/wrongReveal";
import { buildLearnStatPayloads } from "@/lib/learn/emaIntegration";
import {
  distancePenaltyScale,
  evaluateGeoGuess,
  evaluateShapeDrop,
  formatDistanceKm,
  formatMapClickDistanceFeedback,
  MAP_CLICK_HIT_KM,
  MAP_CLICK_CLOSE_KM,
  SHAPE_DROP_HIT_KM,
} from "@/lib/learn/mapGuess";
import { distanceToGeometry, pointInGeometry } from "@worldly/core/geo/distance";
import {
  resolveGuessedCountry,
  resolveGuessedCountryInRegion,
  resolveShapeNameCompare,
} from "@/lib/learn/resolveGuessedCountry";
import { readFileSync } from "fs";
import { geometryToFittedPath } from "@worldly/core/geo/silhouette";

const ENABLED = countriesManifest.countries.filter((c) => c.enabled);
const ENABLED_IDS = ENABLED.map((c) => c.iso3);
const ENABLED_BY_ID = new Map(ENABLED.map((c) => [c.iso3, { ...c, id: c.iso3 }]));

function sample(ids, n) {
  const copy = [...ids];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function tiersOf(questions) {
  return new Set(questions.map((q) => q.tier));
}

function longestSameTypeRun(questions) {
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const q of questions) {
    run = q.type === prev ? run + 1 : 1;
    prev = q.type;
    if (run > longest) longest = run;
  }
  return longest;
}

function isComparative(tier) {
  return tier === QUESTION_TIERS.TIER_3 || tier === QUESTION_TIERS.TIER_4;
}

function comparativeAdjacencies(questions) {
  let count = 0;
  for (let i = 1; i < questions.length; i += 1) {
    if (isComparative(questions[i].tier) && isComparative(questions[i - 1].tier)) count += 1;
  }
  return count;
}

// ── Eligibility ladder (legacy mastery bands still exported) ──────────────────

test("mastery < 0.3 never yields a Tier 1 question", () => {
  for (const m of [0, 0.1, 0.29]) {
    for (const category of ["countries", "capitals", "flags"]) {
      const eligible = getEligibleQuestionTypes(m, category);
      assert.ok(
        eligible.every((t) => t.tier !== QUESTION_TIERS.TIER_1),
        `mastery ${m} / ${category} returned a Tier 1 type`
      );
    }
  }
});

test("mastery >= 0.9 (countries) yields only Tier 1 types", () => {
  const eligible = getEligibleQuestionTypes(0.95, "countries");
  assert.ok(eligible.length > 0);
  assert.ok(eligible.every((t) => t.tier === QUESTION_TIERS.TIER_1));
});

test("mastery 0.0 yields only Tier 4 types", () => {
  const eligible = getEligibleQuestionTypes(0, "countries");
  assert.ok(eligible.length > 0);
  assert.ok(eligible.every((t) => t.tier === QUESTION_TIERS.TIER_4));
});

test("MASTERY_BANDS primary tier matches EMA cutovers", () => {
  assert.equal(getPrimaryTierForMastery(0), QUESTION_TIERS.TIER_4);
  assert.equal(getPrimaryTierForMastery(0.15), QUESTION_TIERS.TIER_4);
  assert.equal(getPrimaryTierForMastery(0.45), QUESTION_TIERS.TIER_3);
  assert.equal(getPrimaryTierForMastery(0.65), QUESTION_TIERS.TIER_2);
  assert.equal(getPrimaryTierForMastery(0.82), QUESTION_TIERS.TIER_1);
  assert.equal(getPrimaryTierForMastery(0.95), QUESTION_TIERS.TIER_1);
});

test("unseen countries (mastery 0, 0 attempts) are Tier 4 first-exposure", () => {
  assert.equal(getTierForCountry(0, 0), QUESTION_TIERS.TIER_4);
  assert.equal(getTierForCountry(0, 4), QUESTION_TIERS.TIER_4);
});

test("challenge workingTier 4 yields Tier 4 (+ adjacent) types", () => {
  const eligible = getEligibleQuestionTypesForChallenge(4, "countries");
  assert.ok(eligible.length > 0);
  assert.ok(eligible.some((t) => t.tier === QUESTION_TIERS.TIER_4));
  assert.ok(eligible.every((t) => t.tier !== QUESTION_TIERS.TIER_1));
});

test("challenge workingTier 1 yields Tier 1 (+ adjacent) types", () => {
  const eligible = getEligibleQuestionTypesForChallenge(1, "countries");
  assert.ok(eligible.some((t) => t.tier === QUESTION_TIERS.TIER_1));
});

// ── Session building rules (Steps 3–4) ────────────────────────────────────────

test("mixed-mastery 12-country sessions honor opening / variety / tier rules", () => {
  for (let iter = 0; iter < 300; iter += 1) {
    const ids = sample(ENABLED_IDS, 12);
    const countries = ids.map((id, i) => ({
      countryId: id,
      mastery: [0.1, 0.45, 0.65, 0.82][i % 4],
      lastAttemptAt: i % 4 === 0 ? null : "2026-01-01",
    }));
    const { questions, sessionMeta } = buildLearnSession({
      countries,
      category: "countries",
      allCountries: ENABLED,
    });

    assert.ok(questions.length >= 12, "no country dropped");
    assert.notEqual(questions[0].tier, QUESTION_TIERS.TIER_1, "opened with Tier 1");
    const typeCount = new Set(questions.map((q) => q.type)).size;
    const longest = longestSameTypeRun(questions);
    if (typeCount >= 4) {
      assert.ok(longest <= 5, `long same-type run (${longest}) despite type mix`);
    }
    assert.ok(tiersOf(questions).size >= 2, "fewer than 2 tiers in a 10+ session");
    assert.ok(
      questions.every((q) => typeof q.predictedSuccess === "number"),
      "predictedSuccess attached"
    );
    assert.equal(sessionMeta.workingTier, undefined);
  }
});

test("Rule 5: no back-to-back comparatives whenever spacers can separate them", () => {
  // Mix of high-mastery (T1/T2 spacers) and low-mastery (T3/T4) countries.
  for (let iter = 0; iter < 500; iter += 1) {
    const ids = sample(ENABLED_IDS, 12);
    const countries = ids.map((id, i) => ({
      countryId: id,
      mastery: i < 6 ? 0.8 : 0.2,
      lastAttemptAt: "2026-01-01",
    }));
    const { questions } = buildLearnSession({
      countries,
      category: "countries",
      allCountries: ENABLED,
    });
    const comparative = questions.filter((q) => isComparative(q.tier)).length;
    const spacers = questions.length - comparative;
    const adjacencies = comparativeAdjacencies(questions);
    if (comparative <= spacers) {
      assert.equal(adjacencies, 0, "back-to-back comparatives despite enough spacers");
    } else {
      assert.ok(
        adjacencies <= comparative - spacers,
        `more forced adjacencies (${adjacencies}) than the minimum (${comparative - spacers})`
      );
    }
  }
});

test("edge case: brand new learner (all EMA 0) builds and has >=2 tiers", () => {
  const ids = sample(ENABLED_IDS, 12);
  const countries = ids.map((id) => ({ countryId: id, mastery: 0 }));
  const { questions } = buildLearnSession({
    countries,
    category: "countries",
    allCountries: ENABLED,
  });
  assert.ok(questions.length >= 12);
  const sampledIds = new Set(ids);
  assert.ok(
    questions.filter((q) => sampledIds.has(q.countryId)).every((q) => q.firstExposure === true)
  );
  assert.ok(tiersOf(questions).size >= 2, "bonus comparative injection should add a 2nd tier");
});

test("edge case: high-mastery capitals builds without error", () => {
  const ids = sample(ENABLED_IDS, 12);
  const countries = ids.map((id) => ({
    countryId: id,
    mastery: 0.97,
    lastAttemptAt: "2026-01-01",
  }));
  const { questions } = buildLearnSession({
    countries,
    category: "capitals",
    allCountries: ENABLED,
  });
  assert.ok(questions.length >= 12);
});

test("per-country EMA selects different tiers in one session", () => {
  const france = ENABLED_BY_ID.get("FRA");
  const germany = ENABLED_BY_ID.get("DEU");
  const italy = ENABLED_BY_ID.get("ITA");
  const spain = ENABLED_BY_ID.get("ESP");
  const { questions } = buildLearnSession({
    countries: [
      { countryId: "FRA", mastery: 0.15, lastAttemptAt: "2026-01-01" },
      { countryId: "DEU", mastery: 0.45, lastAttemptAt: "2026-01-01" },
      { countryId: "ITA", mastery: 0.65, lastAttemptAt: "2026-01-01" },
      { countryId: "ESP", mastery: 0.82, lastAttemptAt: "2026-01-01" },
    ],
    category: "countries",
    allCountries: ENABLED,
  });
  const byId = Object.fromEntries(questions.map((q) => [q.countryId, q]));
  assert.equal(byId.FRA?.tier, QUESTION_TIERS.TIER_4);
  assert.equal(byId.DEU?.tier, QUESTION_TIERS.TIER_3);
  assert.equal(byId.ITA?.tier, QUESTION_TIERS.TIER_2);
  assert.equal(byId.ESP?.tier, QUESTION_TIERS.TIER_1);
  assert.ok(france && germany && italy && spain);
  assert.ok(questions.every((q) => typeof q.skillDomain === "string"));
});

test("every QUESTION_TYPES id is mapped to a skill domain", () => {
  for (const type of Object.values(QUESTION_TYPES)) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(QUESTION_TYPE_TO_DOMAIN, type.id),
      true,
      `unmapped type ${type.id}`
    );
    assert.ok(Object.values(SKILL_DOMAINS).includes(getDomainForQuestionType(type.id)));
  }
});

test("domain mastery map falls back to general and weights overall", () => {
  const map = buildDomainMasteryMap([
    { countryId: "FRA", skillDomain: "general", masteryScore: 0.4 },
    { countryId: "DEU", skillDomain: "location", masteryScore: 0.8 },
    { countryId: "DEU", skillDomain: "statistics", masteryScore: 0.2 },
  ]);
  assert.equal(getDomainMastery(map, "FRA", SKILL_DOMAINS.LOCATION), 0.4);
  assert.equal(getDomainMastery(map, "ISL", SKILL_DOMAINS.LOCATION), 0);
  assert.equal(getDomainMastery(map, "DEU", SKILL_DOMAINS.STATISTICS), 0.2);
  assert.equal(
    getDomainMastery(map, "DEU", SKILL_DOMAINS.FACTS, 0.99),
    0,
    "missing domain is unseen (0), not the overall-mastery fallback"
  );
  assert.equal(getOverallMastery(map, "FRA"), 0.4);
  const deu = getOverallMastery(map, "DEU");
  assert.ok(deu > 0.2 && deu < 0.8, `weighted overall ${deu}`);
});

test("firstExposure is true only with mastery 0 and zero attempts", () => {
  const unseen = selectQuestionForCountry({
    category: "countries",
    record: ENABLED_BY_ID.get("FRA"),
    allCountries: ENABLED,
    mastery: 0,
    attempts: 0,
  });
  const seenZero = selectQuestionForCountry({
    category: "countries",
    record: ENABLED_BY_ID.get("FRA"),
    allCountries: ENABLED,
    mastery: 0,
    attempts: 3,
  });
  assert.equal(unseen.firstExposure, true);
  assert.equal(unseen.tier, QUESTION_TIERS.TIER_4);
  assert.equal(seenZero.firstExposure, false);
  assert.equal(seenZero.tier, QUESTION_TIERS.TIER_4);
});

test("unseen skill domain on a known country is firstExposure", () => {
  const question = selectQuestionForCountry({
    category: "countries",
    record: ENABLED_BY_ID.get("DEU"),
    allCountries: ENABLED,
    mastery: 0.8,
    attempts: 6,
    masteryStats: [
      {
        countryId: "DEU",
        skillDomain: "location",
        masteryScore: 0.8,
        lastAttemptAt: "2026-01-01",
      },
    ],
  });
  if (question.skillDomain === SKILL_DOMAINS.LOCATION) {
    assert.equal(question.firstExposure, false);
    assert.ok(question.domainMasteryScore > 0.7);
  } else {
    assert.equal(question.firstExposure, true);
    assert.equal(question.domainMasteryScore, 0);
  }
});

test("island with no neighbors is never dropped", () => {
  const iceland = ENABLED_BY_ID.get("ISL");
  assert.ok(iceland);
  const question = selectQuestionForCountry({
    category: "countries",
    record: iceland,
    allCountries: ENABLED,
    mastery: 0.65,
    attempts: 4,
  });
  assert.ok(question);
  assert.equal(question.countryId, "ISL");
});

// ── Adaptive challenge + predictedSuccess ─────────────────────────────────────

test("all-correct streak hardens challenge working tier", () => {
  let challenge = createDefaultChallenge();
  for (let i = 0; i < 12; i += 1) {
    challenge = updateChallengeLevel(
      challenge,
      challengeOutcomeFromAnswer({
        tier: QUESTION_TIERS.TIER_4,
        outcome: ROUND_OUTCOMES.FIRST_TRY_CORRECT,
        correct: true,
        revealUsed: false,
        fast: true,
      })
    );
  }
  assert.ok(challenge.workingTier < 4, `expected harden, got ${challenge.workingTier}`);
});

test("wrong answers (EMA second_try mapping) do not count as correct for challenge", () => {
  let challenge = {
    workingTier: 3,
    momentum: 0,
    recentOutcomes: [],
  };
  for (let i = 0; i < 8; i += 1) {
    challenge = updateChallengeLevel(
      challenge,
      challengeOutcomeFromAnswer({
        tier: QUESTION_TIERS.TIER_3,
        outcome: ROUND_OUTCOMES.SECOND_TRY_CORRECT,
        correct: false,
        revealUsed: false,
      })
    );
  }
  assert.ok(challenge.workingTier >= 3, `should not harden on wrongs, got ${challenge.workingTier}`);
});

test("Russia landlocked predictedSuccess is trivial vs Serbia at workingTier 3", () => {
  const russia = ENABLED_BY_ID.get("RUS");
  const serbia = ENABLED_BY_ID.get("SRB");
  assert.ok(russia && serbia);

  const russiaLL = predictedSuccess({
    workingTier: 3,
    question: {
      type: "landlocked_check",
      tier: QUESTION_TIERS.TIER_4,
      countryId: "RUS",
    },
    country: russia,
  });
  const serbiaLL = predictedSuccess({
    workingTier: 3,
    question: {
      type: "landlocked_check",
      tier: QUESTION_TIERS.TIER_4,
      countryId: "SRB",
    },
    country: serbia,
  });
  assert.ok(russiaLL > serbiaLL, `${russiaLL} vs ${serbiaLL}`);
  assert.ok(isTrivialPrediction(russiaLL, 3));
  const picked = pickByPredictedSuccess(
    [
      { question: { id: "ru" }, predictedSuccess: russiaLL },
      { question: { id: "rs" }, predictedSuccess: serbiaLL },
    ],
    3
  );
  assert.equal(picked.id, "rs");
});

test("high-mastery sessions lean harder than unseen sessions", () => {
  const ids = sample(
    ENABLED.filter((c) => c.region === "europe").map((c) => c.iso3),
    12
  );
  const easy = buildLearnSession({
    countries: ids.map((id) => ({ countryId: id, mastery: 0 })),
    category: "countries",
    allCountries: ENABLED,
  });
  const hard = buildLearnSession({
    countries: ids.map((id) => ({
      countryId: id,
      mastery: 0.82,
      lastAttemptAt: "2026-01-01",
    })),
    category: "countries",
    allCountries: ENABLED,
  });
  const easyHardShare =
    easy.questions.filter(
      (q) => q.tier === QUESTION_TIERS.TIER_1 || q.tier === QUESTION_TIERS.TIER_2
    ).length / easy.questions.length;
  const hardHardShare =
    hard.questions.filter(
      (q) => q.tier === QUESTION_TIERS.TIER_1 || q.tier === QUESTION_TIERS.TIER_2
    ).length / hard.questions.length;
  assert.ok(
    hardHardShare > easyHardShare,
    `expected high-mastery session harder (${hardHardShare} vs ${easyHardShare})`
  );
});

// ── EMA weighting (Steps 2c / 6) ──────────────────────────────────────────────

function correctDelta(tier, fast = true) {
  const { multiplier } = resolveLearnEma({
    tier,
    correct: true,
    revealUsed: false,
    fast,
  });
  const before = { masteryScore: 0.4 };
  const after = computeMasteryUpdate(before, {
    outcome: ROUND_OUTCOMES.FIRST_TRY_CORRECT,
    responseTimeMs: 1000, // fast
    gameType: "learning",
    learnModeMultiplier: multiplier,
  });
  return after.masteryScore - before.masteryScore;
}

test("Tier 4 correct produces a smaller EMA gain than Tier 1 correct", () => {
  const t1 = correctDelta(QUESTION_TIERS.TIER_1);
  const t4 = correctDelta(QUESTION_TIERS.TIER_4);
  assert.ok(t1 > 0);
  assert.ok(t4 > 0);
  assert.ok(t4 < t1, `expected Tier 4 gain (${t4}) < Tier 1 gain (${t1})`);
});

test("Test-mode EMA (no multiplier) equals Tier 1 Learn multiplier (1.0)", () => {
  const before = { masteryScore: 0.4 };
  const test = computeMasteryUpdate(before, {
    outcome: ROUND_OUTCOMES.FIRST_TRY_CORRECT,
    responseTimeMs: 1000,
    gameType: "test",
  });
  const learnT1 = computeMasteryUpdate(before, {
    outcome: ROUND_OUTCOMES.FIRST_TRY_CORRECT,
    responseTimeMs: 1000,
    gameType: "learning",
    learnModeMultiplier: 1.0,
  });
  assert.equal(test.masteryScore, learnT1.masteryScore);
});

test("resolveLearnEma maps events to the correct multiplier key", () => {
  assert.equal(
    resolveLearnEma({ tier: "tier_1", correct: true, fast: true }).multiplierKey,
    "tier_1_correct_fast"
  );
  assert.equal(
    resolveLearnEma({ tier: "tier_1", correct: true, fast: false }).multiplierKey,
    "tier_1_correct_slow"
  );
  assert.equal(
    resolveLearnEma({ tier: "tier_1", correct: false, revealUsed: true }).multiplierKey,
    "tier_1_reveal"
  );
  assert.equal(
    resolveLearnEma({ tier: "tier_2", correct: false }).multiplierKey,
    "tier_2_wrong"
  );
  assert.equal(
    resolveLearnEma({ tier: "tier_3", correct: true }).multiplierKey,
    "tier_3_correct"
  );
  assert.equal(
    resolveLearnEma({ tier: "tier_4", correct: false }).multiplierKey,
    "tier_4_wrong"
  );
});

test("shape identification asks which of four outlines is the named country", () => {
  const italy = ENABLED_BY_ID.get("ITA");
  const question = generateQuestion("shape_identification", italy, ENABLED);
  assert.ok(question);
  assert.equal(question.type, "shape_identification");
  assert.equal(question.answerType, "multiple_choice");
  assert.equal(question.correctAnswer, "ITA");
  assert.match(question.prompt, /Italy/);
  assert.equal(question.options.length, 4);
  assert.ok(question.options.every((option) => option.countryId));
  assert.ok(question.options.some((option) => option.countryId === "ITA"));
  assert.ok(
    question.options.every((option) => ENABLED_BY_ID.get(option.countryId)?.region === "europe")
  );
});

test("shape name entry shows an isolated outline and asks for the country name", () => {
  const chile = ENABLED_BY_ID.get("CHL");
  const question = generateQuestion("shape_name_entry", chile, ENABLED);
  assert.ok(question);
  assert.equal(question.type, "shape_name_entry");
  assert.equal(question.answerType, "text_entry");
  assert.equal(question.correctAnswer, "Chile");
  assert.equal(question.promptSubtext, "");
  assert.equal(question.mapConfig, null);
});

test("tiny countries do not get shape questions", () => {
  const nauru = ENABLED_BY_ID.get("NRU");
  assert.equal(generateQuestion("shape_identification", nauru, ENABLED), null);
  assert.equal(generateQuestion("shape_name_entry", nauru, ENABLED), null);
  assert.equal(generateQuestion("shape_drop", nauru, ENABLED), null);
});

test("borderless map click is a Tier 1 map_click with hidden borders", () => {
  const france = ENABLED_BY_ID.get("FRA");
  const question = generateQuestion("borderless_map_click", france, ENABLED);
  assert.ok(question);
  assert.equal(question.type, "borderless_map_click");
  assert.equal(question.answerType, "map_click");
  assert.equal(question.tier, QUESTION_TIERS.TIER_1);
  assert.equal(question.correctAnswer, "FRA");
  assert.match(question.prompt, /France/);
  assert.equal(question.mapConfig?.display, "borderless");
  assert.equal(question.mapConfig?.hideBorders, true);
});

test("shape drop is an unlabeled silhouette placed on a borderless map", () => {
  const italy = ENABLED_BY_ID.get("ITA");
  const question = generateQuestion("shape_drop", italy, ENABLED);
  assert.ok(question);
  assert.equal(question.type, "shape_drop");
  assert.equal(question.answerType, "shape_drop");
  assert.equal(question.tier, QUESTION_TIERS.TIER_1);
  assert.equal(question.correctAnswer, "ITA");
  assert.doesNotMatch(question.prompt, /Italy/);
  assert.equal(question.mapConfig?.display, "borderless");
});

test("population rank asks to order five same-region countries", () => {
  const germany = ENABLED_BY_ID.get("DEU");
  const question = generateQuestion("population_rank", germany, ENABLED);
  assert.ok(question);
  assert.equal(question.type, "population_rank");
  assert.equal(question.answerType, "drag_to_rank");
  assert.equal(question.tier, QUESTION_TIERS.TIER_3);
  assert.equal(question.rankField, "population");
  assert.ok(question.correctAnswer.length >= 4);
  assert.equal(question.options.length, question.correctAnswer.length);
  assert.ok(question.correctAnswer.includes("DEU"));
  assert.ok(
    question.options.every((option) => ENABLED_BY_ID.get(option.countryId)?.region === "europe")
  );
  const ordered = [...question.correctAnswer].map((id) => ENABLED_BY_ID.get(id).population);
  for (let i = 1; i < ordered.length; i += 1) {
    assert.ok(ordered[i - 1] > ordered[i], "correct order is descending population");
  }
});

test("outcomeFromEvent distinguishes second-try correct from a complete miss", () => {
  assert.equal(
    outcomeFromEvent({ correct: true, revealUsed: false, priorMiss: false }),
    ROUND_OUTCOMES.FIRST_TRY_CORRECT
  );
  assert.equal(
    outcomeFromEvent({ correct: true, revealUsed: false, priorMiss: true }),
    ROUND_OUTCOMES.SECOND_TRY_CORRECT
  );
  assert.equal(
    outcomeFromEvent({ correct: false, revealUsed: false, priorMiss: true }),
    ROUND_OUTCOMES.INCORRECT
  );
  assert.equal(
    outcomeFromEvent({ correct: false, revealUsed: true, priorMiss: false }),
    ROUND_OUTCOMES.NEEDED_REVEAL
  );
  assert.equal(
    outcomeFromEvent({ correct: true, revealUsed: true, priorMiss: false }),
    ROUND_OUTCOMES.NEEDED_REVEAL
  );
});

test("neighbor set credit is hits over the true set, shrunk by extras", () => {
  assert.equal(
    neighborSetCredit({
      correctIds: ["A", "B", "C", "D", "E", "F"],
      selectedIds: ["A", "B", "C", "D"],
      extraCount: 0,
    }),
    4 / 6
  );
  assert.equal(
    neighborSetCredit({
      correctIds: ["A", "B", "C", "D", "E", "F"],
      selectedIds: ["A", "B", "C", "D", "E", "F"],
      extraCount: 2,
    }),
    6 / 8
  );
  assert.equal(
    neighborSetCredit({
      correctIds: ["A", "B", "C"],
      selectedIds: ["A", "B", "X"],
    }),
    (2 / 3) * (3 / 4)
  );
  assert.equal(
    neighborSetCredit({
      correctIds: ["A", "B"],
      selectedIds: [],
      extraCount: 0,
    }),
    0
  );
  assert.equal(
    neighborSetCredit({
      correctIds: ["A", "B"],
      selectedIds: ["A", "B"],
    }),
    1
  );
});

test("partial neighbor recall writes a scaled first-try, not a full miss", () => {
  const partial = buildLearnStatPayloads(
    {
      countryId: "FRA",
      questionType: "neighbor_recall_all",
      tier: QUESTION_TIERS.TIER_1,
      correct: false,
      revealUsed: true,
      correctAnswer: ["BEL", "DEU", "ITA", "ESP", "CHE", "AND"],
      selectedValue: ["BEL", "DEU", "ITA", "ESP"],
      wrongValues: [],
    },
    { mode: "countries", level: "F1" }
  )[0];
  assert.equal(partial.payload.outcome, ROUND_OUTCOMES.FIRST_TRY_CORRECT);
  assert.equal(partial.payload.learnModeMultiplier, 4 / 6);
  assert.equal(partial.payload.responseTimeMs, null);

  const none = buildLearnStatPayloads(
    {
      countryId: "FRA",
      questionType: "neighbor_recall_all",
      tier: QUESTION_TIERS.TIER_1,
      correct: false,
      revealUsed: true,
      correctAnswer: ["BEL", "DEU"],
      selectedValue: [],
      wrongValues: [],
    },
    { mode: "countries", level: "F1" }
  )[0];
  assert.equal(none.payload.outcome, ROUND_OUTCOMES.NEEDED_REVEAL);

  const perfect = buildLearnStatPayloads(
    {
      countryId: "FRA",
      questionType: "neighbor_recall_all",
      tier: QUESTION_TIERS.TIER_1,
      correct: true,
      correctAnswer: ["BEL", "DEU"],
      selectedValue: ["BEL", "DEU"],
      wrongValues: [],
    },
    { mode: "countries", level: "F1" }
  )[0];
  assert.equal(perfect.payload.outcome, ROUND_OUTCOMES.FIRST_TRY_CORRECT);
  assert.equal(perfect.payload.learnModeMultiplier, 1);
});

test("partial neighbor select-all scales the Tier 2 correct multiplier", () => {
  const payloads = buildLearnStatPayloads(
    {
      countryId: "ALB",
      questionType: "neighbor_select_all",
      tier: QUESTION_TIERS.TIER_2,
      correct: false,
      correctAnswer: ["MNE", "XKX", "MKD", "GRC"],
      selectedValue: ["MNE", "XKX", "ITA"],
    },
    { mode: "countries", level: "F1" }
  );
  assert.equal(payloads.length, 1);
  const credit = neighborSetCredit({
    correctIds: ["MNE", "XKX", "MKD", "GRC"],
    selectedIds: ["MNE", "XKX", "ITA"],
  });
  assert.equal(payloads[0].payload.outcome, ROUND_OUTCOMES.FIRST_TRY_CORRECT);
  assert.equal(payloads[0].payload.learnModeMultiplier, 0.6 * credit);
});

test("ranking writes a weighted EMA update for every country in the set", () => {
  const payloads = buildLearnStatPayloads(
    {
      countryId: "DEU",
      tier: QUESTION_TIERS.TIER_3,
      correct: false,
      countryUpdates: [
        { countryId: "DEU", correct: true },
        { countryId: "FRA", correct: false },
        { countryId: "POL", correct: true },
      ],
    },
    { mode: "countries", level: "F1" }
  );
  assert.equal(payloads.length, 3);
  const byId = Object.fromEntries(
    payloads.map(({ payload }) => [payload.countryId, payload])
  );
  assert.equal(byId.DEU.outcome, ROUND_OUTCOMES.FIRST_TRY_CORRECT);
  assert.equal(byId.FRA.outcome, ROUND_OUTCOMES.INCORRECT);
  assert.equal(byId.POL.outcome, ROUND_OUTCOMES.FIRST_TRY_CORRECT);
  assert.ok(byId.DEU.learnModeMultiplier > byId.FRA.learnModeMultiplier);
});

test("a 20 km miss penalizes mastery far less than a 10,000 km miss", () => {
  const near = distancePenaltyScale(20);
  const far = distancePenaltyScale(10000);
  assert.ok(near < 0.15, `20 km scale ${near}`);
  assert.ok(far > 0.95, `10,000 km scale ${far}`);
  const nearPayload = buildLearnStatPayloads(
    {
      countryId: "FRA",
      tier: QUESTION_TIERS.TIER_1,
      correct: false,
      distanceKm: 20,
    },
    { mode: "countries", level: "F1" }
  )[0];
  const farPayload = buildLearnStatPayloads(
    {
      countryId: "FRA",
      tier: QUESTION_TIERS.TIER_1,
      correct: false,
      distanceKm: 10000,
    },
    { mode: "countries", level: "F1" }
  )[0];
  assert.ok(
    nearPayload.payload.learnModeMultiplier < farPayload.payload.learnModeMultiplier
  );
});

test("point-in-polygon and closest-border distance for a simple square", () => {
  const geometry = {
    type: "Polygon",
    coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
  };
  assert.equal(pointInGeometry(1, 1, geometry), true);
  const inside = distanceToGeometry(1, 1, geometry);
  assert.equal(inside.inside, true);
  assert.equal(inside.distanceKm, 0);

  const outside = distanceToGeometry(2.5, 1, geometry);
  assert.equal(outside.inside, false);
  assert.ok(outside.distanceKm > 0);
  assert.ok(outside.closestPoint);

  const hit = evaluateGeoGuess({ lng: 1, lat: 1, geometry, hitKm: MAP_CLICK_HIT_KM });
  assert.equal(hit.correct, true);
  assert.match(formatDistanceKm(0), /less than 1 km|0/);
});

test("shape drop measures centroid to centroid, not nearest border", () => {
  const geometry = {
    type: "Polygon",
    coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
  };
  // Inside the square: border distance is 0, but 0.5° north of the centroid.
  const border = evaluateGeoGuess({ lng: 1, lat: 1.5, geometry });
  assert.equal(border.inside, true);
  assert.equal(border.distanceKm, 0);

  const dropped = evaluateShapeDrop({
    lng: 1,
    lat: 1.5,
    centroid: [1, 1],
    hitKm: SHAPE_DROP_HIT_KM,
  });
  assert.equal(dropped.inside, false);
  assert.ok(dropped.distanceKm > 40 && dropped.distanceKm < 70);
  assert.deepEqual(dropped.closestPoint, [1, 1]);
  assert.equal(dropped.correct, true);
});

test("map click copy: under 20 km is green Close enough, under 100 km is Close!", () => {
  const closeEnough = formatMapClickDistanceFeedback({
    correct: true,
    inside: false,
    distanceKm: 8,
  });
  assert.equal(closeEnough.type, "correct");
  assert.match(closeEnough.text, /Close enough!/);
  assert.match(closeEnough.text, /8/);

  const inside = formatMapClickDistanceFeedback({
    correct: true,
    inside: true,
    distanceKm: 0,
  });
  assert.equal(inside.text, "Correct");
  assert.equal(inside.type, "correct");

  const close = formatMapClickDistanceFeedback({
    correct: false,
    distanceKm: 45,
  });
  assert.equal(close.text, "Close!");
  assert.equal(close.type, "wrong");
  assert.match(close.detail, /45 km away/);
  assert.ok(45 < MAP_CLICK_CLOSE_KM);

  const far = formatMapClickDistanceFeedback({
    correct: false,
    distanceKm: 1720,
  });
  assert.equal(far.text, "Not quite.");
  assert.match(far.detail, /1,720 km away/);

  const nearHit = evaluateGeoGuess({
    lng: 2.15,
    lat: 1,
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
    },
    hitKm: MAP_CLICK_HIT_KM,
  });
  // 0.15 deg ~ 16 km at the equator — inside the 20 km hit band.
  assert.equal(nearHit.inside, false);
  assert.ok(nearHit.distanceKm > 0 && nearHit.distanceKm <= MAP_CLICK_HIT_KM);
  assert.equal(nearHit.correct, true);
});

test("gdp compare asks which country has the larger GDP", () => {
  const germany = ENABLED_BY_ID.get("DEU");
  const question = generateQuestion("gdp_compare", germany, ENABLED);
  assert.ok(question);
  assert.equal(question.type, "gdp_compare");
  assert.equal(question.answerType, "binary_choice");
  assert.equal(question.options.length, 2);
  assert.match(question.prompt, /larger GDP/);
  assert.ok(typeof germany.gdp === "number" && germany.gdp > 0);
  const opponentId = question.comparisonCountryId;
  const opponent = ENABLED_BY_ID.get(opponentId);
  assert.ok(opponent, "comparison opponent exists");
  assert.equal(opponent.region, germany.region);
  assert.ok(typeof opponent.gdp === "number" && opponent.gdp > 0);
  assert.notEqual(opponent.gdp, germany.gdp);
  const winnerId = germany.gdp > opponent.gdp ? "DEU" : opponentId;
  assert.equal(question.correctAnswer, winnerId);
});

test("vatican does not get a gdp compare (no figure)", () => {
  const vatican = ENABLED_BY_ID.get("VAT");
  assert.equal(vatican?.gdp ?? null, null);
  assert.equal(generateQuestion("gdp_compare", vatican, ENABLED), null);
});

test("geometryToFittedPath letterboxes a tall polygon into a square viewBox", () => {
  const geometry = {
    type: "Polygon",
    coordinates: [[[0, 0], [2, 0], [2, 10], [0, 10], [0, 0]]],
  };
  const fitted = geometryToFittedPath(geometry);
  assert.ok(fitted);
  assert.equal(fitted.viewBox, "0 0 400 400");
  assert.ok(fitted.d.startsWith("M"));
  assert.ok(fitted.d.includes("Z"));
});

test("geometryToFittedPath aspect fit keeps a wide country's proportions", () => {
  const geometry = {
    type: "Polygon",
    coordinates: [[[0, 0], [10, 0], [10, 2], [0, 2], [0, 0]]],
  };
  const fitted = geometryToFittedPath(geometry, { fit: "aspect" });
  assert.ok(fitted);
  const [, , w, h] = fitted.viewBox.split(" ").map(Number);
  assert.ok(w > h, "wide country should have a wider-than-tall viewBox");
});

function pathBBox(d) {
  const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
  const xs = [];
  const ys = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    xs.push(nums[i]);
    ys.push(nums[i + 1]);
  }
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

test("geometryToFittedPath uses one uniform scale (no x/y stretch)", () => {
  const geometry = {
    type: "Polygon",
    coordinates: [[[0, 0], [8, 0], [8, 4], [0, 4], [0, 0]]],
  };
  const fitted = geometryToFittedPath(geometry, { fit: "aspect", padding: 0 });
  const box = pathBBox(fitted.d);
  const ratio = box.width / box.height;
  // Equator-ish (mid lat 2°) rectangle is ~2:1; cosine correction is ~1.
  assert.ok(Math.abs(ratio - 2) < 0.05, `expected ~2:1, got ${ratio}`);
});

test("geometryToFittedPath does not treat high-latitude degrees as square", () => {
  const geometry = {
    type: "Polygon",
    coordinates: [[[0, 60], [10, 60], [10, 70], [0, 70], [0, 60]]],
  };
  const fitted = geometryToFittedPath(geometry, { fit: "aspect", padding: 0 });
  const box = pathBBox(fitted.d);
  const expected = Math.cos((65 * Math.PI) / 180);
  const ratio = box.width / box.height;
  assert.ok(
    Math.abs(ratio - expected) < 0.02,
    `10°×10° at 65°N should be ~${expected.toFixed(3)} wide:tall, got ${ratio.toFixed(3)}`
  );
});

function ringCount(d) {
  return (d.match(/Z/g) || []).length;
}

function squareRing(lng, lat, size) {
  return [
    [lng, lat],
    [lng + size, lat],
    [lng + size, lat + size],
    [lng, lat + size],
    [lng, lat],
  ];
}

test("geometryToFittedPath keeps nearby islands even when they are small", () => {
  const geometry = {
    type: "MultiPolygon",
    coordinates: [
      [squareRing(0, 0, 10)],
      [squareRing(11, 4, 2)],
      [squareRing(40, 4, 2)],
    ],
  };
  const fitted = geometryToFittedPath(geometry);
  assert.equal(ringCount(fitted.d), 2, "nearby 4% island stays; distant scrap drops");
});

test("geometryToFittedPath keeps two large landmasses that are far apart", () => {
  const geometry = {
    type: "MultiPolygon",
    coordinates: [
      [squareRing(0, 0, 10)],
      [squareRing(20, 0, 8)],
    ],
  };
  const fitted = geometryToFittedPath(geometry);
  assert.equal(ringCount(fitted.d), 2, "Malaysia-style split cores both stay");
});

const COUNTRIES_GEOJSON = JSON.parse(
  readFileSync(new URL("../public/data/countries.geojson", import.meta.url), "utf8")
);

test("Philippines silhouette keeps the Visayas, not just Luzon and Mindanao", () => {
  const feature = COUNTRIES_GEOJSON.features.find(
    (entry) => entry.properties?.["ISO3166-1-Alpha-3"] === "PHL"
  );
  assert.ok(feature, "Philippines feature present in countries.geojson");
  const fitted = geometryToFittedPath(feature.geometry, { iso3: "PHL" });
  assert.ok(fitted);
  assert.ok(
    ringCount(fitted.d) >= 8,
    `expected Palawan + Visayas islands, got ${ringCount(fitted.d)} rings`
  );
});

test("France silhouette still excludes French Guiana", () => {
  const feature = COUNTRIES_GEOJSON.features.find(
    (entry) => entry.properties?.name === "France"
  );
  assert.ok(feature, "France feature present in countries.geojson");
  const fitted = geometryToFittedPath(feature.geometry, { iso3: "FRA" });
  assert.ok(fitted);
  assert.ok(
    ringCount(fitted.d) <= 4,
    `metropolitan France should not pull in DOM-TOM, got ${ringCount(fitted.d)} rings`
  );
});

test("Serbia neighbor data includes Kosovo as XKX, not the mledoze UNK code", () => {
  const serbia = ENABLED_BY_ID.get("SRB");
  const kosovo = ENABLED_BY_ID.get("XKX");
  assert.ok(serbia?.neighbors.includes("XKX"));
  assert.ok(!serbia?.neighbors.includes("UNK"));
  assert.ok(kosovo?.neighbors.includes("SRB"));

  const question = generateQuestion("neighbor_recall_all", serbia, ENABLED);
  assert.ok(question);
  const reveal = buildLearnWrongReveal(question, ENABLED_BY_ID);
  assert.match(reveal.message, /Kosovo/);
  assert.ok(reveal.neighborReveal?.neighborIds.includes("XKX"));
});

test("neighbor select-all is a 9-option grid of neighbors plus nearby distractors", () => {
  const albania = ENABLED_BY_ID.get("ALB");
  const question = generateQuestion("neighbor_select_all", albania, ENABLED);
  assert.ok(question);
  const optionIds = question.options.map((option) => option.value);
  assert.equal(optionIds.length, 9);
  assert.equal(new Set(optionIds).size, 9);

  const neighbors = ["MNE", "GRC", "MKD", "XKX"];
  for (const id of neighbors) {
    assert.ok(optionIds.includes(id), `missing neighbor ${id}`);
    assert.ok(question.correctAnswer.includes(id));
  }
  assert.equal(question.correctAnswer.length, neighbors.length);

  // 2-hop land neighbors in Europe fill first; Turkey is Asia so it is not used.
  const nearby = ["BIH", "HRV", "SRB", "BGR"];
  for (const id of nearby) {
    assert.ok(optionIds.includes(id), `expected nearby distractor ${id}`);
  }
  assert.ok(!optionIds.includes("TUR"));
  assert.ok(!optionIds.includes("FIN"));
  assert.ok(!optionIds.includes("AND"));
  assert.ok(!optionIds.includes("ALB"));
  for (const id of optionIds) {
    assert.equal(ENABLED_BY_ID.get(id).region, "europe");
  }

  const norway = ENABLED_BY_ID.get("NOR");
  const norwayQ = generateQuestion("neighbor_select_all", norway, ENABLED);
  assert.ok(norwayQ);
  const norwayIds = norwayQ.options.map((option) => option.value);
  assert.equal(norwayIds.length, 9);
  for (const id of ["SWE", "FIN", "RUS"]) {
    assert.ok(norwayIds.includes(id));
  }
  assert.ok(!norwayIds.includes("CHN"));
  assert.ok(!norwayIds.includes("KAZ"));
  for (const id of norwayIds) {
    assert.equal(ENABLED_BY_ID.get(id).region, "europe");
  }

  const germany = ENABLED_BY_ID.get("DEU");
  const germanyQ = generateQuestion("neighbor_select_all", germany, ENABLED);
  assert.ok(germanyQ);
  const germanyNeighbors = germany.neighbors.filter((id) => ENABLED_BY_ID.has(id));
  const germanyIds = germanyQ.options.map((option) => option.value);
  assert.ok(germanyIds.length >= 9);
  assert.equal(germanyIds.length, germanyNeighbors.length + 1);
  for (const id of germanyNeighbors) {
    assert.ok(germanyIds.includes(id));
  }
});

test("neighbor teach promotes out-of-region borders onto the map", () => {
  const europe = ENABLED.filter((country) => country.region === "europe").map(
    (country) => ({ ...country, id: country.iso3 })
  );
  const question = { countryId: "BGR", type: "neighbor_recall_all" };
  const neighborIds = getNeighborIdsForQuestion(question, ENABLED_BY_ID);
  assert.ok(neighborIds.includes("TUR"), "Bulgaria's neighbor list includes Turkey");
  assert.equal(ENABLED_BY_ID.get("TUR").region, "asia");

  const extra = getNeighborTeachExtraCountries(
    neighborIds,
    europe,
    ENABLED_BY_ID
  );
  assert.deepEqual(
    extra.map((country) => country.id),
    ["TUR"]
  );

  const reveal = buildLearnWrongReveal(question, ENABLED_BY_ID);
  assert.match(reveal.message, /Turkey/);
  assert.ok(reveal.neighborReveal?.neighborIds.includes("TUR"));
});

test("neighbor teach paints found green, missed orange, and extra guesses red", () => {
  const neighbors = ["LVA", "RUS"];
  const paint = classifyNeighborTeachPaint({
    neighborIds: neighbors,
    mainId: "EST",
    selectedValue: ["LVA"],
    wrongValues: ["FIN"],
    feedbackType: "wrong",
    resolveId: (value) => value,
  });
  assert.deepEqual(paint.foundIds, ["LVA"]);
  assert.deepEqual(paint.missedIds, ["RUS"]);
  assert.deepEqual(paint.wrongIds, ["FIN"]);
});

test("correct neighbor teach paints the full border set green", () => {
  const neighbors = ["LVA", "RUS"];
  const paint = classifyNeighborTeachPaint({
    neighborIds: neighbors,
    mainId: "EST",
    selectedValue: ["LVA", "RUS"],
    feedbackType: "correct",
    resolveId: (value) => value,
  });
  assert.deepEqual(paint.foundIds, neighbors);
  assert.deepEqual(paint.missedIds, []);
  assert.deepEqual(paint.wrongIds, []);
});

test("wrong flag pick relies on option labels instead of That's-copy", () => {
  const question = {
    type: "flag_identification",
    countryId: "JOR",
    correctAnswer: "JOR",
    options: [
      { value: "JOR", label: "Jordan", countryId: "JOR" },
      { value: "AZE", label: "Azerbaijan", countryId: "AZE" },
    ],
  };
  const reveal = buildLearnWrongReveal(question, ENABLED_BY_ID, {
    selectedValue: "AZE",
  });
  assert.equal(reveal.message, null);
});

test("wrong capital pick names the selected city and its country", () => {
  const moldova = ENABLED_BY_ID.get("MDA");
  const question = {
    type: "capital_matching",
    countryId: "CYP",
    correctAnswer: "Nicosia",
    options: [
      { value: "Nicosia", label: "Nicosia", countryId: "CYP" },
      { value: "Chisinau", label: "Chisinau", countryId: "MDA" },
    ],
  };
  const reveal = buildLearnWrongReveal(question, ENABLED_BY_ID, {
    selectedValue: "Chisinau",
  });
  assert.equal(reveal.message, "Chisinau is the capital of Moldova.");
  assert.equal(moldova?.name, "Moldova");
});

test("wrong typed capital does not add That's-copy above Continue", () => {
  const question = {
    type: "capital_free_recall",
    answerType: "text_entry",
    countryId: "BIH",
    correctAnswer: "Sarajevo",
  };
  const reveal = buildLearnWrongReveal(question, ENABLED_BY_ID, {
    selectedValue: "fjksl",
  });
  assert.equal(reveal.message, null);
});

test("enclave fun fact only appears on landlocked questions", () => {
  const smr = ENABLED_BY_ID.get("SMR");
  const landlocked = generateQuestion("landlocked_check", smr, ENABLED_BY_ID);
  const capital = generateQuestion("capital_free_recall", smr, ENABLED_BY_ID);
  assert.match(landlocked?.continueNote ?? "", /enclave/);
  assert.equal(capital?.continueNote, undefined);
});

test("resolveGuessedCountry matches a typed name anywhere in the world", () => {
  const italy = resolveGuessedCountry("Italy", { allCountriesById: ENABLED_BY_ID });
  assert.equal(italy?.id, "ITA");
  assert.equal(italy?.name, "Italy");
  const byIso = resolveGuessedCountry("CHL", { allCountriesById: ENABLED_BY_ID });
  assert.equal(byIso?.id, "CHL");
  assert.equal(resolveGuessedCountry("fjksl", { allCountriesById: ENABLED_BY_ID }), null);
});

test("resolveGuessedCountryInRegion ignores out-of-region name matches", () => {
  const southAmerica = ENABLED.filter((c) => c.region === "southAmerica").map(
    (c) => ({ ...c, id: c.iso3 })
  );
  const italy = resolveGuessedCountryInRegion("Italy", {
    allCountriesById: ENABLED_BY_ID,
    activeCountries: southAmerica,
  });
  assert.equal(italy, null);
  const chile = resolveGuessedCountryInRegion("Chile", {
    allCountriesById: ENABLED_BY_ID,
    activeCountries: southAmerica,
  });
  assert.equal(chile?.id, "CHL");
});

test("shape name miss compares against the guessed country's outline", () => {
  const chile = ENABLED_BY_ID.get("CHL");
  const question = generateQuestion("shape_name_entry", chile, ENABLED);
  const guessed = resolveShapeNameCompare("Italy", {
    questionCountryId: question.countryId,
    allCountriesById: ENABLED_BY_ID,
  });
  assert.equal(guessed?.id, "ITA");
  assert.equal(
    resolveShapeNameCompare("Chile", {
      questionCountryId: question.countryId,
      allCountriesById: ENABLED_BY_ID,
    }),
    null
  );
  assert.equal(
    resolveShapeNameCompare("asdfgh", {
      questionCountryId: question.countryId,
      allCountriesById: ENABLED_BY_ID,
    }),
    null
  );
});

test("rank list slot targeting stays stable across the full height", () => {
  assert.deepEqual(reorder(["a", "b", "c", "d", "e"], 4, 0), [
    "e",
    "a",
    "b",
    "c",
    "d",
  ]);
  assert.deepEqual(reorder(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
  assert.equal(slotIndexFromY(10, 0, 100, 5), 0);
  assert.equal(slotIndexFromY(39, 0, 100, 5), 1);
  assert.equal(slotIndexFromY(99, 0, 100, 5), 4);
  assert.equal(slotIndexFromY(-8, 0, 100, 5), 0);
  assert.equal(slotIndexFromY(140, 0, 100, 5), 4);

  const slots = slotsWithPlaceholder(["a", "b", "c", "d", "e"], 4, 0);
  assert.equal(slots[0].kind, "placeholder");
  assert.equal(slots[0].id, "e");
  assert.deepEqual(
    slots.slice(1).map((slot) => slot.id),
    ["a", "b", "c", "d"]
  );
});

test("religion majority questions use Pew breakdowns", () => {
  const saudi = ENABLED_BY_ID.get("SAU");
  const india = ENABLED_BY_ID.get("IND");
  const nigeria = ENABLED_BY_ID.get("NGA");
  const czechia = ENABLED_BY_ID.get("CZE");
  assert.ok(saudi?.religions?.length > 0);
  assert.equal(saudi.religions[0].name, "Islam");

  const saudiQ = generateQuestion("religion_majority", saudi, ENABLED_BY_ID);
  assert.equal(saudiQ?.type, "religion_majority");
  assert.equal(saudiQ?.correctAnswer, "Islam");
  assert.ok(saudiQ.options.some((option) => option.value === "Islam"));

  const indiaQ = generateQuestion("religion_majority", india, ENABLED_BY_ID);
  assert.equal(indiaQ?.correctAnswer, "Hinduism");

  const nigeriaQ = generateQuestion("religion_majority", nigeria, ENABLED_BY_ID);
  assert.deepEqual(nigeriaQ?.correctAnswer, ["Islam", "Christianity"]);
  assert.ok(nigeriaQ.options.some((option) => option.value === "Islam"));
  assert.ok(nigeriaQ.options.some((option) => option.value === "Christianity"));

  const czechiaQ = generateQuestion("religion_majority", czechia, ENABLED_BY_ID);
  assert.equal(czechiaQ?.correctAnswer, "No religion");

  assert.equal(
    generateQuestion("religion_majority", { ...saudi, religions: [] }, ENABLED_BY_ID),
    null
  );
});

test("religion pie questions skip one-religion countries and score with tolerance", () => {
  const nigeria = ENABLED_BY_ID.get("NGA");
  const korea = ENABLED_BY_ID.get("KOR");
  const afghanistan = ENABLED_BY_ID.get("AFG");
  const china = ENABLED_BY_ID.get("CHN");
  const singapore = ENABLED_BY_ID.get("SGP");

  assert.equal(buildReligionPieSlices(afghanistan), null);
  assert.equal(buildReligionPieSlices(china), null);
  assert.equal(generateQuestion("religion_pie", afghanistan, ENABLED_BY_ID), null);
  assert.equal(generateQuestion("religion_pie", china, ENABLED_BY_ID), null);

  const nigeriaSlices = buildReligionPieSlices(nigeria);
  assert.equal(nigeriaSlices?.length, 2);
  assert.equal(nigeriaSlices[0].name, "Islam");
  assert.equal(nigeriaSlices[1].name, "Christianity");
  const nigeriaSum = nigeriaSlices.reduce((sum, slice) => sum + slice.percent, 0);
  assert.ok(Math.abs(nigeriaSum - 100) < 0.05);

  const nigeriaQ = generateQuestion("religion_pie", nigeria, ENABLED_BY_ID);
  assert.equal(nigeriaQ?.type, "religion_pie");
  assert.equal(nigeriaQ?.tier, QUESTION_TIERS.TIER_1);
  assert.equal(nigeriaQ?.answerType, "drag_pie");
  assert.equal(nigeriaQ?.mapConfig, null);
  assert.match(nigeriaQ.prompt, /Nigeria/);
  assert.deepEqual(nigeriaQ.correctAnswer, nigeriaSlices);
  assert.ok(nigeriaQ.startingPercents.length === 2);
  assert.equal(
    scoreReligionPie(
      nigeriaSlices.map((slice, index) => ({
        name: slice.name,
        percent: nigeriaQ.startingPercents[index],
      })),
      nigeriaSlices
    ),
    false
  );

  const koreaQ = generateQuestion("religion_pie", korea, ENABLED_BY_ID);
  assert.equal(koreaQ?.correctAnswer.length, 3);
  assert.deepEqual(
    koreaQ.correctAnswer.map((slice) => slice.name),
    ["No religion", "Christianity", "Buddhism"]
  );

  const singaporeQ = generateQuestion("religion_pie", singapore, ENABLED_BY_ID);
  assert.equal(singaporeQ?.correctAnswer.length, 4);

  const closeGuess = nigeriaSlices.map((slice) => ({
    name: slice.name,
    percent: slice.percent + 5,
  }));
  closeGuess[1] = {
    name: closeGuess[1].name,
    percent: nigeriaSlices[1].percent - 5,
  };
  assert.equal(scoreReligionPie(closeGuess, nigeriaSlices), true);
  assert.equal(
    scoreReligionPie(
      [
        { name: "Islam", percent: 25 },
        { name: "Christianity", percent: 75 },
      ],
      nigeriaSlices
    ),
    false
  );

  const moved = movePieBoundary([25, 75], 0, 56);
  assert.equal(moved[0], 56);
  assert.equal(moved[1], 44);

  const start = startingPercentsForSlices(nigeriaSlices);
  assert.equal(start.length, 2);

  const reveal = buildLearnWrongReveal(nigeriaQ, ENABLED_BY_ID);
  assert.equal(reveal.message, null);

  const t1 = getEligibleQuestionTypes(0.95, "countries");
  assert.ok(t1.some((type) => type.id === "religion_pie"));
});
