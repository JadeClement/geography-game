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
import { buildFullRegionLearningQueue, buildGoQueue, buildSampledPool } from "@/lib/learning";
import { getRecencyModifier, getSamplingWeight } from "@/lib/learn/recencySuppression";

const MS_PER_HOUR = 3_600_000;
const NOW = Date.parse("2026-09-01T12:00:00Z");

function firstTryHoursAgo(hours) {
  return {
    lastAttemptAt: new Date(NOW - hours * MS_PER_HOUR).toISOString(),
    lastOutcome: ROUND_OUTCOMES.FIRST_TRY_CORRECT,
  };
}

function firstTryCorrectNow(session = 0) {
  return {
    lastAttemptAt: new Date(NOW).toISOString(),
    lastCorrectAt: new Date(NOW).toISOString(),
    lastCorrectSession: session,
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

test("recent first-try at low mastery is not suppressed", () => {
  const mastery = 0.2;
  const expected = (1 - mastery) ** 2 + MASTERY_MIN_WEIGHT;
  const weight = getLearningWeight(
    {
      masteryScore: mastery,
      graduated: false,
      ...firstTryCorrectNow(),
    },
    NOW,
    0
  );
  assert.equal(weight, expected);
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

test("Learn queue honors a session size cap", () => {
  const ids = ["AAA", "BBB", "CCC", "DDD", "EEE"];
  const queue = buildFullRegionLearningQueue(ids, {}, null, 2);
  assert.equal(queue.length, 2);
  assert.equal(new Set(queue).size, 2);
  for (const id of queue) {
    assert.ok(ids.includes(id));
  }
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
      inPlayStat(id, 0.55, {
        lastAttemptAt: new Date(NOW).toISOString(),
        lastCorrectAt: new Date(NOW).toISOString(),
        lastCorrectSession: 0,
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
      inPlayStat(id, 0.55, {
        lastAttemptAt: new Date(NOW).toISOString(),
        lastCorrectAt: new Date(NOW).toISOString(),
        lastCorrectSession: 0,
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

function suppressedStat(overrides = {}) {
  return {
    masteryScore: 0.7,
    lastOutcome: ROUND_OUTCOMES.FIRST_TRY_CORRECT,
    lastCorrectAt: new Date(NOW).toISOString(),
    lastCorrectSession: 0,
    ...overrides,
  };
}

test("getRecencyModifier returns 1.0 when lastOutcome is needed_reveal", () => {
  assert.equal(
    getRecencyModifier(suppressedStat({ lastOutcome: ROUND_OUTCOMES.NEEDED_REVEAL }), 0, NOW),
    1
  );
});

test("getRecencyModifier returns 1.0 when lastOutcome is incorrect", () => {
  assert.equal(
    getRecencyModifier(suppressedStat({ lastOutcome: ROUND_OUTCOMES.INCORRECT }), 0, NOW),
    1
  );
});

test("getRecencyModifier returns 0.50 for second_try_correct at t=0 mastery 0.70", () => {
  const modifier = getRecencyModifier(
    suppressedStat({ lastOutcome: ROUND_OUTCOMES.SECOND_TRY_CORRECT }),
    0,
    NOW
  );
  assert.equal(modifier, 0.5);
});

test("getRecencyModifier weak-correct is between 0.50 and 1.0 when partially cleared", () => {
  const modifier = getRecencyModifier(
    suppressedStat({
      lastOutcome: ROUND_OUTCOMES.SECOND_TRY_CORRECT,
      lastCorrectAt: new Date(NOW - 12 * MS_PER_HOUR).toISOString(),
      lastCorrectSession: 0,
    }),
    1,
    NOW
  );
  assert.ok(modifier >= 0.5 && modifier < 1);
});

test("first_try_correct is more suppressed than second_try_correct at the same recency", () => {
  const strong = getRecencyModifier(suppressedStat(), 0, NOW);
  const weak = getRecencyModifier(
    suppressedStat({ lastOutcome: ROUND_OUTCOMES.SECOND_TRY_CORRECT }),
    0,
    NOW
  );
  assert.ok(strong < weak);
});

test("getRecencyModifier returns 1.0 when lastCorrectAt is null", () => {
  assert.equal(
    getRecencyModifier(suppressedStat({ lastCorrectAt: null }), 0, NOW),
    1
  );
});

test("getRecencyModifier returns 0.05 when fully suppressed at mastery 0.70", () => {
  assert.equal(getRecencyModifier(suppressedStat(), 0, NOW), 0.05);
});

test("getRecencyModifier returns 1.0 when sessions cleared even if hours remain", () => {
  assert.equal(
    getRecencyModifier(
      suppressedStat({
        lastCorrectAt: new Date(NOW).toISOString(),
        lastCorrectSession: 0,
      }),
      3,
      NOW
    ),
    1
  );
});

test("getRecencyModifier returns 1.0 when hours cleared even if sessions remain", () => {
  assert.equal(
    getRecencyModifier(
      suppressedStat({
        lastCorrectAt: new Date(NOW - 24 * MS_PER_HOUR).toISOString(),
        lastCorrectSession: 0,
      }),
      0,
      NOW
    ),
    1
  );
});

test("getSamplingWeight returns 0 for mastery 0.92 with a recent correct", () => {
  assert.equal(
    getSamplingWeight(suppressedStat({ masteryScore: 0.92 }), 0, NOW),
    0
  );
});

test("getSamplingWeight for a suppressed country is between base*0.05 and base", () => {
  const mastery = 0.7;
  const base = (1 - mastery) ** 2 + 0.05;
  const weight = getSamplingWeight(suppressedStat({ masteryScore: mastery }), 0, NOW);
  assert.ok(weight >= base * 0.05 - 1e-12);
  assert.ok(weight <= base);
  assert.equal(weight, base * 0.05);
});

test("buildSampledPool excludes graduated-territory countries", () => {
  const stats = [
    { countryId: "HIGH", masteryScore: 0.92, ...firstTryCorrectNow() },
    { countryId: "LOW", masteryScore: 0.1, lastOutcome: ROUND_OUTCOMES.NEEDED_REVEAL },
  ];
  const pool = buildSampledPool(stats, 2, 0, NOW);
  assert.deepEqual(pool.map((stat) => stat.countryId), ["LOW"]);
});

test("buildSampledPool backfills to sessionSize from remaining eligible", () => {
  const stats = Array.from({ length: 5 }, (_, i) => ({
    countryId: `C${i}`,
    masteryScore: 0.1,
    lastAttemptAt: new Date(NOW - (5 - i) * MS_PER_HOUR).toISOString(),
    lastOutcome: ROUND_OUTCOMES.NEEDED_REVEAL,
  }));
  const pool = buildSampledPool(stats, 5, 0, NOW);
  assert.equal(pool.length, 5);
});
