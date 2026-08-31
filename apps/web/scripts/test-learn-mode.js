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

import {
  QUESTION_TIERS,
  getEligibleQuestionTypes,
  getEligibleQuestionTypesForChallenge,
} from "@/lib/learn/questionTypes";
import { buildLearnSession } from "@/lib/learn/sessionSequencer";
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
import { resolveLearnEma } from "@/lib/learn/emaIntegration";
import { computeMasteryUpdate } from "@/lib/mastery";
import { ROUND_OUTCOMES } from "@/lib/countryStats";
import countriesManifest from "@/data/countries.json";
import { generateQuestion } from "@/lib/learn/questionGenerator";
import { buildLearnWrongReveal } from "@/lib/learn/wrongReveal";
import {
  resolveGuessedCountry,
  resolveGuessedCountryInRegion,
  resolveShapeNameCompare,
} from "@/lib/learn/resolveGuessedCountry";
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

test("mixed-challenge 12-country sessions honor opening / variety / tier rules", () => {
  for (let iter = 0; iter < 300; iter += 1) {
    const ids = sample(ENABLED_IDS, 12);
    const countries = ids.map((id) => ({
      countryId: id,
      mastery: 0.1 + Math.random() * 0.85,
    }));
    const workingTier = 1 + Math.floor(Math.random() * 4);
    const { questions } = buildLearnSession({
      countries,
      category: "countries",
      allCountries: ENABLED,
      challenge: { workingTier, momentum: 0, recentOutcomes: [] },
    });

    assert.ok(questions.length >= 12, "no country dropped");
    // Rule 3 / checklist: never open with a Tier 1 free-recall question.
    assert.notEqual(questions[0].tier, QUESTION_TIERS.TIER_1, "opened with Tier 1");
    // Rule 2: avoid long same-type runs when the type mix allows it. The
    // sequencer documents that thin catalogs can force residual streaks.
    const typeCount = new Set(questions.map((q) => q.type)).size;
    const longest = longestSameTypeRun(questions);
    if (typeCount >= 4) {
      assert.ok(longest <= 4, `long same-type run (${longest}) despite type mix`);
    }
    // Rule 4: 10+ question sessions include at least 2 tiers.
    assert.ok(tiersOf(questions).size >= 2, "fewer than 2 tiers in a 10+ session");
    assert.ok(
      questions.every((q) => typeof q.predictedSuccess === "number"),
      "predictedSuccess attached"
    );
  }
});

test("Rule 5: no back-to-back comparatives whenever spacers can separate them", () => {
  // workingTier 2 → primarily T1/T2 with adjacent T3 — plenty of spacers.
  for (let iter = 0; iter < 500; iter += 1) {
    const ids = sample(ENABLED_IDS, 12);
    const countries = ids.map((id) => ({
      countryId: id,
      mastery: Math.random(),
    }));
    const { questions } = buildLearnSession({
      countries,
      category: "countries",
      allCountries: ENABLED,
      challenge: { workingTier: 2, momentum: 0, recentOutcomes: [] },
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

test("edge case: brand new challenge (tier 4) builds without error and has >=2 tiers", () => {
  const ids = sample(ENABLED_IDS, 12);
  const countries = ids.map((id) => ({ countryId: id, mastery: 0 }));
  const { questions } = buildLearnSession({
    countries,
    category: "countries",
    allCountries: ENABLED,
    challenge: createDefaultChallenge(),
  });
  assert.ok(questions.length >= 12);
  assert.ok(tiersOf(questions).size >= 2, "bonus comparative injection should add a 2nd tier");
});

test("edge case: workingTier 1 capitals builds without error", () => {
  const ids = sample(ENABLED_IDS, 12);
  const countries = ids.map((id) => ({ countryId: id, mastery: 0.97 }));
  const { questions } = buildLearnSession({
    countries,
    category: "capitals",
    allCountries: ENABLED,
    challenge: { workingTier: 1, momentum: 0, recentOutcomes: [] },
  });
  assert.ok(questions.length >= 12);
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

test("workingTier 2 sessions lean harder than workingTier 4", () => {
  const ids = sample(
    ENABLED.filter((c) => c.region === "europe").map((c) => c.iso3),
    12
  );
  const countries = ids.map((id) => ({ countryId: id, mastery: 0 }));
  const easy = buildLearnSession({
    countries,
    category: "countries",
    allCountries: ENABLED,
    challenge: { workingTier: 4, momentum: 0, recentOutcomes: [] },
  });
  const hard = buildLearnSession({
    countries,
    category: "countries",
    allCountries: ENABLED,
    challenge: { workingTier: 2, momentum: 0, recentOutcomes: [] },
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
    `expected hard session harder (${hardHardShare} vs ${easyHardShare})`
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
