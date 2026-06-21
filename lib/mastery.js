import { ROUND_OUTCOMES } from "./countryStats.js";

// A country graduates out of the learning pool once mastery is high and the
// user has answered it quickly on first try several times in a row (Test only).
export const MASTERY_GRADUATION_THRESHOLD = 0.9;
export const MASTERY_FAST_STREAK_REQUIRED = 3;

// Floor added to every non-graduated weight so even near-mastered countries
// retain a small chance of being practiced.
export const MASTERY_MIN_WEIGHT = 0.05;

// EMA step sizes: a fast first-try gains more mastery than a slow one.
const MASTERY_EMA_FAST = 0.2;
const MASTERY_EMA_SLOW = 0.08;
// Flat penalties for missing on first try.
const MASTERY_PENALTY_SECOND = 0.15;
const MASTERY_PENALTY_REVEAL = 0.35;

// Mastery seeded purely from historical aggregates is capped below 1 so a
// country can never be considered fully mastered without live EMA evidence.
const AGGREGATE_MASTERY_CAP = 0.85;
// How strongly reveals drag down the aggregate-derived mastery estimate.
const AGGREGATE_REVEAL_WEIGHT = 0.5;

// "Fast" means answering within this multiple of the personal baseline, clamped
// to an absolute window so the threshold stays sane for very fast/slow users.
const FAST_RESPONSE_MULTIPLIER = 1.2;
const FAST_RESPONSE_MIN_MS = 3000;
const FAST_RESPONSE_MAX_MS = 8000;

const DEFAULT_SPEED_BASELINE_MS = 5000;
// Weight of the newest sample when blending it into the speed baseline EMA.
const SPEED_BASELINE_BLEND = 0.15;

