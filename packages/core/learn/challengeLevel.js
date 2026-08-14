/**
 * Learn challenge level — adaptive format difficulty per mode × region.
 *
 * workingTier: 4 (easiest association formats) … 1 (hardest free recall).
 * Tiers still drive EMA multipliers elsewhere; this module only decides which
 * formats to serve so learners stay between boredom and frustration.
 */

import { LEARN_CHALLENGE, QUESTION_TIERS, ROUND_OUTCOMES } from "@worldly/constants";

const TIER_STRING_BY_NUMBER = {
  1: QUESTION_TIERS.TIER_1,
  2: QUESTION_TIERS.TIER_2,
  3: QUESTION_TIERS.TIER_3,
  4: QUESTION_TIERS.TIER_4,
};

const TIER_NUMBER_BY_STRING = {
  [QUESTION_TIERS.TIER_1]: 1,
  [QUESTION_TIERS.TIER_2]: 2,
  [QUESTION_TIERS.TIER_3]: 3,
  [QUESTION_TIERS.TIER_4]: 4,
};

export function tierNumberFromString(tier) {
  return TIER_NUMBER_BY_STRING[tier] ?? null;
}

export function tierStringFromNumber(n) {
  return TIER_STRING_BY_NUMBER[n] ?? null;
}

/**
 * @returns {{ workingTier: number, momentum: number, recentOutcomes: object[] }}
 */
export function createDefaultChallenge() {
  return {
    workingTier: LEARN_CHALLENGE.DEFAULT_WORKING_TIER,
    momentum: LEARN_CHALLENGE.DEFAULT_MOMENTUM,
    recentOutcomes: [],
  };
}

export function normalizeChallenge(raw) {
  const base = createDefaultChallenge();
  if (!raw || typeof raw !== "object") return base;

  const workingTier = clamp(
    Number(raw.workingTier ?? raw.working_tier) || base.workingTier,
    LEARN_CHALLENGE.MIN_WORKING_TIER,
    LEARN_CHALLENGE.MAX_WORKING_TIER
  );
  const momentum = clamp(
    Number(raw.momentum) || base.momentum,
    LEARN_CHALLENGE.MIN_MOMENTUM,
    LEARN_CHALLENGE.MAX_MOMENTUM
  );
  const recentOutcomes = Array.isArray(raw.recentOutcomes)
    ? raw.recentOutcomes
    : Array.isArray(raw.recent_outcomes)
      ? raw.recent_outcomes
      : [];

  return {
    workingTier,
    momentum,
    recentOutcomes: recentOutcomes.slice(-LEARN_CHALLENGE.OUTCOME_WINDOW),
  };
}

/**
 * Ordered tier strings for selection: working tier first, then adjacent easier
 * and harder (when present). Used with PRIMARY_TIER_WEIGHT (~70% primary).
 *
 * @param {number} workingTier
 * @returns {string[]}
 */
export function orderedTiersForChallenge(workingTier) {
  const n = clamp(
    Number(workingTier) || LEARN_CHALLENGE.DEFAULT_WORKING_TIER,
    LEARN_CHALLENGE.MIN_WORKING_TIER,
    LEARN_CHALLENGE.MAX_WORKING_TIER
  );
  const primary = tierStringFromNumber(n);
  const adjacent = [];
  // Prefer slightly easier as secondary (higher number), then harder.
  if (n < LEARN_CHALLENGE.MAX_WORKING_TIER) {
    adjacent.push(tierStringFromNumber(n + 1));
  }
  if (n > LEARN_CHALLENGE.MIN_WORKING_TIER) {
    adjacent.push(tierStringFromNumber(n - 1));
  }
  return [primary, ...adjacent].filter(Boolean);
}

/**
 * Build a rolling-window outcome record from a Learn answer.
 *
 * Prefer explicit `correct` / `revealUsed` from the UI event — Learn maps some
 * wrong answers to `second_try_correct` for EMA, which must not count as success
 * for challenge pacing.
 *
 * @param {{ tier: string, outcome?: string, correct?: boolean, revealUsed?: boolean, fast?: boolean, predictedSuccess?: number|null }} args
 */
