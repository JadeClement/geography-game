/**
 * Recency cooldown for Go / Learn sampling weights.
 *
 * Run: npm run test:recency
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ROUND_OUTCOMES } from "@/lib/countryStats";
import {
  getRecencyMultiplier,
  getLearningWeight,
  GO_RECENCY_HALF_LIFE_HOURS,
  LEARN_RECENCY_HALF_LIFE_HOURS,
  MASTERY_MIN_WEIGHT,
} from "@/lib/mastery";
import { buildFullRegionLearningQueue } from "@/lib/learning";

const MS_PER_HOUR = 3_600_000;
const NOW = Date.parse("2026-09-01T12:00:00Z");

function firstTryHoursAgo(hours) {
  return {
    lastAttemptAt: new Date(NOW - hours * MS_PER_HOUR).toISOString(),
    lastOutcome: ROUND_OUTCOMES.FIRST_TRY_CORRECT,
  };
}

test("miss stays at recency 1 even if it just happened", () => {
  const stat = {
    lastAttemptAt: new Date(NOW).toISOString(),
    lastOutcome: ROUND_OUTCOMES.SECOND_TRY_CORRECT,
  };
  assert.equal(getRecencyMultiplier(stat, GO_RECENCY_HALF_LIFE_HOURS, NOW), 1);
});

test("reveal stays at recency 1", () => {
  const stat = {
    lastAttemptAt: new Date(NOW).toISOString(),
    lastOutcome: ROUND_OUTCOMES.NEEDED_REVEAL,
  };
  assert.equal(getRecencyMultiplier(stat, GO_RECENCY_HALF_LIFE_HOURS, NOW), 1);
});

test("null lastOutcome (legacy row) stays at recency 1", () => {
  const stat = {
    lastAttemptAt: new Date(NOW).toISOString(),
    lastOutcome: null,
  };
  assert.equal(getRecencyMultiplier(stat, GO_RECENCY_HALF_LIFE_HOURS, NOW), 1);
});

test("missing timestamp stays at recency 1", () => {
  const stat = { lastOutcome: ROUND_OUTCOMES.FIRST_TRY_CORRECT };
  assert.equal(getRecencyMultiplier(stat, GO_RECENCY_HALF_LIFE_HOURS, NOW), 1);
});

test("first-try at t=0 has recency 0", () => {
  assert.equal(
    getRecencyMultiplier(firstTryHoursAgo(0), GO_RECENCY_HALF_LIFE_HOURS, NOW),
    0
  );
});

test("first-try at one Go half-life has recency 0.5", () => {
  const recency = getRecencyMultiplier(
    firstTryHoursAgo(GO_RECENCY_HALF_LIFE_HOURS),
    GO_RECENCY_HALF_LIFE_HOURS,
    NOW
  );
  assert.equal(recency, 0.5);
});

test("first-try at one Learn half-life has recency 0.5", () => {
  const recency = getRecencyMultiplier(
    firstTryHoursAgo(LEARN_RECENCY_HALF_LIFE_HOURS),
    LEARN_RECENCY_HALF_LIFE_HOURS,
    NOW
  );
  assert.equal(recency, 0.5);
});

test("Go weight for a recent first-try is floored, not dropped", () => {
  const weight = getLearningWeight(
    {
      masteryScore: 0.2,
      graduated: false,
      ...firstTryHoursAgo(0),
    },
    NOW
  );
  assert.equal(weight, 0.01);
});

test("Go weight ignores recency on a miss", () => {
  const mastery = 0.2;
  const expected = (1 - mastery) ** 2 + MASTERY_MIN_WEIGHT;
  const weight = getLearningWeight(
    {
      masteryScore: mastery,
      graduated: false,
      lastAttemptAt: new Date(NOW).toISOString(),
      lastOutcome: ROUND_OUTCOMES.NEEDED_REVEAL,
    },
    NOW
  );
  assert.equal(weight, expected);
});

test("graduated countries still have Go weight 0", () => {
  const weight = getLearningWeight(
    {
      masteryScore: 0.95,
      graduated: true,
      ...firstTryHoursAgo(48),
    },
    NOW
  );
  assert.equal(weight, 0);
});

test("Learn queue still includes every country when recency is 0", () => {
  const ids = ["AAA", "BBB", "CCC"];
  const masteryById = { AAA: 0.5, BBB: 0.5, CCC: 0.5 };
  const recencyById = {
    AAA: firstTryHoursAgo(0),
    BBB: firstTryHoursAgo(0),
    CCC: firstTryHoursAgo(0),
  };
  const queue = buildFullRegionLearningQueue(ids, masteryById, recencyById);
  assert.deepEqual([...queue].sort(), ids);
});