export const GAME_TYPE_FOR_STATS = {
  TEST: "test",
  LEARNING: "learning",
  REVIEW: "review",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function isFastResponse(responseTimeMs, speedBaselineMs) {
  if (responseTimeMs == null || responseTimeMs < 0) return false;

  const baseline = speedBaselineMs ?? DEFAULT_SPEED_BASELINE_MS;
  const threshold = Math.min(
    Math.max(baseline * FAST_RESPONSE_MULTIPLIER, FAST_RESPONSE_MIN_MS),
    FAST_RESPONSE_MAX_MS
  );

  return responseTimeMs <= threshold;
}

export function updateSpeedBaseline(currentBaseline, responseTimeMs) {
  if (responseTimeMs == null || responseTimeMs < 0) return currentBaseline;

  if (currentBaseline == null) {
    return Math.round(responseTimeMs);
  }

  return Math.round(
    currentBaseline * (1 - SPEED_BASELINE_BLEND) + responseTimeMs * SPEED_BASELINE_BLEND
  );
}

export function deriveMasteryFromAggregates(stat) {
  const firstTry = stat.firstTryCorrect ?? 0;
  const secondTry = stat.secondTryCorrect ?? 0;
  const reveal = stat.neededReveal ?? 0;
  const total = firstTry + secondTry + reveal;

  if (total === 0) return 0;

  const firstTryRate = firstTry / total;
  const revealRate = reveal / total;
  return clamp(
    firstTryRate * (1 - revealRate * AGGREGATE_REVEAL_WEIGHT),
    0,
    AGGREGATE_MASTERY_CAP
  );
}

/**
 * @param {object|null} stat - existing country_stats row
 * @param {{ outcome: string, responseTimeMs?: number|null, gameType: string }} attempt
 */
export function computeMasteryUpdate(stat, { outcome, responseTimeMs, gameType }) {
  const hadHistory =
    (stat?.firstTryCorrect ?? 0) +
      (stat?.secondTryCorrect ?? 0) +
      (stat?.neededReveal ?? 0) >
    0;

  // Seed mastery from historical aggregates for rows that predate EMA tracking
  // (mastery_score defaults to 0), so existing players aren't reset to zero.
  let mastery =
    stat?.masteryScore > 0
      ? stat.masteryScore
      : hadHistory
        ? deriveMasteryFromAggregates(stat)
        : 0;

  let fastStreak = stat?.fastStreak ?? 0;
  let speedBaselineMs = stat?.speedBaselineMs ?? null;
  let graduated = stat?.graduated ?? false;

  if (outcome === ROUND_OUTCOMES.FIRST_TRY_CORRECT) {
    const fast = isFastResponse(responseTimeMs, speedBaselineMs);
    speedBaselineMs = updateSpeedBaseline(speedBaselineMs, responseTimeMs);

    if (fast) {
      mastery += MASTERY_EMA_FAST * (1 - mastery);
      fastStreak += 1;
    } else {
      mastery += MASTERY_EMA_SLOW * (1 - mastery);
      fastStreak = 0;
    }
  } else if (outcome === ROUND_OUTCOMES.SECOND_TRY_CORRECT) {
    mastery = Math.max(0, mastery - MASTERY_PENALTY_SECOND);
    fastStreak = 0;
  } else if (outcome === ROUND_OUTCOMES.NEEDED_REVEAL) {
    mastery = Math.max(0, mastery - MASTERY_PENALTY_REVEAL);
    fastStreak = 0;
  }

  mastery = clamp(mastery, 0, 1);

  const missedFirstTry =
    outcome === ROUND_OUTCOMES.SECOND_TRY_CORRECT ||
    outcome === ROUND_OUTCOMES.NEEDED_REVEAL;

  if (missedFirstTry && gameType === GAME_TYPE_FOR_STATS.TEST) {
    graduated = false;
  }

  if (
    !graduated &&
    gameType === GAME_TYPE_FOR_STATS.TEST &&
    outcome === ROUND_OUTCOMES.FIRST_TRY_CORRECT &&
    mastery >= MASTERY_GRADUATION_THRESHOLD &&
    fastStreak >= MASTERY_FAST_STREAK_REQUIRED
  ) {
    graduated = true;
  }

  return {
    masteryScore: mastery,
    fastStreak,
    speedBaselineMs,
    graduated,
  };
}

export function getEffectiveMastery(stat) {
  if ((stat.masteryScore ?? 0) > 0) return stat.masteryScore;
  return deriveMasteryFromAggregates(stat);
}

/** Higher = more likely to appear in a learning session. */
export function getLearningWeight(stat) {
  if (stat.graduated) return 0;

  const mastery = getEffectiveMastery(stat);
  return (1 - mastery) ** 2 + MASTERY_MIN_WEIGHT;
}

export function hasEverStruggled(stat) {
  return (stat.secondTryCorrect ?? 0) > 0 || (stat.neededReveal ?? 0) > 0;
}

/** Eligible for learning: struggled before and not yet graduated. */
export function isEligibleForLearning(stat) {
  return hasEverStruggled(stat) && !stat.graduated;
}

/**
 * Combines a level's own mastery with the mastery from "proving" levels (the
 * harder no-fill tier proves the easier fill tier within the same Find/Name
 * section). Mastery and graduation only ever cascade up to a proving level,
 * never the other way. See getMasteryProvingLevels in lib/levels.
 *
 * @param {object|null} ownStat - the stat at the requested level
 * @param {object[]} provingStats - stats whose mastery proves the requested level
 */
export function getCascadedMastery(ownStat, provingStats = []) {
  let masteryScore = ownStat ? getEffectiveMastery(ownStat) : 0;
  let graduated = ownStat?.graduated ?? false;

  for (const proving of provingStats) {
    if (!proving) continue;
    masteryScore = Math.max(masteryScore, getEffectiveMastery(proving));
    if (proving.graduated) graduated = true;
  }

  return { masteryScore, graduated };
}

/**
 * Builds an effective learning stat for the requested level, with
 * mastery/graduated boosted by any proving-level mastery for the same country.
 * Eligibility still relies on the level's own struggle history, so a country is
 * never injected into a level the user has not actually missed there.
 */
export function buildCascadedStat(countryId, ownStat, provingStats = []) {
  const { masteryScore, graduated } = getCascadedMastery(ownStat, provingStats);

  if (!ownStat) {
    return {
      countryId,
      masteryScore,
      graduated,
      firstTryCorrect: 0,
      secondTryCorrect: 0,
      neededReveal: 0,
    };
  }

  return { ...ownStat, countryId, masteryScore, graduated };
}
