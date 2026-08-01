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
} from "@/lib/learn/questionTypes";
import { buildLearnSession } from "@/lib/learn/sessionSequencer";
import { resolveLearnEma } from "@/lib/learn/emaIntegration";
import { computeMasteryUpdate } from "@/lib/mastery";
import { ROUND_OUTCOMES } from "@/lib/countryStats";
import countriesManifest from "@/data/countries.json";

const ENABLED = countriesManifest.countries.filter((c) => c.enabled);
const ENABLED_IDS = ENABLED.map((c) => c.iso3);

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

// ── Eligibility ladder (Step 2b) ──────────────────────────────────────────────

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

// ── Session building rules (Steps 3–4) ────────────────────────────────────────

test("mixed-mastery 12-country sessions honor opening / variety / tier rules", () => {
  for (let iter = 0; iter < 300; iter += 1) {
    const ids = sample(ENABLED_IDS, 12);
    const countries = ids.map((id) => ({
      countryId: id,
      mastery: 0.1 + Math.random() * 0.85,
    }));
    const { questions } = buildLearnSession({
      countries,
      category: "countries",
      allCountries: ENABLED,
    });

    assert.ok(questions.length >= 12, "no country dropped");
    // Rule 3 / checklist: never open with a Tier 1 free-recall question.
    assert.notEqual(questions[0].tier, QUESTION_TIERS.TIER_1, "opened with Tier 1");
    // Rule 2: never more than 3 in a row of the same type.
    assert.ok(longestSameTypeRun(questions) <= 3, "3+ consecutive same type");
    // Rule 4: 10+ question sessions include at least 2 tiers.
    assert.ok(tiersOf(questions).size >= 2, "fewer than 2 tiers in a 10+ session");
  }
});

test("Rule 5: no back-to-back comparatives whenever spacers can separate them", () => {
  // Proficient band (0.5–0.7) for countries → Tier 2 (recognition) + Tier 3
  // (comparative). Whenever comparatives don't outnumber the non-comparative
  // spacers, the achievable (and required) number of adjacencies is zero. Rule 5
  // is subordinate to Rule 2, so we allow a residual only when comparatives are
  // the majority (unavoidable) — see the sequencer's documented caveats.
  for (let iter = 0; iter < 500; iter += 1) {
    const ids = sample(ENABLED_IDS, 12);
    const countries = ids.map((id) => ({
      countryId: id,
      mastery: 0.5 + Math.random() * 0.19,
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
      // Even when comparatives are the majority, never exceed the theoretical
      // minimum number of forced adjacencies.
      assert.ok(
        adjacencies <= comparative - spacers,
        `more forced adjacencies (${adjacencies}) than the minimum (${comparative - spacers})`
      );
    }
  }
});

test("edge case: all mastery 0.0 (brand new) builds without error and has >=2 tiers", () => {
  const ids = sample(ENABLED_IDS, 12);
  const countries = ids.map((id) => ({ countryId: id, mastery: 0 }));
  const { questions } = buildLearnSession({
    countries,
    category: "countries",
    allCountries: ENABLED,
  });
  assert.ok(questions.length >= 12);
  assert.ok(tiersOf(questions).size >= 2, "bonus comparative injection should add a 2nd tier");
});

test("edge case: all mastery 0.97 (fully mastered) builds without error", () => {
  const ids = sample(ENABLED_IDS, 12);
  const countries = ids.map((id) => ({ countryId: id, mastery: 0.97 }));
  const { questions } = buildLearnSession({
    countries,
    category: "capitals",
    allCountries: ENABLED,
  });
  assert.ok(questions.length >= 12);
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
