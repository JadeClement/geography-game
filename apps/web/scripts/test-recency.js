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
import { buildFullRegionLearningQueue, buildGoQueue } from "@/lib/learning";

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

function inPlayStat(countryId, mastery, extra = {}) {
  return {
    countryId,
    masteryScore: mastery,
    graduated: false,
    lastAttemptAt: extra.lastAttemptAt ?? new Date(NOW - 48 * MS_PER_HOUR).toISOString(),
    lastOutcome: extra.lastOutcome ?? ROUND_OUTCOMES.NEEDED_REVEAL,
    ...extra,
  };
}

test("Go mix includes weak, near, and never-seen when EMA is spread out", () => {
  const weak = Array.from({ length: 9 }, (_, i) => `W${i}`);
  const middle = Array.from({ length: 9 }, (_, i) => `M${i}`);
  const near = Array.from({ length: 9 }, (_, i) => `H${i}`);
  const unseen = Array.from({ length: 9 }, (_, i) => `U${i}`);
  const inPlayStats = [
    ...weak.map((id) => inPlayStat(id, 0.05)),
    ...middle.map((id) => inPlayStat(id, 0.45)),
    ...near.map((id) => inPlayStat(id, 0.8)),
  ];

  const queue = buildGoQueue({
    regionCountryIds: [...weak, ...middle, ...near, ...unseen],
    inPlayStats,
    sessionSize: 10,
    now: NOW,
  });

  assert.equal(queue.length, 10);
  assert.equal(new Set(queue).size, 10);
  assert.ok(queue.some((id) => weak.includes(id)));
  assert.ok(queue.some((id) => near.includes(id)));
  assert.ok(queue.some((id) => unseen.includes(id)));
});

test("Go mix includes never-seen when all in-play mastery is bunched", () => {
  const seen = Array.from({ length: 20 }, (_, i) => `S${i}`);
  const unseen = Array.from({ length: 10 }, (_, i) => `U${i}`);
  const queue = buildGoQueue({
    regionCountryIds: [...seen, ...unseen],
    inPlayStats: seen.map((id) => inPlayStat(id, 0.05)),
    sessionSize: 10,
    now: NOW,
  });

  assert.equal(queue.length, 10);
  assert.equal(new Set(queue).size, 10);
  assert.ok(queue.some((id) => unseen.includes(id)));
});

test("Go mix fills from in-play when nothing is never-seen", () => {
  const seen = Array.from({ length: 30 }, (_, i) => `S${i}`);
  const queue = buildGoQueue({
    regionCountryIds: seen,
    inPlayStats: seen.map((id, i) => inPlayStat(id, i < 10 ? 0.05 : i < 20 ? 0.45 : 0.8)),
    sessionSize: 10,
    now: NOW,
  });

  assert.equal(queue.length, 10);
  assert.ok(queue.every((id) => seen.includes(id)));
});

test("a fully cooled weak third donates slots instead of repeating", () => {
  const weak = Array.from({ length: 9 }, (_, i) => `W${i}`);
  const middle = Array.from({ length: 9 }, (_, i) => `M${i}`);
  const near = Array.from({ length: 9 }, (_, i) => `H${i}`);
  const unseen = Array.from({ length: 9 }, (_, i) => `U${i}`);
  const inPlayStats = [
    ...weak.map((id) =>
      inPlayStat(id, 0.05, {
        lastAttemptAt: new Date(NOW).toISOString(),
        lastOutcome: ROUND_OUTCOMES.FIRST_TRY_CORRECT,
      })
    ),
    ...middle.map((id) => inPlayStat(id, 0.45)),
    ...near.map((id) => inPlayStat(id, 0.8)),
  ];

  const queue = buildGoQueue({
    regionCountryIds: [...weak, ...middle, ...near, ...unseen],
    inPlayStats,
    sessionSize: 10,
    now: NOW,
  });

  assert.equal(queue.length, 10);
  assert.equal(queue.filter((id) => weak.includes(id)).length, 0);
  assert.ok(queue.some((id) => unseen.includes(id) || middle.includes(id) || near.includes(id)));
});

test("Go mix still prefers other weak countries when only some of the third is cooled", () => {
  const cooled = ["W0", "W1", "W2"];
  const hotWeak = ["W3", "W4", "W5", "W6", "W7", "W8"];
  const middle = Array.from({ length: 9 }, (_, i) => `M${i}`);
  const near = Array.from({ length: 9 }, (_, i) => `H${i}`);
  const inPlayStats = [
    ...cooled.map((id) =>
      inPlayStat(id, 0.05, {
        lastAttemptAt: new Date(NOW).toISOString(),
        lastOutcome: ROUND_OUTCOMES.FIRST_TRY_CORRECT,
      })
    ),
    ...hotWeak.map((id) => inPlayStat(id, 0.05)),
    ...middle.map((id) => inPlayStat(id, 0.45)),
    ...near.map((id) => inPlayStat(id, 0.8)),
  ];

  const queue = buildGoQueue({
    regionCountryIds: [...cooled, ...hotWeak, ...middle, ...near],
    inPlayStats,
    sessionSize: 10,
    now: NOW,
  });

  assert.equal(queue.filter((id) => cooled.includes(id)).length, 0);
  assert.ok(queue.some((id) => hotWeak.includes(id)));
});