export function challengeOutcomeFromAnswer({
  tier,
  outcome,
  correct: correctFlag,
  revealUsed,
  fast = false,
  predictedSuccess = null,
}) {
  const reveal =
    revealUsed != null
      ? Boolean(revealUsed)
      : outcome === ROUND_OUTCOMES.NEEDED_REVEAL;
  const correct =
    correctFlag != null
      ? Boolean(correctFlag) && !reveal
      : outcome === ROUND_OUTCOMES.FIRST_TRY_CORRECT;
  return {
    tier: typeof tier === "string" ? tier : tierStringFromNumber(tier),
    tierNumber: typeof tier === "number" ? tier : tierNumberFromString(tier),
    correct: Boolean(correct),
    reveal: Boolean(reveal),
    fast: Boolean(fast),
    predictedSuccess:
      predictedSuccess != null && Number.isFinite(predictedSuccess)
        ? predictedSuccess
        : null,
    at: Date.now(),
  };
}

/**
 * Apply one Learn answer to challenge state. Returns a new challenge object.
 *
 * Harden when recent accuracy at/above working tier is high; ease when accuracy
 * is low or reveals pile up. Momentum hysteresis avoids thrashing.
 *
 * @param {object} challenge
 * @param {object} outcomeRecord - from challengeOutcomeFromAnswer
 */
export function updateChallengeLevel(challenge, outcomeRecord) {
  const state = normalizeChallenge(challenge);
  const nextOutcomes = [...state.recentOutcomes, outcomeRecord].slice(
    -LEARN_CHALLENGE.OUTCOME_WINDOW
  );

  let { workingTier, momentum } = state;

  if (nextOutcomes.length >= 3) {
    const relevant = nextOutcomes.filter((o) => {
      const tn = o.tierNumber ?? tierNumberFromString(o.tier);
      // Count answers at or harder than current working tier (lower number = harder).
      return tn != null && tn <= workingTier;
    });
    const pool = relevant.length >= 3 ? relevant : nextOutcomes;
    const correctCount = pool.filter((o) => o.correct && !o.reveal).length;
    const revealCount = pool.filter((o) => o.reveal).length;
    const accuracy = correctCount / pool.length;
    const revealRate = revealCount / pool.length;

    if (accuracy >= LEARN_CHALLENGE.HARDEN_ACCURACY && revealRate < 0.2) {
      momentum = clamp(
        momentum + 1,
        LEARN_CHALLENGE.MIN_MOMENTUM,
        LEARN_CHALLENGE.MAX_MOMENTUM
      );
    } else if (
      accuracy <= LEARN_CHALLENGE.EASE_ACCURACY ||
      revealRate >= 0.35
    ) {
      momentum = clamp(
        momentum - 1,
        LEARN_CHALLENGE.MIN_MOMENTUM,
        LEARN_CHALLENGE.MAX_MOMENTUM
      );
    } else if (accuracy >= 0.7 && momentum < 0) {
      momentum = clamp(momentum + 1, LEARN_CHALLENGE.MIN_MOMENTUM, LEARN_CHALLENGE.MAX_MOMENTUM);
    } else if (accuracy <= 0.65 && momentum > 0) {
      momentum = clamp(momentum - 1, LEARN_CHALLENGE.MIN_MOMENTUM, LEARN_CHALLENGE.MAX_MOMENTUM);
    }

    if (momentum >= LEARN_CHALLENGE.MOMENTUM_BUMP && workingTier > LEARN_CHALLENGE.MIN_WORKING_TIER) {
      workingTier -= 1;
      momentum = 0;
    } else if (
      momentum <= -LEARN_CHALLENGE.MOMENTUM_BUMP &&
      workingTier < LEARN_CHALLENGE.MAX_WORKING_TIER
    ) {
      workingTier += 1;
      momentum = 0;
    }
  }

  return {
    workingTier,
    momentum,
    recentOutcomes: nextOutcomes,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
